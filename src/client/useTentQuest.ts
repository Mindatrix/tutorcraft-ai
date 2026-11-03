'use client';

import { useEffect, useState } from 'react';
import type { TentQuestView } from '../engine/campQuest';
import { connectMatch, type MatchConnection, type MatchSnapshot } from './matchChannel';

// Summer Camp live match (03/11/2026): the student's tent Quest Board, live from the class match
// channel (signed `camp_quest` broadcasts, and the match view for a device that (re)joins).
// Only for a session inside a class match (`enabled`); solo / demo stay on their own progress.

const tentOf = (snap: MatchSnapshot) => (snap.me?.grp != null ? `g${snap.me.grp}` : 'all');

export function tentQuestOf(snap: MatchSnapshot): TentQuestView | null {
  const key = tentOf(snap);
  return snap.campQuest?.[key] ?? snap.view?.campQuest?.[key] ?? null;
}

export function useTentQuest(token: string | null, enabled: boolean): TentQuestView | null {
  const [tent, setTent] = useState<TentQuestView | null>(null);
  useEffect(() => {
    if (!token || !enabled) return;
    let stale = false;
    let conn: MatchConnection | null = null;
    connectMatch({ token, join: false, onChange: (snap) => !stale && setTent(tentQuestOf(snap)) }).then(
      (c) => {
        if (stale) c.close();
        else conn = c;
      },
      () => undefined, // not in a running match (yet): the scene shows the student's own progress
    );
    return () => {
      stale = true;
      conn?.close();
    };
  }, [token, enabled]);
  return enabled ? tent : null;
}
