import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import {
  MATCH_EVENT,
  clockOffsetNtp,
  matchClockAt,
  type MatchClock,
  type MatchMe,
  type MatchMessage,
  type MatchMessageType,
  type MatchPlayerView,
  type MatchScores,
  type MatchView,
  type SignedMatchMessage,
  type SurvivalEvent,
  type SurvivalPublic,
  type MatchResult,
  type MatchTime,
} from '../engine';

// The device side of a class match (plan B2.4 / B2.5).
//  - Joins (or re-joins) through our API with the battle session token, then listens on the
//    Supabase Realtime channel of the match.
//  - Every message must carry a valid server signature (ECDSA P-256, checked with Web Crypto),
//    belong to this match and be newer than what we have: forged, replayed and foreign messages
//    are dropped (a student CAN post on a public channel, 27/10 test).
//  - Asks the server for the authoritative state every 20 s, at once when the network or the tab
//    comes back, and every 3 s while the realtime channel is down. Scores live on the server, so a
//    phone that was offline for a while gets everything back on the next poll.
//  - Keeps a server-clock offset from the fastest round trip, so every device shows the same stage
//    and seconds left. Works in the browser and in Node (the load test uses this same code).

export interface ChannelInfo {
  topic: string;
  event: string;
  publicKey: JsonWebKey;
}

interface StudentMatch {
  view: MatchView;
  me: MatchMe;
  channel: ChannelInfo;
}

export type MatchLink = 'connecting' | 'realtime' | 'polling' | 'offline';

export interface MatchSnapshot {
  view: MatchView | null;
  me: MatchMe | null;
  link: MatchLink;
  /** Player ids present on the channel right now (Realtime presence). */
  present: Set<string>;
  /** Last stage announcement received. */
  stage: { stage: number; eventId: string | null } | null;
  /** Messages dropped: bad signature, other match, or not a match message. */
  dropped: number;
  /** Genuine messages that arrived after a newer state (already covered), or replays. */
  stale: number;
}

export interface MatchConnectOptions {
  token: string;
  /** Join first (default), with an optional Dino look; false = only read the state (already joined). */
  join?: { species?: string; color?: string } | false;
  onChange?(snap: MatchSnapshot): void;
  /** Every accepted message (Survival events, stage changes…), after it was applied. */
  onMessage?(msg: MatchMessage): void;
  /** A genuine message that was not applied because a newer state was already there. */
  onStale?(msg: MatchMessage): void;
  /** An authoritative state arrived from the server (its message number). */
  onSync?(seq: number): void;
  pollMs?: number;
  /** '' in the browser; the server origin in Node. */
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Realtime client (anon key). Default: the browser client. null = polling only. */
  supabase?: SupabaseClient | null;
  /** The device clock (default Date.now); the load test gives each fake device a skewed one. */
  localNow?: () => number;
  /** Window-like target for online / offline / visibility events (browser only). */
  events?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
}

export interface MatchConnection {
  snapshot(): MatchSnapshot;
  /** Server time estimate (ms). */
  now(): number;
  clock(): MatchClock | null;
  refresh(): Promise<void>;
  /** River Survival action, checked by the server. */
  act(action: Record<string, unknown>): Promise<{ events: SurvivalEvent[] }>;
  close(): void;
  /** For tests: feed a raw channel payload as if it came from Realtime. */
  receive(payload: unknown): Promise<boolean>;
}

const TYPES: MatchMessageType[] = ['state', 'stage', 'scores', 'roster', 'survival', 'ended'];

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function importMatchKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

/** The message inside a signed payload, or null when the signature does not match. */
export async function openSignedMessage(key: CryptoKey, payload: unknown): Promise<MatchMessage | null> {
  const p = payload as Partial<SignedMatchMessage> | null;
  if (!p || typeof p.b !== 'string' || typeof p.g !== 'string' || p.b.length > 200_000) return null;
  try {
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlBytes(p.g), new TextEncoder().encode(p.b));
    return ok ? (JSON.parse(p.b) as MatchMessage) : null;
  } catch {
    return null;
  }
}

