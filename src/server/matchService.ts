import { randomUUID } from 'node:crypto';
import {
  AVATAR_COLORS,
  GameMode,
  MATCH_AUDIO_CONTROLS,
  MATCH_CONTROLS,
  avatarColor,
  avatarTemplate,
  suggestLook,
  MAX_MATCH_PLAYERS,
  SURVIVAL,
  addSurvivalPlayer,
  applyControl,
  balanceTeams,
  isGameMode,
  matchClockAt,
  matchTopic,
  newSurvivalState,
  normalizeLevel,
  planRun,
  playPlanFor,
  resolveGameMode,
  splitGroups,
  survivalAct,
  survivalResult,
  survivalSettle,
  hashString,
  type ClassResult,
  type MatchControl,
  type MatchMe,
  type MatchMessageType,
  type MatchPlayerView,
  type MatchResult,
  type MatchScores,
  type MatchTime,
  type MatchView,
  type PlayPlan,
  type LastAnswers,
  type SurvivalAction,
  type SurvivalEvent,
  type SurvivalPublic,
  type SurvivalState,
  type SurvivalTeam,
} from '../engine';
import type { LoadedBattle } from './battles';
import { matchPublicKey, type Broadcaster, type MatchPublicKey } from './matchBroadcast';
import { MatchStoreError, timeOf, type MatchRow, type MatchStore, type PlayerRow, type ScoreRow } from './matchStore';

// Class matches (plan phase B2): the server owns the clock, the teams, the scores and the rules;
// devices only draw what they are told. No timers run on the server (Vercel functions sleep):
// every request first "advances" the match — ends it when time is up, announces a new stage
// once, settles River Survival windows — so whoever asks next sees the right state.

