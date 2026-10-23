import type { AnswerRecord, BattleConfig, BattleScaling, Question, SkillId } from './types';
import { damageFor, timeLimitFor } from './scaling';
import { MAX_MP, SKILLS, FREEZE_SECONDS, canCast, mpGain, optionsToRemove } from './skills';
import { miracleBuffFor } from './dda';
import { pick, themeForQuestion } from './themes';

// Pure battle state machine shared by every theme and scenario.
// The UI only renders state and dispatches actions.

export interface BattleCtx {
  questions: Question[];
  config: BattleConfig;
  scaling: BattleScaling;
}

export type FeedbackTone = 'correct' | 'critical' | 'wrong' | 'blocked' | 'skill' | 'buff';
export type BattleEvent = FeedbackTone | 'victory' | 'defeat';

export interface BattleState {
  phase: 'lobby' | 'playing' | 'result';
  idx: number;
  hp: number;
  bossHp: number;
  mp: number;
  combo: number;
  maxCombo: number;
  consecutiveWrong: number;
  shield: boolean;
  freezeLeft: number;
  removed: number[];
  miracle: boolean;
  questionTime: number;
  timeLeft: number;
  selected: number | null;
  answers: AnswerRecord[];
  feedback: { text: string; tone: FeedbackTone } | null;
  outcome: 'victory' | 'defeat' | null;
  /** Increments on every event so the UI can fire one SFX per event. */
  event: { kind: BattleEvent; n: number } | null;
}

export type BattleAction =
  | { type: 'START' }
  | { type: 'TICK' }
  | { type: 'ANSWER'; idx: number }
  | { type: 'NEXT' }
  | { type: 'CAST'; skill: SkillId }
  | { type: 'RESET' }
  | { type: 'RESTORE'; state: BattleState };

export function initialBattleState(ctx: BattleCtx): BattleState {
  const t = timeLimitFor(ctx.questions[0]?.difficulty);
  return {
    phase: 'lobby',
    idx: 0,
    hp: ctx.scaling.playerHp,
    bossHp: ctx.scaling.bossHp,
    mp: 0,
    combo: 0,
    maxCombo: 0,
    consecutiveWrong: 0,
    shield: false,
    freezeLeft: 0,
    removed: [],
    miracle: false,
    questionTime: t,
    timeLeft: t,
    selected: null,
    answers: [],
    feedback: null,
    outcome: null,
    event: null,
  };
}

function emit(s: BattleState, kind: BattleEvent): BattleState['event'] {
  return { kind, n: (s.event?.n ?? 0) + 1 };
}

function answer(s: BattleState, chosen: number, ctx: BattleCtx): BattleState {
  const q = ctx.questions[s.idx];
  if (!q || s.selected !== null || s.phase !== 'playing') return s;
  const ok = chosen === q.correct_idx;
  const timeMs = Math.max(0, (s.questionTime - s.timeLeft) * 1000);
  const answers = [...s.answers, { questionId: q.id, chosenIdx: chosen, timeMs, shielded: !ok && s.shield }];
  const base = { ...s, selected: chosen, answers };

  if (ctx.config.mode === 'standard') {
    return {
      ...base,
      feedback: ok ? { text: 'Correct', tone: 'correct' } : { text: chosen === -1 ? 'Time is up' : 'Incorrect', tone: 'wrong' },
      event: emit(s, ok ? 'correct' : 'wrong'),
    };
  }

  const theme = themeForQuestion(ctx.config.themes, s.idx);
  if (ok) {
    const combo = s.combo + 1;
    const dmg = damageFor(combo);
    const crit = combo >= 3;
    const line = crit ? pick(theme.critical, s.idx) : pick(theme.correct, s.idx);
    return {
      ...base,
      combo,
      maxCombo: Math.max(s.maxCombo, combo),
      consecutiveWrong: 0,
      bossHp: Math.max(0, s.bossHp - dmg),
      mp: Math.min(MAX_MP, s.mp + mpGain(combo)),
      feedback: { text: `${theme.emoji} ${line} -${dmg} HP${combo >= 2 ? ` · Combo x${combo}` : ''}`, tone: crit ? 'critical' : 'correct' },
      event: emit(s, crit ? 'critical' : 'correct'),
    };
  }

  const prefix = chosen === -1 ? '⏰ Time out! ' : '';
  if (s.shield) {
    return {
      ...base,
      combo: 0,
      consecutiveWrong: s.consecutiveWrong + 1,
      shield: false,
      feedback: { text: `${prefix}🛡️ Shield blocked the hit! No HP lost.`, tone: 'blocked' },
      event: emit(s, 'blocked'),
    };
  }
  return {
    ...base,
    combo: 0,
    consecutiveWrong: s.consecutiveWrong + 1,
    hp: Math.max(0, s.hp - ctx.scaling.wrongPenalty),
    feedback: { text: `${prefix}${theme.emoji} ${pick(theme.wrong, s.idx)} -${ctx.scaling.wrongPenalty} HP`, tone: 'wrong' },
    event: emit(s, 'wrong'),
  };
}

