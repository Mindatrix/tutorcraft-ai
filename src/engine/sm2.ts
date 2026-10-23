// Spaced repetition for the weak_knowledge_matrix.
// SM-2 ease factor with the blueprint's fixed review ladder: Day 1 -> 3 -> 7 -> 14.

export const REVIEW_LADDER_DAYS = [1, 3, 7, 14];
export const REVIEW_RATIO_MIN = 0.2;
export const REVIEW_RATIO_MAX = 0.3;

export interface WeakItem {
  topic: string;
  skill_tag: string;
  question: string;
  repetition: number; // index into REVIEW_LADDER_DAYS
  ease: number; // SM-2 ease factor, starts 2.5
  interval_days: number;
  due_at: string; // ISO date
}

/**
 * SM-2 quality grade from an answer:
 * 5 = correct fast, 4 = correct, 3 = correct but hesitated, 1 = wrong, 0 = timed out.
 */
export function gradeAnswer(correct: boolean, timeMs: number, limitSec: number, timedOut = false): number {
  if (timedOut) return 0;
  if (!correct) return 1;
  const ratio = timeMs / (limitSec * 1000);
  if (ratio < 0.33) return 5;
  if (ratio < 0.75) return 4;
  return 3;
}

/** A student "hesitated" if the grade is 3 or lower — those items go into review. */
export function needsReview(grade: number): boolean {
  return grade <= 3;
}

export function nextReview(item: Pick<WeakItem, 'repetition' | 'ease'> | null, grade: number, now = new Date()): Pick<WeakItem, 'repetition' | 'ease' | 'interval_days' | 'due_at'> {
  const prevEase = item?.ease ?? 2.5;
  const ease = Math.max(1.3, prevEase + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  // Wrong or hesitant: restart the ladder. Good recall: climb one rung.
  const repetition = grade < 4 ? 0 : Math.min(REVIEW_LADDER_DAYS.length - 1, (item?.repetition ?? -1) + 1);
  const interval_days = REVIEW_LADDER_DAYS[repetition];
  const due = new Date(now.getTime() + interval_days * 86_400_000);
  return { repetition, ease: Number(ease.toFixed(2)), interval_days, due_at: due.toISOString() };
}

/** How many review questions to inject into a battle of `total` questions (20-30%). */
export function reviewSlots(total: number, available: number): number {
  if (available <= 0 || total < 3) return 0;
  const target = Math.round(total * ((REVIEW_RATIO_MIN + REVIEW_RATIO_MAX) / 2));
  return Math.min(available, Math.max(1, target));
}
