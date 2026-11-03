import { battleReducer, initialBattleState, type BattleCtx, type BattleState } from './battleState';
import { minPlausibleMs, type AnswerTiming } from './anticheat';
import { matchClockAt, type MatchTime } from './match';
import { wordCount } from './normalize';
import { adaptState, matchSlots, pickForSlot, reviewForm, serverTimeOf, type AskedRecord, type QuestionSlot, type SchedulePlan } from './questionSchedule';
import { isAnswerCorrect, questionTimeLimit, questionType } from './questionTypes';
import { FEEDBACK_MS, type Rebuilt, type SessionLogEntry } from './session';
import { FREEZE_SECONDS } from './skills';
import type { Question } from './types';

// WP7 (03/11/2026): a student's session inside a CLASS match follows the match's question schedule
// (questionSchedule.ts) instead of walking the material in order.
//
//  - Every device and the server see the same points at the same second (match clock + shared seed).
//  - At each point the server picks the student's question with `pickForSlot`: by level, wrong ones
//    coming back in another form, one step easier after 2 wrong in a row, one step harder when the
//    student took the golden challenge (C4.9).
//  - A question is only shown while its point is open; a point that closes unanswered counts as a
//    timeout. The chốt is 3 questions back to back inside its window.
//  - Points that closed before the student joined are skipped (not counted).
//
// The battle reducer is reused unchanged: the replay feeds it a growing list of SERVED questions
// (`ctx.questions`), picking the next one before each NEXT. Solo and demo sessions keep the
// sequential `rebuildSession`.

export interface ClassSchedule {
  time: MatchTime;
  plan: SchedulePlan;
  /** Seeds the per-student pick (the session id). */
  studentId: string;
  /** The student's own teaching level 0..5 (`personalLevel`). */
  level: number;
}

/** Recent accuracy of an average student (match_players.skill default). */
export const DEFAULT_SKILL = 0.6;

/**
 * The student's own level for question picks (owner, 03/11): the class level moved by their recent
 * accuracy in this class (match_players.skill, 0..1): +1 level per 0.2 above 0.6, −1 per 0.2 below.
 * No history (null) = the class level.
 */
export function personalLevel(classLevel: number, skill: number | null | undefined): number {
  const base = Number.isFinite(classLevel) ? classLevel : 3;
  const s = typeof skill === 'number' && Number.isFinite(skill) ? Math.max(0, Math.min(1, skill)) : DEFAULT_SKILL;
  return Math.max(0, Math.min(5, Math.round(base + (s - DEFAULT_SKILL) * 5)));
}

export interface ClassSlotView {
  id: string;
  kind: QuestionSlot['kind'];
  stage: number;
  /** 0..2 inside a chốt. */
  chain: number;
  questions: number;
  /** The point glows gold (C4.9) and the student may still take the challenge. */
  golden: boolean;
  goldenTaken: boolean;
  /** The current question may be answered now. */
  open: boolean;
  /** Server epoch ms; null while paused or before the start. */
  opensAt: number | null;
  closesAt: number | null;
}

export interface ClassRebuilt extends Rebuilt {
  /** The battle context with the questions this student was actually served (answer keys inside). */
  ctx: BattleCtx;
  /** The point of the current question (open or coming), null when none is left. */
  slot: ClassSlotView | null;
}

/**
 * A question served again (a wrong one coming back, or a spaced review) gets its own id:
 * original id + REVIEW_ID_STEP × n. Scoring, reveal and coins then never confuse the copy (options
 * in a new order) with the first time it was asked. `originalQuestionId` maps it back.
 */
export const REVIEW_ID_STEP = 1_000_000;

export function originalQuestionId(id: number): number {
  return id % REVIEW_ID_STEP;
}

