import type { AnswerRecord, DifficultyLevel, Question } from './types';
import { LEVELS, normalizeLevel } from './levels';
import { timeLimitFor } from './scaling';

// Boat Race 1v1 vs a bot. Pure + deterministic: the bot's plan comes from a seeded PRNG,
// so the server (authoritative) and the client (live animation) agree without any wall clock.
// Each question = one stretch of river. A correct answer rows the boat one stretch ahead;
// a wrong answer costs time but no distance. More distance wins; a tie goes to the faster boat.

export interface BotStep {
  correct: boolean;
  /** Share of the question's time limit the bot uses (0.15–1). */
  frac: number;
}

export type RaceResult = 'win' | 'lose' | 'draw';

export interface RaceOutcome {
  result: RaceResult;
  playerDistance: number;
  botDistance: number;
  playerTimeMs: number;
  botTimeMs: number;
  total: number;
}

export const MIN_BOT_STEP_MS = 1500;

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same seed on client and server: battle + variant + level. */
export function raceSeed(battleId: string, variant: number | null, level: DifficultyLevel | undefined): string {
  return `${battleId}:${variant ?? 0}:${normalizeLevel(level)}`;
}

export function botPlan(seed: string, count: number, level: DifficultyLevel | undefined): BotStep[] {
  const prof = LEVELS[normalizeLevel(level)].bot;
  const rnd = mulberry32(hash(seed));
  const steps: BotStep[] = [];
  for (let i = 0; i < count; i++) {
    const correct = rnd() < prof.accuracy;
    const frac = Math.min(1, Math.max(0.15, prof.pace * (0.6 + 0.8 * rnd())));
    steps.push({ correct, frac });
  }
  return steps;
}

/** Real duration of each bot step, given the time limit of each question. */
export function botStepTimes(plan: BotStep[], limitsSec: number[]): number[] {
  return plan.map((s, i) => Math.max(MIN_BOT_STEP_MS, Math.round(s.frac * (limitsSec[i] ?? 45) * 1000)));
}

/** Stretches the bot has rowed after `elapsedMs` of race time. */
export function botDistanceAt(plan: BotStep[], stepMs: number[], elapsedMs: number): number {
  let t = 0;
  let d = 0;
  for (let i = 0; i < plan.length; i++) {
    t += stepMs[i] ?? 0;
    if (t > elapsedMs) break;
    if (plan[i].correct) d += 1;
  }
  return d;
}

/** 0..1 progress inside the bot's current stretch, for smooth animation. */
export function botFraction(plan: BotStep[], stepMs: number[], elapsedMs: number): number {
  let t = 0;
  for (let i = 0; i < plan.length; i++) {
    const end = t + (stepMs[i] ?? 0);
    if (elapsedMs < end) return (elapsedMs - t) / Math.max(1, stepMs[i] ?? 1);
    t = end;
  }
  return 0;
}

/** Fractional distance rowed by the bot (completed correct stretches + progress in the current one). */
export function botPosition(plan: BotStep[], stepMs: number[], elapsedMs: number): number {
  let t = 0;
  let d = 0;
  for (let i = 0; i < plan.length; i++) {
    const end = t + (stepMs[i] ?? 0);
    if (elapsedMs >= end) {
      if (plan[i].correct) d += 1;
      t = end;
      continue;
    }
    if (plan[i].correct) d += (elapsedMs - t) / Math.max(1, stepMs[i] ?? 1);
    break;
  }
  return d;
}

export function raceOutcome(questions: Question[], answers: AnswerRecord[], seed: string, level: DifficultyLevel | undefined): RaceOutcome {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const plan = botPlan(seed, questions.length, level);
  const stepMs = botStepTimes(plan, questions.map((q) => timeLimitFor(q.difficulty, level)));
  const botDistance = plan.reduce((n, s) => n + (s.correct ? 1 : 0), 0);
  const botTimeMs = stepMs.reduce((a, b) => a + b, 0);

  const seen = new Set<number>();
  let playerDistance = 0;
  let playerTimeMs = 0;
  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q || seen.has(a.questionId)) continue;
    seen.add(a.questionId);
    if (a.chosenIdx === q.correct_idx) playerDistance += 1;
    const cap = (timeLimitFor(q.difficulty, level) + 60) * 1000;
    playerTimeMs += Math.min(Math.max(0, Number(a.timeMs) || 0), cap);
  }

  let result: RaceResult;
  if (playerDistance !== botDistance) result = playerDistance > botDistance ? 'win' : 'lose';
  else if (Math.abs(playerTimeMs - botTimeMs) < 250) result = 'draw';
  else result = playerTimeMs < botTimeMs ? 'win' : 'lose';

  return { result, playerDistance, botDistance, playerTimeMs, botTimeMs, total: questions.length };
}
