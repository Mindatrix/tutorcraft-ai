// Class match (plan phase B): one shared match for a whole class (up to 50 students).
// Pure logic shared by the server (which decides) and the browser (which only displays):
//  - the match clock: 6 stages × 5 minutes, +2 optional stages when the tutor presses "Kéo dài",
//    paused time does not count; every device computes the same stage from the server's numbers;
//  - the tutor's state machine: lobby → running ⇄ paused → ended;
//  - stars per answer, and which play mode a class size gets (solo / class / teams).

import { GameMode } from './types';
import type { RunPlan } from './runEvents';
import type { PendingTag, SurvivalPlayer, SurvivalResult, SurvivalTeam } from './survivalRules';

export type MatchStatus = 'lobby' | 'running' | 'paused' | 'ended';

export const STAGE_MS = 5 * 60_000;
export const CORE_STAGES = 6;
export const EXTRA_STAGES = 2;
export const MAX_MATCH_PLAYERS = 60;

/** What the server stores about time. All times are server epoch milliseconds. */
export interface MatchTime {
  status: MatchStatus;
  startedAt: number | null;
  /** Set while paused. */
  pausedAt: number | null;
  /** Total paused time before the current pause. */
  pausedMs: number;
  endedAt: number | null;
  stageMs: number;
  coreStages: number;
  extraStages: number;
  /** Tutor pressed "Kéo dài": the 2 optional stages are played. */
  extended: boolean;
}

export interface MatchClock {
  status: MatchStatus;
  /** Playing time so far (pauses excluded), capped at the match length. */
  elapsedMs: number;
  /** 0 in the lobby, then 1..stageCount. */
  stage: number;
  stageCount: number;
  stageElapsedMs: number;
  stageRemainingMs: number;
  totalMs: number;
  totalRemainingMs: number;
  /** Stage 7 or 8 (only after "Kéo dài"). */
  optional: boolean;
  /** Time is up: the server ends the match at the next request. */
  over: boolean;
}

export function newMatchTime(opts: Partial<Pick<MatchTime, 'stageMs' | 'coreStages' | 'extraStages'>> = {}): MatchTime {
  return {
    status: 'lobby',
    startedAt: null,
    pausedAt: null,
    pausedMs: 0,
    endedAt: null,
    stageMs: opts.stageMs ?? STAGE_MS,
    coreStages: opts.coreStages ?? CORE_STAGES,
    extraStages: opts.extraStages ?? EXTRA_STAGES,
    extended: false,
  };
}

export function matchClockAt(t: MatchTime, now: number): MatchClock {
  const stageCount = t.coreStages + (t.extended ? t.extraStages : 0);
  const totalMs = stageCount * t.stageMs;
  let elapsed = 0;
  if (t.startedAt != null) {
    const until = t.status === 'ended' ? t.endedAt ?? now : t.status === 'paused' ? t.pausedAt ?? now : now;
    elapsed = Math.max(0, until - t.startedAt - t.pausedMs);
  }
  const over = t.status !== 'lobby' && elapsed >= totalMs;
  elapsed = Math.min(elapsed, totalMs);
  const stage = t.status === 'lobby' ? 0 : Math.min(stageCount, Math.floor(elapsed / t.stageMs) + 1);
  const stageStart = Math.max(0, stage - 1) * t.stageMs;
  const stageElapsedMs = t.status === 'lobby' ? 0 : elapsed - stageStart;
  return {
    status: t.status,
    elapsedMs: elapsed,
    stage,
    stageCount,
    stageElapsedMs,
    stageRemainingMs: t.status === 'lobby' ? t.stageMs : Math.max(0, t.stageMs - stageElapsedMs),
    totalMs,
    totalRemainingMs: totalMs - elapsed,
    optional: stage > t.coreStages,
    over,
  };
}

export type MatchControl = 'start' | 'pause' | 'resume' | 'extend' | 'end';
export const MATCH_CONTROLS: MatchControl[] = ['start', 'pause', 'resume', 'extend', 'end'];

export type ControlResult = { ok: true; time: MatchTime } | { ok: false; status: number; reason: string };

const deny = (reason: string): ControlResult => ({ ok: false, status: 409, reason });

