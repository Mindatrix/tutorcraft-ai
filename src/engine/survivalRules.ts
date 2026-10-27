// River Survival "Cướp Lưới" rules, decided on the SERVER (plan B2.7; rules from game_worlds.class_plan,
// river_survival, 26/10). Pure: every function takes a state and returns a new one.
//
//  - Pursuers (Đội Săn Tìm) charge their Tag Net with correct answers: no charge, no throw
//    ("đội đủ điểm mới được bắn lưới"). One throw tags at most SURVIVAL.maxTargets escapers.
//  - A tagged escaper gets one "Né lưới" question (6 s, once per stage): the next answer decides.
//    Already used this stage → caught at once. Caught = sent to the Wooden Pen, never eliminated.
//  - An escaper behind a pursuer can try "Cướp lưới": one question within 8 s. Right: the escaper
//    holds the net (3 uses or 60 s) and the pursuer is without a net for 45 s. Wrong: the escaper
//    shows on the pursuers' map for 5 s.
//  - A held net freezes a pursuer for 10 s or opens the pen for 2 teammates. A pursuer who touches
//    the holder takes the net back.
//  - Time up: escapers win if more are free than caught, pursuers if they caught more than half;
//    exactly half = more stars wins. MVP of the winners gets 20% of the losing team's points.
//  - Positions (who is close to whom) are drawn by the clients; the server checks everything else
//    (teams, charges, cooldowns, windows, who is caught or free) and refuses the rest.

import { mulberry32 } from './variants';

export type SurvivalTeam = 'escapers' | 'pursuers';

export const SURVIVAL = {
  maxCharge: 3,
  throwCost: 1,
  maxTargets: 2,
  throwCooldownMs: 5_000,
  dodgeWindowMs: 6_000,
  immuneMs: 5_000,
  snatchWindowMs: 8_000,
  netLostMs: 45_000,
  stolenNetUses: 3,
  stolenNetMs: 60_000,
  freezeMs: 10_000,
  rescuePerUse: 2,
  revealMs: 5_000,
  points: { capture: 50, dodge: 30, snatch: 80, freeze: 30, rescue: 50 },
  mvpShare: 0.2,
  /** Bot pursuers (1–5 students): one throw every this many ms, by class level 0..5. */
  botIntervalMs: [120_000, 100_000, 85_000, 75_000, 60_000, 50_000],
  /** Remembered action ids (duplicate submits are ignored, not applied twice). */
  seenMax: 300,
} as const;

export interface SurvivalPlayer {
  id: string;
  team: SurvivalTeam;
  bot?: boolean;
  /** Escapers: false while in the pen. */
  free: boolean;
  caughtAt: number;
  immuneUntil: number;
  /** Stage in which this escaper already used "Né lưới" (one per stage). */
  dodgeStage: number;
  /** Pursuers: net charges from correct answers. */
  charge: number;
  lastThrowAt: number;
  /** Pursuers: no net until then (it was snatched). */
  netLostUntil: number;
  /** Escapers: a snatched net. */
  stolenNet: { from: string; uses: number; until: number } | null;
  frozenUntil: number;
  revealedUntil: number;
  stars: number;
  actionPoints: number;
  captures: number;
  timesCaught: number;
  dodges: number;
  snatches: number;
  rescues: number;
}

export interface PendingTag {
  escaper: string;
  by: string;
  /** When the window opened: only an answer given in [at, until] counts. */
  at: number;
  until: number;
}

export interface PendingSnatch {
  escaper: string;
  target: string;
  at: number;
  until: number;
}

/**
 * Each player's latest graded answer (match_players.last_answer_at / last_answer_correct).
 * Open windows are decided from it, so a lost write at answer time can never cost a student a
 * dodge they answered right: the next settle reads the durable answer and decides the same way.
 */
export type LastAnswers = Record<string, { at: number; correct: boolean }>;

