'use client';

import { useEffect, useRef, useState } from 'react';
import type { SurvivalAction, SurvivalEvent } from '../engine';
import { connectMatch, type MatchConnection, type MatchSnapshot } from './matchChannel';

// Live class-match state for a 3D world (03/11/2026): the signed match channel (Realtime + polling)
// of a session inside a class match. River Survival reads the players (free / caught / frozen, who
// holds a net), the open dodge windows and the survival events, and sends its actions through the
// server (`/api/match/action`, survivalRules.ts decides everything).

export interface MatchLive {
  snap: MatchSnapshot | null;
  /** Latest survival events (newest last, at most 12). */
  events: SurvivalEvent[];
  /** Server clock (ms) as this device estimates it. */
  now: () => number;
  /** Send a survival action; rejects with the server's Vietnamese reason. */
  act: (a: SurvivalAction) => Promise<SurvivalEvent[]>;
}

export function useMatchLive(token: string | null, enabled: boolean): MatchLive | null {
  const [snap, setSnap] = useState<MatchSnapshot | null>(null);
  const [events, setEvents] = useState<SurvivalEvent[]>([]);
  const conn = useRef<MatchConnection | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token || !enabled) return;
    let stale = false;
    connectMatch({
      token,
      join: false,
      onChange: (s) => !stale && setSnap({ ...s }),
      onMessage: (m) => {
        if (stale || m.t !== 'survival') return;
        const evs = (m.d as { events?: SurvivalEvent[] }).events ?? [];
        if (evs.length) setEvents((e) => [...e, ...evs].slice(-12));
      },
    }).then(
      (c) => {
        if (stale) c.close();
        else {
          conn.current = c;
          setReady(true);
        }
      },
      () => undefined,
    );
    return () => {
      stale = true;
      conn.current?.close();
      conn.current = null;
      setReady(false);
    };
  }, [token, enabled]);

  if (!enabled || !ready) return null;
  return {
    snap,
    events,
    now: () => conn.current?.now() ?? Date.now(),
    act: async (a) => {
      const c = conn.current;
      if (!c) throw new Error('Chưa kết nối trận.');
      const r = await c.act({ ...a, id: a.id ?? `${a.type}-${Date.now().toString(36)}` });
      setEvents((e) => [...e, ...r.events].slice(-12));
      return r.events;
    },
  };
}