export function rebuildClassSession(base: BattleCtx, sched: ClassSchedule, startedAt: number, log: SessionLogEntry[], now: number): ClassRebuilt {
  const { time, plan } = sched;
  const slots = matchSlots(plan, time.extended, time.extraStages);
  const clock = matchClockAt(time, now);
  const nowPlay = time.status === 'lobby' ? -1 : clock.elapsedMs;
  const finished = time.status === 'ended' || clock.over;
  const byId = new Map(base.questions.map((q) => [q.id, q]));

  // First point for this student: the first one still open when they joined, or the first point
  // they answered (whichever is earlier: a pause after joining shifts the join estimate).
  const joinPlay = time.status === 'lobby' || time.startedAt == null || startedAt <= time.startedAt ? 0 : matchClockAt({ ...time, status: 'running', pausedAt: null }, startedAt).elapsedMs;
  let si = slots.findIndex((s) => s.closesMs > joinPlay);
  const firstLogged = log.find((e) => (e.t === 'answer' || e.t === 'pair') && !!e.slot) as { slot?: string } | undefined;
  const loggedIdx = firstLogged ? slots.findIndex((s) => s.id === firstLogged.slot) : -1;
  if (loggedIdx >= 0 && (si < 0 || loggedIdx < si)) si = loggedIdx;

  const served: Question[] = [];
  // Out of HP is not the end in a class match: the clock decides (owner, 03/11).
  const ctx: BattleCtx = { ...base, questions: served, keepPlaying: true };
  const reduce = battleReducer(ctx);
  const history: AskedRecord[] = [];
  const results: boolean[] = [];
  const timings: AnswerTiming[] = [];
  const goldenTaken = new Set<string>();
  let chain = 0;
  let issuedAt: number | null = null; // server time the current chain question was served (chain > 0)
  let freezeAt: number | null = null;
  let afterLastAnswer: BattleState | null = null;

  const servedTimes = new Map<number, number>();
  const pick = (slot: QuestionSlot, chainIndex: number, golden = false): Question | null => {
    const p = pickForSlot({ questions: base.questions, plan, slot, chainIndex, studentId: sched.studentId, level: sched.level, history, easier: adaptState(results).easier, golden });
    const q = p ? byId.get(p.qid) : undefined;
    if (!p || !q) return null;
    const form = p.review ? reviewForm(q, `${plan.seed}:${sched.studentId}:${slot.id}`).question : q;
    const n = servedTimes.get(q.id) ?? 0;
    servedTimes.set(q.id, n + 1);
    return n === 0 ? form : { ...form, id: q.id + REVIEW_ID_STEP * n, is_review: true };
  };

  const slotOpensAt = (slot: QuestionSlot) => serverTimeOf(time, slot.atMs);
  const slotClosesAt = (slot: QuestionSlot) => serverTimeOf(time, slot.closesMs);

  // Serve the first question.
  let s: BattleState;
  if (si >= 0) {
    const first = pick(slots[si], 0);
    if (first) served.push(first);
  } else si = slots.length;
  s = reduce(initialBattleState(ctx), { type: 'START' });

  /** Record the final answer of the current question, then serve the next one (or end). */
  const afterFinal = (q: Question, slotId: string, at: number) => {
    const rec = s.answers[s.answers.length - 1];
    const correct = !!rec && rec.questionId === q.id && isAnswerCorrect(q, rec);
    results.push(correct);
    history.push({ qid: originalQuestionId(q.id), slotId, correct });
    afterLastAnswer = s;
    freezeAt = null;
    const slot = slots[si];
    const close = slotClosesAt(slot);
    // Next question of a chốt, only if it is served before the window closes.
    if (chain + 1 < slot.questions && (close == null || at + FEEDBACK_MS < close)) {
      const nq = pick(slot, chain + 1);
      if (nq) {
        served.push(nq);
        chain += 1;
        issuedAt = at + FEEDBACK_MS;
        s = reduce(s, { type: 'NEXT' });
        return;
      }
    }
    advanceSlot();
  };

  /** Leave the current point: serve the first question of the next one (or end the session). */
  const advanceSlot = () => {
    si += 1;
    chain = 0;
    issuedAt = null;
    const nq = si < slots.length ? pick(slots[si], 0) : null;
    if (nq) served.push(nq);
    else si = slots.length;
    s = reduce(s, { type: 'NEXT' });
  };

  /** The current point closed unanswered: a timeout (never shown again unless picked as a review). */
  const timeoutCurrent = () => {
    const q = served[s.idx];
    const slot = slots[si];
    if (!q || !slot) return;
    s = reduce({ ...s, timeLeft: 0 }, { type: 'ANSWER', idx: -1 });
    timings.push({ questionId: q.id, elapsedMs: s.questionTime * 1000, minPlausibleMs: minPlausibleMs(q, 0), timedOut: true, typedWords: 0 });
    const close = slotClosesAt(slot) ?? 0;
    // The rest of a chốt that ran out of time is not served.
    chain = slot.questions;
    afterFinal(q, slot.id, close);
  };

  /** Close every point that ended before playing time `play` (exclusive of the open one). */
  const closeUntil = (play: number) => {
    while (s.phase === 'playing' && si < slots.length && slots[si].closesMs <= play) {
      if (s.selected === null) timeoutCurrent();
      else advanceSlot();
    }
  };

  /** Earlier points closed without an answer: timeouts, up to point `target`. */
  const moveTo = (target: number) => {
    while (s.phase === 'playing' && si < target) {
      if (s.selected === null) timeoutCurrent();
      else advanceSlot();
    }
  };

  for (const e of log) {
    if (s.phase !== 'playing') break;
    if (e.t === 'cast') {
      const before = s;
      s = reduce(s, { type: 'CAST', skill: e.skill });
      if (e.skill === 'freeze' && s !== before) freezeAt = e.at;
      continue;
    }
    if (e.t === 'golden') {
      const target = slots.findIndex((x) => x.id === e.slot);
      if (target < 0) continue;
      moveTo(target);
      const slot = slots[si];
      const q = served[s.idx];
      if (!slot || slot.id !== e.slot || !slot.golden || chain !== 0 || goldenTaken.has(slot.id) || s.selected !== null || s.match || !q) continue;
      const harder = pick(slot, 0, true);
      goldenTaken.add(slot.id);
      const unserve = (x: Question) => servedTimes.set(originalQuestionId(x.id), (servedTimes.get(originalQuestionId(x.id)) ?? 1) - 1);
      if (harder && originalQuestionId(harder.id) === originalQuestionId(q.id)) unserve(harder);
      else if (harder) {
        unserve(q); // the easier one was never asked
        served[s.idx] = harder;
        const t = questionTimeLimit(harder, ctx.config.level);
        s = { ...s, questionTime: t, timeLeft: t, removed: [], match: null, hintUnlocked: false };
      }
      continue;
    }
    // Answers: move to the point they were given at (earlier points closed unanswered = timeouts).
    const target = e.slot ? slots.findIndex((x) => x.id === e.slot) : si;
    if (target < 0) continue;
    moveTo(target);
    if (s.phase !== 'playing' || si !== target) continue;
    const q = served[s.idx];
    if (!q || e.qid !== q.id) continue; // stale or forged answer for another question

    const slot = slots[si];
    const iss = e.iss ?? issuedAt ?? slotOpensAt(slot) ?? e.at;
    const frozenMs = freezeAt === null ? 0 : Math.max(0, Math.min(FREEZE_SECONDS * 1000, e.at - freezeAt));
    const elapsed = Math.max(0, e.at - iss);
    const counted = Math.max(0, Math.min(elapsed - frozenMs, s.questionTime * 1000));
    s = { ...s, timeLeft: s.questionTime - counted / 1000 };

    let typed = 0;
    let timedOut = false;
    if (e.t === 'pair') {
      s = reduce(s, { type: 'PAIR', left: e.l, right: e.r });
      if (s.selected === null) continue; // more pairs to go
    } else {
      const isMcq = questionType(q) === 'mcq';
      timedOut = e.chosen === -1;
      const chosen = timedOut ? -1 : isMcq ? (Number.isInteger(e.chosen) && e.chosen >= 0 && e.chosen < q.options.length ? e.chosen : -1) : 0;
      typed = e.response ? wordCount(e.response) : 0;
      s = reduce(s, { type: 'ANSWER', idx: chosen, grade: timedOut ? undefined : e.grade, response: e.response });
    }
    timings.push({ questionId: q.id, elapsedMs: elapsed - frozenMs, minPlausibleMs: minPlausibleMs(q, typed), timedOut, typedWords: typed });
    afterFinal(q, slot.id, e.at);
  }

  // Up to now: points that closed without an answer are timeouts.
  if (nowPlay >= 0) closeUntil(nowPlay);
  // The match is over (time up or the tutor ended it): the session ends with the points played.
  if (finished && s.phase === 'playing') {
    if (s.selected === null && served.length > s.idx) served.length = s.idx;
    s = { ...s, phase: 'result', outcome: 'victory', selected: null, event: { kind: 'victory', n: (s.event?.n ?? 0) + 1 } };
  }

  let view: ClassSlotView | null = null;
  const slot = s.phase === 'playing' ? slots[si] : undefined;
  if (slot) {
    const opensAt = chain > 0 ? issuedAt : slotOpensAt(slot);
    const closesAt = slotClosesAt(slot);
    const running = time.status === 'running';
    const open = running && s.selected === null && nowPlay >= slot.atMs && nowPlay < slot.closesMs && (opensAt == null || now >= opensAt);
    view = {
      id: slot.id,
      kind: slot.kind,
      stage: slot.stage,
      chain,
      questions: slot.questions,
      golden: slot.golden && chain === 0 && !goldenTaken.has(slot.id) && s.selected === null && !s.match,
      goldenTaken: goldenTaken.has(slot.id),
      open,
      opensAt,
      closesAt,
    };
  }
  return { state: s, afterLastAnswer, timings, issuedAt: view?.opensAt ?? now, ctx, slot: view };
}

