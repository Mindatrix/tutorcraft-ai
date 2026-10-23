import type { AnswerRecord, BattleConfig, BattleScaling, BossProfile, Question, SkillCast, SkillId } from './types';
import { damageFor, timeLimitFor } from './scaling';
import { MAX_MP, SKILLS, FREEZE_SECONDS, canCast, mpGain, optionsToRemove } from './skills';
import { miracleBuffFor } from './dda';
import { pick, themeForQuestion } from './themes';
import { advanceQuests, pickQuests, type QuestState } from './quests';

// Pure battle state machine shared by every theme and scenario.
// The UI only renders state and dispatches actions.

export interface BattleCtx {
  questions: Question[];
  config: BattleConfig;
  scaling: BattleScaling;
  /** Enables boss phase / enrage dialogue. */
  boss?: BossProfile;
}

/** Story moments layered on top of an event: boss transformation, enrage, quest completion. */
export interface StoryBeat {
  kind: 'phase' | 'enrage' | 'quest';
  text: string;
}

export const ENRAGE_STREAK = 3;

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
  casts: SkillCast[];
  feedback: { text: string; tone: FeedbackTone } | null;
  outcome: 'victory' | 'defeat' | null;
  /** 1 = opening form, 2 = transformed at 50% boss HP. */
  bossPhase: 1 | 2;
  /** Wrong answers in a row (not reset by the DDA buff, unlike consecutiveWrong). */
  wrongStreak: number;
  /** Boss enraged by a wrong streak — it taunts and unlocks the hint. Calms on a correct answer. */
  enraged: boolean;
  /** Hint for the current question is visible (Miracle Buff or enraged boss). */
  hintUnlocked: boolean;
  quests: QuestState[];
  /** Increments on every event so the UI can fire one SFX / animation per event. */
  event: { kind: BattleEvent; n: number; amount?: number; beats?: StoryBeat[] } | null;
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
    casts: [],
    feedback: null,
    outcome: null,
    bossPhase: 1,
    wrongStreak: 0,
    enraged: false,
    hintUnlocked: false,
    quests: ctx.config.mode === 'gamified' ? pickQuests(ctx.questions) : [],
    event: null,
  };
}

function emit(s: BattleState, kind: BattleEvent, amount?: number, beats?: StoryBeat[]): BattleState['event'] {
  return { kind, n: (s.event?.n ?? 0) + 1, amount, ...(beats?.length ? { beats } : {}) };
}

/** Boss skill name for the current phase, e.g. used in attack feedback. */
export function bossSkillName(boss: BossProfile | undefined, phase: 1 | 2): string | null {
  if (!boss?.boss_skills.length) return null;
  return boss.boss_skills[Math.min(boss.boss_skills.length - 1, phase === 2 ? 1 : 0)];
}

/** Phase change, enrage and quest progress after an answer (gamified mode only). */
function applyStory(prev: BattleState, s: BattleState, q: Question, ok: boolean, timeMs: number, ctx: BattleCtx): BattleState {
  const beats: StoryBeat[] = [];
  const enteredPhase2 = prev.bossPhase === 1 && s.bossHp > 0 && s.bossHp <= ctx.scaling.bossHp / 2;
  const wrongStreak = ok ? 0 : prev.wrongStreak + 1;
  const enrageNow = !ok && wrongStreak > 0 && wrongStreak % ENRAGE_STREAK === 0;

  if (enteredPhase2 && ctx.boss) {
    beats.push({ kind: 'phase', text: `⚡ ${ctx.boss.boss_name} biến hình thành ${ctx.boss.phase2_name}! “${ctx.boss.phase2_dialogue}”` });
  }
  if (enrageNow && ctx.boss) {
    beats.push({ kind: 'enrage', text: `🔥 Boss cuồng nộ: “${ctx.boss.enrage_dialogue}” — Gợi ý câu sau đã mở khoá.` });
  }

  const upd = advanceQuests(prev.quests, q, ok, timeMs, timeLimitFor(q.difficulty), s.hp < prev.hp, enteredPhase2);
  let mp = s.mp;
  let hp = s.hp;
  for (const done of upd.completed) {
    mp = Math.min(MAX_MP, mp + done.reward.mp);
    if (hp > 0) hp = Math.min(ctx.scaling.playerHp, hp + done.reward.heal);
    const parts = [`+${done.reward.gems} Gems`, done.reward.mp ? `+${done.reward.mp} MP` : '', done.reward.heal ? `+${done.reward.heal} HP` : ''].filter(Boolean);
    beats.push({ kind: 'quest', text: `🏅 Nhiệm vụ hoàn thành: ${done.title}! ${parts.join(' · ')}` });
  }

  return {
    ...s,
    mp,
    hp,
    bossPhase: enteredPhase2 ? 2 : prev.bossPhase,
    wrongStreak,
    enraged: ok ? false : prev.enraged || enrageNow,
    quests: upd.quests,
    event: s.event ? { ...s.event, ...(beats.length ? { beats } : {}) } : s.event,
  };
}

function answer(s: BattleState, chosen: number, ctx: BattleCtx): BattleState {
  const r = resolveAnswer(s, chosen, ctx);
  if (r === s || ctx.config.mode !== 'gamified') return r;
  const q = ctx.questions[s.idx];
  return applyStory(s, r, q, chosen === q.correct_idx, r.answers[r.answers.length - 1]?.timeMs ?? 0, ctx);
}

function resolveAnswer(s: BattleState, chosen: number, ctx: BattleCtx): BattleState {
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
      event: emit(s, crit ? 'critical' : 'correct', dmg),
    };
  }

  const prefix = chosen === -1 ? '⏰ Time out! ' : '';
  const skill = bossSkillName(ctx.boss, s.bossPhase);
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
    feedback: { text: `${prefix}${skill ? `👹 ${skill}! ` : `${theme.emoji} `}${pick(theme.wrong, s.idx)} -${ctx.scaling.wrongPenalty} HP`, tone: 'wrong' },
    event: emit(s, 'wrong', ctx.scaling.wrongPenalty),
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
    hintUnlocked: gamified && (!!buff || s.enraged),
    consecutiveWrong: buff ? 0 : s.consecutiveWrong,
    freezeLeft: 0,
    questionTime: t,
    timeLeft: t,
    feedback: buff
      ? { text: `✨ Miracle Buff! 50/50 + ${buff.bonusSeconds}s bonus time`, tone: 'buff' }
      : gamified && s.enraged
        ? { text: '🔥 Boss đang cuồng nộ — gợi ý đã mở khoá, đọc kỹ nhé!', tone: 'buff' }
        : null,
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
    casts: [...s.casts, { skill, questionId: q.id }],
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
        return a.state.idx < ctx.questions.length ? { ...initialBattleState(ctx), ...a.state, casts: a.state.casts ?? [], event: null } : s;
    }
  };
}
