import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchStatus, MatchTime, PlayPlan, RunPlan } from '../engine';

// Storage for class matches (tables matches / match_players, migration 20261027_class_matches.sql).
// MemoryMatchStore mirrors the database rules (one open match per battle, unique look per match,
// conditional updates, throttled scoreboard) so the service can be tested without a database.

export interface MatchRow {
  id: string;
  battleId: string;
  tutorId: string | null;
  classCode: string;
  game: string | null;
  scenarioId: string | null;
  level: number;
  status: MatchStatus;
  createdAt: number;
  startedAt: number | null;
  pausedAt: number | null;
  pausedMs: number;
  endedAt: number | null;
  endsAt: number | null;
  stageMs: number;
  coreStages: number;
  extraStages: number;
  extended: boolean;
  seedKey: string;
  runPlan: RunPlan | null;
  play: PlayPlan | null;
  state: Record<string, unknown>;
  stateVersion: number;
  result: unknown | null;
  seq: number;
  announcedStage: number;
}

export interface PlayerRow {
  id: string;
  matchId: string;
  sessionId: string | null;
  studentKey: string;
  nickname: string;
  avatar: string;
  team: string | null;
  grp: number | null;
  species: string | null;
  color: string | null;
  skill: number;
  stars: number;
  correct: number;
  answered: number;
  actionPoints: number;
  /** River Survival: net charges of a pursuer (atomic in match_answer / match_use_charge). */
  charge: number;
  joinedAt: number;
  lastSeenAt: number;
  lastCorrectAt: number | null;
  /** Latest graded answer: decides open "Né lưới" / "Cướp lưới" windows. */
  lastAnswerAt: number | null;
  lastAnswerCorrect: boolean | null;
  leftAt: number | null;
}

export type NewMatch = Omit<MatchRow, 'id' | 'createdAt' | 'seq' | 'stateVersion' | 'announcedStage' | 'result'>;
export type MatchPatch = Partial<Omit<MatchRow, 'id' | 'battleId' | 'createdAt' | 'seq'>>;
export interface MatchCond {
  status?: MatchStatus[];
  stateVersion?: number;
  /** Only if announced_stage is below this value. */
  announcedBelow?: number;
}
export type JoinInput = Pick<PlayerRow, 'matchId' | 'studentKey' | 'nickname' | 'avatar' | 'skill'> & {
  sessionId: string;
  team?: string | null;
  grp?: number | null;
  species?: string | null;
  color?: string | null;
};

export class MatchStoreError extends Error {
  constructor(public code: 'open_exists' | 'look_taken', message: string) {
    super(message);
  }
}

export interface AnswerTick {
  matchId: string;
  playerId: string;
  /** Time to send the scoreboard (at most once per throttle window per match). */
  broadcast: boolean;
  seq: number;
  /** The scoreboard, when broadcasting (comes back with the same round trip). */
  players?: ScoreRow[];
}

export type ScoreRow = Pick<PlayerRow, 'id' | 'team' | 'stars' | 'correct' | 'lastCorrectAt'>;

export function timeOf(m: MatchRow): MatchTime {
  return {
    status: m.status,
    startedAt: m.startedAt,
    pausedAt: m.pausedAt,
    pausedMs: m.pausedMs,
    endedAt: m.endedAt,
    stageMs: m.stageMs,
    coreStages: m.coreStages,
    extraStages: m.extraStages,
    extended: m.extended,
  };
}

