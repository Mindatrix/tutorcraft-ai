import type { BattleConfig, BattleScaling, Difficulty } from './types';

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

export function timeLimitFor(difficulty: Difficulty | undefined): number {
  return TIME_LIMIT_BY_DIFFICULTY[difficulty ?? 'medium'] ?? TIME_LIMIT_BY_DIFFICULTY.medium;
}

/**
 * HP lost per wrong answer. A student can survive roughly 40% wrong answers
 * before being knocked out.
 */
export function wrongPenalty(questions: number): number {
  const allowedWrong = Math.max(1, Math.floor(questions * 0.4));
  return Math.ceil(PLAYER_MAX_HP / (allowedWrong + 1));
}

export function computeScaling(config: Pick<BattleConfig, 'durationMinutes' | 'scenario' | 'teamSize'>): BattleScaling {
  const q = totalQuestions(config.durationMinutes);
  const team = config.scenario === 'coop_raid' ? config.teamSize : 1;
  return {
    totalQuestions: q,
    bossHp: bossHp(q, team),
    playerHp: PLAYER_MAX_HP,
    wrongPenalty: wrongPenalty(q),
  };
}

/** Critical strike: 1.5x damage once the combo reaches 3. */
export function damageFor(combo: number, multiplier = 1): number {
  const crit = combo >= 3 ? 1.5 : 1;
  return Math.round(BASE_DAMAGE * crit * multiplier);
}
