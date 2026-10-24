import type { Grade, MatchPair, Question, QuestionType, SkillId } from './types';
import { questionType, sessionPermutation } from './questionTypes';
import { wordCount } from './normalize';
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
  /** `grade` is computed by the server BEFORE the entry is written — replays never re-grade. */
  | { t: 'answer'; qid: number; chosen: number; at: number; grade?: Grade; response?: string }
  /** Matching: one pair try, both as ORIGINAL indices (the server maps display ids). */
  | { t: 'pair'; qid: number; l: number; r: number; at: number }
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
    const late = elapsed > allowedMs;
    const counted = Math.max(0, Math.min(elapsed - frozenMs, s.questionTime * 1000));
    s = { ...s, timeLeft: s.questionTime - counted / 1000 };

    let timedOut = false;
    let typed = 0;
    if (e.t === 'pair' && !late) {
      s = reduce(s, { type: 'PAIR', left: e.l, right: e.r });
      if (s.selected === null) continue; // more pairs to go
    } else {
      // A late pair closes the matching question as a timeout, keeping matched pairs.
      const picked = e.t === 'answer' ? e.chosen : -1;
      timedOut = e.t === 'pair' || picked === -1 || late;
      const isMcq = questionType(q) === 'mcq';
      const chosen = timedOut ? -1 : isMcq ? (Number.isInteger(picked) && picked >= 0 && picked < q.options.length ? picked : -1) : 0;
      const grade = e.t === 'answer' && !timedOut ? e.grade : undefined;
      const response = e.t === 'answer' ? e.response : undefined;
      typed = response ? wordCount(response) : 0;
      s = reduce(s, { type: 'ANSWER', idx: chosen, grade, response });
    }
    afterLastAnswer = s;
    timings.push({ questionId: q.id, elapsedMs: elapsed - frozenMs, minPlausibleMs: minPlausibleMs(q, typed), timedOut, typedWords: typed });
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

  if (entry.t === 'answer' || entry.t === 'pair') {
    if (entry.qid !== current.id) return { ok: false, status: 409, reason: 'Câu hỏi này đã được trả lời hoặc không phải câu hiện tại.' };
    if (entry.t === 'pair' && questionType(current) !== 'matching') return { ok: false, status: 400, reason: 'Câu hiện tại không phải dạng nối cặp.' };
    const after = rebuildSession(ctx, startedAt, [...log, entry]);
    if (entry.t === 'pair') {
      const sameQuestion = after.state.idx === before.state.idx && after.state.phase === 'playing';
      if (sameQuestion && JSON.stringify(after.state.match) === JSON.stringify(before.state.match)) {
        return { ok: false, status: 409, reason: 'Cặp này đã được nối.' };
      }
      // Completing the last pair locks the question in like an answer.
      const completed = after.afterLastAnswer && after.afterLastAnswer !== before.afterLastAnswer && !sameQuestion;
      return { ok: true, rebuilt: after, afterAnswer: completed ? after.afterLastAnswer : null };
    }
    return { ok: true, rebuilt: after, afterAnswer: after.afterLastAnswer };
  }

  const after = rebuildSession(ctx, startedAt, [...log, entry]);
  if (after.state.mp === before.state.mp && after.state.casts.length === before.state.casts.length) {
    return { ok: false, status: 409, reason: 'Không thể dùng kỹ năng (thiếu MP hoặc đang có hiệu lực).' };
  }
  return { ok: true, rebuilt: after, afterAnswer: null };
}

/**
 * What a student may see about the current question. Never the answer key:
 * no correct option, explanation, rubric, sample answer, accepted rewrites,
 * canonical token order, pair mapping or gap answers.
 */
export interface PublicQuestion {
  id: number;
  index: number;
  type: QuestionType;
  question: string;
  difficulty: Question['difficulty'];
  topic: string;
  is_review?: boolean;
  /** Only once unlocked by a Miracle Buff, Eye of Truth or an enraged boss. */
  hint?: string;
  /** mcq */
  options?: string[];
  /** essay / reading / transform: word limits */
  minWords?: number;
  maxWords?: number;
  /** reading */
  passage?: string;
  /** matching: hub concept, left column (original order), right column (shuffled, display ids) */
  hub?: string;
  leftItems?: string[];
  rightItems?: { id: number; text: string }[];
  /** matching: pairs already matched, as (left index, right display id) */
  matched?: { left: number; right: number }[];
  /** transform */
  source?: string;
  cue?: string;
  /** reorder: chips in shuffled order with display ids */
  chips?: { id: number; text: string }[];
  /** cloze: text with {{n}} gaps, and an optional shuffled word bank */
  clozeText?: string;
  gapCount?: number;
  wordBank?: string[];
  /** Server-added: salted hashes so the UI can light up key phrases / correct prefixes without knowing them. */
  salt?: string;
  keyHashes?: string[];
  prefixHashes?: string[];
}