export interface MatchStore {
  create(m: NewMatch): Promise<MatchRow>;
  get(id: string): Promise<MatchRow | null>;
  /** The match of a battle that is not over (at most one), else the latest one when `latest`. */
  forBattle(battleId: string, latest?: boolean): Promise<MatchRow | null>;
  /** Conditional update: null when the condition no longer holds (someone else changed it first). */
  update(id: string, patch: MatchPatch, cond?: MatchCond): Promise<MatchRow | null>;
  players(matchId: string): Promise<PlayerRow[]>;
  player(id: string): Promise<PlayerRow | null>;
  playerBySession(sessionId: string): Promise<PlayerRow | null>;
  /** Join or re-join (same student key): keeps team, group and score, takes the new session. */
  join(p: JoinInput, now: number): Promise<PlayerRow>;
  patchPlayers(rows: { id: string; patch: Partial<Pick<PlayerRow, 'team' | 'grp' | 'leftAt' | 'lastSeenAt' | 'actionPoints'>> }[]): Promise<void>;
  /** One answer: counters + throttled "broadcast now?". null when the session is not in a running match. */
  answer(sessionId: string, correct: boolean, stars: number, throttleMs: number, now: number): Promise<AnswerTick | null>;
  nextSeq(matchId: string): Promise<number>;
  /** Spend net charge if the pursuer has it (atomic); refund when the throw is then refused. */
  useCharge(playerId: string, cost: number): Promise<boolean>;
  refundCharge(playerId: string, cost: number): Promise<void>;
  /** battle_sessions.match_id (and the boat-race team) of a student's session. */
  linkSession(sessionId: string, matchId: string, team?: string | null): Promise<void>;
  /** Event ids used by this tutor's class in its last runs of a scenario (planRun avoids them). */
  recentEventIds(classCode: string, scenarioId: string | null, limit: number, tutorId?: string | null): Promise<string[]>;
  /** Recent accuracy of a student in a class (0..1), null when unknown. */
  skillOf(classCode: string, studentKey: string): Promise<number | null>;
}

// ------------------------------------------------------------------------------------------------

let memId = 0;
const uid = () => `00000000-0000-4000-8000-${(++memId).toString(16).padStart(12, '0')}`;

export class MemoryMatchStore implements MatchStore {
  matches = new Map<string, MatchRow & { lastBroadcastAt: number }>();
  rows = new Map<string, PlayerRow>();
  sessionTeams = new Map<string, { matchId: string; team: string | null }>();
  skills = new Map<string, number>();

