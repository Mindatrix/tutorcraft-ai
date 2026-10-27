// Question schedule of a class match (phase C4.6–C4.10). Pure and deterministic: every device and
// the server compute the same question points from the match clock (server time, pauses excluded,
// see match.ts) and one shared seed, so nothing extra is broadcast.
//
// One stage (5 minutes):
//   0–20 s   opening (story beat, no question)
//   points   regular question points, evenly spaced; one of them may glow gold (C4.9)
//   "chốt"   3 questions back to back, big reward, closes exactly 25 s before the stage ends
//   last 25 s summary and quick ranking
// Pace by the tutor's question count (C4.7):
//   ≥ 60 questions: 8–9 questions per stage (~30 s each), each stage = its own part of the material
//   30–59:          7 per stage (~35 s each), same split
//   < 30 (20):      7 per stage: 3–4 new ones + the student's wrong ones back in another form
// Pausing freezes the elapsed time, so every point simply moves by the pause; "Kéo dài" adds
// stages 7–8 (review of the whole material) without moving any earlier point.

import { matchClockAt, STAGE_MS, type MatchTime } from './match';
import { QUESTION_RULES } from './consequences';
import { questionType } from './questionTypes';
import type { Difficulty, Question } from './types';
import { hashString, mulberry32, seededShuffle } from './variants';

export const STAGE_INTRO_MS = 20_000;
export const STAGE_OUTRO_MS = 25_000;
export const CHOT_QUESTIONS = QUESTION_RULES.chot.questions;
/** One question at most: the 25 s limit plus the ~1.5 s answer feedback. */
export const QUESTION_SLOT_MS = QUESTION_RULES.questionLimitMs + QUESTION_RULES.feedbackMs;

export type PaceTier = 'large' | 'medium' | 'small';

export interface Pace {
  tier: PaceTier;
  questionCount: number;
  /** Questions per stage, chốt included (large: 8 or 9 by stage). */
  perStage: number[];
}

export interface QuestionSlot {
  /** "s3-2" (3rd point of stage 3) or "s3-chot". */
  id: string;
  stage: number;
  index: number;
  kind: 'point' | 'chot';
  /** Opens / closes, in ms of playing time since the match start (pauses excluded). */
  atMs: number;
  closesMs: number;
  /** Questions in this slot (1, or 3 for the chốt). */
  questions: number;
  /** A glowing object: the student may take a harder question for double coins (C4.9). */
  golden: boolean;
}

export interface SchedulePlan {
  seed: number;
  questionCount: number;
  stageMs: number;
  coreStages: number;
}

/** C4.7 pace from the number of questions the tutor asked for. */
export function paceTier(questionCount: number): PaceTier {
  if (questionCount >= 60) return 'large';
  if (questionCount >= 30) return 'medium';
  return 'small';
}

/** Questions in one stage, chốt included. Large: 8 or 9 (seeded per stage), otherwise 7. */
export function questionsInStage(plan: SchedulePlan, stage: number): number {
  const tier = paceTier(plan.questionCount);
  const want = tier === 'large' ? 8 + (hashString(`${plan.seed}:pace:${stage}`) & 1) : 7;
  // A shorter stage (tests, demos) never squeezes questions closer than one full slot.
  const room = plan.stageMs - STAGE_INTRO_MS - STAGE_OUTRO_MS - CHOT_QUESTIONS * QUESTION_SLOT_MS;
  const fit = Math.max(0, Math.floor(room / QUESTION_SLOT_MS));
  return CHOT_QUESTIONS + Math.max(1, Math.min(want - CHOT_QUESTIONS, fit));
}

export function paceFor(plan: SchedulePlan): Pace {
  return { tier: paceTier(plan.questionCount), questionCount: plan.questionCount, perStage: Array.from({ length: plan.coreStages + 2 }, (_, i) => questionsInStage(plan, i + 1)) };
}

