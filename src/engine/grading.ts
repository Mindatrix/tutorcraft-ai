import type { Grade, Question } from './types';
import { contentWords, normalizeForCompare, normalizeText, wordCount } from './normalize';
import { questionType } from './questionTypes';

// Deterministic graders. Run on the server only; the result is written into the
// session log so a replay never needs to grade (or call the AI) again.

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
const round2 = (n: number) => Math.round(clamp01(n) * 100) / 100;

/** Cloze: share of gaps filled with an accepted answer. */
export function gradeCloze(q: Question, responses: unknown): Grade {
  const gaps = q.gaps ?? [];
  const list = Array.isArray(responses) ? responses : [];
  let right = 0;
  gaps.forEach((g, i) => {
    const given = normalizeForCompare(list[i]);
    if (given && g.answers.some((a) => normalizeForCompare(a) === given)) right += 1;
  });
  const score = gaps.length ? right / gaps.length : 0;
  return { score: round2(score), by: 'exact', feedback: `Đúng ${right}/${gaps.length} ô trống.` };
}

function tokenOverlap(a: string, b: string): number {
  const A = normalizeForCompare(a).split(' ').filter(Boolean);
  const B = normalizeForCompare(b).split(' ').filter(Boolean);
  if (!A.length || !B.length) return 0;
  // Longest common subsequence keeps word ORDER, which matters for rewrites.
  const dp = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = 1; i <= A.length; i++) {
    for (let j = 1; j <= B.length; j++) dp[i][j] = A[i - 1] === B[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  return dp[A.length][B.length] / Math.max(A.length, B.length);
}

/** Which key phrases appear in the text (normalized, as whole-word sequences). */
export function matchedKeyPhrases(phrases: string[], text: string): string[] {
  const hay = ` ${normalizeForCompare(text)} `;
  return phrases.filter((p) => {
    const needle = normalizeForCompare(p);
    return needle && hay.includes(` ${needle} `);
  });
}

/**
 * Transform: an accepted rewrite scores 1. Otherwise partial credit from key phrases
 * and word-order similarity, capped below a pass if the cue word is missing.
 */
export function gradeTransform(q: Question, text: unknown): Grade {
  const given = normalizeForCompare(text);
  if (!given) return { score: 0, by: 'rules', feedback: 'Chưa có câu trả lời.' };
  const answers = q.answers ?? [];
  if (answers.some((a) => normalizeForCompare(a) === given)) return { score: 1, by: 'exact', feedback: 'Chính xác tuyệt đối!' };

  const phrases = q.key_phrases ?? [];
  const keyShare = phrases.length ? matchedKeyPhrases(phrases, String(text)).length / phrases.length : 0;
  const similarity = Math.max(0, ...answers.map((a) => tokenOverlap(a, String(text))));
  let score = phrases.length ? 0.5 * keyShare + 0.5 * similarity : similarity;
  score = Math.min(0.85, score); // only an accepted rewrite earns full marks
  const cueOk = !q.cue || ` ${given} `.includes(` ${normalizeForCompare(q.cue)} `);
  if (!cueOk) score = Math.min(score, 0.5);
  const feedback = !cueOk
    ? `Câu viết lại phải dùng từ gợi ý “${q.cue}”.`
    : score >= 0.6
      ? 'Gần đúng — so sánh với đáp án mẫu để hoàn thiện.'
      : 'Nghĩa hoặc cấu trúc chưa khớp với câu gốc.';
  return { score: round2(score), by: 'rules', feedback };
}

/**
 * Reorder: `order` = original token indices in the student's order.
 * Exact (or an accepted alternative sentence) = 1, else share of tokens in the right place.
 */
export function gradeReorder(q: Question, order: number[]): Grade {
  const tokens = q.tokens ?? [];
  const n = tokens.length;
  const valid = order.length === n && new Set(order).size === n && order.every((i) => Number.isInteger(i) && i >= 0 && i < n);
  if (!valid) return { score: 0, by: 'rules', feedback: 'Chưa xếp đủ các mảnh ghép.' };
  const sentence = normalizeForCompare(order.map((i) => tokens[i]).join(' '));
  const accepted = [tokens.join(' '), ...(q.answers ?? [])].map(normalizeForCompare);
  if (accepted.includes(sentence)) return { score: 1, by: 'exact', feedback: 'Câu hoàn chỉnh!' };
  // Compare by text, so two identical chunks (e.g. two "the") are interchangeable.
  const right = order.filter((idx, pos) => normalizeForCompare(tokens[idx]) === normalizeForCompare(tokens[pos])).length;
  return { score: round2(0.8 * (right / n)), by: 'rules', feedback: `${right}/${n} mảnh ở đúng vị trí.` };
}

/** Matching: matched share, minus 15% per wrong attempt (never below 30% of it). */
export function matchingScore(total: number, matched: number, wrong: number): number {
  if (!total) return 0;
  return round2((matched / total) * Math.max(0.3, 1 - 0.15 * wrong));
}

/** Length gate for written answers: too short scales down, far too long trims a little. */
export function lengthFactor(q: Pick<Question, 'min_words' | 'max_words'>, words: number): number {
  const min = q.min_words ?? 1;
  const max = q.max_words ?? Number.MAX_SAFE_INTEGER;
  if (words <= 0) return 0;
  if (words < min) return clamp01(words / min);
  if (words > max * 1.5) return 0.85;
  return 1;
}

/** Weighted score from the 3 rubric criteria (0..100 each). Reading leans on ideas. */
export function rubricScore(q: Question, c: { grammar: number; vocabulary: number; ideas: number }, words: number): number {
  const reading = questionType(q) === 'reading';
  const w = reading ? { g: 0.2, v: 0.2, i: 0.6 } : { g: 0.3, v: 0.3, i: 0.4 };
  const raw = (w.g * c.grammar + w.v * c.vocabulary + w.i * c.ideas) / 100;
  return round2(raw * lengthFactor(q, words));
}

/** Share of key points the answer covers (≥ half of each point's content words present). */
export function keyPointCoverage(q: Question, text: string): number {
  const have = new Set(contentWords(text));
  const points = (q.key_points ?? []).map(contentWords).filter((p) => p.length);
  if (!points.length) {
    const sample = contentWords(q.sample_answer ?? '');
    if (!sample.length) return have.size ? 0.6 : 0;
    return Math.min(1, sample.filter((w) => have.has(w)).length / Math.max(3, sample.length * 0.6));
  }
  const covered = points.filter((p) => p.filter((w) => have.has(w)).length >= Math.ceil(p.length / 2)).length;
  return covered / points.length;
}

/**
 * Rule-based essay / reading grader, used when the AI is unavailable or slow.
 * Deliberately conservative — it can't judge meaning, so the tutor should review.
 */
export function gradeOpenFallback(q: Question, input: unknown): Grade {
  const text = normalizeText(input);
  const words = wordCount(text);
  if (!words) return { score: 0, by: 'rules', criteria: { grammar: 0, vocabulary: 0, ideas: 0 }, feedback: 'Chưa có bài làm.' };

  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  let grammar = 70;
  if (!/^[A-Z"']/.test(text)) grammar -= 10;
  if (!/[.!?]["']?$/.test(text)) grammar -= 10;
  if (/\bi\b/.test(text)) grammar -= 10; // lower-case "i"
  const avg = words / Math.max(1, sentences.length);
  if (avg > 35 || avg < 3) grammar -= 10;
  if (/\b(\w+) \1\b/i.test(text)) grammar -= 5;

  const all = normalizeForCompare(text).split(' ');
  const variety = new Set(all).size / Math.max(1, all.length);
  const vocabulary = Math.round(Math.min(85, 45 + variety * 45));
  const ideas = Math.round(keyPointCoverage(q, text) * 100);

  const criteria = { grammar: Math.max(30, grammar), vocabulary, ideas };
  return { score: rubricScore(q, criteria, words), by: 'fallback', criteria, feedback: 'Chấm tự động theo ý chính và độ dài — gia sư có thể xem lại bài.' };
}