  async create(m: NewMatch) {
    if ([...this.matches.values()].some((x) => x.battleId === m.battleId && x.status !== 'ended')) throw new MatchStoreError('open_exists', 'open match exists');
    const row = { ...structuredClone(m), id: uid(), createdAt: Date.now(), seq: 0, stateVersion: 0, announcedStage: 0, result: null, lastBroadcastAt: 0 };
    this.matches.set(row.id, row);
    return structuredClone(row);
  }
  async get(id: string) {
    const m = this.matches.get(id);
    return m ? structuredClone(m) : null;
  }
  async forBattle(battleId: string, latest = false) {
    const list = [...this.matches.values()].filter((m) => m.battleId === battleId);
    const open = list.find((m) => m.status !== 'ended');
    if (open) return structuredClone(open);
    return latest && list.length ? structuredClone(list[list.length - 1]) : null;
  }
  async update(id: string, patch: MatchPatch, cond: MatchCond = {}) {
    const m = this.matches.get(id);
    if (!m) return null;
    if (cond.status && !cond.status.includes(m.status)) return null;
    if (cond.stateVersion !== undefined && m.stateVersion !== cond.stateVersion) return null;
    if (cond.announcedBelow !== undefined && !(m.announcedStage < cond.announcedBelow)) return null;
    Object.assign(m, structuredClone(patch));
    return structuredClone(m);
  }
  async players(matchId: string) {
    return [...this.rows.values()].filter((p) => p.matchId === matchId).map((p) => structuredClone(p));
  }
  async player(id: string) {
    const p = this.rows.get(id);
    return p ? structuredClone(p) : null;
  }
  async playerBySession(sessionId: string) {
    const p = [...this.rows.values()].find((r) => r.sessionId === sessionId);
    return p ? structuredClone(p) : null;
  }
  async join(p: JoinInput, now: number) {
    const others = [...this.rows.values()].filter((r) => r.matchId === p.matchId && r.studentKey !== p.studentKey);
    if (p.species && p.color && others.some((r) => r.species === p.species && r.color === p.color)) throw new MatchStoreError('look_taken', 'look taken');
    for (const r of this.rows.values()) if (r.sessionId === p.sessionId && r.studentKey !== p.studentKey) r.sessionId = null;
    let row = [...this.rows.values()].find((r) => r.matchId === p.matchId && r.studentKey === p.studentKey);
    if (row) {
      Object.assign(row, { sessionId: p.sessionId, nickname: p.nickname, avatar: p.avatar, leftAt: null, lastSeenAt: now });
      if (p.species !== undefined) row.species = p.species ?? null;
      if (p.color !== undefined) row.color = p.color ?? null;
    } else {
      row = {
        id: uid(), matchId: p.matchId, sessionId: p.sessionId, studentKey: p.studentKey, nickname: p.nickname, avatar: p.avatar,
        team: p.team ?? null, grp: p.grp ?? null, species: p.species ?? null, color: p.color ?? null, skill: p.skill,
        stars: 0, correct: 0, answered: 0, actionPoints: 0, charge: 0, joinedAt: now, lastSeenAt: now, lastCorrectAt: null, lastAnswerAt: null, lastAnswerCorrect: null, leftAt: null,
      };
      this.rows.set(row.id, row);
    }
    return structuredClone(row);
  }
  async patchPlayers(rows: { id: string; patch: Partial<PlayerRow> }[]) {
    for (const r of rows) {
      const p = this.rows.get(r.id);
      if (p) Object.assign(p, r.patch);
    }
  }
  async answer(sessionId: string, correct: boolean, stars: number, throttleMs: number, now: number) {
    const p = [...this.rows.values()].find((r) => r.sessionId === sessionId);
    if (!p) return null;
    const m = this.matches.get(p.matchId);
    if (!m || m.status !== 'running' || (m.endsAt != null && m.endsAt <= now)) return null;
    p.answered += 1;
    if (correct) {
      p.correct += 1;
      p.lastCorrectAt = now;
    }
    p.stars += Math.max(0, Math.min(3, Math.floor(stars)));
    p.lastSeenAt = now;
    p.lastAnswerAt = now;
    p.lastAnswerCorrect = correct;
    if (p.team === 'pursuers' && correct) p.charge = Math.min(3, p.charge + 1);
    let broadcast = false;
    if (now - m.lastBroadcastAt >= Math.max(250, throttleMs)) {
      m.seq += 1;
      m.lastBroadcastAt = now;
      broadcast = true;
    }
    const players = broadcast ? [...this.rows.values()].filter((r) => r.matchId === m.id).map((r) => ({ id: r.id, team: r.team, stars: r.stars, correct: r.correct, lastCorrectAt: r.lastCorrectAt })) : undefined;
    return { matchId: m.id, playerId: p.id, broadcast, seq: broadcast ? m.seq : 0, ...(players ? { players } : {}) };
  }
  async nextSeq(matchId: string) {
    const m = this.matches.get(matchId);
    if (!m) return 0;
    m.seq += 1;
    return m.seq;
  }
  async useCharge(playerId: string, cost: number) {
    const p = this.rows.get(playerId);
    if (!p || p.charge < cost) return false;
    p.charge -= cost;
    return true;
  }
  async refundCharge(playerId: string, cost: number) {
    const p = this.rows.get(playerId);
    if (p) p.charge = Math.min(3, p.charge + cost);
  }
  async linkSession(sessionId: string, matchId: string, team?: string | null) {
    this.sessionTeams.set(sessionId, { matchId, team: team ?? null });
  }
  async recentEventIds(classCode: string, scenarioId: string | null, limit: number, tutorId?: string | null) {
    return [...this.matches.values()]
      .filter((m) => m.classCode === classCode && m.scenarioId === scenarioId && m.runPlan && (!tutorId || m.tutorId === tutorId))
      .slice(-limit)
      .flatMap((m) => m.runPlan!.stages.map((s) => s.eventId).filter((x): x is string => !!x));
  }
  async skillOf(classCode: string, studentKey: string) {
    return this.skills.get(`${classCode}:${studentKey}`) ?? null;
  }
}

