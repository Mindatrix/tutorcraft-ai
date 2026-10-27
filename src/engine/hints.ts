// Two-tier hints (phase C4.11–C4.12). The server builds them from the full question and sends only
// this payload: tier 1 = the Vietnamese meaning (the question's own Vietnamese hint), tier 2 = two
// WRONG options to fade out. Neither ever carries the answer key: no correct index, no right option
// text, no explanation. The companion of each game whispers it (content/consequences_v2.json).

import { QUESTION_RULES, gameConsequences, pickLine } from './consequences';
import { questionType } from './questionTypes';
import type { Question } from './types';
import { hashString, mulberry32, seededShuffle } from './variants';

export type HintTier = 1 | 2;

export type HintPayload = { tier: 1; meaning: string } | { tier: 2; remove: number[] };

/** Whether a tier makes sense for this question (tier 2 needs 3+ options to leave two). */
export function hintAvailable(q: Question, tier: HintTier): boolean {
  if (tier === 1) return true;
  return questionType(q) === 'mcq' && q.options.length >= 3;
}

/** The hint payload for the CURRENT question (server only: it reads the answer key to avoid it). */
export function hintFor(q: Question, tier: HintTier, seed: string): HintPayload | null {
  if (!hintAvailable(q, tier)) return null;
  if (tier === 1) return { tier: 1, meaning: (q.hint ?? '').trim() || `Chủ đề: ${q.topic}` };
  const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correct_idx);
  // Always leave at least two options, so the right one is never the only one standing.
  const n = Math.min(2, q.options.length - 2);
  return { tier: 2, remove: seededShuffle(wrong, mulberry32(hashString(`${seed}:${q.id}:hint`))).slice(0, n).sort((a, b) => a - b) };
}

/** The companion's whisper for a hint ({vi} = the meaning for tier 1). */
export function companionLine(game: string, tier: HintTier, seed: string, vars: { vi?: string } = {}): string {
  const g = gameConsequences(game);
  const lines = g ? (tier === 1 ? g.hints.tier1 : g.hints.tier2) : [];
  const line = pickLine(lines, `${seed}:${tier}`) || (tier === 1 ? 'Gợi ý: "{vi}"' : 'Bỏ bớt hai đáp án sai.');
  return line.replace('{vi}', vars.vi ?? '');
}

/** The hint button appears this long after the question was served (server time). */
export const HINT_AFTER_MS = QUESTION_RULES.hintAfterMs;
