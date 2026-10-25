import { DEMO_BATTLE_ID, gradeAnswer, isAnswerCorrect, needsReview, nextReview, questionTimeLimit, questionType } from '../engine';
import { gradeOpenResponse } from './grader';
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

/** Written answers + their grades, for the tutor to review (essays, reading, rewrites…). */
function openResponses(rec: Parameters<SessionDeps['persistResult']>[0]['rec'], ctx: Parameters<SessionDeps['persistResult']>[0]['ctx']) {
  const byId = new Map(ctx.questions.map((q) => [q.id, q]));
  return rec.log
    .filter((e) => e.t === 'answer' && (e.response || e.grade))
    .map((e) => {
      const a = e as Extract<typeof e, { t: 'answer' }>;
      const q = byId.get(a.qid);
      return {
        question_id: a.qid,
        type: q ? questionType(q) : 'mcq',
        prompt: q?.question.slice(0, 200),
        response: a.response?.slice(0, 2000) ?? null,
        score: a.grade?.score ?? null,
        by: a.grade?.by ?? null,
        criteria: a.grade?.criteria ?? null,
        feedback: a.grade?.feedback ?? null,
      };
    })
    .slice(0, 50);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const persistResult: SessionDeps['persistResult'] = async ({ battle, rec, ctx, state, score, hpRemaining }) => {
  if (battle.id === DEMO_BATTLE_ID) return 'skipped';
  const db = serverSupabase();
  if (!db) return 'skipped';

  const row = {
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
    responses: openResponses(rec, ctx),
  };
  // Short in-request retries for blips; anything longer is left to the retry queue
  // (session.resultSaved = false → retryPending / the student's next submit).
  let saved = false;
  for (let attempt = 0; attempt < 3 && !saved; attempt++) {
    if (attempt) await sleep(250 * 3 ** (attempt - 1));
    const ins = await db.from('battle_results').insert([row]).then((r) => r, (e: unknown) => ({ error: { code: '', message: String(e) } }));
    // 23505 = unique session_id: an earlier attempt already got through.
    if (!ins.error || ins.error.code === '23505') saved = true;
    else console.error(`battle_results insert failed (try ${attempt + 1}/3):`, ins.error.message);
  }
  if (!saved) return false;

  // Spaced repetition: wrong or hesitant answers (graded on SERVER time) go into the weak matrix.
  const byId = new Map(ctx.questions.map((q) => [q.id, q]));
  const rows = new Map<string, Record<string, unknown>>();
  for (const a of state.answers) {
    const q = byId.get(a.questionId);
    if (!q) continue;
    const grade = gradeAnswer(isAnswerCorrect(q, a), a.timeMs, questionTimeLimit(q, battle.config.level), a.chosenIdx === -1);
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

export const sessions = createSessionService({ loadBattle: loadBattleCached, storeFor, persistResult, gradeOpen: gradeOpenResponse });

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