/** `entry` is what to store: the action stamped with its point (`slot`) and serve time (`iss`). */
export type ClassAppend = { ok: true; rebuilt: ClassRebuilt; afterAnswer: BattleState | null; entry: SessionLogEntry } | { ok: false; status: number; reason: string };

/**
 * Validate one new action of a class session against the schedule at server time `at`, stamp it
 * with its point and serve time, and apply it.
 */
export function appendClassEntry(base: BattleCtx, sched: ClassSchedule, startedAt: number, log: SessionLogEntry[], entry: SessionLogEntry, at: number): ClassAppend {
  const before = rebuildClassSession(base, sched, startedAt, log, at);
  if (before.state.phase !== 'playing') return { ok: false, status: 409, reason: 'Trận đấu đã kết thúc.' };
  const slot = before.slot;
  if (entry.t === 'cast') {
    const after = rebuildClassSession(base, sched, startedAt, [...log, entry], at);
    if (after.state.mp === before.state.mp && after.state.casts.length === before.state.casts.length) return { ok: false, status: 409, reason: 'Không thể dùng kỹ năng (thiếu MP hoặc đang có hiệu lực).' };
    return { ok: true, rebuilt: after, afterAnswer: null, entry };
  }
  if (!slot || !slot.open) return { ok: false, status: 409, reason: 'Chưa tới điểm hỏi — chờ câu tiếp theo nhé.' };
  const stamped = (entry.t === 'golden' ? { ...entry, slot: slot.id } : { ...entry, slot: slot.id, iss: slot.opensAt ?? at }) as SessionLogEntry;
  if (entry.t === 'golden') {
    if (!slot.golden) return { ok: false, status: 409, reason: 'Chưa có vật phát sáng lúc này.' };
    const after = rebuildClassSession(base, sched, startedAt, [...log, stamped], at);
    if (!after.slot?.goldenTaken) return { ok: false, status: 409, reason: 'Chưa có vật phát sáng lúc này.' };
    return { ok: true, rebuilt: after, afterAnswer: null, entry: stamped };
  }
  const current = before.ctx.questions[before.state.idx];
  if (!current || entry.qid !== current.id) return { ok: false, status: 409, reason: 'Câu hỏi này đã được trả lời hoặc không phải câu hiện tại.' };
  if (entry.t === 'pair' && questionType(current) !== 'matching') return { ok: false, status: 400, reason: 'Câu hiện tại không phải dạng nối cặp.' };
  const after = rebuildClassSession(base, sched, startedAt, [...log, stamped], at);
  if (entry.t === 'pair') {
    const sameQuestion = after.state.idx === before.state.idx && after.state.phase === 'playing' && after.state.selected === null;
    if (sameQuestion && JSON.stringify(after.state.match) === JSON.stringify(before.state.match)) return { ok: false, status: 409, reason: 'Cặp này đã được nối.' };
    const completed = after.afterLastAnswer && after.afterLastAnswer !== before.afterLastAnswer && !sameQuestion;
    return { ok: true, rebuilt: after, afterAnswer: completed ? after.afterLastAnswer : null, entry: stamped };
  }
  return { ok: true, rebuilt: after, afterAnswer: after.afterLastAnswer, entry: stamped };
}

/** Questions a full class schedule asks (chốt counted ×3), for progress bars. */
export function classQuestionTotal(sched: ClassSchedule): number {
  return matchSlots(sched.plan, sched.time.extended, sched.time.extraStages).reduce((n, s) => n + s.questions, 0);
}
