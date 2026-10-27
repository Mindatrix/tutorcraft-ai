// Phase C4 shared rules for in-scene questions, read from content/consequences_v2.json (owned by the
// content side; read only here): time limits, hint costs, difficulty triggers, coin values, and the
// right / wrong outcomes of the six games. Plus the ConsequenceSystem (C4.13): every game registers
// the same four hooks (onCorrect, onWrong, onWrongStreak, recover) and the system decides which
// one an answer triggers. Pure: the three.js side (effects, camera, avatar) lives in
// src/components/modes/three/consequenceHooks.ts.

import content from '../../content/consequences_v2.json';
import { GameMode } from './types';
import { hashString } from './variants';

const S = content.shared;

/** Everything C4 reads from `shared` in one place (numbers only; captions stay in the content). */
export const QUESTION_RULES = {
  questionLimitMs: S.questionLimitMs,
  hintAfterMs: S.hintAfterMs,
  feedbackMs: S.feedbackMs,
  hintCost: { 1: S.hintCostCoins.tier1, 2: S.hintCostCoins.tier2 } as Record<1 | 2, number>,
  wrongInRowToEasier: S.difficulty.wrongInRowToEasier,
  rightInRowToCombo: S.difficulty.rightInRowToCombo,
  wrongInRowToRescue: S.difficulty.wrongInRowToRescue,
  coins: S.coins,
  chot: { questions: S.chotChang.questions, bonusCoins: S.chotChang.bonusCoins },
  box: { min: S.boxAfterMatch.coinsMin, max: S.boxAfterMatch.coinsMax },
  rescueClassOnly: S.rescue.classModeOnly,
} as const;

export type OutcomeKind = 'correct' | 'wrong' | 'wrongStreak' | 'recover';
export const OUTCOME_KINDS: OutcomeKind[] = ['correct', 'wrong', 'wrongStreak', 'recover'];

export interface ConsequenceOutcome {
  effect: string;
  sfx: string;
  caption: string[];
  durationMs: number;
  camera?: string;
  avatarAnim?: string;
}

export interface GameConsequences {
  name: string;
  companion: { name: string; role: string };
  answerSign: string;
  hints: { tier1: string[]; tier2: string[] };
  tasks: Record<string, { label: string } & Record<OutcomeKind, ConsequenceOutcome>>;
}

const GAMES = content.games as unknown as Record<string, GameConsequences>;

export function gameConsequences(game: GameMode | string): GameConsequences | null {
  return GAMES[game] ?? null;
}

/** Task keys of a game in content order (kayak: gate, rapids, sprint…). */
export function gameTasks(game: GameMode | string): string[] {
  return Object.keys(GAMES[game]?.tasks ?? {});
}

export function outcomeFor(game: GameMode | string, task: string, kind: OutcomeKind): ConsequenceOutcome | null {
  const g = GAMES[game];
  const t = g?.tasks[task] ?? (g ? Object.values(g.tasks)[0] : undefined);
  return t?.[kind] ?? null;
}

/** One caption, the same on every device for the same seed. */
export function pickLine(lines: readonly string[], seed: number | string): string {
  if (!lines.length) return '';
  const h = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  return lines[h % lines.length];
}

// -------------------------------------------------------------------------------------------------
// C4.13 ConsequenceSystem: one contract for six games

export interface ConsequenceEvent {
  game: GameMode;
  task: string;
  kind: OutcomeKind;
  outcome: ConsequenceOutcome;
  caption: string;
  playerId: string;
  /** Text of the right answer: shown as a sign in the scene after a wrong answer (never before). */
  rightAnswer?: string;
  /** Ran out of time: a light wrong (never escalates to wrongStreak). */
  timeout?: boolean;
  /** Wrong answers in a row, this one included (0 on correct). */
  wrongInRow: number;
}

export type ConsequenceHook<C> = (e: ConsequenceEvent, ctx: C) => void | Promise<void>;

/** The four hooks every game declares (C4 spec: onCorrect, onWrong, onWrongStreak, recover). */
export interface ConsequenceHooks<C> {
  onCorrect: ConsequenceHook<C>;
  onWrong: ConsequenceHook<C>;
  onWrongStreak: ConsequenceHook<C>;
  recover: ConsequenceHook<C>;
}

export const HOOK_NAMES: (keyof ConsequenceHooks<unknown>)[] = ['onCorrect', 'onWrong', 'onWrongStreak', 'recover'];
const HOOK_OF: Record<OutcomeKind, keyof ConsequenceHooks<unknown>> = { correct: 'onCorrect', wrong: 'onWrong', wrongStreak: 'onWrongStreak', recover: 'recover' };

export class ConsequenceSystem<C> {
  private hooks = new Map<GameMode, ConsequenceHooks<C>>();
  /** Wrong answers in a row per player (a correct one resets). */
  private wrongRow = new Map<string, number>();

  /** A game registers all four hooks or nothing (a missing hook is a bug, not a quiet no-op). */
  register(game: GameMode, hooks: ConsequenceHooks<C>): this {
    const missing = HOOK_NAMES.filter((k) => typeof hooks[k] !== 'function');
    if (missing.length) throw new Error(`${game}: thiếu móc ${missing.join(', ')}`);
    this.hooks.set(game, hooks);
    return this;
  }

  registered(): GameMode[] {
    return [...this.hooks.keys()];
  }

  wrongInRow(playerId: string): number {
    return this.wrongRow.get(playerId) ?? 0;
  }