/** The tutor's buttons, in the only order they make sense. Anything else is refused. */
export function applyControl(t: MatchTime, action: MatchControl, now: number): ControlResult {
  switch (action) {
    case 'start':
      if (t.status !== 'lobby') return deny('Trận đã bắt đầu rồi.');
      return { ok: true, time: { ...t, status: 'running', startedAt: now } };
    case 'pause':
      if (t.status !== 'running') return deny('Chỉ tạm dừng được trận đang chạy.');
      return { ok: true, time: { ...t, status: 'paused', pausedAt: now } };
    case 'resume':
      if (t.status !== 'paused' || t.pausedAt == null) return deny('Trận không ở trạng thái tạm dừng.');
      return { ok: true, time: { ...t, status: 'running', pausedMs: t.pausedMs + Math.max(0, now - t.pausedAt), pausedAt: null } };
    case 'extend':
      if (t.status !== 'running' && t.status !== 'paused') return deny('Chỉ kéo dài được trận đang chơi.');
      if (t.extended) return deny('Trận đã được kéo dài.');
      return { ok: true, time: { ...t, extended: true } };
    case 'end': {
      if (t.status === 'ended') return deny('Trận đã kết thúc.');
      // A paused match ends where it was paused; a time-up match ends exactly at the limit.
      let endedAt = now;
      if (t.status === 'paused' && t.pausedAt != null) endedAt = t.pausedAt;
      else if (t.status === 'running' && t.startedAt != null) endedAt = Math.min(now, t.startedAt + t.pausedMs + matchClockAt(t, now).totalMs);
      return { ok: true, time: { ...t, status: 'ended', endedAt } };
    }
  }
}

/**
 * Server clock offset from one round trip with a single server stamp: add it to Date.now() to get
 * server time. Its error includes half the server's processing time (see clockOffsetNtp).
 */
export function clockOffset(sentAt: number, serverNow: number, receivedAt: number): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

/**
 * NTP with four stamps: t0 local send, t1 server receive, t2 server send, t3 local receive. The
 * server's processing time (t2 - t1) cancels out, so a slow request (a join under load took
 * seconds, 27/10 load test) no longer skews a device's clock; only network asymmetry remains.
 */
export function clockOffsetNtp(t0: number, t1: number, t2: number, t3: number): { offset: number; delay: number } {
  return { offset: (t1 - t0 + (t2 - t3)) / 2, delay: Math.max(0, t3 - t0 - Math.max(0, t2 - t1)) };
}

/**
 * Stars for one answer (1–3 when correct, 0 when wrong), by accuracy and speed:
 * fast (≤ 40% of the time limit) = 3, normal (≤ 75%) = 2, slow = 1. Graded answers (essays,
 * rewrites…) count as correct from 0.5 and lose a star below 0.85.
 */
export function answerStars(a: { correct: boolean; score?: number | null; timeMs: number; limitMs: number }): number {
  if (!a.correct) return 0;
  const limit = Math.max(1, a.limitMs);
  let stars = a.timeMs <= limit * 0.4 ? 3 : a.timeMs <= limit * 0.75 ? 2 : 1;
  if (typeof a.score === 'number' && a.score < 0.85) stars = Math.max(1, stars - 1);
  return stars;
}

/** How a class plays together. */
export type PlayMode =
  /** One student: plays the hero; the herd / the other team are computer-controlled. */
  | 'solo'
  /** Everyone in one shared world, scored as one class (in groups when large). */
  | 'class'
  /** Two teams against each other. */
  | 'teams';

export interface PlayPlan {
  mode: PlayMode;
  /** Students per group / squad (0 = no groups). */
  groupSize: number;
  /** Computer-controlled opponents (Survival with 1–5 students: slow bot pursuers). */
  bots: number;
  /** Share of students in the first team (Survival: escapers 60%). */
  teamRatio: number;
  /** Large herds are split over side-by-side meadows so no device draws 50 dinosaurs. */
  lanes: number;
}

/**
 * Play mode by class size (game_worlds.class_plan.sizes, 26/10):
 *  - Dino Journey: 1 student plays the hero baby dinosaur (solo); 2+ each are a baby in the herd,
 *    groups of 4–5 from 6 students, groups of 5 on 2 meadows from 21.
 *  - River Survival: 1–5 students all escape from 2–3 slow bot pursuers; from 6, teams 60/40
 *    (escapers / pursuers) in squads of 3–4, squads of 5 from 21.
 *  - Boat race worlds (Kayak): two teams. Other worlds: the whole class together.
 */