/** The points of one stage (stage-relative times turned into match playing time). */
export function stageSlots(plan: SchedulePlan, stage: number): QuestionSlot[] {
  const start = (stage - 1) * plan.stageMs;
  const regular = questionsInStage(plan, stage) - CHOT_QUESTIONS;
  const chotAt = plan.stageMs - STAGE_OUTRO_MS - CHOT_QUESTIONS * QUESTION_SLOT_MS;
  const gap = (chotAt - STAGE_INTRO_MS) / regular;
  const rand = mulberry32(hashString(`${plan.seed}:golden:${stage}`));
  // About two stages in three have one golden point, never the first point of a stage.
  const golden = regular > 1 && rand() < 0.67 ? 1 + Math.floor(rand() * (regular - 1)) : -1;
  const slots: QuestionSlot[] = [];
  for (let i = 0; i < regular; i++) {
    const at = Math.round(STAGE_INTRO_MS + i * gap);
    slots.push({ id: `s${stage}-${i + 1}`, stage, index: i, kind: 'point', atMs: start + at, closesMs: start + at + QUESTION_SLOT_MS, questions: 1, golden: i === golden });
  }
  slots.push({ id: `s${stage}-chot`, stage, index: regular, kind: 'chot', atMs: start + chotAt, closesMs: start + plan.stageMs - STAGE_OUTRO_MS, questions: CHOT_QUESTIONS, golden: false });
  return slots;
}

/** Every slot of the match (core stages, plus the 2 optional ones when extended). */
export function matchSlots(plan: SchedulePlan, extended = false, extraStages = 2): QuestionSlot[] {
  const n = plan.coreStages + (extended ? extraStages : 0);
  return Array.from({ length: n }, (_, i) => stageSlots(plan, i + 1)).flat();
}

export function schedulePlanFor(t: Pick<MatchTime, 'stageMs' | 'coreStages'>, seedKey: string, questionCount: number): SchedulePlan {
  return { seed: hashString(`${seedKey}:questions`), questionCount, stageMs: t.stageMs || STAGE_MS, coreStages: t.coreStages };
}

export type SchedulePhase = 'lobby' | 'intro' | 'play' | 'question' | 'chot' | 'outro' | 'ended';

export interface ScheduleNow {
  phase: SchedulePhase;
  stage: number;
  paused: boolean;
  /** The open slot (question / chot), or the next one (play / intro). */
  slot: QuestionSlot | null;
  next: QuestionSlot | null;
  /** Server epoch ms when `slot` opens / closes; null while paused or before the start. */
  opensAt: number | null;
  closesAt: number | null;
  /** Playing time (ms) since the match start. */
  elapsedMs: number;
}

/** Server epoch ms of a playing-time instant, for a running match (null when paused / lobby). */
export function serverTimeOf(t: MatchTime, playMs: number): number | null {
  if (t.status !== 'running' || t.startedAt == null) return null;
  return t.startedAt + t.pausedMs + playMs;
}

/** Where the match is in the schedule at server time `now`. Same answer on every device. */
export function scheduleAt(t: MatchTime, now: number, plan: SchedulePlan): ScheduleNow {
  const c = matchClockAt(t, now);
  const base = { stage: c.stage, paused: t.status === 'paused', elapsedMs: c.elapsedMs };
  if (t.status === 'lobby') return { ...base, phase: 'lobby', slot: null, next: stageSlots(plan, 1)[0], opensAt: null, closesAt: null };
  if (t.status === 'ended' || c.over) return { ...base, phase: 'ended', slot: null, next: null, opensAt: null, closesAt: null };
  const slots = stageSlots(plan, c.stage);
  const open = slots.find((s) => s.atMs <= c.elapsedMs && c.elapsedMs < s.closesMs) ?? null;
  const next = slots.find((s) => s.atMs > c.elapsedMs) ?? (c.stage < c.stageCount ? stageSlots(plan, c.stage + 1)[0] : null);
  const stageStart = (c.stage - 1) * plan.stageMs;
  let phase: SchedulePhase = 'play';
  if (open) phase = open.kind === 'chot' ? 'chot' : 'question';
  else if (c.elapsedMs - stageStart < STAGE_INTRO_MS) phase = 'intro';
  else if (c.elapsedMs >= stageStart + plan.stageMs - STAGE_OUTRO_MS) phase = 'outro';
  const shown = open ?? next;
  return { ...base, phase, slot: open, next, opensAt: shown ? serverTimeOf(t, shown.atMs) : null, closesAt: shown ? serverTimeOf(t, shown.closesMs) : null };
}

// -------------------------------------------------------------------------------------------------
// What each student gets at a slot (C4.7, C4.9, C4.10): same slot for the whole class, content by
// the student's level, their wrong answers coming back in another form.

export interface AskedRecord {
  qid: number;
  slotId: string;
  correct: boolean;
}

export type ReviewForm = 'reordered' | 'two_choice' | 'retry';

export interface SlotPick {
  qid: number;
  /** A wrong answer coming back. */
  review: boolean;
  form: ReviewForm | null;
  difficulty: Difficulty;
  /** Picked harder because the student took the golden challenge. */
  golden: boolean;
}