/** Right-column / chip permutations for this session (display id → original index). */
export function rightPermutation(ctx: BattleCtx, q: Question): number[] {
  return sessionPermutation(ctx.seed ?? 0, q.id, q.pairs?.length ?? 0, 'right');
}
export function chipPermutation(ctx: BattleCtx, q: Question): number[] {
  return sessionPermutation(ctx.seed ?? 0, q.id, q.tokens?.length ?? 0, 'chips');
}

export function publicQuestion(ctx: BattleCtx, s: BattleState): PublicQuestion | null {
  if (s.phase !== 'playing') return null;
  const q = ctx.questions[s.idx];
  if (!q) return null;
  const type = questionType(q);
  const base: PublicQuestion = {
    id: q.id,
    index: s.idx,
    type,
    question: q.question,
    difficulty: q.difficulty,
    topic: q.topic,
    is_review: q.is_review,
    hint: s.hintUnlocked ? q.hint : undefined,
  };
  switch (type) {
    case 'mcq':
      return { ...base, options: q.options };
    case 'essay':
    case 'reading':
      return { ...base, passage: q.passage, minWords: q.min_words, maxWords: q.max_words };
    case 'matching': {
      const perm = rightPermutation(ctx, q);
      const pairs = q.pairs ?? [];
      const m = s.match?.qid === q.id ? s.match.matched : [];
      return {
        ...base,
        hub: q.hub,
        leftItems: pairs.map((p) => p.left),
        rightItems: perm.map((orig, id) => ({ id, text: pairs[orig].right })),
        matched: m.map((left) => ({ left, right: perm.indexOf(left) })),
      };
    }
    case 'transform':
      return { ...base, source: q.source, cue: q.cue };
    case 'reorder': {
      const perm = chipPermutation(ctx, q);
      return { ...base, chips: perm.map((orig, id) => ({ id, text: (q.tokens ?? [])[orig] })) };
    }
    case 'cloze': {
      const bank = q.word_bank?.length ? sessionPermutation(ctx.seed ?? 0, q.id, q.word_bank.length, 'bank').map((i) => q.word_bank![i]) : undefined;
      return { ...base, clozeText: q.text, gapCount: q.gaps?.length ?? 0, wordBank: bank };
    }
  }
}

/** Revealed only after the student has locked in an answer. */
export interface AnswerReveal {
  questionId: number;
  type: QuestionType;
  /** mcq: the right option; -1 for other formats. */
  correctIdx: number;
  chosenIdx: number;
  explanation?: string;
  /** 0..1 credit for this answer. */
  score?: number;
  grade?: Grade;
  /** Model answer(s): accepted rewrite, correct sentence, gap answers, sample answer / key points. */
  solution?: string[];
  pairs?: MatchPair[];
  /** matching: deep explanation unlocked after the Ultimate. */
  deepInsight?: string;
}

export function revealFor(ctx: BattleCtx, afterAnswer: BattleState, grade?: Grade): AnswerReveal | null {
  const last = afterAnswer.answers[afterAnswer.answers.length - 1];
  const q = last && ctx.questions.find((x) => x.id === last.questionId);
  if (!q) return null;
  const type = questionType(q);
  const base: AnswerReveal = {
    questionId: q.id,
    type,
    correctIdx: type === 'mcq' ? q.correct_idx : -1,
    chosenIdx: last.chosenIdx,
    explanation: q.explanation,
    score: last.score ?? (last.chosenIdx === q.correct_idx ? 1 : 0),
    ...(grade ? { grade } : {}),
  };
  switch (type) {
    case 'mcq':
      return base;
    case 'essay':
    case 'reading':
      return { ...base, solution: q.sample_answer ? [q.sample_answer] : q.key_points };
    case 'matching':
      return { ...base, pairs: q.pairs, deepInsight: q.deep_insight };
    case 'transform':
      return { ...base, solution: q.answers };
    case 'reorder':
      return { ...base, solution: [(q.tokens ?? []).join(' '), ...(q.answers ?? [])] };
    case 'cloze':
      return { ...base, solution: (q.gaps ?? []).map((g) => g.answers[0]) };
  }
}