export async function connectMatch(opts: MatchConnectOptions): Promise<MatchConnection> {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? '';
  const pollMs = opts.pollMs ?? 20_000;
  const local = opts.localNow ?? Date.now;
  const events = opts.events === undefined ? (typeof window !== 'undefined' ? window : null) : opts.events;

  const snap: MatchSnapshot = { view: null, me: null, link: 'connecting', present: new Set(), stage: null, dropped: 0, stale: 0 };
  const lastSeq = Object.fromEntries(TYPES.map((t) => [t, 0])) as Record<MatchMessageType, number>;
  let offset = 0;
  let bestDelay = Infinity;
  let key: CryptoKey | null = null;
  let channel: RealtimeChannel | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let subscribed = false;
  /** Highest message number seen (any type): a jump means a message was missed. */
  let maxSeq = 0;
  let gapTimer: ReturnType<typeof setTimeout> | null = null;
  let lastGapRefresh = 0;

  const emit = () => opts.onChange?.(snap);

  async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const sent = local();
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: { 'x-battle-session': opts.token, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const got = local();
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; view?: MatchView };
    if (!res.ok) throw Object.assign(new Error(data.error ?? `HTTP ${res.status}`), { status: res.status });
    const t2 = data.view?.serverNow;
    // NTP with four stamps: the server's processing time cancels out. Keep the sample with the
    // smallest network delay (least uncertainty), but accept close ones so a drifting phone
    // clock is still followed.
    if (typeof t2 === 'number') {
      const t1 = data.view?.serverRecv ?? t2;
      const { offset: o, delay } = clockOffsetNtp(sent, t1, t2, got);
      if (delay <= bestDelay * 1.5 + 50) {
        bestDelay = Math.min(bestDelay, delay);
        offset = o;
      }
    }
    return data;
  }

  function adopt(r: StudentMatch) {
    snap.view = r.view;
    snap.me = r.me;
    // Nothing older than this authoritative view may be applied on top of it.
    for (const t of TYPES) lastSeq[t] = Math.max(lastSeq[t], r.view.seq);
    maxSeq = Math.max(maxSeq, r.view.seq);
    opts.onSync?.(r.view.seq);
    emit();
  }

  /**
   * Realtime is best effort (27/10: 8 of 48,967 deliveries missed). Every message carries the
   * match's message number, so a jump shows that one was missed: ask the server right away
   * instead of waiting for the next 20 s poll.
   */
  function noteSeq(s: number) {
    const gap = s > maxSeq + 1;
    maxSeq = Math.max(maxSeq, s);
    if (!gap || gapTimer || closed) return;
    const wait = Math.max(300, 2000 - (Date.now() - lastGapRefresh));
    gapTimer = setTimeout(() => {
      gapTimer = null;
      lastGapRefresh = Date.now();
      void refresh().catch(() => undefined);
    }, wait);
  }

  function apply(msg: MatchMessage) {
    const v = snap.view;
    if (!v) return;
    switch (msg.t) {
      case 'state': {
        const d = msg.d as { time: MatchTime; view?: MatchView; muted?: boolean };
        if (d.view) snap.view = d.view;
        else snap.view = { ...v, time: d.time, status: d.time.status, ...(typeof d.muted === 'boolean' ? { muted: d.muted } : {}) };
        if (d.view && snap.me) {
          const mine = d.view.roster.find((p) => p.id === snap.me!.id);
          if (mine) snap.me = { ...snap.me, team: mine.team, grp: mine.grp };
        }
        break;
      }
      case 'stage':
        snap.stage = msg.d as { stage: number; eventId: string | null };
        break;
      case 'scores': {
        const d = msg.d as MatchScores;
        snap.view = { ...v, scores: d };
        if (snap.me && d.players[snap.me.id] !== undefined) snap.me = { ...snap.me, stars: d.players[snap.me.id], correct: d.correct[snap.me.id] ?? snap.me.correct };
        break;
      }
      case 'roster': {
        const d = msg.d as { player: MatchPlayerView; left?: boolean };
        const roster = v.roster.filter((p) => p.id !== d.player.id);
        roster.push(d.player);
        snap.view = { ...v, roster };
        break;
      }
      case 'survival': {
        const next = (msg.d as { survival: SurvivalPublic }).survival;
        const prev = v.survival?.players ?? {};
        const players: SurvivalPublic['players'] = {};
        for (const [id, p] of Object.entries(next.players)) players[id] = { ...(prev[id]?.charge !== undefined ? { charge: prev[id].charge } : {}), ...p };
        snap.view = { ...v, survival: { ...next, players } };
        break;
      }
      case 'ended': {
        const d = msg.d as { result: MatchResult; time: MatchTime };
        snap.view = { ...v, status: 'ended', time: d.time, result: d.result };
        break;
      }
    }
  }

  async function receive(payload: unknown): Promise<boolean> {
    if (!key || !snap.view) return false;
    const msg = await openSignedMessage(key, payload);
    if (!msg || msg.m !== snap.view.id || !TYPES.includes(msg.t)) {
      snap.dropped += 1;
      return false;
    }
    noteSeq(msg.s);
    if (!(msg.s > lastSeq[msg.t])) {
      snap.stale += 1;
      opts.onStale?.(msg);
      return false;
    }
    lastSeq[msg.t] = msg.s;
    apply(msg);
    emit();
    opts.onMessage?.(msg);
    return true;
  }

  async function refresh() {
    if (closed) return;
    try {
      adopt(await call<StudentMatch>('/api/match/state', 'GET'));
      if (snap.link === 'offline') snap.link = subscribed ? 'realtime' : 'polling';
    } catch (e) {
      if ((e as { status?: number }).status === undefined) {
        snap.link = 'offline';
        emit();
      } else throw e;
    }
  }

  function schedule() {
    if (closed) return;
    if (pollTimer) clearTimeout(pollTimer);
    const fast = snap.link !== 'realtime';
    pollTimer = setTimeout(() => void refresh().catch(() => undefined).finally(schedule), fast ? Math.min(pollMs, 3000) : pollMs);
  }

  const onOnline = () => void refresh().catch(() => undefined);
  const onOffline = () => {
    snap.link = 'offline';
    emit();
  };
  const onVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') onOnline();
  };

  // 1) join / state, 2) key, 3) channel, 4) polling
  const first = opts.join === false ? await call<StudentMatch>('/api/match/state', 'GET') : await call<StudentMatch>('/api/match/join', 'POST', opts.join ?? {});
  key = await importMatchKey(first.channel.publicKey);
  adopt(first);

  const sb = opts.supabase === undefined ? (await import('./supabaseBrowser')).browserSupabase() : opts.supabase;
  if (sb) {
    channel = sb.channel(first.channel.topic, { config: { broadcast: { self: false }, presence: { key: first.me.id } } });
    channel.on('broadcast', { event: first.channel.event || MATCH_EVENT }, (m) => void receive(m.payload));
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel!.presenceState();
      snap.present = new Set(Object.keys(state));
      emit();
    });
    channel.subscribe((status) => {
      if (closed) return;
      subscribed = status === 'SUBSCRIBED';
      if (status === 'SUBSCRIBED') {
        snap.link = 'realtime';
        void channel!.track({ id: first.me.id, at: local() });
        // Anything sent while we were (re)connecting: catch up from the server.
        void refresh().catch(() => undefined);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') snap.link = 'polling';
      emit();
      schedule();
    });
  } else snap.link = 'polling';
  events?.addEventListener('online', onOnline);
  events?.addEventListener('offline', onOffline);
  events?.addEventListener('visibilitychange', onVisible);
  schedule();
  emit();

  return {
    snapshot: () => snap,
    now: () => local() + offset,
    clock: () => (snap.view ? matchClockAt(snap.view.time, local() + offset) : null),
    refresh,
    async act(action) {
      const r = await call<{ events: SurvivalEvent[]; survival: SurvivalPublic; me: MatchMe }>('/api/match/action', 'POST', action);
      if (snap.view) snap.view = { ...snap.view, survival: r.survival };
      snap.me = r.me ?? snap.me;
      emit();
      return { events: r.events };
    },
    close() {
      closed = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (gapTimer) clearTimeout(gapTimer);
      events?.removeEventListener('online', onOnline);
      events?.removeEventListener('offline', onOffline);
      events?.removeEventListener('visibilitychange', onVisible);
      if (channel && sb) void sb.removeChannel(channel);
    },
    receive,
  };
}