export function playPlanFor(game: GameMode | string | null | undefined, players: number): PlayPlan {
  const n = Math.max(0, Math.floor(players));
  const base: PlayPlan = { mode: 'class', groupSize: 0, bots: 0, teamRatio: 0.5, lanes: 1 };
  switch (game) {
    case GameMode.DINO_JOURNEY:
      if (n <= 1) return { ...base, mode: 'solo' };
      return { ...base, groupSize: n <= 5 ? 0 : n <= 20 ? 4 : 5, lanes: n > 20 ? 2 : 1 };
    case GameMode.RIVER_SURVIVAL:
      if (n <= 5) return { ...base, mode: 'solo', bots: n <= 2 ? 2 : 3 };
      return { ...base, mode: 'teams', teamRatio: 0.6, groupSize: n <= 20 ? 4 : 5 };
    case GameMode.KAYAK_RUSH_3D:
      return n <= 1 ? { ...base, mode: 'solo' } : { ...base, mode: 'teams' };
    default:
      return n <= 1 ? { ...base, mode: 'solo' } : base;
  }
}

// ---------------------------------------------------------------------------------------------
// What travels to the devices. The server signs every broadcast (ECDSA P-256); devices drop
// anything unsigned, from another match, or older than what they already have (seq).

export const matchTopic = (matchId: string) => `match:${matchId}`;
export const MATCH_EVENT = 'm';

export type MatchMessageType =
  /** Status / time changed (start, pause, resume, extend): full view in `d`. */
  | 'state'
  /** A new stage began (once per stage): { stage, eventId }. */
  | 'stage'
  /** Scoreboard, at most every ~2 s while students answer. */
  | 'scores'
  /** Someone joined or left: { player, left? }. */
  | 'roster'
  /** River Survival rule events (tags, catches, nets, rescues). */
  | 'survival'
  /** Time up or ended by the tutor: { result, time }. */
  | 'ended';

export interface MatchMessage<T = unknown> {
  /** Match id: a message for another match is ignored. */
  m: string;
  /** Message number, increasing per match. */
  s: number;
  t: MatchMessageType;
  /** Server time when sent (ms). */
  at: number;
  d: T;
}

/** On the wire: the exact JSON string that was signed, and its signature (base64url, r‖s). */
export interface SignedMatchMessage {
  b: string;
  g: string;
}

export interface MatchPlayerView {
  id: string;
  nickname: string;
  avatar: string;
  team: string | null;
  grp: number | null;
  species: string | null;
  color: string | null;
  /** Seen by the server in the last 45 s. */
  online: boolean;
  left: boolean;
}

export interface MatchScores {
  /** Stars per player id. */
  players: Record<string, number>;
  /** Correct answers per player id. */
  correct: Record<string, number>;
  /** Stars per team (empty when not playing in teams). */
  teams: Record<string, number>;
  /** Who just answered right (newest first, at most 5). */
  recent: string[];
}

export type SurvivalPublicPlayer = Pick<SurvivalPlayer, 'team' | 'free' | 'immuneUntil' | 'frozenUntil' | 'netLostUntil' | 'revealedUntil' | 'stolenNet'> & {
  bot?: boolean;
  /** Pursuer net charges (from the database; left out of rule broadcasts). */
  charge?: number;
};

export interface SurvivalPublic {
  players: Record<string, SurvivalPublicPlayer>;
  /** Open "Né lưới" windows (everyone can see who was tagged). */
  pendingTags: PendingTag[];
}

export interface ClassResult {
  kind: 'class';
  teams: Record<string, number>;
  winner: string | 'draw' | null;
  totalStars: number;
  top: { id: string; nickname: string; stars: number }[];
}

export type MatchResult = ClassResult | ({ kind: 'survival' } & SurvivalResult);

export interface MatchView {
  id: string;
  status: MatchStatus;
  game: string | null;
  scenarioId: string | null;
  level: number;
  time: MatchTime;
  /** Server clock when this view was built, i.e. just before the reply (NTP t2). */
  serverNow: number;
  /** Server clock when the request arrived (NTP t1): with serverNow, processing time cancels out. */
  serverRecv?: number;
  runPlan: RunPlan | null;
  play: PlayPlan | null;
  roster: MatchPlayerView[];
  scores: MatchScores;
  seq: number;
  survival: SurvivalPublic | null;
  result: MatchResult | null;
}

export interface MatchMe {
  id: string;
  team: string | null;
  grp: number | null;
  species: string | null;
  color: string | null;
  stars: number;
  correct: number;
  answered: number;
  /** River Survival: my net charges (pursuers). */
  charge?: number;
  /** River Survival: my open "Cướp lưới" window, if any (not shown to the other team). */
  snatchUntil?: number | null;
}

export const SURVIVAL_TEAMS: Record<SurvivalTeam, string> = { escapers: 'Đội Chạy Trốn', pursuers: 'Đội Săn Tìm' };

/** Dino herd species a student can pick (game_worlds.class_plan.species, dino_journey). */
export const DINO_SPECIES = ['trex', 'raptor', 'triceratops', 'stegosaurus', 'diplodocus', 'sauropod'] as const;