  /**
   * Which outcome an answer gets: correct; the first wrong (or any timeout: "sai nhẹ") → wrong;
   * the second wrong in a row and after → wrongStreak.
   */
  static kindFor(correct: boolean, wrongBefore: number, timeout = false): OutcomeKind {
    if (correct) return 'correct';
    if (timeout) return 'wrong';
    return wrongBefore + 1 >= QUESTION_RULES.wrongInRowToEasier ? 'wrongStreak' : 'wrong';
  }

  /** The student is coming back from a wrong streak: the next question is the easy "recover" one. */
  needsRecover(playerId: string): boolean {
    return this.wrongInRow(playerId) >= QUESTION_RULES.wrongInRowToEasier;
  }

  private event(game: GameMode, task: string, kind: OutcomeKind, playerId: string, seed: number | string, extra: Partial<ConsequenceEvent> = {}): ConsequenceEvent | null {
    const outcome = outcomeFor(game, task, kind);
    if (!outcome) return null;
    return { game, task, kind, outcome, caption: pickLine(outcome.caption, `${seed}:${kind}`), playerId, wrongInRow: this.wrongInRow(playerId), ...extra };
  }

  /** Route one graded answer to the game's hook. Resolves when the hook is done. */
  async answer(
    game: GameMode,
    task: string,
    a: { playerId: string; correct: boolean; timeout?: boolean; rightAnswer?: string; seed: number | string },
    ctx: C,
  ): Promise<ConsequenceEvent | null> {
    const hooks = this.hooks.get(game);
    const before = this.wrongInRow(a.playerId);
    const kind = ConsequenceSystem.kindFor(a.correct, before, a.timeout);
    this.wrongRow.set(a.playerId, a.correct ? 0 : before + 1);
    const e = this.event(game, task, kind, a.playerId, a.seed, { rightAnswer: a.correct ? undefined : a.rightAnswer, timeout: a.timeout || undefined });
    if (!hooks || !e) return e;
    await hooks[HOOK_OF[kind]](e, ctx);
    return e;
  }

  /** Before the next question: the "recover" gate (easier question) when coming off a wrong streak. */
  async beforeQuestion(game: GameMode, task: string, playerId: string, seed: number | string, ctx: C): Promise<ConsequenceEvent | null> {
    if (!this.needsRecover(playerId)) return null;
    const e = this.event(game, task, 'recover', playerId, seed);
    const hooks = this.hooks.get(game);
    if (hooks && e) await hooks.recover(e, ctx);
    return e;
  }

  reset(playerId?: string) {
    if (playerId) this.wrongRow.delete(playerId);
    else this.wrongRow.clear();
  }
}

/** The six games in the content, in GameMode terms. */
export const CONSEQUENCE_GAMES: GameMode[] = Object.values(GameMode).filter((g) => !!GAMES[g]);

// -------------------------------------------------------------------------------------------------
// The standard hooks: what each of the four does in a scene, as a plan the 3D / 2D layer executes
// (src/components/modes/three/consequenceHooks.ts). Games of phase D/E replace or extend them with
// their own (C4.15); the contract stays the same.

/** The six avatar states of C2.3 (avatar.ts). */
export type ConsequenceAvatarState = 'idle' | 'run' | 'happy' | 'sad' | 'correct' | 'wrong';

export interface ConsequencePlan {
  kind: OutcomeKind;
  effect: string;
  sfx: string;
  camera: string | null;
  /** First the reaction (correct / wrong), then the content's mood (happy / sad). */
  avatar: ConsequenceAvatarState[];
  caption: string;
  /** Wrong: the right answer on a sign in the scene (game-dressed: buoy board, wooden sign…). */
  sign: { text: string; style: string } | null;
  durationMs: number;
}

export function planConsequence(e: ConsequenceEvent): ConsequencePlan {
  const o = e.outcome;
  const mood = (o.avatarAnim as ConsequenceAvatarState | undefined) ?? null;
  const reaction: ConsequenceAvatarState[] = e.kind === 'correct' ? ['correct'] : e.kind === 'recover' ? [] : ['wrong'];
  const avatar = [...reaction, ...(mood && !reaction.includes(mood) ? [mood] : [])];
  const sign = e.kind === 'wrong' || e.kind === 'wrongStreak' ? (e.rightAnswer ? { text: e.rightAnswer, style: gameConsequences(e.game)?.answerSign ?? '' } : null) : null;
  // A timeout is a light wrong: no big camera move.
  const camera = e.timeout ? null : (o.camera ?? null);
  return { kind: e.kind, effect: o.effect, sfx: o.sfx, camera, avatar, caption: e.caption, sign, durationMs: o.durationMs ?? QUESTION_RULES.feedbackMs };
}

/** The four standard hooks of one game: each turns its event into a plan for `run`. */
export function standardHooks<C>(run: (plan: ConsequencePlan, e: ConsequenceEvent, ctx: C) => void | Promise<void>): ConsequenceHooks<C> {
  const hook: ConsequenceHook<C> = (e, ctx) => run(planConsequence(e), e, ctx);
  return { onCorrect: hook, onWrong: hook, onWrongStreak: hook, recover: hook };
}

/** A system with all six games registered on the standard hooks. */
export function standardConsequences<C>(run: (plan: ConsequencePlan, e: ConsequenceEvent, ctx: C) => void | Promise<void>): ConsequenceSystem<C> {
  const sys = new ConsequenceSystem<C>();
  for (const g of CONSEQUENCE_GAMES) sys.register(g, standardHooks(run));
  return sys;
}