export interface PickInput {
  /** The tutor's material, in its own order (tutor-chosen difficulty per question). */
  questions: Question[];
  plan: SchedulePlan;
  slot: QuestionSlot;
  /** Position inside a chốt (0..2). */
  chainIndex?: number;
  studentId: string;
  /** Class / student level 0..5 (levels.ts). */
  level: number;
  history: AskedRecord[];
  /** C4.8: two wrong in a row → one step easier. */
  easier?: boolean;
  /** C4.9: the student took the golden challenge → one step harder. */
  golden?: boolean;
}

const DIFF: Difficulty[] = ['easy', 'medium', 'hard'];
const levelDifficulty = (level: number): number => (level <= 1 ? 0 : level <= 3 ? 1 : 2);

/** Which part of the material a stage teaches (large / medium): equal slices in order. */
export function stagePool(questions: Question[], stage: number, coreStages: number): Question[] {
  if (stage > coreStages) return questions; // "Kéo dài": the whole material, as review
  const per = questions.length / coreStages;
  return questions.slice(Math.floor((stage - 1) * per), Math.floor(stage * per));
}

/** Small tier: new questions per stage (20 over 6 stages → 4, 4, 3, 3, 3, 3 in a seeded order). */
export function newQuota(plan: SchedulePlan, stage: number): number {
  if (stage > plan.coreStages) return 0;
  const n = plan.questionCount;
  const base = Math.floor(n / plan.coreStages);
  const extra = n - base * plan.coreStages;
  const order = seededShuffle(Array.from({ length: plan.coreStages }, (_, i) => i + 1), mulberry32(plan.seed ^ 0x51ed));
  return Math.min(4, base + (order.indexOf(stage) < extra ? 1 : 0));
}

/** Questions of the small tier that stage `stage` introduces (consecutive, in material order). */
export function smallStageNew(questions: Question[], plan: SchedulePlan, stage: number): Question[] {
  let from = 0;
  for (let s = 1; s < stage; s++) from += newQuota(plan, s);
  return questions.slice(from, from + newQuota(plan, stage));
}

/** A wrong answer is due again after at least one other question, until answered right (2 tries back). */
function dueReviews(history: AskedRecord[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  // Newest first: the latest try of each question decides; the oldest wrong one comes back first.
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (seen.has(h.qid)) continue;
    seen.add(h.qid);
    if (h.correct || i === history.length - 1) continue; // right now, or just asked
    if (history.filter((x) => x.qid === h.qid).length > 2) continue;
    out.unshift(h.qid);
  }
  return out;
}

/** Spaced review filler: the question asked longest ago (ever-missed ones first), not the last one. */
function spacedReview(history: AskedRecord[]): number | null {
  if (history.length < 2) return null;
  const last = new Map<number, number>();
  const missed = new Set<number>();
  history.forEach((h, i) => {
    last.set(h.qid, i);
    if (!h.correct) missed.add(h.qid);
  });
  const lastQid = history[history.length - 1].qid;
  const order = [...last.entries()].filter(([qid]) => qid !== lastQid).sort((a, b) => Number(missed.has(b[0])) - Number(missed.has(a[0])) || a[1] - b[1]);
  return order[0]?.[0] ?? null;
}

function closest(cands: Question[], target: number, rand: () => number): Question | null {
  if (!cands.length) return null;
  const shuffled = seededShuffle(cands, rand);
  return shuffled.reduce((best, q) => (Math.abs(DIFF.indexOf(q.difficulty) - target) < Math.abs(DIFF.indexOf(best.difficulty) - target) ? q : best));
}