export class MatchError extends Error {
  /** Extra fields for the JSON reply (e.g. a suggested free look). */
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export interface StudentSession {
  id: string;
  battleId: string;
  studentKey: string;
  nickname: string;
  avatar: string;
}

export interface MatchDeps {
  store: MatchStore;
  broadcaster: Broadcaster;
  loadBattle(id: string): Promise<LoadedBattle | null>;
  /** Opens a student's sealed session token; throws (401/404) when it is not valid. */
  session(token: unknown): Promise<StudentSession>;
  /** Scenario tags and fish species (fishing "fish of the day"), null when unknown. */
  scenario?(id: string): Promise<{ tags: string[]; species: string[] } | null>;
  now?: () => number;
  /** Scoreboard broadcasts at most this often per match. */
  throttleMs?: number;
}

export interface ChannelInfo {
  topic: string;
  event: string;
  publicKey: MatchPublicKey;
}

export interface StudentMatch {
  view: MatchView;
  me: MatchMe;
  channel: ChannelInfo;
}

export interface TutorPlayer extends MatchPlayerView {
  stars: number;
  correct: number;
  answered: number;
  skill: number;
  lastSeenAt: number;
  /** River Survival: actions the server refused (cheating signal). */
  refused: number;
}

const ONLINE_MS = 45_000;
const STATE_RETRIES = 8;
const TEAM_NAMES: Partial<Record<string, [string, string]>> = {
  [GameMode.RIVER_SURVIVAL]: ['escapers', 'pursuers'],
};

const isSurvivalState = (s: unknown): s is SurvivalState => !!s && typeof s === 'object' && 'players' in (s as object) && 'pendingTags' in (s as object);

/** Latest answer per player, from the database: decides open dodge / snatch windows. */
function answersOf(players: PlayerRow[]): LastAnswers {
  const out: LastAnswers = {};
  for (const p of players) if (p.lastAnswerAt != null && p.lastAnswerCorrect != null) out[p.id] = { at: p.lastAnswerAt, correct: p.lastAnswerCorrect };
  return out;
}

/** Survival events everyone may see ("Cướp lưới" attempts stay with the one trying). */
const publicEvents = (events: SurvivalEvent[]) => events.filter((e) => e.t !== 'snatch_try');

function endsAtOf(t: MatchTime): number | null {
  if (t.startedAt == null || t.status !== 'running') return null;
  return t.startedAt + t.pausedMs + (t.coreStages + (t.extended ? t.extraStages : 0)) * t.stageMs;
}

const timePatch = (t: MatchTime) => ({
  status: t.status,
  startedAt: t.startedAt,
  pausedAt: t.pausedAt,
  pausedMs: t.pausedMs,
  endedAt: t.endedAt,
  extended: t.extended,
  endsAt: endsAtOf(t),
});

export function createMatchService(deps: MatchDeps) {
  const { store } = deps;
  const now = deps.now ?? Date.now;
  const throttleMs = deps.throttleMs ?? 2000;
  const channel = (id: string): ChannelInfo => ({ topic: matchTopic(id), event: 'm', publicKey: matchPublicKey() });
  /** A match's game never changes: remembered so answers in other games skip a read. */
  const gameOf = new Map<string, string | null>();

  async function send(m: MatchRow, t: MatchMessageType, d: unknown, seq?: number) {
    const s = seq ?? (await store.nextSeq(m.id));
    await deps.broadcaster.send({ m: m.id, s, t, at: now(), d });
    return s;
  }

  // ---------------------------------------------------------------------------------------- views

  const rosterEntry = (p: PlayerRow, at: number): MatchPlayerView => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    team: p.team,
    grp: p.grp,
    species: p.species,
    color: p.color,
    online: p.leftAt == null && at - p.lastSeenAt < ONLINE_MS,
    left: p.leftAt != null,
  });

  function scoresOf(players: ScoreRow[], at: number): MatchScores {
    const out: MatchScores = { players: {}, correct: {}, teams: {}, recent: [] };
    for (const p of players) {
      out.players[p.id] = p.stars;
      out.correct[p.id] = p.correct;
      if (p.team) out.teams[p.team] = (out.teams[p.team] ?? 0) + p.stars;
    }
    out.recent = players
      .filter((p) => p.lastCorrectAt != null && at - p.lastCorrectAt < 5000)
      .sort((a, b) => (b.lastCorrectAt ?? 0) - (a.lastCorrectAt ?? 0))
      .slice(0, 5)
      .map((p) => p.id);
    return out;
  }

  /** Net charges come from the database (players); rule broadcasts leave them out. */
  function survivalPublic(state: unknown, players?: PlayerRow[]): SurvivalPublic | null {
    if (!isSurvivalState(state)) return null;
    const charge = new Map((players ?? []).map((p) => [p.id, p.charge]));
    const out: SurvivalPublic['players'] = {};
    for (const [id, p] of Object.entries(state.players)) {
      out[id] = { team: p.team, free: p.free, immuneUntil: p.immuneUntil, frozenUntil: p.frozenUntil, netLostUntil: p.netLostUntil, revealedUntil: p.revealedUntil, stolenNet: p.stolenNet, ...(p.bot ? { bot: true } : {}), ...(charge.has(id) ? { charge: charge.get(id) } : {}) };
    }
    return { players: out, pendingTags: state.pendingTags };
  }

  function viewOf(m: MatchRow, players: PlayerRow[], at: number, recv?: number): MatchView {
    return {
      id: m.id,
      status: m.status,
      game: m.game,
      scenarioId: m.scenarioId,
      level: m.level,
      time: timeOf(m),
      // Stamped when the reply is built (after the database work), not when the request came in:
      // devices take their clock offset from it (27/10 load test: a slow join skewed one by 4 s).
      serverNow: now(),
      ...(recv !== undefined ? { serverRecv: recv } : {}),
      runPlan: m.runPlan,
      play: m.play,
      roster: players.map((p) => rosterEntry(p, at)),
      scores: scoresOf(players, at),
      seq: m.seq,
      survival: survivalPublic(m.state, players),
      result: (m.result as MatchResult | null) ?? null,
      muted: !!m.muted,
    };
  }

  function meOf(p: PlayerRow, m: MatchRow, at: number): MatchMe {
    const snatch = isSurvivalState(m.state) ? m.state.pendingSnatches.find((s) => s.escaper === p.id && s.until > at) : undefined;
    return { id: p.id, team: p.team, grp: p.grp, species: p.species, color: p.color, stars: p.stars, correct: p.correct, answered: p.answered, ...(p.team === 'pursuers' ? { charge: p.charge } : {}), ...(snatch ? { snatchUntil: snatch.until } : {}) };
  }

  // --------------------------------------------------------------------------- teams and results

  function assignAtStart(m: MatchRow, players: PlayerRow[], at: number) {
    const play = playPlanFor(m.game, players.length);
    const patches = new Map<string, { team: string | null; grp: number | null }>(players.map((p) => [p.id, { team: null, grp: null }]));
    const groups = (list: PlayerRow[]) => {
      if (play.groupSize > 0) splitGroups(list, play.groupSize).forEach((g, i) => g.forEach((p) => (patches.get(p.id)!.grp = i + 1)));
    };
    if (play.mode === 'teams') {
      const names = TEAM_NAMES[m.game ?? ''] ?? ['A', 'B'];
      balanceTeams(players, play.teamRatio).forEach((list, i) => {
        list.forEach((p) => (patches.get(p.id)!.team = names[i]));
        groups(list);
      });
    } else {
      if (m.game === GameMode.RIVER_SURVIVAL) players.forEach((p) => (patches.get(p.id)!.team = 'escapers'));
      groups(players);
    }
    const survival =
      m.game === GameMode.RIVER_SURVIVAL
        ? newSurvivalState(players.map((p) => ({ id: p.id, team: patches.get(p.id)!.team as SurvivalTeam })), { bots: play.bots, seed: hashString(m.seedKey), now: at })
        : null;
    return { play, patches: [...patches.entries()].map(([id, patch]) => ({ id, patch })), survival };
  }

  /** A student who joins after the start: the team below its share, then the smallest group. */
  function assignLate(m: MatchRow, players: PlayerRow[]): { team: string | null; grp: number | null } {
    const play = m.play ?? playPlanFor(m.game, players.length + 1);
    let team: string | null = null;
    let pool = players;
    if (play.mode === 'teams') {
      const names = TEAM_NAMES[m.game ?? ''] ?? ['A', 'B'];
      const first = players.filter((p) => p.team === names[0]).length;
      team = first < Math.round((players.length + 1) * play.teamRatio) ? names[0] : names[1];
      pool = players.filter((p) => p.team === team);
    } else if (m.game === GameMode.RIVER_SURVIVAL) team = 'escapers';
    if (play.groupSize <= 0) return { team, grp: null };
    const counts = new Map<number, number>();
    for (const p of pool) if (p.grp != null) counts.set(p.grp, (counts.get(p.grp) ?? 0) + 1);
    const open = [...counts.entries()].filter(([, n]) => n < play.groupSize + 1).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    return { team, grp: open[0]?.[0] ?? Math.max(0, ...counts.keys()) + 1 };
  }

  function classResult(players: PlayerRow[]): ClassResult {
    const teams: Record<string, number> = {};
    const size: Record<string, number> = {};
    for (const p of players) {
      if (!p.team) continue;
      teams[p.team] = (teams[p.team] ?? 0) + p.stars;
      size[p.team] = (size[p.team] ?? 0) + 1;
    }
    const names = Object.keys(teams);
    let winner: ClassResult['winner'] = null;
    if (names.length === 2) {
      // Mean stars per member, so a team that is one student bigger has no advantage.
      const [a, b] = names.map((n) => teams[n] / size[n]);
      winner = Math.abs(a - b) < 1e-9 ? 'draw' : a > b ? names[0] : names[1];
    }
    return {
      kind: 'class',
      teams,
      winner,
      totalStars: players.reduce((s, p) => s + p.stars, 0),
      top: [...players].sort((a, b) => b.stars - a.stars || b.correct - a.correct).slice(0, 5).map((p) => ({ id: p.id, nickname: p.nickname, stars: p.stars })),
    };
  }

  // ------------------------------------------------------------------- state changes (CAS loops)

  type StepFn = (s: SurvivalState, ctx: { now: number; stage: number; level: number }) => { state: SurvivalState; events: SurvivalEvent[]; ok?: boolean; reason?: string };

  /** Apply a Survival rule step with optimistic concurrency; broadcasts the public events. */
  async function survivalStep(m: MatchRow, at: number, fn: StepFn): Promise<{ m: MatchRow; ok: boolean; reason?: string; events: SurvivalEvent[] }> {
    let cur = m;
    for (let i = 0; i < STATE_RETRIES; i++) {
      if (!isSurvivalState(cur.state)) return { m: cur, ok: false, reason: 'Trận này không có luật Cướp Lưới.', events: [] };
      const r = fn(cur.state, { now: at, stage: Math.max(1, matchClockAt(timeOf(cur), at).stage), level: cur.level });
      if (r.state === cur.state) return { m: cur, ok: r.ok !== false, reason: r.reason, events: r.events };
      const up = await store.update(cur.id, { state: r.state as unknown as Record<string, unknown>, stateVersion: cur.stateVersion + 1 }, { stateVersion: cur.stateVersion });
      if (up) {
        const shown = publicEvents(r.events);
        if (shown.length) await send(up, 'survival', { events: shown, survival: survivalPublic(up.state) });
        return { m: up, ok: r.ok !== false, reason: r.reason, events: r.events };
      }
      const fresh = await store.get(cur.id);
      if (!fresh) throw new MatchError(404, 'Không tìm thấy trận.');
      cur = fresh;
      await new Promise((res) => setTimeout(res, 15 + Math.random() * 40 * (i + 1)));
    }
    throw new MatchError(409, 'Trận đang bận, thử lại.');
  }

  async function endMatch(m: MatchRow, at: number): Promise<MatchRow> {
    const ctl = applyControl(timeOf(m), 'end', at);
    if (!ctl.ok) return m;
    const players = await store.players(m.id);
    let result: MatchResult;
    let state = m.state;
    if (isSurvivalState(m.state)) {
      const endAt = ctl.time.endedAt ?? at;
      const settled = survivalSettle(m.state, { now: endAt, stage: matchClockAt(ctl.time, endAt).stage, level: m.level }, answersOf(players)).state;
      // Stars are counted per answer in match_players; the rule state keeps the actions.
      const withStars = structuredClone(settled);
      for (const p of players) if (withStars.players[p.id]) withStars.players[p.id].stars = p.stars;
      result = { kind: 'survival', ...survivalResult(withStars) };
      state = withStars as unknown as Record<string, unknown>;
    } else result = classResult(players);
    const up = await store.update(m.id, { ...timePatch(ctl.time), result, state }, { status: ['lobby', 'running', 'paused'] });
    if (!up) return (await store.get(m.id)) ?? m;
    await send(up, 'ended', { result, time: timeOf(up) });
    return up;
  }

  /** Lazy timers: end when time is up, announce a new stage once, settle Survival windows. */
  async function advance(m: MatchRow, at: number): Promise<MatchRow> {
    if (m.status === 'ended' || m.status === 'lobby') return m;
    const clock = matchClockAt(timeOf(m), at);
    if (clock.over) return endMatch(m, at);
    let cur = m;
    if (m.status === 'running' && clock.stage > m.announcedStage) {
      const up = await store.update(m.id, { announcedStage: clock.stage }, { announcedBelow: clock.stage, status: ['running'] });
      if (up) {
        cur = up;
        await send(up, 'stage', { stage: clock.stage, eventId: up.runPlan?.stages.find((s) => s.n === clock.stage)?.eventId ?? null });
      }
    }
    if (cur.status === 'running' && isSurvivalState(cur.state)) {
      // Open windows are decided from the durable last answers (read only when one is open).
      const answers = cur.state.pendingTags.length || cur.state.pendingSnatches.length ? answersOf(await store.players(cur.id)) : {};
      cur = (await survivalStep(cur, at, (s, ctx) => survivalSettle(s, ctx, answers))).m;
    }
    return cur;
  }

  // --------------------------------------------------------------------------------- tutor side

  async function owned(tutorId: string, matchId: string): Promise<MatchRow> {
    const m = typeof matchId === 'string' && /^[0-9a-f-]{36}$/i.test(matchId) ? await store.get(matchId) : null;
    if (!m || !m.tutorId || m.tutorId !== tutorId) throw new MatchError(404, 'Không tìm thấy trận của bạn.');
    return m;
  }

  async function tutorView(m: MatchRow, at: number) {
    const players = await store.players(m.id);
    const refused = isSurvivalState(m.state) ? m.state.rejected : {};
    const list: TutorPlayer[] = players.map((p) => ({ ...rosterEntry(p, at), stars: p.stars, correct: p.correct, answered: p.answered, skill: p.skill, lastSeenAt: p.lastSeenAt, refused: refused[p.id] ?? 0 }));
    return { view: viewOf(m, players, at), players: list, clock: matchClockAt(timeOf(m), at) };
  }

  async function startMatch(m: MatchRow, at: number): Promise<MatchRow> {
    const players = (await store.players(m.id)).filter((p) => p.leftAt == null);
    if (!players.length) throw new MatchError(409, 'Chưa có học sinh nào vào phòng.');
    const ctl = applyControl(timeOf(m), 'start', at);
    if (!ctl.ok) throw new MatchError(ctl.status, ctl.reason);
    const { play, patches, survival } = assignAtStart(m, players, at);
    const scenario = m.scenarioId && deps.scenario ? await deps.scenario(m.scenarioId).catch(() => null) : null;
    const recent = await store.recentEventIds(m.classCode, m.scenarioId, 3, m.tutorId).catch(() => []);
    const runPlan =
      m.game && isGameMode(m.game)
        ? planRun({ game: m.game, scenarioId: m.scenarioId ?? m.game, tags: scenario?.tags ?? [], seedKey: m.seedKey, recent, species: scenario?.species })
        : null;
    const up = await store.update(
      m.id,
      { ...timePatch(ctl.time), play, runPlan, state: (survival ?? {}) as unknown as Record<string, unknown>, stateVersion: m.stateVersion + 1, announcedStage: 1 },
      { status: ['lobby'] },
    );
    if (!up) throw new MatchError(409, 'Trận đã bắt đầu rồi.');
    await store.patchPlayers(patches);
    if (m.game === GameMode.KAYAK_RUSH_3D) {
      // Boat race results group by battle_sessions.team: keep it the same as the match team.
      const byId = new Map(patches.map((p) => [p.id, p.patch.team]));
      await Promise.all(players.filter((p) => p.sessionId).map((p) => store.linkSession(p.sessionId!, m.id, byId.get(p.id) ?? null)));
    }
    await send(up, 'state', { time: timeOf(up), view: viewOf(up, await store.players(m.id), at) });
    return up;
  }

  return {
    /** Tutor opens a live class match for one of their battles (idempotent while one is open). */
    async create(tutorId: string, battleId: string, opts: { stageMs?: number } = {}) {
      const battle = await deps.loadBattle(battleId);
      if (!battle || !battle.tutorId || battle.tutorId !== tutorId) throw new MatchError(404, 'Không tìm thấy đấu trường của bạn.');
      const at = now();
      const open = await store.forBattle(battle.id);
      if (open) return tutorView(await advance(open, at), at);
      const game = resolveGameMode(battle.config);
      const stageMs = Number.isFinite(opts.stageMs) ? Math.max(10_000, Math.min(1_800_000, Math.round(opts.stageMs!))) : undefined;
      try {
        const m = await store.create({
          battleId: battle.id,
          tutorId,
          // The class as battle_results knows it (skill lookups); the battle code is for joining.
          classCode: battle.config.classCode || battle.code || 'default',
          game: game ?? null,
          scenarioId: battle.config.scenarioKey ?? null,
          level: normalizeLevel(battle.config.level),
          status: 'lobby',
          startedAt: null,
          pausedAt: null,
          pausedMs: 0,
          endedAt: null,
          endsAt: null,
          stageMs: stageMs ?? 300_000,
          coreStages: 6,
          extraStages: 2,
          extended: false,
          seedKey: `${battle.id}#${randomUUID().slice(0, 8)}`,
          runPlan: null,
          play: null,
          state: {},
          muted: false,
        });
        return tutorView(m, at);
      } catch (e) {
        if (e instanceof MatchStoreError && e.code === 'open_exists') {
          const again = await store.forBattle(battle.id);
          if (again) return tutorView(again, at);
        }
        throw e;
      }
    },

    async control(tutorId: string, matchId: string, action: unknown) {
      const at = now();
      if (MATCH_AUDIO_CONTROLS.includes(action as 'mute')) {
        // C3.2: one switch for the whole class, any time before the end.
        const m0 = await owned(tutorId, matchId);
        const up = await store.update(m0.id, { muted: action === 'mute' }, { status: ['lobby', 'running', 'paused'] });
        if (!up) throw new MatchError(409, 'Trận đã kết thúc.');
        await send(up, 'state', { time: timeOf(up), muted: up.muted });
        return tutorView(up, at);
      }
      if (!MATCH_CONTROLS.includes(action as MatchControl)) throw new MatchError(400, 'Thao tác không hợp lệ.');
      let m = await advance(await owned(tutorId, matchId), at);
      const a = action as MatchControl;
      if (a === 'start') m = await startMatch(m, at);
      else if (a === 'end') {
        if (m.status === 'ended') throw new MatchError(409, 'Trận đã kết thúc.');
        m = await endMatch(m, at);
      } else {
        const ctl = applyControl(timeOf(m), a, at);
        if (!ctl.ok) throw new MatchError(ctl.status, ctl.reason);
        const up = await store.update(m.id, timePatch(ctl.time), { status: [m.status] });
        if (!up) throw new MatchError(409, 'Trận vừa thay đổi, hãy thử lại.');
        m = up;
        await send(m, 'state', { time: timeOf(m), muted: m.muted });
      }
      return tutorView(m, at);
    },

    async tutorMatch(tutorId: string, ref: { matchId?: string; battleId?: string }) {
      const at = now();
      let m: MatchRow | null = null;
      if (ref.matchId) m = await owned(tutorId, ref.matchId);
      else if (ref.battleId) {
        m = await store.forBattle(ref.battleId, true);
        if (m && m.tutorId !== tutorId) m = null;
      }
      if (!m) return null;
      return tutorView(await advance(m, at), at);
    },

    // ------------------------------------------------------------------------------ student side

    /**
     * C2.1: a look is a template (journey character, or baby dinosaur in Dino Journey) + one of the
     * 12 colours, unique in the match; a taken one is refused with a free suggestion. `name`
     * replaces the display name.
     */
    async join(token: unknown, opts: { species?: unknown; color?: unknown; name?: unknown } = {}): Promise<StudentMatch> {
      const recv = now(); // NTP t1: before any database work
      const sess = await deps.session(token);
      const at = now();
      // The open match, else the latest one (so a latecomer hears "it is over", not "not open").
      const open = await store.forBattle(sess.battleId, true);
      if (!open) throw new MatchError(404, 'Lớp chưa mở trận chung.');
      const m = await advance(open, at);
      if (m.status === 'ended') throw new MatchError(409, 'Trận chung đã kết thúc.');
      let species: string | null | undefined;
      let color: string | null | undefined;
      if (opts.species !== undefined || opts.color !== undefined) {
        const t = avatarTemplate(m.game, opts.species);
        const c = avatarColor(opts.color);
        if (!t || !c) throw new MatchError(400, 'Mẫu nhân vật hoặc màu không hợp lệ.');
        species = t.id;
        color = c.hex;
      }
      const name = typeof opts.name === 'string' && opts.name.trim() ? opts.name.trim().replace(/\s+/g, ' ').slice(0, 24) : null;
      const players = await store.players(m.id);
      const existing = players.find((p) => p.studentKey === sess.studentKey);
      const active = players.filter((p) => p.leftAt == null && p.studentKey !== sess.studentKey);
      const lookTaken = () => {
        const others = players.filter((p) => p.studentKey !== sess.studentKey && p.species && p.color).map((p) => ({ template: p.species!, color: p.color! }));
        const s2 = suggestLook(m.game, { template: species ?? undefined, color: color ?? undefined }, others);
        const t = avatarTemplate(m.game, s2?.template);
        const c = AVATAR_COLORS.find((x) => x.hex === s2?.color);
        return new MatchError(409, `Đã có bạn chọn kiểu này${t && c ? `. Gợi ý: ${t.nameVi}, màu ${c.nameVi}` : ''}.`, { suggest: s2 });
      };
      if (species && color && players.some((p) => p.studentKey !== sess.studentKey && p.species === species && p.color === color)) throw lookTaken();
      if (!existing && active.length >= MAX_MATCH_PLAYERS) throw new MatchError(409, `Trận đã đủ ${MAX_MATCH_PLAYERS} em.`);
      const skill = existing?.skill ?? (await store.skillOf(m.classCode, sess.studentKey).catch(() => null)) ?? 0.6;
      const late = !existing && m.status !== 'lobby' ? assignLate(m, active) : { team: existing?.team ?? null, grp: existing?.grp ?? null };
      let player: PlayerRow;
      try {
        player = await store.join({ matchId: m.id, sessionId: sess.id, studentKey: sess.studentKey, nickname: name ?? existing?.nickname ?? sess.nickname, avatar: sess.avatar, skill, ...late, species, color }, at);
      } catch (e) {
        if (e instanceof MatchStoreError && e.code === 'look_taken') throw lookTaken(); // lost a race with another student
        throw e;
      }
      await store.linkSession(sess.id, m.id, m.game === GameMode.KAYAK_RUSH_3D ? player.team : null);
      let cur = m;
      if (isSurvivalState(cur.state) && player.team && !cur.state.players[player.id]) {
        cur = (await survivalStep(cur, at, (s) => ({ state: addSurvivalPlayer(s, player.id, player.team as SurvivalTeam), events: [] }))).m;
      }
      // Re-joining with a new session (out of questions, page reload) changes nothing others see.
      if (!existing || existing.leftAt != null || species !== undefined || name) await send(cur, 'roster', { player: rosterEntry(player, at) });
      return { view: viewOf(cur, await store.players(m.id), at, recv), me: meOf(player, cur, at), channel: channel(m.id) };
    },

    /** Reconnect / poll: the authoritative state for this student. */
    async state(token: unknown): Promise<StudentMatch> {
      const recv = now(); // NTP t1: before any database work
      const sess = await deps.session(token);
      const p = await store.playerBySession(sess.id);
      if (!p) throw new MatchError(404, 'Em chưa vào trận chung.');
      const at = now();
      const m0 = await store.get(p.matchId);
      if (!m0) throw new MatchError(404, 'Không tìm thấy trận.');
      const m = await advance(m0, at);
      if (at - p.lastSeenAt > 10_000) await store.patchPlayers([{ id: p.id, patch: { lastSeenAt: at } }]);
      const players = await store.players(m.id);
      return { view: viewOf(m, players, at, recv), me: meOf(players.find((x) => x.id === p.id) ?? p, m, at), channel: channel(m.id) };
    },

    async leave(token: unknown) {
      const sess = await deps.session(token);
      const p = await store.playerBySession(sess.id);
      if (!p) return { ok: true };
      const at = now();
      await store.patchPlayers([{ id: p.id, patch: { leftAt: at } }]);
      const m = await store.get(p.matchId);
      if (m && m.status !== 'ended') await send(m, 'roster', { player: rosterEntry({ ...p, leftAt: at }, at), left: true });
      return { ok: true };
    },

    /** River Survival actions (tag, snatch, freeze, rescue, retake), checked against the rules. */
    async action(token: unknown, raw: unknown) {
      const sess = await deps.session(token);
      const p = await store.playerBySession(sess.id);
      if (!p) throw new MatchError(404, 'Em chưa vào trận chung.');
      const at = now();
      const m0 = await store.get(p.matchId);
      if (!m0) throw new MatchError(404, 'Không tìm thấy trận.');
      const m = await advance(m0, at);
      if (m.status !== 'running') throw new MatchError(409, m.status === 'paused' ? 'Trận đang tạm dừng.' : 'Trận không chạy.');
      const action = parseAction(raw);
      if (!action) throw new MatchError(400, 'Thao tác không hợp lệ.');
      // A throw spends net charge first (atomic in the database); refunded if the rules refuse it.
      const cost = action.type === 'tag' ? SURVIVAL.throwCost : 0;
      const reserved = cost > 0 && (await store.useCharge(p.id, cost));
      let r: Awaited<ReturnType<typeof survivalStep>>;
      try {
        r = await survivalStep(m, at, (s, ctx) => {
          let input = s;
          if (cost > 0 && s.players[p.id]) {
            input = structuredClone(s);
            input.players[p.id].charge = reserved ? cost : 0;
          }
          const res = survivalAct(input, p.id, action, ctx);
          return res.ok ? res : { ...res, events: [] };
        });
      } catch (e) {
        if (reserved) await store.refundCharge(p.id, cost);
        throw e;
      }
      if (!r.ok) {
        if (reserved) await store.refundCharge(p.id, cost);
        throw new MatchError(409, r.reason ?? 'Không thực hiện được.');
      }
      const fresh = (await store.player(p.id)) ?? p;
      return { events: r.events.filter((e) => e.t !== 'snatch_try' || e.escaper === p.id), survival: survivalPublic(r.m.state, [fresh]), me: meOf(fresh, r.m, at) };
    },

    /**
     * After a graded answer of a session that is in a match: counters, the scoreboard (throttled),
     * the clock (stage / time up) and the Survival rules (net charge, open dodge / snatch windows).
     */
    async onAnswer(sessionId: string, ans: { correct: boolean; stars: number }) {
      const at = now();
      const tick = await store.answer(sessionId, ans.correct, ans.stars, throttleMs, at);
      if (!tick) return null;
      let m: MatchRow | null = null;
      if (tick.broadcast) {
        // Scoreboard first (it came back with the answer), then the slower bookkeeping.
        const rows = tick.players ?? (await store.players(tick.matchId));
        await deps.broadcaster.send({ m: tick.matchId, s: tick.seq, t: 'scores', at: now(), d: scoresOf(rows, at) });
        m = await store.get(tick.matchId);
        if (!m) return tick;
        m = await advance(m, now());
      }
      if (m) gameOf.set(m.id, m.game);
      if (!gameOf.has(tick.matchId)) {
        m = await store.get(tick.matchId);
        if (gameOf.size > 500) gameOf.clear();
        gameOf.set(tick.matchId, m?.game ?? null);
      }
      if (gameOf.get(tick.matchId) !== GameMode.RIVER_SURVIVAL) return tick;
      m ??= await store.get(tick.matchId);
      // Net charge and stars were counted by match_answer. An open "Né lưới" / "Cướp lưới" window of
      // this student is decided now; if that write loses every retry, the next settle decides it
      // the same way from the durable last answer.
      if (m && m.status === 'running' && isSurvivalState(m.state) && (m.state.pendingTags.some((t) => t.escaper === tick.playerId) || m.state.pendingSnatches.some((t) => t.escaper === tick.playerId))) {
        const answered: LastAnswers = { [tick.playerId]: { at, correct: ans.correct } };
        await survivalStep(m, at, (s, ctx) => survivalSettle(s, ctx, answered)).catch((e: unknown) => console.warn('survival window kept for the next settle:', (e as Error).message));
      }
      return tick;
    },
  };
}

function parseAction(raw: unknown): SurvivalAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && /^[\w-]{1,40}$/.test(r.id) ? r.id : undefined;
  const str = (v: unknown) => (typeof v === 'string' && v.length <= 64 ? v : null);
  const list = (v: unknown) => (Array.isArray(v) ? v.slice(0, 5).map(str).filter((x): x is string => !!x) : null);
  switch (r.type) {
    case 'tag': {
      const targets = list(r.targets);
      return targets ? { type: 'tag', targets, id } : null;
    }
    case 'snatch':
    case 'freeze':
    case 'retake': {
      const target = str(r.target);
      return target ? { type: r.type, target, id } : null;
    }
    case 'rescue': {
      const freed = r.freed === undefined ? undefined : list(r.freed) ?? undefined;
      return { type: 'rescue', freed, id };
    }
    default:
      return null;
  }
}

export type MatchService = ReturnType<typeof createMatchService>;
export type { PlayPlan };
