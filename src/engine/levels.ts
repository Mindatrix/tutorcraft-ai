import type { BattleConfig, Difficulty, DifficultyLevel } from './types';

// 5 teaching levels (age 5+). Level 3 reproduces the original behaviour exactly
// (40/40/20 mix, 30/45/60 s, 40% mistakes allowed) so existing battles are unchanged.

export const DEFAULT_LEVEL: DifficultyLevel = 3;
export const LEVEL_IDS: DifficultyLevel[] = [1, 2, 3, 4, 5];

export interface LevelDefinition {
  level: DifficultyLevel;
  code: 'easy' | 'medium' | 'intermediate' | 'hard' | 'very_hard';
  nameVi: string;
  /** CEFR target used when the tutor leaves "Tự động". */
  cefr: string;
  /** Share of questions per question difficulty (sums to 1). */
  mix: Record<Difficulty, number>;
  /** Multiplies the per-question time limit. */
  timeMult: number;
  /** Fraction of questions a student may miss before being knocked out. */
  allowedWrong: number;
  /** Written into the AI prompt. */
  guidance: string;
  /** Boat Race bot: chance of a correct answer, and share of the time limit it uses on average. */
  bot: { accuracy: number; pace: number };
}

export const LEVELS: Record<DifficultyLevel, LevelDefinition> = {
  1: {
    level: 1, code: 'easy', nameVi: 'Dễ', cefr: 'A1',
    mix: { easy: 0.8, medium: 0.2, hard: 0 }, timeMult: 1.4, allowedWrong: 0.6,
    guidance: 'Learners may be as young as 5: use only very common words, sentences of at most 8 words, concrete everyday topics, no idioms and no grammar jargon.',
    bot: { accuracy: 0.45, pace: 0.8 },
  },
  2: {
    level: 2, code: 'medium', nameVi: 'Vừa', cefr: 'A2',
    mix: { easy: 0.5, medium: 0.4, hard: 0.1 }, timeMult: 1.2, allowedWrong: 0.5,
    guidance: 'Use familiar vocabulary and short sentences; at most one new idea per question; keep distractors clearly different.',
    bot: { accuracy: 0.6, pace: 0.65 },
  },
  3: {
    level: 3, code: 'intermediate', nameVi: 'Trung bình', cefr: 'B1',
    mix: { easy: 0.4, medium: 0.4, hard: 0.2 }, timeMult: 1, allowedWrong: 0.4,
    guidance: 'Use complete sentences and typical school-level vocabulary.',
    bot: { accuracy: 0.72, pace: 0.5 },
  },
  4: {
    level: 4, code: 'hard', nameVi: 'Khó', cefr: 'B2',
    mix: { easy: 0.2, medium: 0.4, hard: 0.4 }, timeMult: 0.85, allowedWrong: 0.3,
    guidance: 'Use extended vocabulary, longer contexts and plausible distractors that test common mistakes.',
    bot: { accuracy: 0.85, pace: 0.4 },
  },
  5: {
    level: 5, code: 'very_hard', nameVi: 'Rất khó', cefr: 'C1',
    mix: { easy: 0.1, medium: 0.3, hard: 0.6 }, timeMult: 0.7, allowedWrong: 0.2,
    guidance: 'Use advanced vocabulary and grammar, subtle distractors, collocations and nuance; no obvious wrong options.',
    bot: { accuracy: 0.94, pace: 0.3 },
  },
};

export function normalizeLevel(raw: unknown): DifficultyLevel {
  const n = Math.round(Number(raw));
  return n >= 1 && n <= 5 ? (n as DifficultyLevel) : DEFAULT_LEVEL;
}

export function levelOf(config: Pick<BattleConfig, 'level'> | undefined | null): LevelDefinition {
  return LEVELS[normalizeLevel(config?.level)];
}
