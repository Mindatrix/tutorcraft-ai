import { NextResponse } from 'next/server';
import {
    computeScaling,
    defaultBoss,
    bankFillReport,
    fillFromBank,
    FALLBACK_TEACHING_NOTES,
    planQuestionTypes,
    configTypes,
    averageWeight,
    plannedQuestionCount,
    normalizeConfig,
    parseRequestedCounts,
    reviewSlots,
    validateBattlePayload,
    variantCodes,
    type BankFill,
    type BattlePayload,
    type Question,
    type QuestionType,
} from '../../../src/engine';
import { generateWithFailSafe } from '../../../src/server/gemini';
import { DocumentError, parseDocument, type DocumentInput } from '../../../src/server/documents';
import { buildBattlePrompt } from '../../../src/server/prompt';
import { rateLimitShared } from '../../../src/server/rateLimit';
import { serverSupabase } from '../../../src/server/supabase-server';
import { UNAUTHORIZED, requireTutor } from '../../../src/server/auth';

const RATE_LIMIT = 5; // generations per IP per minute
async function dueReviewTopics(classCode: string): Promise<string[]> {
    const db = serverSupabase();
    if (!db) return [];
    try {
        const { data, error } = await db
            .from('weak_knowledge_matrix')
            .select('topic')
            .eq('class_code', classCode)
            .lte('due_at', new Date().toISOString())
            .order('due_at', { ascending: true })
            .limit(30);
        if (error || !data) return [];
        return Array.from(new Set(data.map((r: { topic: string }) => r.topic))).slice(0, 8);
    } catch {
        return [];
    }
}

export async function POST(req: Request) {
    const startTime = Date.now();

    // Only signed-in tutors may spend AI quota; the browser's claim is never trusted.
    const tutor = await requireTutor(req);
    if (!tutor) return NextResponse.json(UNAUTHORIZED, { status: 401 });

    const limit = await rateLimitShared(`gen:${tutor.id}`, RATE_LIMIT, 60_000);
    if (!limit.ok) {
        return NextResponse.json(
            { error: `Quá nhiều yêu cầu. Thử lại sau ${limit.retryAfterSec}s.` },
            { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
        );
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
    }

    const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 300) : '';
    const doc = body.document as DocumentInput | undefined;
    if (!topic && !doc) {
        return NextResponse.json({ error: 'Cần nhập chủ đề hoặc tải lên tài liệu.' }, { status: 400 });
    }

    let parsedDoc: Awaited<ReturnType<typeof parseDocument>>;
    try {
        // Long text / Word files are split into sections; the topic steers which ones the AI sees.
        parsedDoc = await parseDocument(doc, topic);
    } catch (e) {
        if (e instanceof DocumentError) return NextResponse.json({ error: e.message }, { status: 400 });
        throw e;
    }

    // Counts typed in the topic ("20 câu", "5 trắc nghiệm, 3 điền từ") beat the Studio field —
    // except for a Studio "refill" call, which asks for exactly the questions to replace.
    const asked = body.refill === true ? {} as ReturnType<typeof parseRequestedCounts> : parseRequestedCounts(topic);
    const config = normalizeConfig({
        ...body,
        questionCount: asked.total ?? body.questionCount,
        typeCounts: asked.perType ?? body.typeCounts,
    });
    const classCode = typeof body.classCode === 'string' && body.classCode.trim() ? body.classCode.trim().slice(0, 40) : 'default';
    const types = configTypes(config);
    // Mixed formats take longer per question, so fewer of them fit the same duration.
    const Q = config.questionCount ?? plannedQuestionCount(config.durationMinutes, types);

    const reviewTopics = await dueReviewTopics(classCode);
    const reviewCount = reviewSlots(Q, reviewTopics.length ? Q : 0);

    const prompt = buildBattlePrompt({
        topic: topic || doc?.name || 'Uploaded lesson',
        config,
        questionCount: Q,
        documentText: parsedDoc.text,
        documentSections: parsedDoc.info && parsedDoc.info.chunks > 1 ? { shown: parsedDoc.info.usedChunks, total: parsedDoc.info.chunks } : undefined,
        hasInlineDocument: !!parsedDoc.inline,
        reviewTopics,
        reviewCount,
    });

    const bossFallback = defaultBoss(topic || doc?.name || '', config.themes);

    // Accept the AI output if it delivers at least 80% of the requested questions.
    const minQuestions = Math.max(1, Math.ceil(Q * 0.8));
    const ai = await generateWithFailSafe(prompt, parsedDoc.inline, (raw) => validateBattlePayload(raw, minQuestions, bossFallback), Math.round(Q * averageWeight(types)));

    // The format plan the AI was given; bank top-ups follow it so the mix stays as requested.
    const plan: QuestionType[] = config.typeCounts
        ? (Object.entries(config.typeCounts) as [QuestionType, number][]).flatMap(([t, n]) => Array<QuestionType>(n).fill(t))
        : planQuestionTypes(types, Q);

    let payload: BattlePayload;
    let provider: string;
    let fill: BankFill | null = null;
    if (ai.result) {
        payload = ai.result;
        provider = ai.model!;
        if (payload.questions.length < Q) {
            // Top up from the local bank so the count still matches — and say so to the tutor:
            // these are general-English questions, not from their lesson (flagged from_bank).
            const fromAi = payload.questions.length;
            const extra = fillFromBank(payload.questions, Q, plan, topic || 'fallback');
            payload.questions.push(...extra);
            fill = bankFillReport(Q, fromAi, extra, 'ai_short');
        }
    } else {
        const bank = fillFromBank([], Q, plan, topic || 'fallback');
        payload = { teaching_notes: FALLBACK_TEACHING_NOTES, questions: bank };
        provider = 'Local Cached Template';
        fill = bankFillReport(Q, 0, bank, 'ai_failed');
    }
    const boss = payload.boss ?? bossFallback;

    const reviewSet = new Set(reviewTopics.map((t) => t.toLowerCase()));
    const questions: Question[] = payload.questions.slice(0, Q).map((q, i) => ({
        ...q,
        id: i + 1,
        is_review: reviewSet.has(q.topic.toLowerCase()) || undefined,
    }));

    const lessonTitle = topic || doc?.name || 'Uploaded lesson';
    const scaling = computeScaling(config, questions.length, questions); // Boss HP weighted by format
    const storedConfig = { ...config, scaling, classCode, boss };

    // Generation never issues a class code: the tutor must review the draft and
    // publish it explicitly via POST /api/battles (which stores it under their account).
    const saved: { id: string | null; code: string | null; warning?: string } = { id: null, code: null };

    return NextResponse.json({
        battle_id: saved.id,
        code: saved.code,
        raw_input: lessonTitle,
        config: storedConfig,
        boss,
        variants: variantCodes(config.studentCount),
        provider,
        attempts: ai.attempts,
        execution_time: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        review_topics: reviewCount ? reviewTopics : [],
        // Non-null when some questions came from the local bank instead of the AI.
        fill,
        document_info: parsedDoc.info,
        db_warning: saved.warning,
        teaching_notes: payload.teaching_notes,
        knowledge_matrix: payload.knowledge_matrix,
        questions,
    });
}
