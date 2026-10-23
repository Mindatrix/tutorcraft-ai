import { NextResponse } from 'next/server';
import {
  buildVariant,
  gradeAnswer,
  needsReview,
  nextReview,
  replayBattle,
  scoreBattle,
  timeLimitFor,
  weakTopics,
  type AnswerRecord,
  type SkillCast,
  type SkillId,
  type TopicStat,
} from '../../../src/engine';
import { loadBattle } from '../../../src/server/battles';
import { clientKey, rateLimit } from '../../../src/server/rateLimit';
import { serverSupabase } from '../../../src/server/supabase-server';

// Server-side validation for Gems / EXP. The client sends only raw answers;
// rewards are recomputed here from the stored questions, so editing values
// in DevTools has no effect.

function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export async function POST(req: Request) {
  const limit = rateLimit(`result:${clientKey(req)}`, 20, 60_000);
  if (!limit.ok) return NextResponse.json({ error: 'Too many submissions' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const battleId = cleanText(body.battleId, 64);
  const battle = battleId ? await loadBattle(battleId) : null;
  if (!battle) return NextResponse.json({ error: 'Battle not found' }, { status: 404 });

  const variant = Number.isInteger(body.variant) ? (body.variant as number) : null;
  const questions = buildVariant(battle.questions, battle.id, variant);

  const answers: AnswerRecord[] = (Array.isArray(body.answers) ? body.answers : [])
    .slice(0, questions.length)
    .map((a) => {
      const o = (a ?? {}) as Record<string, unknown>;
      return { questionId: Number(o.questionId), chosenIdx: Number(o.chosenIdx), timeMs: Number(o.timeMs) };
    })
    .filter((a) => Number.isInteger(a.questionId) && Number.isInteger(a.chosenIdx));

  const casts: SkillCast[] = (Array.isArray(body.casts) ? body.casts : [])
    .slice(0, 100)
    .map((c) => {
      const o = (c ?? {}) as Record<string, unknown>;
      return { skill: String(o.skill) as SkillId, questionId: Number(o.questionId) };
    })
    .filter((c) => Number.isInteger(c.questionId));

  const score = scoreBattle(questions, answers, battle.config);
  const { hpRemaining } = replayBattle(questions, answers, casts, battle.config);
  const nickname = cleanText(body.nickname, 24) || 'Anonymous Hero';
  const avatar = cleanText(body.avatar, 8) || '🐣';
  const studentKey = cleanText(body.studentKey, 64) || 'anon';

  const db = serverSupabase();
  let saved = false;
  if (db && battle.id !== 'demo') {
    const resultRow = {
      battle_id: battle.id,
      class_code: battle.config.classCode,
      student_key: studentKey,
      nickname,
      avatar,
      variant_code: variant,
      correct: score.correct,
      answered: score.answered,
      accuracy: score.accuracy,
      gems: score.gems,
      exp: score.exp,
      damage: score.damage,
      boss_defeated: score.bossDefeated,
      topics: score.topics,
    };
    let ins = await db.from('battle_results').insert([{ ...resultRow, hp_remaining: hpRemaining }]);
    // hp_remaining column not migrated yet — save the rest anyway.
    if (ins.error) ins = await db.from('battle_results').insert([resultRow]);
    if (ins.error) console.error('battle_results insert failed:', ins.error.message);
    saved = !ins.error;

    // Spaced repetition: capture wrong / hesitant items into the weak matrix.
    const byId = new Map(questions.map((q) => [q.id, q]));
    const weakRows = answers.flatMap((a) => {
      const q = byId.get(a.questionId);
      if (!q) return [];
      const grade = gradeAnswer(a.chosenIdx === q.correct_idx, a.timeMs, timeLimitFor(q.difficulty), a.chosenIdx === -1);
      if (!needsReview(grade)) return [];
      return [{
        class_code: battle.config.classCode,
        student_key: studentKey,
        topic: q.topic,
        skill_tag: q.skill_tag,
        question: q.question,
        ...nextReview(null, grade),
      }];
    });
    // One row per topic: Postgres rejects an upsert batch that hits the same key twice.
    const byTopic = new Map(weakRows.map((r) => [r.topic.toLowerCase(), r]));
    if (byTopic.size) {
      const up = await db.from('weak_knowledge_matrix').upsert(Array.from(byTopic.values()), { onConflict: 'class_code,student_key,topic' });
      if (up.error) console.error('weak_knowledge_matrix upsert failed:', up.error.message);
    }
  }

  return NextResponse.json({ score, hpRemaining, saved });
}

/** Leaderboard (nicknames + pet avatars only) and class diagnostics for one battle. */
export async function GET(req: Request) {
  const battleId = new URL(req.url).searchParams.get('battleId') ?? '';
  const db = serverSupabase();
  if (!db || !battleId) return NextResponse.json({ leaderboard: [], diagnostics: [] });

  const { data, error } = await db
    .from('battle_results')
    .select('nickname, avatar, gems, accuracy, damage, topics, created_at')
    .eq('battle_id', battleId)
    .order('gems', { ascending: false })
    .limit(200);
  if (error || !data) return NextResponse.json({ leaderboard: [], diagnostics: [], error: error?.message });

  const merged = new Map<string, TopicStat>();
  for (const row of data) {
    for (const t of (row.topics ?? []) as TopicStat[]) {
      const key = t.topic.toLowerCase();
      const m = merged.get(key) ?? { topic: t.topic, skill_tag: t.skill_tag, attempts: 0, wrong: 0 };
      m.attempts += t.attempts;
      m.wrong += t.wrong;
      merged.set(key, m);
    }
  }

  return NextResponse.json({
    leaderboard: data.slice(0, 10).map(({ nickname, avatar, gems, accuracy, damage }) => ({ nickname, avatar, gems, accuracy, damage })),
    participants: data.length,
    totalDamage: data.reduce((s, r) => s + (r.damage ?? 0), 0),
    diagnostics: weakTopics(Array.from(merged.values())).slice(0, 10),
  });
}
