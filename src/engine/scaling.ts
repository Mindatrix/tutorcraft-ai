import type { BattleConfig, BattleScaling, Difficulty, DifficultyLevel, Question } from './types';
import { bossHpForQuestions } from './questionTypes';
import { LEVELS, normalizeLevel } from './levels';

export const MIN_DURATION = 1;
export const MAX_DURATION = 30;
export const MIN_QUESTIONS = 2;
export const MAX_QUESTIONS = 45;
export const BASE_DAMAGE = 100;
export const PLAYER_MAX_HP = 100;

export const TIME_LIMIT_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 30,
  medium: 45,
  hard: 60,
};

export function clampDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) return 10;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(minutes)));
}

/** Q = Duration x 1.5, rounded, clamped to [2, 45]. */
export function totalQuestions(durationMinutes: number): number {
  const q = Math.round(clampDuration(durationMinutes) * 1.5);
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, q));
}

/** Boss HP = Q x 100. In a Co-op Raid every member answers Q questions against one shared boss. */
export function bossHp(questions: number, teamSize = 1): number {
  return questions * BASE_DAMAGE * Math.max(1, teamSize);
}

/** Seconds per question. `level` (1–5) scales it; level 3 / undefined = the base table. */
export function timeLimitFor(difficulty: Difficulty | undefined, level?: DifficultyLevel): number {
  const base = TIME_LIMIT_BY_DIFFICULTY[difficulty ?? 'medium'] ?? TIME_LIMIT_BY_DIFFICULTY.medium;
  return Math.round(base * LEVELS[normalizeLevel(level)].timeMult);
}

/**
 * HP lost per wrong answer. A student can survive roughly 40% wrong answers
 * before being knocked out.
 */
export function wrongPenalty(questions: number, level?: DifficultyLevel): number {
  const allowedWrong = Math.max(1, Math.floor(questions * LEVELS[normalizeLevel(level)].allowedWrong));
  return Math.ceil(PLAYER_MAX_HP / (allowedWrong + 1));
}

/**
 * `questionCount` overrides the duration formula once a battle exists — tutors can
 * delete questions in the Studio, and Boss HP must stay = Q x 100 for the real Q.
 * With `questions`, Boss HP is weighted by format (essay ×3, reading ×2.5 …);
 * an all-multiple-choice battle still gives exactly Q × 100.
 */
export function computeScaling(
  config: Pick<BattleConfig, 'durationMinutes' | 'scenario' | 'teamSize' | 'level'>,
  questionCount?: number,
  questions?: Pick<Question, 'type' | 'difficulty'>[],
): BattleScaling {
  const q = questions?.length ? questions.length : questionCount && questionCount > 0 ? questionCount : totalQuestions(config.durationMinutes);
  const team = config.scenario === 'coop_raid' ? config.teamSize : 1;
  return {
    totalQuestions: q,
    bossHp: questions?.length ? bossHpForQuestions(questions, team) : bossHp(q, team),
    playerHp: PLAYER_MAX_HP,
    wrongPenalty: wrongPenalty(q, config.level),
  };
}

/** Critical strike: 1.5x damage once the combo reaches 3. */
export function damageFor(combo: number, multiplier = 1): number {
  const crit = combo >= 3 ? 1.5 : 1;
  return Math.round(BASE_DAMAGE * crit * multiplier);
}
