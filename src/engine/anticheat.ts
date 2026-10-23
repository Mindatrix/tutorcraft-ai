import type { Question } from './types';

// Speed-hack detection on SERVER-measured answer times. A human has to at least
// skim the question and its options; answering faster than that, repeatedly,
// means a bot or a script.

export interface AnswerTiming {
  questionId: number;
  /** Server-measured ms from the question being served to the answer arriving. */
  elapsedMs: number;
  minPlausibleMs: number;
  timedOut: boolean;
}

export const MIN_REACTION_MS = 400;
/** ~1000 words/min — faster than any real reading, so only bots fall below it. */
export const MS_PER_WORD = 60;

export function minPlausibleMs(q: Pick<Question, 'question' | 'options' | 'skill_tag'>): number {
  const words = `${q.question} ${q.options.join(' ')}`.trim().split(/\s+/).length;
  const reading = q.skill_tag === 'reading' ? 1.5 : 1;
  return Math.round(Math.min(6000, Math.max(700, MIN_REACTION_MS + words * MS_PER_WORD * reading)));
}

export interface TimingVerdict {
  flagged: boolean;
  suspicious: number;
  answered: number;
  reasons: string[];
}

export function assessTimings(timings: AnswerTiming[]): TimingVerdict {
  const real = timings.filter((t) => !t.timedOut);
  const tooFast = real.filter((t) => t.elapsedMs < t.minPlausibleMs);
  const negative = real.filter((t) => t.elapsedMs < 0);
  const reasons: string[] = [];

  if (negative.length) reasons.push(`${negative.length} câu được trả lời trước khi câu hỏi kịp hiển thị.`);
  if (tooFast.length >= 3) reasons.push(`${tooFast.length} câu trả lời nhanh hơn tốc độ đọc tối thiểu của con người.`);
  else if (real.length >= 2 && tooFast.length / real.length >= 0.5) {
    reasons.push(`${tooFast.length}/${real.length} câu trả lời nhanh bất thường.`);
  }
  const total = real.reduce((s, t) => s + Math.max(0, t.elapsedMs), 0);
  if (real.length >= 5 && total < real.length * 1000) {
    reasons.push(`Hoàn thành ${real.length} câu trong ${(total / 1000).toFixed(1)}s.`);
  }
  return { flagged: reasons.length > 0, suspicious: tooFast.length, answered: real.length, reasons };
}
