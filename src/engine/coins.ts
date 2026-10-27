// Coins and rewards (phase C4.16, C4.18, C4.19). Two separate currencies:
//  - stars / ranking points: earned by answering, decide the ranking, can never be bought;
//  - coins (xu): earned only by playing, spent on hints (and later on characters), never sold.
// Wrong answers never cost coins. Everything here is decided on the server; the client only shows
// what the server answered.

import { QUESTION_RULES } from './consequences';
import { hashString, mulberry32 } from './variants';

const C = QUESTION_RULES.coins;

/** Server limits that make farming pointless (checked in the coin store, atomically). */
export const COIN_LIMITS = {
  /** Answer rewards per student per minute (a stage asks ~2 per minute; the chốt 3 in ~80 s). */
  answerAwardsPerMinute: 8,
  /** Most coins one answer can give: (10 + 5) × streak 2 × golden 2. */
  maxPerAnswer: (C.correct + C.fastBonus) * C.streakMultiplierMax * C.goldenMultiplier,
  /** Most coins from one match (8 stages × 9 questions × 60 is far above any real play). */
  perMatch: 3000,
  /** Gift boxes per student per day (one per match anyway). */
  boxesPerDay: 5,
} as const;

/** Finishing a stage (answered at least half of its points). Not in the content file yet. */
export const STAGE_COMPLETE_COINS = 10;
export const CHOT_BONUS_COINS = QUESTION_RULES.chot.bonusCoins;
/** C4.14: a successful class rescue pays both students. */
export const RESCUE_COINS = 15;

/** Streak multiplier: ×1 for the first right answer, +0.25 per extra one in a row, at most ×2. */
export function streakMultiplier(rightInRow: number): number {
  if (rightInRow <= 1) return 1;
  return Math.min(C.streakMultiplierMax, 1 + 0.25 * (rightInRow - 1));
}

export interface AnswerCoins {
  base: number;
  fast: number;
  multiplier: number;
  golden: boolean;
  total: number;
}

/**
 * Coins for one graded answer (server numbers only: its own timing, its own streak count).
 * Right: 10, +5 under 5 s, × streak (max 2), × 2 for a golden challenge. Wrong: always 0.
 */
export function answerCoins(a: { correct: boolean; timeMs: number; rightInRow: number; golden?: boolean }): AnswerCoins {
  if (!a.correct) return { base: 0, fast: 0, multiplier: 1, golden: !!a.golden, total: 0 };
  const fast = a.timeMs >= 0 && a.timeMs < C.fastUnderMs ? C.fastBonus : 0;
  const multiplier = streakMultiplier(a.rightInRow) * (a.golden ? C.goldenMultiplier : 1);
  const total = Math.min(COIN_LIMITS.maxPerAnswer, Math.round((C.correct + fast) * multiplier));
  return { base: C.correct, fast, multiplier, golden: !!a.golden, total };
}

/** Chốt chặng: the bonus when all three answers are right. */
export function chotCoins(rightOfThree: number): number {
  return rightOfThree >= QUESTION_RULES.chot.questions ? CHOT_BONUS_COINS : 0;
}

export function hintCost(tier: 1 | 2): number {
  return QUESTION_RULES.hintCost[tier];
}

/**
 * Gift box after a match (C4.18): coins only, 20–100 in steps of 5, small amounts more likely
 * (about 55% under 50). Seeded by match + student so a retried request gives the same box.
 */
export function boxCoins(seed: string): number {
  const { min, max } = QUESTION_RULES.box;
  const r = mulberry32(hashString(`box:${seed}`))();
  const steps = Math.floor((max - min) / 5);
  return min + 5 * Math.min(steps, Math.floor(r * r * (steps + 1)));
}

// -------------------------------------------------------------------------------------------------
// C4.19 Gold, silver and bronze frames for the class top 3

export type PodiumPlace = 'gold' | 'silver' | 'bronze';
export const PODIUM_COLORS: Record<PodiumPlace, string> = { gold: '#f5c542', silver: '#c9d3df', bronze: '#d08a4f' };

/**
 * The top 3 of a class by stars (ranking points), ties broken by correct answers then by id so
 * every screen draws the same frames. Nobody with 0 stars gets a frame.
 */
export function podiumOf(scores: { players: Record<string, number>; correct?: Record<string, number> }): Record<string, PodiumPlace> {
  const places: PodiumPlace[] = ['gold', 'silver', 'bronze'];
  const ranked = Object.entries(scores.players)
    .filter(([, stars]) => stars > 0)
    .sort((a, b) => b[1] - a[1] || (scores.correct?.[b[0]] ?? 0) - (scores.correct?.[a[0]] ?? 0) || a[0].localeCompare(b[0]));
  const out: Record<string, PodiumPlace> = {};
  ranked.slice(0, 3).forEach(([id], i) => (out[id] = places[i]));
  return out;
}