export interface SurvivalState {
  players: Record<string, SurvivalPlayer>;
  pendingTags: PendingTag[];
  pendingSnatches: PendingSnatch[];
  /** Applied action ids, newest last. */
  seen: string[];
  /** Refused actions per player: a cheating signal for the tutor, never applied. */
  rejected: Record<string, number>;
  botSeed: number;
  lastBotAt: number;
  botThrows: number;
}

export type SurvivalEvent =
  | { t: 'tag'; by: string; targets: string[]; at: number }
  | { t: 'dodge_window'; escaper: string; by: string; until: number }
  | { t: 'caught'; escaper: string; by: string; at: number }
  | { t: 'dodged'; escaper: string; by: string; at: number }
  | { t: 'snatch_try'; escaper: string; target: string; until: number }
  | { t: 'snatched'; escaper: string; target: string; at: number }
  | { t: 'snatch_failed'; escaper: string; target: string; at: number; revealedUntil: number }
  | { t: 'frozen'; by: string; target: string; until: number }
  | { t: 'rescued'; by: string; freed: string[]; at: number }
  | { t: 'net_back'; holder: string; owner: string; at: number; why: 'used' | 'expired' | 'retaken' | 'caught' };

export type SurvivalAction =
  | { type: 'tag'; targets: string[]; id?: string }
  | { type: 'snatch'; target: string; id?: string }
  | { type: 'freeze'; target: string; id?: string }
  | { type: 'rescue'; freed?: string[]; id?: string }
  | { type: 'retake'; target: string; id?: string };

export interface SurvivalCtx {
  now: number;
  /** Current match stage (1..8): "Né lưới" is once per stage. */
  stage: number;
  /** Class level 0..5 (bot speed). */
  level?: number;
}

export type ActResult =
  | { ok: true; state: SurvivalState; events: SurvivalEvent[]; duplicate?: boolean }
  | { ok: false; state: SurvivalState; reason: string };

const blank = (id: string, team: SurvivalTeam, bot = false): SurvivalPlayer => ({
  id,
  team,
  ...(bot ? { bot: true } : {}),
  free: true,
  caughtAt: 0,
  immuneUntil: 0,
  dodgeStage: 0,
  charge: 0,
  lastThrowAt: 0,
  netLostUntil: 0,
  stolenNet: null,
  frozenUntil: 0,
  revealedUntil: 0,
  stars: 0,
  actionPoints: 0,
  captures: 0,
  timesCaught: 0,
  dodges: 0,
  snatches: 0,
  rescues: 0,
});

export const botId = (i: number) => `bot-${i + 1}`;

/** `bots` > 0 adds computer pursuers (1–5 students: everyone escapes from slow bots). */
export function newSurvivalState(players: { id: string; team: SurvivalTeam }[], opts: { bots?: number; seed?: number; now?: number } = {}): SurvivalState {
  const all: Record<string, SurvivalPlayer> = {};
  for (const p of players) all[p.id] = blank(p.id, p.team);
  for (let i = 0; i < (opts.bots ?? 0); i++) all[botId(i)] = blank(botId(i), 'pursuers', true);
  return { players: all, pendingTags: [], pendingSnatches: [], seen: [], rejected: {}, botSeed: (opts.seed ?? 1) >>> 0, lastBotAt: opts.now ?? 0, botThrows: 0 };
}

/** A late joiner (or a reconnect after the start) enters the given team. */
export function addSurvivalPlayer(state: SurvivalState, id: string, team: SurvivalTeam): SurvivalState {
  if (state.players[id]) return state;
  const s = structuredClone(state);
  s.players[id] = blank(id, team);
  return s;
}

const clone = (s: SurvivalState) => structuredClone(s);

function catchEscaper(s: SurvivalState, escaper: SurvivalPlayer, byId: string, now: number, events: SurvivalEvent[]) {
  escaper.free = false;
  escaper.caughtAt = now;
  escaper.timesCaught += 1;
  const by = s.players[byId];
  if (by) {
    by.captures += 1;
    if (!by.bot) by.actionPoints += SURVIVAL.points.capture;
  }
  events.push({ t: 'caught', escaper: escaper.id, by: byId, at: now });
  // A caught escaper drops any net they were holding: it goes back to its owner.
  if (escaper.stolenNet) returnNet(s, escaper, now, 'caught', events);
  s.pendingSnatches = s.pendingSnatches.filter((p) => p.escaper !== escaper.id);
}

