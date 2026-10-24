import { NextResponse } from 'next/server';
import {
  MAX_QUESTIONS,
  computeScaling,
  defaultBoss,
  normalizeBattleCode,
  normalizeConfig,
  sanitizeBoss,
  validateBattlePayload,
  variantCodes,
} from '../../../src/engine';
import { demoLoadedBattle, loadBattle, loadBattleByCode, publicBattle, saveBattle } from '../../../src/server/battles';
import { clientKey, rateLimit } from '../../../src/server/rateLimit';
import { UNAUTHORIZED, ensureTutorProfile, requireTutor } from '../../../src/server/auth';

/** Publish a battle the tutor reviewed and edited in the Studio. */
export async function POST(req: Request) {
  const tutor = await requireTutor(req);
  if (!tutor) return NextResponse.json(UNAUTHORIZED, { status: 401 });
  const limit = rateLimit(`publish:${tutor.id}`, 10, 60_000);
  if (!limit.ok) return NextResponse.json({ error: `Quá nhiều yêu cầu. Thử lại sau ${limit.retryAfterSec}s.` }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }

  const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0, 300) : 'Bài học';
  const rawConfig = (body.config ?? {}) as Record<string, unknown>;
  const config = normalizeConfig(rawConfig);
  const classCode = typeof rawConfig.classCode === 'string' && rawConfig.classCode.trim() ? rawConfig.classCode.trim().slice(0, 40) : 'default';

  let payload;
  try {
    payload = validateBattlePayload({ questions: body.questions, teaching_notes: body.teaching_notes }, 2);
  } catch {
    return NextResponse.json({ error: 'Cần ít nhất 2 câu hỏi hợp lệ (mỗi câu 2–6 đáp án khác nhau, 1 đáp án đúng).' }, { status: 400 });
  }
  const questions = payload.questions.slice(0, MAX_QUESTIONS).map((q, i) => ({ ...q, id: i + 1 }));
  const boss = sanitizeBoss(body.boss, defaultBoss(topic, config.themes));
  const scaling = computeScaling(config, questions.length, questions); // Boss HP weighted by format

  // The watermark name comes from the verified account, not from the request body.
  const tutorName = tutor.name;
  await ensureTutorProfile(tutor);
  const saved = await saveBattle({
    topic,
    config: { ...config, scaling, classCode, boss, tutorName },
    teachingNotes: payload.teaching_notes,
    questions,
    tutorId: tutor.id,
  });
  if (!saved.id) return NextResponse.json({ error: saved.warning ?? 'Không lưu được đấu trường.' }, { status: 503 });

  return NextResponse.json({
    battle_id: saved.id,
    code: saved.code,
    variants: variantCodes(config.studentCount),
    warning: saved.warning,
  });
}

/** Public battle info by short code (?code=ABC123) or id (?id=uuid) for the student lobby. */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const limit = rateLimit(`lookup:${clientKey(req)}`, 60, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const id = params.get('id');
  const code = normalizeBattleCode(params.get('code'));
  if (!id && !code) return NextResponse.json({ error: 'Mã đấu trường không hợp lệ.' }, { status: 400 });

  const battle = id === 'demo' ? demoLoadedBattle() : id ? await loadBattle(id) : await loadBattleByCode(code!);
  if (!battle) return NextResponse.json({ error: 'Không tìm thấy đấu trường.' }, { status: 404 });

  // Never the questions or answers — those are served one at a time by /api/session.
  return NextResponse.json(publicBattle(battle), { headers: { 'Cache-Control': 'no-store' } });
}
