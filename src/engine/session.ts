import type { Question, SkillId } from './types';
import { battleReducer, initialBattleState, type BattleCtx, type BattleState } from './battleState';
import { FREEZE_SECONDS } from './skills';
import { minPlausibleMs, type AnswerTiming } from './anticheat';

// Server-authoritative battle sessions. The server stores only an action log
// stamped with ITS OWN clock and rebuilds the battle by replaying it through the
// same reducer the UI uses. Scores, HP, MP and timing are never taken from the client.

/** The client shows answer feedback this long before the next question appears. */
export const FEEDBACK_MS = 1400;
/** Network allowance before a late answer counts as a timeout. */
export const TIMEOUT_GRACE_MS = 2500;

export type SessionLogEntry =
  | { t: 'answer'; qid: number; chosen: number; at: number }
  | { t: 'cast'; skill: SkillId; at: number };

export interface Rebuilt {
  state: BattleState;
  /** State right after the last answer, before advancing — what the feedback screen shows. */
  afterLastAnswer: BattleState | null;
  timings: AnswerTiming[];
  /** Server time the current question was served. */
  issuedAt: number;
}

export function rebuildSession(ctx: BattleCtx, startedAt: number, log: SessionLogEntry[]): Rebuilt {
  const reduce = battleReducer(ctx);
  let s = reduce(initialBattleState(ctx), { type: 'START' });
  let afterLastAnswer: BattleState | null = null;
  const timings: AnswerTiming[] = [];
  let issuedAt = startedAt;
  let freezeAt: number | null = null;

  for (const e of log) {
    if (s.phase !== 'playing') break;
    const q = ctx.questions[s.idx];
    if (e.t === 'cast') {
      const before = s;
      s = reduce(s, { type: 'CAST', skill: e.skill });
      if (e.skill === 'freeze' && s !== before) freezeAt = Math.max(issuedAt, e.at);
      continue;
    }
    if (e.qid !== q.id) continue; // stale or forged answer for another question

    // Time spent frozen doesn't count — but only the part that actually elapsed.
    const frozenMs = freezeAt === null ? 0 : Math.max(0, Math.min(FREEZE_SECONDS * 1000, e.at - freezeAt));
    const elapsed = e.at - issuedAt;
    const allowedMs = s.questionTime * 1000 + frozenMs + TIMEOUT_GRACE_MS;
    const timedOut = e.chosen === -1 || elapsed > allowedMs;
    const counted = Math.max(0, Math.min(elapsed - frozenMs, s.questionTime * 1000));
    const chosen = timedOut || !Number.isInteger(e.chosen) || e.chosen < -1 || e.chosen >= q.options.length ? -1 : e.chosen;

    s = { ...s, timeLeft: s.questionTime - counted / 1000 };
    s = reduce(s, { type: 'ANSWER', idx: chosen });
    afterLastAnswer = s;
    timings.push({ questionId: q.id, elapsedMs: elapsed - frozenMs, minPlausibleMs: minPlausibleMs(q), timedOut });
    s = reduce(s, { type: 'NEXT' });
    issuedAt = e.at + FEEDBACK_MS;
    freezeAt = null;
  }
  return { state: s, afterLastAnswer, timings, issuedAt };
}

export type AppendResult = { ok: true; rebuilt: Rebuilt; afterAnswer: BattleState | null } | { ok: false; status: number; reason: string };

/** Validate and apply one new action on top of an existing log. */
export function appendEntry(ctx: BattleCtx, startedAt: number, log: SessionLogEntry[], entry: SessionLogEntry): AppendResult {
  const before = rebuildSession(ctx, startedAt, log);
  if (before.state.phase !== 'playing') return { ok: false, status: 409, reason: 'Trận đấu đã kết thúc.' };
  const current = ctx.questions[before.state.idx];

  if (entry.t === 'answer') {
    if (entry.qid !== current.id) return { ok: false, status: 409, reason: 'Câu hỏi này đã được trả lời hoặc không phải câu hiện tại.' };
    const after = rebuildSession(ctx, startedAt, [...log, entry]);
    return { ok: true, rebuilt: after, afterAnswer: after.afterLastAnswer };
  }

  const after = rebuildSession(ctx, startedAt, [...log, entry]);
  if (after.state.mp === before.state.mp && after.state.casts.length === before.state.casts.length) {
    return { ok: false, status: 409, reason: 'Không thể dùng kỹ năng (thiếu MP hoặc đang có hiệu lực).' };
  }
  return { ok: true, rebuilt: after, afterAnswer: null };
}

/** What a student may see about the current question: no correct answer, no explanation. */
export interface PublicQuestion {
  id: number;
  index: number;
  question: string;
  options: string[];
  difficulty: Question['difficulty'];
  topic: string;
  is_review?: boolean;
  /** Only once unlocked by a Miracle Buff or an enraged boss. */
  hint?: string;
}

export function publicQuestion(ctx: BattleCtx, s: BattleState): PublicQuestion | null {
  if (s.phase !== 'playing') return null;
  const q = ctx.questions[s.idx];
  if (!q) return null;
  return {
    id: q.id,
    index: s.idx,
    question: q.question,
    options: q.options,
    difficulty: q.difficulty,
    topic: q.topic,
    is_review: q.is_review,
    hint: s.hintUnlocked ? q.hint : undefined,
  };
}

/** Revealed only after the student has locked in an answer. */
export interface AnswerReveal {
  questionId: number;
  correctIdx: number;
  chosenIdx: number;
  explanation?: string;
}

export function revealFor(ctx: BattleCtx, afterAnswer: BattleState): AnswerReveal | null {
  const last = afterAnswer.answers[afterAnswer.answers.length - 1];
  const q = last && ctx.questions.find((x) => x.id === last.questionId);
  if (!q) return null;
  return { questionId: q.id, correctIdx: q.correct_idx, chosenIdx: last.chosenIdx, explanation: q.explanation };
}
