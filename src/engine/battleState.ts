import type { AnswerRecord, BattleConfig, BattleScaling, BossProfile, Grade, Question, SkillCast, SkillId } from './types';
import { damageFor } from './scaling';
import { CRIT_SCORE, PASS_SCORE, QUESTION_TYPES, isAnswerCorrect, questionShare, questionTimeLimit, questionType } from './questionTypes';
import { matchingScore } from './grading';
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
  /** Per-session seed: shuffles matching cards / reorder chips differently for every student. */
  seed?: number;
}

/** Story moments layered on top of an event: boss transformation, enrage, quest completion. */
export interface StoryBeat {
  kind: 'phase' | 'enrage' | 'quest';
  text: string;
}

export const ENRAGE_STREAK = 3;

export type FeedbackTone = 'correct' | 'critical' | 'wrong' | 'blocked' | 'skill' | 'buff' | 'ultimate' | 'miss';
export type BattleEvent = FeedbackTone | 'victory' | 'defeat';

/** Matching progress on the current question (left indices matched, wrong tries, damage dealt). */
export interface MatchProgress {
  qid: number;
  matched: number[];
  wrong: number;
  dealt: number;
}

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
  /** Correct answers so far (the boat's distance in Boat Race). */
  correct: number;
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
  /** Matching question in progress, else null. */
  match: MatchProgress | null;
  /** Increments on every event so the UI can fire one SFX / animation per event. */
  event: { kind: BattleEvent; n: number; amount?: number; beats?: StoryBeat[] } | null;
}

export type BattleAction =
  | { type: 'START' }
  | { type: 'TICK' }
  | { type: 'ANSWER'; idx: number; grade?: Grade; response?: string }
  /** Matching: try one pair (left index, original index of the right card). */
  | { type: 'PAIR'; left: number; right: number }
  | { type: 'NEXT' }
  | { type: 'CAST'; skill: SkillId }
  | { type: 'RESET' }
  | { type: 'RESTORE'; state: BattleState };

