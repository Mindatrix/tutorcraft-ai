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
  /** Words the student typed for this answer (written formats). */
  typedWords?: number;
}

/** A written answer this long is checked on its own for paste / scripting. */
export const LONG_ANSWER_WORDS = 15;

export const MIN_REACTION_MS = 400;
/** ~1000 words/min — faster than any real reading, so only bots fall below it. */
export const MS_PER_WORD = 60;

/** Faster than ~300 words/min of TYPING means the text was pasted or scripted. */
export const MS_PER_TYPED_WORD = 200;

/** Everything the student has to read for a question, in any format. */
function readableText(q: Partial<Question>): string {
  return [
    q.question,
    ...(q.options ?? []),
    q.passage,
    q.source,
    q.text,
    q.hub,
    ...(q.pairs ?? []).flatMap((p) => [p.left, p.right]),
    ...(q.tokens ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Minimum believable time to read the question and (for written formats) type
 * `typedWords` words. Reading time is capped; typing time is not — pasting a
 * 150-word essay in 5 s is exactly what this catches.
 */
export function minPlausibleMs(q: Partial<Question> & Pick<Question, 'question'>, typedWords = 0): number {
  const words = readableText(q).trim().split(/\s+/).length;
  const reading = q.skill_tag === 'reading' || q.type === 'reading' ? 1.5 : 1;
  const read = Math.min(q.type === 'reading' ? 12000 : 6000, Math.max(700, MIN_REACTION_MS + words * MS_PER_WORD * reading));
  return Math.round(read + Math.max(0, typedWords) * MS_PER_TYPED_WORD);
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
  // One long written answer submitted faster than it could be typed is enough on its own.
  const pasted = real.filter((t) => (t.typedWords ?? 0) >= LONG_ANSWER_WORDS && t.elapsedMs < (t.typedWords ?? 0) * MS_PER_TYPED_WORD);
  if (pasted.length) {
    reasons.push(`${pasted.length} bài viết dài được nộp nhanh hơn tốc độ gõ phím (có thể đã dán sẵn).`);
  }
  const total = real.reduce((s, t) => s + Math.max(0, t.elapsedMs), 0);
  if (real.length >= 5 && total < real.length * 1000) {
    reasons.push(`Hoàn thành ${real.length} câu trong ${(total / 1000).toFixed(1)}s.`);
  }
  return { flagged: reasons.length > 0, suspicious: tooFast.length, answered: real.length, reasons };
}