// ------------------------------------------------------------------------------------------------

const ms = (v: unknown): number | null => (typeof v === 'string' ? Date.parse(v) : null);
const iso = (v: number | null | undefined) => (v == null ? null : new Date(v).toISOString());

type MRow = Record<string, unknown>;

const MATCH_COLUMNS: [keyof MatchRow, string, 'time' | 'plain'][] = [
  ['tutorId', 'tutor_id', 'plain'],
  ['classCode', 'class_code', 'plain'],
  ['game', 'game', 'plain'],
  ['scenarioId', 'scenario_id', 'plain'],
  ['level', 'level', 'plain'],
  ['status', 'status', 'plain'],
  ['startedAt', 'started_at', 'time'],
  ['pausedAt', 'paused_at', 'time'],
  ['pausedMs', 'paused_ms', 'plain'],
  ['endedAt', 'ended_at', 'time'],
  ['endsAt', 'ends_at', 'time'],
  ['stageMs', 'stage_ms', 'plain'],
  ['coreStages', 'core_stages', 'plain'],
  ['extraStages', 'extra_stages', 'plain'],
  ['extended', 'extended', 'plain'],
  ['seedKey', 'seed_key', 'plain'],
  ['runPlan', 'run_plan', 'plain'],
  ['play', 'play', 'plain'],
  ['state', 'state', 'plain'],
  ['stateVersion', 'state_version', 'plain'],
  ['result', 'result', 'plain'],
  ['announcedStage', 'announced_stage', 'plain'],
];

function matchToDb(patch: Partial<MatchRow>): MRow {
  const out: MRow = {};
  for (const [k, col, kind] of MATCH_COLUMNS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    out[col] = kind === 'time' ? iso(v as number | null) : v;
  }
  return out;
}

function matchFromDb(r: MRow): MatchRow {
  return {
    id: String(r.id),
    battleId: String(r.battle_id),
    tutorId: (r.tutor_id as string) ?? null,
    classCode: String(r.class_code),
    game: (r.game as string) ?? null,
    scenarioId: (r.scenario_id as string) ?? null,
    level: Number(r.level ?? 3),
    status: r.status as MatchStatus,
    createdAt: ms(r.created_at) ?? 0,
    startedAt: ms(r.started_at),
    pausedAt: ms(r.paused_at),
    pausedMs: Number(r.paused_ms ?? 0),
    endedAt: ms(r.ended_at),
    endsAt: ms(r.ends_at),
    stageMs: Number(r.stage_ms),
    coreStages: Number(r.core_stages),
    extraStages: Number(r.extra_stages),
    extended: !!r.extended,
    seedKey: String(r.seed_key),
    runPlan: (r.run_plan as RunPlan) ?? null,
    play: (r.play as PlayPlan) ?? null,
    state: (r.state as Record<string, unknown>) ?? {},
    stateVersion: Number(r.state_version ?? 0),
    result: r.result ?? null,
    seq: Number(r.seq ?? 0),
    announcedStage: Number(r.announced_stage ?? 0),
  };
}