function returnNet(s: SurvivalState, holder: SurvivalPlayer, now: number, why: 'used' | 'expired' | 'retaken' | 'caught', events: SurvivalEvent[]) {
  const net = holder.stolenNet;
  if (!net) return;
  holder.stolenNet = null;
  const owner = s.players[net.from];
  if (owner && why === 'retaken') owner.netLostUntil = Math.min(owner.netLostUntil, now);
  events.push({ t: 'net_back', holder: holder.id, owner: net.from, at: now, why });
}

function resolveDodge(s: SurvivalState, tag: PendingTag, correct: boolean, at: number, events: SurvivalEvent[]) {
  const p = s.players[tag.escaper];
  if (!p?.free) return;
  if (correct) {
    p.dodges += 1;
    p.actionPoints += SURVIVAL.points.dodge;
    p.immuneUntil = at + SURVIVAL.immuneMs;
    events.push({ t: 'dodged', escaper: p.id, by: tag.by, at });
  } else catchEscaper(s, p, tag.by, at, events);
}

function resolveSnatch(s: SurvivalState, sn: PendingSnatch, correct: boolean, at: number, events: SurvivalEvent[]) {
  const p = s.players[sn.escaper];
  const target = s.players[sn.target];
  if (!p) return;
  if (correct && p.free && !p.stolenNet && target && target.netLostUntil <= at) {
    p.stolenNet = { from: target.id, uses: SURVIVAL.stolenNetUses, until: at + SURVIVAL.stolenNetMs };
    p.snatches += 1;
    p.actionPoints += SURVIVAL.points.snatch;
    target.netLostUntil = at + SURVIVAL.netLostMs;
    events.push({ t: 'snatched', escaper: p.id, target: target.id, at });
  } else {
    p.revealedUntil = at + SURVIVAL.revealMs;
    events.push({ t: 'snatch_failed', escaper: p.id, target: sn.target, at, revealedUntil: p.revealedUntil });
  }
}

/**
 * Resolve every open window that has an answer in it (from `answers`) or whose time has passed
 * (no answer = caught / failed), return held nets after 60 s, and make one bot throw when due.
 */
export function survivalSettle(state: SurvivalState, ctx: SurvivalCtx, answers: LastAnswers = {}): { state: SurvivalState; events: SurvivalEvent[] } {
  const { now } = ctx;
  const answerIn = (id: string, from: number, until: number) => {
    const a = answers[id];
    return a && a.at >= from && a.at <= Math.min(until, now) ? a : null;
  };
  const due =
    state.pendingTags.some((p) => p.until <= now || answerIn(p.escaper, p.at, p.until)) ||
    state.pendingSnatches.some((p) => p.until <= now || answerIn(p.escaper, p.at, p.until)) ||
    Object.values(state.players).some((p) => p.stolenNet && p.stolenNet.until <= now);
  const bots = Object.values(state.players).filter((p) => p.bot);
  const interval = SURVIVAL.botIntervalMs[Math.max(0, Math.min(5, Math.round(ctx.level ?? 3)))];
  const botDue = bots.length > 0 && now - state.lastBotAt >= interval;
  if (!due && !botDue) return { state, events: [] };

  const s = clone(state);
  const events: SurvivalEvent[] = [];
  const openTags: PendingTag[] = [];
  for (const p of s.pendingTags) {
    const a = answerIn(p.escaper, p.at, p.until);
    if (a) resolveDodge(s, p, a.correct, a.at, events);
    else if (p.until <= now) resolveDodge(s, p, false, p.until, events);
    else openTags.push(p);
  }
  s.pendingTags = openTags;
  const openSnatches: PendingSnatch[] = [];
  for (const p of s.pendingSnatches) {
    const a = answerIn(p.escaper, p.at, p.until);
    if (a) resolveSnatch(s, p, a.correct, a.at, events);
    else if (p.until <= now) resolveSnatch(s, p, false, p.until, events);
    else openSnatches.push(p);
  }
  s.pendingSnatches = openSnatches;
  for (const p of Object.values(s.players)) if (p.stolenNet && p.stolenNet.until <= now) returnNet(s, p, p.stolenNet.until, 'expired', events);

  if (botDue) {
    // One throw per settle, starting now, so the student always gets the full dodge window.
    s.lastBotAt = now;
    const rand = mulberry32((s.botSeed + s.botThrows * 0x9e3779b1) >>> 0);
    const thrower = bots.filter((b) => s.players[b.id].frozenUntil <= now && s.players[b.id].netLostUntil <= now);
    const targets = Object.values(s.players).filter((p) => p.team === 'escapers' && p.free && p.immuneUntil <= now && !s.pendingTags.some((t) => t.escaper === p.id));
    if (thrower.length && targets.length) {
      s.botThrows += 1;
      const bot = s.players[thrower[Math.floor(rand() * thrower.length)].id];
      const target = targets[Math.floor(rand() * targets.length)];
      bot.lastThrowAt = now;
      events.push({ t: 'tag', by: bot.id, targets: [target.id], at: now });
      offerDodgeOrCatch(s, target, bot.id, ctx, events);
    }
  }
  return { state: s, events };
}