function next(s: BattleState, ctx: BattleCtx): BattleState {
  if (s.phase !== 'playing' || s.selected === null) return s;
  const gamified = ctx.config.mode === 'gamified';
  if (gamified && s.hp <= 0) {
    return { ...s, phase: 'result', outcome: 'defeat', event: emit(s, 'defeat') };
  }
  if (s.idx + 1 >= ctx.questions.length) {
    return { ...s, phase: 'result', outcome: 'victory', event: emit(s, 'victory') };
  }

  const idx = s.idx + 1;
  const q = ctx.questions[idx];
  const buff = gamified ? miracleBuffFor(s.consecutiveWrong) : null;
  const t = timeLimitFor(q.difficulty) + (buff?.bonusSeconds ?? 0);
  return {
    ...s,
    idx,
    selected: null,
    removed: buff?.fiftyFifty ? optionsToRemove(q.options.length, q.correct_idx, idx) : [],
    miracle: !!buff,
    consecutiveWrong: buff ? 0 : s.consecutiveWrong,
    freezeLeft: 0,
    questionTime: t,
    timeLeft: t,
    feedback: buff ? { text: `✨ Miracle Buff! 50/50 + ${buff.bonusSeconds}s bonus time`, tone: 'buff' } : null,
    event: buff ? emit(s, 'buff') : s.event,
  };
}

function cast(s: BattleState, skill: SkillId, ctx: BattleCtx): BattleState {
  if (s.phase !== 'playing' || s.selected !== null || ctx.config.mode !== 'gamified') return s;
  if (!canCast(skill, s.mp)) return s;
  const q = ctx.questions[s.idx];
  const cost = SKILLS[skill].cost;
  const done = (patch: Partial<BattleState>, text: string): BattleState => ({
    ...s,
    ...patch,
    mp: s.mp - cost,
    feedback: { text, tone: 'skill' },
    event: emit(s, 'skill'),
  });
  switch (skill) {
    case 'shield':
      return s.shield ? s : done({ shield: true }, '🛡️ Shield up! Your next mistake is blocked.');
    case 'freeze':
      return s.freezeLeft > 0 ? s : done({ freezeLeft: FREEZE_SECONDS }, `❄️ Time Freeze! Timer paused ${FREEZE_SECONDS}s.`);
    case 'eye_of_truth':
      return s.removed.length ? s : done({ removed: optionsToRemove(q.options.length, q.correct_idx, s.idx + 7) }, '👁️ Eye of Truth! 2 wrong options removed.');
  }
}

export function battleReducer(ctx: BattleCtx) {
  return (s: BattleState, a: BattleAction): BattleState => {
    switch (a.type) {
      case 'START':
        return s.phase === 'lobby' ? { ...s, phase: 'playing' } : s;
      case 'TICK':
        if (s.phase !== 'playing' || s.selected !== null) return s;
        if (s.freezeLeft > 0) return { ...s, freezeLeft: s.freezeLeft - 1 };
        if (s.timeLeft <= 1) return answer({ ...s, timeLeft: 0 }, -1, ctx);
        return { ...s, timeLeft: s.timeLeft - 1 };
      case 'ANSWER':
        return answer(s, a.idx, ctx);
      case 'NEXT':
        return next(s, ctx);
      case 'CAST':
        return cast(s, a.skill, ctx);
      case 'RESET':
        return { ...initialBattleState(ctx), phase: 'playing' };
      case 'RESTORE':
        // Resume saved progress, but never past the end of this battle.
        return a.state.idx < ctx.questions.length ? { ...a.state, event: null } : s;
    }
  };
}