function playerFromDb(r: MRow): PlayerRow {
  return {
    id: String(r.id),
    matchId: String(r.match_id),
    sessionId: (r.session_id as string) ?? null,
    studentKey: String(r.student_key),
    nickname: String(r.nickname),
    avatar: String(r.avatar ?? '🐣'),
    team: (r.team as string) ?? null,
    grp: r.grp == null ? null : Number(r.grp),
    species: (r.species as string) ?? null,
    color: (r.color as string) ?? null,
    skill: Number(r.skill ?? 0.6),
    stars: Number(r.stars ?? 0),
    correct: Number(r.correct ?? 0),
    answered: Number(r.answered ?? 0),
    actionPoints: Number(r.action_points ?? 0),
    charge: Number(r.charge ?? 0),
    joinedAt: ms(r.joined_at) ?? 0,
    lastSeenAt: ms(r.last_seen_at) ?? 0,
    lastCorrectAt: ms(r.last_correct_at),
    lastAnswerAt: ms(r.last_answer_at),
    lastAnswerCorrect: r.last_answer_correct == null ? null : !!r.last_answer_correct,
    leftAt: ms(r.left_at),
  };
}

export class SupabaseMatchStore implements MatchStore {
  constructor(private db: SupabaseClient) {}

  async create(m: NewMatch) {
    const { data, error } = await this.db.from('matches').insert([{ battle_id: m.battleId, ...matchToDb(m) }]).select('*').single();
    if (error?.code === '23505') throw new MatchStoreError('open_exists', error.message);
    if (error || !data) throw new Error(error?.message ?? 'insert failed');
    return matchFromDb(data);
  }
  async get(id: string) {
    const { data } = await this.db.from('matches').select('*').eq('id', id).maybeSingle();
    return data ? matchFromDb(data) : null;
  }
  async forBattle(battleId: string, latest = false) {
    const open = await this.db.from('matches').select('*').eq('battle_id', battleId).neq('status', 'ended').limit(1);
    if (open.data?.[0]) return matchFromDb(open.data[0]);
    if (!latest) return null;
    const last = await this.db.from('matches').select('*').eq('battle_id', battleId).order('created_at', { ascending: false }).limit(1);
    return last.data?.[0] ? matchFromDb(last.data[0]) : null;
  }
  async update(id: string, patch: MatchPatch, cond: MatchCond = {}) {
    let q = this.db.from('matches').update({ ...matchToDb(patch), updated_at: new Date().toISOString() }).eq('id', id);
    if (cond.status) q = q.in('status', cond.status);
    if (cond.stateVersion !== undefined) q = q.eq('state_version', cond.stateVersion);
    if (cond.announcedBelow !== undefined) q = q.lt('announced_stage', cond.announcedBelow);
    const { data, error } = await q.select('*');
    if (error) throw new Error(error.message);
    return data?.[0] ? matchFromDb(data[0]) : null;
  }
  async players(matchId: string) {
    const { data, error } = await this.db.from('match_players').select('*').eq('match_id', matchId).order('joined_at').limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map(playerFromDb);
  }
  async player(id: string) {
    const { data } = await this.db.from('match_players').select('*').eq('id', id).maybeSingle();
    return data ? playerFromDb(data) : null;
  }
  async playerBySession(sessionId: string) {
    const { data } = await this.db.from('match_players').select('*').eq('session_id', sessionId).maybeSingle();
    return data ? playerFromDb(data) : null;
  }
  async join(p: JoinInput, now: number) {
    // A new session of the same student takes over: free the session id first (unique index).
    await this.db.from('match_players').update({ session_id: null }).eq('session_id', p.sessionId).neq('student_key', p.studentKey);
    const existing = await this.db.from('match_players').select('*').eq('match_id', p.matchId).eq('student_key', p.studentKey).maybeSingle();
    const look = { ...(p.species !== undefined ? { species: p.species } : {}), ...(p.color !== undefined ? { color: p.color } : {}) };
    const res = existing.data
      ? await this.db
          .from('match_players')
          .update({ session_id: p.sessionId, nickname: p.nickname, avatar: p.avatar, left_at: null, last_seen_at: iso(now), ...look })
          .eq('id', existing.data.id)
          .select('*')
          .single()
      : await this.db
          .from('match_players')
          .insert([{ match_id: p.matchId, session_id: p.sessionId, student_key: p.studentKey, nickname: p.nickname, avatar: p.avatar, skill: p.skill, team: p.team ?? null, grp: p.grp ?? null, joined_at: iso(now), last_seen_at: iso(now), ...look }])
          .select('*')
          .single();
    if (res.error?.code === '23505') {
      if (/look/.test(res.error.message)) throw new MatchStoreError('look_taken', res.error.message);
      // Two joins of the same student at once: the other one won, use its row.
      const again = await this.db.from('match_players').select('*').eq('match_id', p.matchId).eq('student_key', p.studentKey).maybeSingle();
      if (again.data) return playerFromDb(again.data);
    }
    if (res.error || !res.data) throw new Error(res.error?.message ?? 'join failed');
    return playerFromDb(res.data);
  }
  async patchPlayers(rows: { id: string; patch: Partial<PlayerRow> }[]) {
    const cols: Record<string, string> = { team: 'team', grp: 'grp', leftAt: 'left_at', lastSeenAt: 'last_seen_at', actionPoints: 'action_points' };
    await Promise.all(
      rows.map(({ id, patch }) => {
        const row: MRow = {};
        for (const [k, v] of Object.entries(patch)) if (cols[k]) row[cols[k]] = k === 'leftAt' || k === 'lastSeenAt' ? iso(v as number | null) : v;
        return this.db.from('match_players').update(row).eq('id', id);
      }),
    );
  }
  async answer(sessionId: string, correct: boolean, stars: number, throttleMs: number) {
    const { data, error } = await this.db.rpc('match_answer', { p_session: sessionId, p_correct: correct, p_stars: stars, p_throttle_ms: throttleMs });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.match_id) return null;
    const players = Array.isArray(row.players)
      ? (row.players as MRow[]).map((r) => ({ id: String(r.id), team: (r.team as string) ?? null, stars: Number(r.stars ?? 0), correct: Number(r.correct ?? 0), lastCorrectAt: ms(r.last_correct_at) }))
      : undefined;
    return { matchId: String(row.match_id), playerId: String(row.player_id), broadcast: !!row.broadcast, seq: Number(row.seq), ...(players ? { players } : {}) };
  }
  async nextSeq(matchId: string) {
    const { data, error } = await this.db.rpc('match_next_seq', { p_match: matchId });
    if (error) throw new Error(error.message);
    return Number(data ?? 0);
  }
  async useCharge(playerId: string, cost: number) {
    const { data, error } = await this.db.rpc('match_use_charge', { p_player: playerId, p_cost: cost });
    if (error) throw new Error(error.message);
    return data === true;
  }
  async refundCharge(playerId: string, cost: number) {
    await this.db.rpc('match_refund_charge', { p_player: playerId, p_cost: cost });
  }
  async linkSession(sessionId: string, matchId: string, team?: string | null) {
    await this.db.from('battle_sessions').update({ match_id: matchId, ...(team ? { team } : {}) }).eq('id', sessionId);
  }
  async recentEventIds(classCode: string, scenarioId: string | null, limit: number, tutorId?: string | null) {
    if (!scenarioId) return [];
    let q = this.db.from('matches').select('run_plan').eq('class_code', classCode).eq('scenario_id', scenarioId).not('run_plan', 'is', null);
    if (tutorId) q = q.eq('tutor_id', tutorId);
    const { data } = await q.order('created_at', { ascending: false }).limit(limit);
    return (data ?? []).flatMap((r) => ((r.run_plan as RunPlan | null)?.stages ?? []).map((s) => s.eventId).filter((x): x is string => !!x));
  }
  async skillOf(classCode: string, studentKey: string) {
    const { data } = await this.db.from('battle_results').select('accuracy').eq('class_code', classCode).eq('student_key', studentKey).order('created_at', { ascending: false }).limit(10);
    const list = (data ?? []).map((r) => Number(r.accuracy)).filter((x) => Number.isFinite(x));
    if (!list.length) return null;
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    return Math.max(0, Math.min(1, mean > 1 ? mean / 100 : mean));
  }
}
