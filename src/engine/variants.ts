import type { Question } from './types';

// Anti-cheating variant generator: when 2+ students take the same battle,
// each gets a variant code (101, 102, ...) with its own question and option order.

export const VARIANT_BASE = 101;
export const MAX_VARIANTS = 10;

export function variantCodes(studentCount: number): number[] {
  if (studentCount < 2) return [];
  const n = Math.min(MAX_VARIANTS, studentCount);
  return Array.from({ length: n }, (_, i) => VARIANT_BASE + i);
}

/** Small deterministic PRNG so every device builds the same variant from its code. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededShuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Shuffle question order and each question's options, keeping correct_idx right. */
export function buildVariant(questions: Question[], battleId: string, code: number | null): Question[] {
  if (code == null) return questions;
  const rand = mulberry32(hashString(`${battleId}:${code}`));
  return seededShuffle(questions, rand).map((q) => {
    if (q.type && q.type !== 'mcq') return q; // cards / chips are shuffled per session instead
    const order = seededShuffle(q.options.map((_, i) => i), rand);
    return {
      ...q,
      options: order.map((i) => q.options[i]),
      correct_idx: order.indexOf(q.correct_idx),
    };
  });
}