function offerDodgeOrCatch(s: SurvivalState, target: SurvivalPlayer, byId: string, ctx: SurvivalCtx, events: SurvivalEvent[]) {
  if (target.dodgeStage === ctx.stage) {
    catchEscaper(s, target, byId, ctx.now, events);
    return;
  }
  target.dodgeStage = ctx.stage;
  const until = ctx.now + SURVIVAL.dodgeWindowMs;
  s.pendingTags.push({ escaper: target.id, by: byId, at: ctx.now, until });
  events.push({ t: 'dodge_window', escaper: target.id, by: byId, until });
}

/**
 * A graded answer from a player in the match. Stars always count; a pursuer's right answer
 * charges the net; an escaper's next answer decides an open "Né lưới" / "Cướp lưới".
 */
export function survivalAnswer(state: SurvivalState, playerId: string, ans: { correct: boolean; stars: number }, ctx: SurvivalCtx): { state: SurvivalState; events: SurvivalEvent[] } {
  const p0 = state.players[playerId];
  if (!p0) return survivalSettle(state, ctx);
  const s = clone(state);
  const p = s.players[playerId];
  p.stars += Math.max(0, Math.min(3, Math.floor(ans.stars)));
  if (p.team === 'pursuers' && ans.correct) p.charge = Math.min(SURVIVAL.maxCharge, p.charge + 1);
  // The first answer after a tag / snatch decides it: same rule as the durable path in settle.
  return survivalSettle(s, ctx, { [playerId]: { at: ctx.now, correct: ans.correct } });
}

