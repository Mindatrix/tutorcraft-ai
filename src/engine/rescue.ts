// Class rescue (phase C4.14): a student who gets 3 answers wrong in a row inside one stage gets
// help from a classmate. The server picks the helper (online, not struggling themselves, same squad
// or team first), the helper receives one "rescue" question, and a right answer pays both of them.
// River Survival keeps its own freeze-and-free rules (B2.7, survivalRules.ts) instead.
// Pure state machine: the server stores the state with the match and applies it per answer.

import { QUESTION_RULES } from './consequences';
import { RESCUE_COINS } from './coins';
import { GameMode } from './types';
import { hashString } from './variants';

export const RESCUE = {
  wrongInRow: QUESTION_RULES.wrongInRowToRescue,
  /** The helper has this long to answer the rescue question. */
  windowMs: 45_000,
  coins: RESCUE_COINS,
  /** A struggling student is helped at most this often per stage. */
  perStage: 1,
} as const;

export interface RescueRequest {
  id: string;
  needy: string;
  helper: string;
  stage: number;
  openedAt: number;
  until: number;
  /** The rescue question (server side: graded against the battle's answer key). */
  qid?: number;
}

export interface RescueState {
  /** Wrong answers in a row inside the current stage, per player. */
  wrong: Record<string, { stage: number; n: number }>;
  open: RescueRequest[];
  /** "needy:stage" already helped (one rescue per student per stage). */
  helped: string[];
}

export interface RescueMate {
  id: string;
  online: boolean;
  left?: boolean;
  team?: string | null;
  grp?: number | null;
}

export type RescueEvent =
  | { t: 'rescue_open'; req: RescueRequest }
  | { t: 'rescued'; req: RescueRequest; coins: Record<string, number> }
  | { t: 'rescue_failed'; req: RescueRequest; reason: 'wrong' | 'timeout' };

export const newRescueState = (): RescueState => ({ wrong: {}, open: [], helped: [] });

/** Survival plays its own freeze / free rules; every other game uses the class rescue. */
export function rescueApplies(game: GameMode | string | null | undefined): boolean {
  return game !== GameMode.RIVER_SURVIVAL;
}

function pickHelper(state: RescueState, needy: RescueMate, mates: RescueMate[], stage: number, seed: string): RescueMate | null {
  const busy = new Set(state.open.flatMap((r) => [r.helper, r.needy]));
  const ok = mates.filter((m) => m.id !== needy.id && m.online && !m.left && !busy.has(m.id) && (state.wrong[m.id]?.stage !== stage || (state.wrong[m.id]?.n ?? 0) < 2));
  if (!ok.length) return null;
  const score = (m: RescueMate) => (needy.grp != null && m.grp === needy.grp ? 2 : 0) + (needy.team && m.team === needy.team ? 1 : 0);
  const best = Math.max(...ok.map(score));
  const top = ok.filter((m) => score(m) === best).sort((a, b) => a.id.localeCompare(b.id));
  return top[hashString(`${seed}:${needy.id}:${stage}`) % top.length];
}

/**
 * Open a rescue for `needy` in `stage` (the caller checked the 3 wrong answers in a row of that
 * stage). Nothing happens when they were already helped this stage, already have one open, or no
 * classmate can help (solo play: the rescue is for class mode only).
 */
export function openRescue(
  state: RescueState,
  a: { needy: string; stage: number; at: number; qid?: number },
  mates: RescueMate[],
  seed: string,
): { state: RescueState; events: RescueEvent[] } {
  const key = `${a.needy}:${a.stage}`;
  if (state.helped.includes(key) || state.open.some((r) => r.needy === a.needy)) return { state, events: [] };
  const me = mates.find((m) => m.id === a.needy) ?? { id: a.needy, online: true };
  const helper = pickHelper(state, me, mates, a.stage, seed);
  if (!helper) return { state, events: [] };
  const req: RescueRequest = { id: `r-${a.needy}-${a.stage}`, needy: a.needy, helper: helper.id, stage: a.stage, openedAt: a.at, until: a.at + RESCUE.windowMs, ...(a.qid != null ? { qid: a.qid } : {}) };
  return { state: { ...state, open: [...state.open, req], helped: [...state.helped, key] }, events: [{ t: 'rescue_open', req }] };
}

/** After one graded answer of `playerId`: counts wrong answers per stage, opens a rescue at the third. */
export function rescueOnAnswer(
  state: RescueState,
  a: { playerId: string; correct: boolean; stage: number; at: number; qid?: number },
  mates: RescueMate[],
  seed: string,
): { state: RescueState; events: RescueEvent[] } {
  const prev = state.wrong[a.playerId];
  const n = a.correct ? 0 : (prev && prev.stage === a.stage ? prev.n : 0) + 1;
  const next: RescueState = { ...state, wrong: { ...state.wrong, [a.playerId]: { stage: a.stage, n } } };
  if (n < RESCUE.wrongInRow) return { state: next, events: [] };
  return openRescue(next, { needy: a.playerId, stage: a.stage, at: a.at, qid: a.qid }, mates, seed);
}

/** The helper answered the rescue question. Right (in time) pays both; wrong closes it. */
export function rescueAnswer(state: RescueState, a: { helperId: string; requestId: string; correct: boolean; at: number }): { state: RescueState; events: RescueEvent[] } {
  const req = state.open.find((r) => r.id === a.requestId && r.helper === a.helperId);
  if (!req) return { state, events: [] };
  const rest = state.open.filter((r) => r !== req);
  if (a.at > req.until) return { state: { ...state, open: rest }, events: [{ t: 'rescue_failed', req, reason: 'timeout' }] };
  if (!a.correct) return { state: { ...state, open: rest }, events: [{ t: 'rescue_failed', req, reason: 'wrong' }] };
  // The rescued student starts the stage over without the wrong streak.
  const wrong = { ...state.wrong, [req.needy]: { stage: req.stage, n: 0 } };
  return { state: { ...state, open: rest, wrong }, events: [{ t: 'rescued', req, coins: { [req.needy]: RESCUE.coins, [req.helper]: RESCUE.coins } }] };
}

/** Close requests whose time is up (called on every request, like the other match rules). */
export function rescueExpire(state: RescueState, now: number): { state: RescueState; events: RescueEvent[] } {
  const late = state.open.filter((r) => r.until < now);
  if (!late.length) return { state, events: [] };
  return { state: { ...state, open: state.open.filter((r) => r.until >= now) }, events: late.map((req) => ({ t: 'rescue_failed', req, reason: 'timeout' }) as RescueEvent) };
}