/** The question a student gets at a slot. Deterministic for (seed, student, slot, history). */
export function pickForSlot(input: PickInput): SlotPick | null {
  const { questions, plan, slot, history } = input;
  if (!questions.length) return null;
  const rand = mulberry32(hashString(`${plan.seed}:${input.studentId}:${slot.id}:${input.chainIndex ?? 0}`));
  const asked = new Set(history.map((h) => h.qid));
  let target = levelDifficulty(input.level);
  if (input.easier) target = Math.max(0, target - 1);
  if (input.golden) target = Math.min(2, target + 1);
  const due = dueReviews(history);
  const tier = paceTier(plan.questionCount);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const review = (qid: number): SlotPick => {
    const q = byId.get(qid)!;
    return { qid, review: true, form: reviewForm(q, `${plan.seed}:${input.studentId}:${slot.id}`).form, difficulty: q.difficulty, golden: false };
  };
  const fresh = (q: Question): SlotPick => ({ qid: q.id, review: false, form: null, difficulty: q.difficulty, golden: !!input.golden });

  if (tier === 'small') {
    // Regular points: the stage's 3–4 new questions first, then the wrong ones back; the chốt
    // prefers reviews (it is the stage's test). Nothing new or wrong left: an earlier question in
    // another form (the oldest, ones ever missed first), so the ~7 points never run the material dry.
    const news = smallStageNew(questions, plan, slot.stage).filter((q) => !asked.has(q.id));
    const goldenPick = input.golden ? closest(questions.filter((q) => !asked.has(q.id) && DIFF.indexOf(q.difficulty) >= target), target, rand) : null;
    if (goldenPick) return fresh(goldenPick);
    if (slot.kind === 'chot' && due.length) return review(due[0]);
    if (news.length && !input.easier) return fresh(news[0]);
    if (due.length) return review(due[0]);
    if (news.length) return fresh(closest(news, target, rand)!);
    const old = spacedReview(history);
    if (old != null && byId.has(old)) return review(old);
    const unasked = questions.filter((q) => !asked.has(q.id));
    return fresh(closest(unasked.length ? unasked : questions, target, rand)!);
  }

  const pool = stagePool(questions, slot.stage, plan.coreStages);
  const unasked = pool.filter((q) => !asked.has(q.id));
  if (slot.kind === 'chot' && due.length && rand() < 0.5) return review(due[0]);
  if (input.easier && due.length === 0) {
    const easy = closest(unasked, target, rand);
    if (easy) return fresh(easy);
  }
  const pick = closest(unasked, target, rand);
  if (pick) return fresh(pick);
  if (due.length) return review(due[0]);
  const any = closest(questions.filter((q) => !asked.has(q.id)), target, rand) ?? closest(pool.length ? pool : questions, target, rand)!;
  return asked.has(any.id) ? review(any.id) : fresh(any);
}

/**
 * The same question in another form (server side, the answer key moves with it):
 *  - mcq with 3+ options: same options in a different order (the right one moves), or every second
 *    time only two options left (the right one and one wrong);
 *  - matching: the right column reshuffled (the session already shuffles per student);
 *  - other types: asked again as they are.
 */
export function reviewForm(q: Question, seed: string): { form: ReviewForm; question: Question } {
  const rand = mulberry32(hashString(`${seed}:${q.id}:form`));
  if (questionType(q) === 'mcq' && q.options.length >= 2) {
    const n = q.options.length;
    const form: ReviewForm = n >= 3 && rand() < 0.5 ? 'two_choice' : 'reordered';
    let idx = q.options.map((_, i) => i);
    if (form === 'two_choice') {
      const wrong = idx.filter((i) => i !== q.correct_idx);
      idx = [q.correct_idx, wrong[Math.floor(rand() * wrong.length)]];
    }
    // A different order in which the right option is not where it was.
    let order = seededShuffle(idx, rand);
    for (let k = 0; k < 6 && order.indexOf(q.correct_idx) === q.correct_idx && order.length > 1; k++) order = seededShuffle(idx, rand);
    if (order.indexOf(q.correct_idx) === q.correct_idx && order.length > 1) order = [...order.slice(1), order[0]];
    return { form, question: { ...q, options: order.map((i) => q.options[i]), correct_idx: order.indexOf(q.correct_idx), is_review: true } };
  }
  return { form: 'retry', question: { ...q, is_review: true } };
}

// -------------------------------------------------------------------------------------------------
// C4.8 Self-balancing difficulty

export interface AdaptState {
  rightInRow: number;
  wrongInRow: number;
  /** 2 wrong in a row: next question one step easier. */
  easier: boolean;
  /** …and its tier-1 hint shows by itself (free). */
  autoHint: boolean;
  /** 3 right in a row: combo on (level 1 at 3, 2 at 4…). */
  combo: number;
}

/** From the student's answers so far (true = right; a timeout counts as wrong). */
export function adaptState(results: boolean[]): AdaptState {
  let right = 0;
  let wrong = 0;
  for (const r of results) {
    if (r) {
      right += 1;
      wrong = 0;
    } else {
      wrong += 1;
      right = 0;
    }
  }
  const easier = wrong >= QUESTION_RULES.wrongInRowToEasier;
  const combo = right >= QUESTION_RULES.rightInRowToCombo ? right - QUESTION_RULES.rightInRowToCombo + 1 : 0;
  return { rightInRow: right, wrongInRow: wrong, easier, autoHint: easier, combo };
}