/** A player's action (tag, snatch, freeze, rescue, retake). Refused actions change nothing but the refusal count. */
export function survivalAct(state: SurvivalState, actorId: string, action: SurvivalAction, ctx: SurvivalCtx): ActResult {
  const settled = survivalSettle(state, ctx);
  const s = clone(settled.state);
  const events: SurvivalEvent[] = [...settled.events];
  const { now } = ctx;
  const refuse = (reason: string): ActResult => {
    const r = clone(settled.state);
    if (r.players[actorId]) r.rejected[actorId] = (r.rejected[actorId] ?? 0) + 1;
    return { ok: false, state: r, reason };
  };
  if (action.id && s.seen.includes(action.id)) return { ok: true, state: settled.state, events: settled.events, duplicate: true };

  const me = s.players[actorId];
  if (!me || me.bot) return refuse('Người chơi không có trong trận.');
  const other = (id: unknown) => (typeof id === 'string' ? s.players[id] : undefined);

  switch (action.type) {
    case 'tag': {
      if (me.team !== 'pursuers') return refuse('Chỉ Đội Săn Tìm được tung lưới.');
      if (me.frozenUntil > now) return refuse('Bạn đang bị đóng băng.');
      if (me.netLostUntil > now) return refuse('Lưới của bạn đã bị cướp.');
      if (me.charge < SURVIVAL.throwCost) return refuse('Lưới chưa được nạp: hãy trả lời đúng một câu.');
      if (now - me.lastThrowAt < SURVIVAL.throwCooldownMs) return refuse('Vừa tung lưới, chờ một chút.');
      const ids = Array.isArray(action.targets) ? Array.from(new Set(action.targets)) : [];
      if (!ids.length || ids.length > SURVIVAL.maxTargets) return refuse(`Mỗi lần tung lưới bắt tối đa ${SURVIVAL.maxTargets} người.`);
      const targets = ids.map(other);
      if (targets.some((t) => !t || t.team !== 'escapers' || !t.free || t.immuneUntil > now || s.pendingTags.some((p) => p.escaper === t.id))) {
        return refuse('Có người không thể bị bắt lúc này.');
      }
      me.charge -= SURVIVAL.throwCost;
      me.lastThrowAt = now;
      events.push({ t: 'tag', by: me.id, targets: ids, at: now });
      for (const t of targets as SurvivalPlayer[]) offerDodgeOrCatch(s, t, me.id, ctx, events);
      break;
    }
    case 'snatch': {
      const target = other(action.target);
      if (me.team !== 'escapers' || !me.free) return refuse('Chỉ người Chạy Trốn còn tự do được cướp lưới.');
      if (me.stolenNet) return refuse('Bạn đang cầm một lưới rồi.');
      if (s.pendingSnatches.some((p) => p.escaper === me.id)) return refuse('Bạn đang cướp lưới.');
      if (!target || target.team !== 'pursuers' || target.netLostUntil > now || s.pendingSnatches.some((p) => p.target === target.id)) return refuse('Người này không có lưới để cướp.');
      const until = now + SURVIVAL.snatchWindowMs;
      s.pendingSnatches.push({ escaper: me.id, target: target.id, at: now, until });
      events.push({ t: 'snatch_try', escaper: me.id, target: target.id, until });
      break;
    }
    case 'freeze': {
      const target = other(action.target);
      if (!me.stolenNet || me.stolenNet.until <= now || !me.free) return refuse('Bạn không cầm lưới.');
      if (!target || target.team !== 'pursuers' || target.frozenUntil > now) return refuse('Không đóng băng được người này.');
      target.frozenUntil = now + SURVIVAL.freezeMs;
      me.actionPoints += SURVIVAL.points.freeze;
      events.push({ t: 'frozen', by: me.id, target: target.id, until: target.frozenUntil });
      spendNet(s, me, now, events);
      break;
    }
    case 'rescue': {
      if (!me.stolenNet || me.stolenNet.until <= now || !me.free) return refuse('Cần cầm lưới để mở Chuồng Gỗ.');
      const caught = Object.values(s.players).filter((p) => p.team === 'escapers' && !p.free).sort((a, b) => a.caughtAt - b.caughtAt || a.id.localeCompare(b.id));
      let freed: SurvivalPlayer[];
      if (Array.isArray(action.freed) && action.freed.length) {
        const ids = Array.from(new Set(action.freed));
        if (ids.length > SURVIVAL.rescuePerUse) return refuse(`Mỗi lần mở chuồng cứu tối đa ${SURVIVAL.rescuePerUse} bạn.`);
        const list = ids.map(other);
        if (list.some((p) => !p || p.team !== 'escapers' || p.free)) return refuse('Có bạn không ở trong chuồng.');
        freed = list as SurvivalPlayer[];
      } else freed = caught.slice(0, SURVIVAL.rescuePerUse);
      if (!freed.length) return refuse('Chuồng Gỗ đang trống.');
      for (const f of freed) {
        f.free = true;
        f.immuneUntil = now + SURVIVAL.immuneMs;
      }
      me.rescues += freed.length;
      me.actionPoints += SURVIVAL.points.rescue * freed.length;
      events.push({ t: 'rescued', by: me.id, freed: freed.map((f) => f.id), at: now });
      spendNet(s, me, now, events);
      break;
    }
    case 'retake': {
      const holder = other(action.target);
      if (me.team !== 'pursuers' || me.frozenUntil > now) return refuse('Chỉ người Săn Tìm (không bị đóng băng) lấy lại được lưới.');
      if (!holder || !holder.stolenNet) return refuse('Người này không cầm lưới.');
      returnNet(s, holder, now, 'retaken', events);
      break;
    }
    default:
      return refuse('Thao tác không hợp lệ.');
  }
  if (action.id) s.seen = [...s.seen, String(action.id).slice(0, 40)].slice(-SURVIVAL.seenMax);
  return { ok: true, state: s, events };
}

