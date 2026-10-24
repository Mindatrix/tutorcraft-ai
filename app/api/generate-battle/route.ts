import { NextResponse } from 'next/server';
import {
    computeScaling,
    defaultBoss,
    fallbackPayload,
    configTypes,
    averageWeight,
    plannedQuestionCount,
    normalizeConfig,
    reviewSlots,
    validateBattlePayload,
    variantCodes,
    type BattlePayload,
    type Question,
} from '../../../src/engine';
import { generateWithFailSafe, type InlineDocument } from '../../../src/server/gemini';
import { buildBattlePrompt } from '../../../src/server/prompt';
import { rateLimit } from '../../../src/server/rateLimit';
import { serverSupabase } from '../../../src/server/supabase-server';
import { UNAUTHORIZED, requireTutor } from '../../../src/server/auth';

const RATE_LIMIT = 5; // generations per IP per minute
const MAX_DOC_BYTES = 4 * 1024 * 1024;
const MAX_DOC_TEXT = 30_000;
const INLINE_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

interface DocumentInput {
    name?: string;
    mimeType?: string;
    data?: string; // base64 for PDF / images
    text?: string; // extracted client-side for .txt / .md
}

function parseDocument(doc: DocumentInput | undefined): { inline: InlineDocument | null; text?: string } {
    if (!doc) return { inline: null };
    if (typeof doc.text === 'string' && doc.text.trim()) {
        return { inline: null, text: doc.text.slice(0, MAX_DOC_TEXT) };
    }
    if (typeof doc.data === 'string' && doc.mimeType && INLINE_MIME.includes(doc.mimeType)) {
        if (doc.data.length * 0.75 > MAX_DOC_BYTES) throw new Error('Tài liệu quá lớn (tối đa 4MB).');
        return { inline: { mimeType: doc.mimeType, data: doc.data } };
    }
    throw new Error('Định dạng tài liệu chưa hỗ trợ. Dùng PDF, ảnh (PNG/JPG/WEBP) hoặc TXT/MD.');
}

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

    const limit = rateLimit(`gen:${tutor.id}`, RATE_LIMIT, 60_000);
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

    let parsedDoc: ReturnType<typeof parseDocument>;
    try {
        parsedDoc = parseDocument(doc);
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }

    const config = normalizeConfig(body);
    const classCode = typeof body.classCode === 'string' && body.classCode.trim() ? body.classCode.trim().slice(0, 40) : 'default';
    const types = configTypes(config);
    // Mixed formats take longer per question, so fewer of them fit the same duration.
    const Q = plannedQuestionCount(config.durationMinutes, types);

    const reviewTopics = await dueReviewTopics(classCode);
    const reviewCount = reviewSlots(Q, reviewTopics.length ? Q : 0);

    const prompt = buildBattlePrompt({
        topic: topic || doc?.name || 'Uploaded lesson',
        config,
        questionCount: Q,
        documentText: parsedDoc.text,
        hasInlineDocument: !!parsedDoc.inline,
        reviewTopics,
        reviewCount,
    });

    const bossFallback = defaultBoss(topic || doc?.name || '', config.themes);

    // Accept the AI output if it delivers at least 80% of the requested questions.
    const minQuestions = Math.max(1, Math.ceil(Q * 0.8));
    const ai = await generateWithFailSafe(prompt, parsedDoc.inline, (raw) => validateBattlePayload(raw, minQuestions, bossFallback), Math.round(Q * averageWeight(types)));

    let payload: BattlePayload;
    let provider: string;
    if (ai.result) {
        payload = ai.result;
        provider = ai.model!;
        if (payload.questions.length < Q) {
            // Top up the last few from the local bank so Q always matches the duration formula.
            const extra = fallbackPayload(Q - payload.questions.length, topic, types).questions;
            payload.questions.push(...extra);
        }
    } else {
        payload = fallbackPayload(Q, topic || 'fallback', types);
        provider = 'Local Cached Template';
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
        db_warning: saved.warning,
        teaching_notes: payload.teaching_notes,
        knowledge_matrix: payload.knowledge_matrix,
        questions,
    });
}
