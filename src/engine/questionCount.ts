import type { QuestionType } from './types';
import { MAX_QUESTIONS, MIN_QUESTIONS } from './scaling';

// Reads question counts the tutor typed in free text: "20 câu", "10 questions",
// "5 trắc nghiệm, 3 điền từ". Pure, no I/O.

const ALIASES: Record<QuestionType, string[]> = {
  mcq: ['trắc nghiệm', 'trac nghiem', 'tn', 'multiple choice', 'mcq'],
  cloze: ['điền từ', 'dien tu', 'điền khuyết', 'cloze', 'fill in the blank', 'fill-in'],
  reorder: ['sắp xếp câu', 'sap xep cau', 'sắp xếp', 'reorder'],
  transform: ['viết lại câu', 'viet lai cau', 'viết lại', 'transform', 'rewrite'],
  matching: ['nối cặp', 'noi cap', 'nối', 'matching'],
  reading: ['đọc hiểu', 'doc hieu', 'reading'],
  essay: ['tự luận', 'tu luan', 'viết đoạn', 'essay'],
};

export interface RequestedCounts {
  /** Total number of questions asked for (clamped to the allowed range). */
  total?: number;
  /** Explicit per-format counts. */
  perType?: Partial<Record<QuestionType, number>>;
}

export function clampQuestionCount(n: number): number {
  return Math.min(MAX_QUESTIONS, Math.max(MIN_QUESTIONS, Math.round(n)));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseRequestedCounts(text: string): RequestedCounts {
  let rest = (text || '').toLowerCase().slice(0, 4000);
  const perType: Partial<Record<QuestionType, number>> = {};

  for (const type of Object.keys(ALIASES) as QuestionType[]) {
    // Longest alias first so "sắp xếp câu" wins over "sắp xếp".
    const alts = [...ALIASES[type]].sort((a, b) => b.length - a.length).map(esc).join('|');
    const before = new RegExp(`(?<!\\d)(\\d{1,3})\\s*(?:câu|cau|questions?|bài)?\\s*(?:${alts})(?![\\p{L}])`, 'iu');
    const after = new RegExp(`(?:${alts})\\s*[:=]?\\s*(\\d{1,3})(?!\\d|\\s*(?:phút|min))`, 'iu');
    const m = rest.match(before) ?? rest.match(after);
    if (m) {
      const n = Number(m[1]);
      if (n > 0) perType[type] = Math.min(MAX_QUESTIONS, n);
      rest = rest.replace(m[0], ' ');
    }
  }

  const out: RequestedCounts = {};
  const keys = Object.keys(perType) as QuestionType[];
  if (keys.length) {
    out.perType = perType;
    out.total = clampQuestionCount(keys.reduce((s, k) => s + (perType[k] ?? 0), 0));
    return out;
  }
  const t = rest.match(/(?<!\d)(\d{1,3})\s*(?:câu|cau|questions?)(?![\p{L}])/iu);
  if (t && Number(t[1]) > 0) out.total = clampQuestionCount(Number(t[1]));
  return out;
}

/**
 * Exact format of every slot when the tutor asked for per-format counts. Counts are
 * scaled down proportionally if their sum exceeds `total` (the clamped maximum).
 */
export function planFromCounts(counts: Partial<Record<QuestionType, number>>, total: number): QuestionType[] {
  const entries = (Object.entries(counts) as [QuestionType, number][]).filter(([, n]) => n > 0);
  const sum = entries.reduce((s, [, n]) => s + n, 0);
  const plan: QuestionType[] = [];
  const left = new Map(entries.map(([t, n]) => [t, sum > total ? Math.max(1, Math.floor((n * total) / sum)) : n]));
  // Round-robin so formats alternate rather than clump.
  while (plan.length < total && [...left.values()].some((n) => n > 0)) {
    for (const [t] of entries) {
      if ((left.get(t) ?? 0) > 0 && plan.length < total) {
        plan.push(t);
        left.set(t, (left.get(t) ?? 0) - 1);
      }
    }
  }
  return plan;
}