function spendNet(s: SurvivalState, holder: SurvivalPlayer, now: number, events: SurvivalEvent[]) {
  if (!holder.stolenNet) return;
  holder.stolenNet.uses -= 1;
  if (holder.stolenNet.uses <= 0) returnNet(s, holder, now, 'used', events);
}

export interface SurvivalResult {
  winner: SurvivalTeam | 'draw';
  why: 'free_majority' | 'caught_majority' | 'stars' | 'draw';
  escapers: number;
  free: number;
  caught: number;
  stars: Record<SurvivalTeam, number>;
  /** Final points per student: stars × 100 + action points (+ the MVP bonus). */
  points: Record<string, number>;
  teamPoints: Record<SurvivalTeam, number>;
  mvp: { id: string; bonus: number } | null;
  /** Top scorer of the losing team: "Gương Mặt Quật Cường". */
  braveFace: string | null;
}

/** Head count when time is up ("đếm đầu người ở phút cuối"). Bots never get awards. */
export function survivalResult(state: SurvivalState): SurvivalResult {
  const players = Object.values(state.players);
  const escapers = players.filter((p) => p.team === 'escapers');
  const free = escapers.filter((p) => p.free).length;
  const caught = escapers.length - free;
  const stars: Record<SurvivalTeam, number> = { escapers: 0, pursuers: 0 };
  for (const p of players) stars[p.team] += p.stars;

  let winner: SurvivalTeam | 'draw';
  let why: SurvivalResult['why'];
  if (caught * 2 > escapers.length) [winner, why] = ['pursuers', 'caught_majority'];
  else if (free > caught) [winner, why] = ['escapers', 'free_majority'];
  else if (stars.escapers !== stars.pursuers) [winner, why] = [stars.escapers > stars.pursuers ? 'escapers' : 'pursuers', 'stars'];
  else [winner, why] = ['draw', 'draw'];

  const points: Record<string, number> = {};
  const teamPoints: Record<SurvivalTeam, number> = { escapers: 0, pursuers: 0 };
  for (const p of players) {
    if (p.bot) continue;
    points[p.id] = p.stars * 100 + p.actionPoints;
    teamPoints[p.team] += points[p.id];
  }
  const top = (team: SurvivalTeam) =>
    players.filter((p) => p.team === team && !p.bot).sort((a, b) => points[b.id] - points[a.id] || b.stars - a.stars || a.id.localeCompare(b.id))[0] ?? null;
  let mvp: SurvivalResult['mvp'] = null;
  let braveFace: string | null = null;
  if (winner !== 'draw') {
    const loser: SurvivalTeam = winner === 'escapers' ? 'pursuers' : 'escapers';
    const best = top(winner);
    if (best) {
      const bonus = Math.round(teamPoints[loser] * SURVIVAL.mvpShare);
      mvp = { id: best.id, bonus };
      points[best.id] += bonus;
      teamPoints[winner] += bonus;
    }
    braveFace = top(loser)?.id ?? null;
  }
  return { winner, why, escapers: escapers.length, free, caught, stars, points, teamPoints, mvp, braveFace };
}