export function initialBattleState(ctx: BattleCtx): BattleState {
  const t = ctx.questions[0] ? questionTimeLimit(ctx.questions[0], ctx.config.level) : 45;
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
    correct: 0,
    casts: [],
    feedback: null,
    outcome: null,
    bossPhase: 1,
    wrongStreak: 0,
    enraged: false,
    hintUnlocked: false,
    quests: ctx.config.mode === 'gamified' ? pickQuests(ctx.questions) : [],
    match: null,
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

  const upd = advanceQuests(prev.quests, q, ok, timeMs, questionTimeLimit(q, ctx.config.level), s.hp < prev.hp, enteredPhase2);
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

function answer(s: BattleState, chosen: number, ctx: BattleCtx, grade?: Grade, response?: string): BattleState {
  const r = resolveAnswer(s, chosen, ctx, grade, response);
  if (r === s || ctx.config.mode !== 'gamified') return r;
  const q = ctx.questions[s.idx];
  const last = r.answers[r.answers.length - 1];
  return applyStory(s, r, q, !!last && isAnswerCorrect(q, last), last?.timeMs ?? 0, ctx);
}

function currentMatch(s: BattleState, q: Question): MatchProgress {
  return s.match?.qid === q.id ? s.match : { qid: q.id, matched: [], wrong: 0, dealt: 0 };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function resolveAnswer(s: BattleState, chosen: number, ctx: BattleCtx, grade?: Grade, response?: string): BattleState {
  const q = ctx.questions[s.idx];
  if (!q || s.selected !== null || s.phase !== 'playing') return s;
  const type = questionType(q);
  const share = questionShare(q);
  const match = type === 'matching' ? currentMatch(s, q) : null;

  // 0..1 credit for this question, whatever its format.
  let score: number;
  if (type === 'mcq') score = chosen === q.correct_idx && chosen >= 0 ? 1 : 0;
  else if (match) score = matchingScore(q.pairs?.length ?? 0, match.matched.length, match.wrong);
  else score = chosen === -1 ? 0 : Math.max(0, Math.min(1, grade?.score ?? 0));
  const ok = score >= PASS_SCORE;
  const complete = !!match && match.matched.length === (q.pairs?.length ?? 0) && chosen !== -1;

  const timeMs = Math.max(0, (s.questionTime - s.timeLeft) * 1000);
  const record = (damage: number): AnswerRecord => ({
    questionId: q.id,
    chosenIdx: chosen,
    timeMs,
    shielded: !ok && s.shield,
    ...(type !== 'mcq' ? { score } : {}),
    damage: damage + (match?.dealt ?? 0),
    ...(response ? { response: response.slice(0, 2000) } : {}),
  });

  if (ctx.config.mode === 'standard') {
    const label = type === 'mcq' ? (ok ? 'Correct' : chosen === -1 ? 'Time is up' : 'Incorrect') : `${ok ? 'Đạt' : 'Chưa đạt'} · ${pct(score)}`;
    return {
      ...s,
      selected: chosen,
      answers: [...s.answers, record(0)],
      correct: s.correct + (ok ? 1 : 0),
      match: null,
      feedback: { text: label, tone: ok ? 'correct' : 'wrong' },
      event: emit(s, ok ? 'correct' : 'wrong'),
    };
  }

  const theme = themeForQuestion(ctx.config.themes, s.idx);
  const base = { ...s, selected: chosen, correct: s.correct + (ok ? 1 : 0), match: null };

  if (ok) {
    const combo = s.combo + 1;
    let dmg: number;
    let kind: BattleEvent;
    let text: string;
    if (type === 'mcq') {
      dmg = damageFor(combo);
      kind = combo >= 3 ? 'critical' : 'correct';
      text = `${theme.emoji} ${pick(kind === 'critical' ? theme.critical : theme.correct, s.idx)} -${dmg} HP${combo >= 2 ? ` · Combo x${combo}` : ''}`;
    } else if (complete) {
      // Every pair matched: Ultimate Skill. Flawless = critical multiplier.
      const flawless = match!.wrong === 0;
      dmg = Math.round(share * 0.5 * score * (flawless ? 1.5 : 1));
      kind = 'ultimate';
      text = `🌟 TUYỆT KỸ ${q.hub ? `“${q.hub}” ` : ''}${flawless ? 'HOÀN HẢO — CRITICAL! ' : ''}-${dmg} HP`;
    } else {
      const crit = score >= CRIT_SCORE || combo >= 3;
      dmg = Math.round(share * score * (crit ? 1.5 : 1));
      kind = crit ? 'critical' : 'correct';
      text = `${QUESTION_TYPES[type].icon} ${pct(score)} chính xác${crit ? ' — CRITICAL!' : ''} -${dmg} HP${combo >= 2 ? ` · Combo x${combo}` : ''}`;
    }
    return {
      ...base,
      answers: [...s.answers, record(dmg)],
      combo,
      maxCombo: Math.max(s.maxCombo, combo),
      consecutiveWrong: 0,
      bossHp: Math.max(0, s.bossHp - dmg),
      mp: Math.min(MAX_MP, s.mp + mpGain(combo)),
      feedback: { text, tone: kind === 'ultimate' ? 'ultimate' : kind === 'critical' ? 'critical' : 'correct' },
      event: emit(s, kind, dmg),
    };
  }

  // Below the pass mark: partial credit still chips the boss, then the boss strikes back.
  const partial = type === 'mcq' || match ? 0 : Math.round(share * score * 0.5);
  const prefix = chosen === -1 ? '⏰ Time out! ' : partial ? `${pct(score)} — trúng nhẹ -${partial} HP. ` : '';
  const skill = bossSkillName(ctx.boss, s.bossPhase);
  const after = { ...base, answers: [...s.answers, record(partial)], bossHp: Math.max(0, s.bossHp - partial) };
  if (s.shield) {
    return {
      ...after,
      combo: 0,
      consecutiveWrong: s.consecutiveWrong + 1,
      shield: false,
      feedback: { text: `${prefix}🛡️ Shield blocked the hit! No HP lost.`, tone: 'blocked' },
      event: emit(s, 'blocked'),
    };
  }
  return {
    ...after,
    combo: 0,
    consecutiveWrong: s.consecutiveWrong + 1,
    hp: Math.max(0, s.hp - ctx.scaling.wrongPenalty),
    feedback: { text: `${prefix}${skill ? `👹 ${skill}! ` : `${theme.emoji} `}${pick(theme.wrong, s.idx)} -${ctx.scaling.wrongPenalty} HP`, tone: 'wrong' },
    event: emit(s, 'wrong', ctx.scaling.wrongPenalty),
  };
}

/** Matching: one pair attempt. Right = combo hit (energy beam); wrong = blocked, combo lost. */
function pair(s: BattleState, left: number, right: number, ctx: BattleCtx): BattleState {
  const q = ctx.questions[s.idx];
  if (!q || s.phase !== 'playing' || s.selected !== null || questionType(q) !== 'matching') return s;
  const n = q.pairs?.length ?? 0;
  const m = currentMatch(s, q);
  if (![left, right].every((i) => Number.isInteger(i) && i >= 0 && i < n)) return s;
  if (m.matched.includes(left) || m.matched.includes(right)) return s; // already matched: no-op

  if (left !== right) {
    return {
      ...s,
      match: { ...m, wrong: m.wrong + 1 },
      combo: 0,
      feedback: { text: '✖ Chưa đúng cặp — Boss chặn đòn! (mất combo)', tone: 'miss' },
      event: emit(s, 'miss'),
    };
  }

  const combo = s.combo + 1;
  const hit = Math.round((questionShare(q) * 0.5) / Math.max(1, n));
  const next: BattleState = {
    ...s,
    match: { ...m, matched: [...m.matched, left], dealt: m.dealt + hit },
    combo,
    maxCombo: Math.max(s.maxCombo, combo),
    bossHp: Math.max(0, s.bossHp - hit),
    mp: Math.min(MAX_MP, s.mp + 5),
    feedback: { text: `⚡ Nối đúng! Đòn chém năng lượng -${hit} HP · Combo x${combo}`, tone: 'correct' },
    event: emit(s, 'correct', hit),
  };
  // Last pair: lock the question in and fire the Ultimate.
  return next.match!.matched.length === n ? answer(next, 0, ctx) : next;
}

function next(s: BattleState, ctx: BattleCtx): BattleState {
  if (s.phase !== 'playing' || s.selected === null) return s;
  const gamified = ctx.config.mode === 'gamified';
  if (gamified && s.hp <= 0 && ctx.config.scenario !== 'boat_race') { // a race is decided by distance, not HP
    return { ...s, phase: 'result', outcome: 'defeat', event: emit(s, 'defeat') };
  }
  if (s.idx + 1 >= ctx.questions.length) {
    return { ...s, phase: 'result', outcome: 'victory', event: emit(s, 'victory') };
  }

  const idx = s.idx + 1;
  const q = ctx.questions[idx];
  const buff = gamified ? miracleBuffFor(s.consecutiveWrong) : null;
  const t = questionTimeLimit(q, ctx.config.level) + (buff?.bonusSeconds ?? 0);
  const isMcq = questionType(q) === 'mcq';
  return {
    ...s,
    idx,
    selected: null,
    match: null,
    // 50/50 removes options on multiple choice; other formats get the hint instead.
    removed: buff?.fiftyFifty && isMcq ? optionsToRemove(q.options.length, q.correct_idx, idx) : [],
    miracle: !!buff,
    hintUnlocked: gamified && (!!buff || s.enraged),
    consecutiveWrong: buff ? 0 : s.consecutiveWrong,
    freezeLeft: 0,
    questionTime: t,
    timeLeft: t,
    feedback: buff
      ? { text: isMcq ? `✨ Miracle Buff! 50/50 + ${buff.bonusSeconds}s bonus time` : `✨ Miracle Buff! Gợi ý đã mở + ${buff.bonusSeconds}s`, tone: 'buff' }
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
      if (questionType(q) !== 'mcq') {
        return s.hintUnlocked || !q.hint ? s : done({ hintUnlocked: true }, '👁️ Mắt Thần! Gợi ý đã hiện ra.');
      }
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
        return answer(s, a.idx, ctx, a.grade, a.response);
      case 'PAIR':
        return pair(s, a.left, a.right, ctx);
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
