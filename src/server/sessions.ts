import { DEMO_BATTLE_ID, gradeAnswer, needsReview, nextReview, timeLimitFor } from '../engine';
import { loadBattleCached } from './battles';
import { serverSupabase } from './supabase-server';
import { MemorySessionStore, SupabaseSessionStore, type SessionStore } from './sessionStore';
import { createSessionService, SessionError, type SessionDeps } from './sessionService';

const demoStore = new MemorySessionStore();
let dbStore: SupabaseSessionStore | null = null;

function storeFor(battleId: string): SessionStore {
  if (battleId === DEMO_BATTLE_ID) return demoStore;
  const db = serverSupabase();
  if (!db) throw new SessionError(503, 'Chưa cấu hình Supabase.');
  dbStore ??= new SupabaseSessionStore(db);
  return dbStore;
}

const persistResult: SessionDeps['persistResult'] = async ({ battle, rec, ctx, state, score, hpRemaining }) => {
  if (battle.id === DEMO_BATTLE_ID) return false;
  const db = serverSupabase();
  if (!db) return false;

  const ins = await db.from('battle_results').insert([
    {
      battle_id: battle.id,
      session_id: rec.id,
      class_code: battle.config.classCode,
      student_key: rec.studentKey,
      nickname: rec.nickname,
      avatar: rec.avatar,
      variant_code: rec.variant,
      team: rec.team ?? null,
      correct: score.correct,
      answered: score.answered,
      accuracy: score.accuracy,
      gems: score.gems,
      exp: score.exp,
      damage: score.damage,
      boss_defeated: score.bossDefeated,
      hp_remaining: hpRemaining,
      topics: score.topics,
    },
  ]);
  if (ins.error) {
    console.error('battle_results insert failed:', ins.error.message);
    return false;
  }

  // Spaced repetition: wrong or hesitant answers (graded on SERVER time) go into the weak matrix.
  const byId = new Map(ctx.questions.map((q) => [q.id, q]));
  const rows = new Map<string, Record<string, unknown>>();
  for (const a of state.answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const grade = gradeAnswer(a.chosenIdx === q.correct_idx, a.timeMs, timeLimitFor(q.difficulty, battle.config.level), a.chosenIdx === -1);
    if (!needsReview(grade)) continue;
    rows.set(q.topic.toLowerCase(), {
      class_code: battle.config.classCode,
      student_key: rec.studentKey,
      topic: q.topic,
      skill_tag: q.skill_tag,
      question: q.question,
      ...nextReview(null, grade),
    });
  }
  if (rows.size) {
    const up = await db.from('weak_knowledge_matrix').upsert(Array.from(rows.values()), { onConflict: 'class_code,student_key,topic' });
    if (up.error) console.error('weak_knowledge_matrix upsert failed:', up.error.message);
  }
  return true;
};

export const sessions = createSessionService({ loadBattle: loadBattleCached, storeFor, persistResult });

export const SESSION_HEADER = 'x-battle-session';

/** Turn service errors into JSON responses; anything unexpected becomes a 500 without internals. */
export function sessionErrorResponse(e: unknown): Response {
  if (e instanceof SessionError) return Response.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : String(e);
  if (/battle_sessions/.test(msg)) {
    return Response.json({ error: 'Bảng battle_sessions chưa có — chạy supabase/schema.sql.' }, { status: 503 });
  }
  console.error('session error:', msg);
  return Response.json({ error: 'Lỗi máy chủ.' }, { status: 500 });
}
