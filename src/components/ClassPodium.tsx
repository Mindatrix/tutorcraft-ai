'use client';

import type { CSSProperties, ReactNode } from 'react';
import { PODIUM_COLORS, podiumOf, type MatchPlayerView, type MatchScores, type PodiumPlace } from '../engine';

// C4.19 gold, silver and bronze frames around the avatars of the class top 3, the same on the
// tutor's screen and on every student's screen (podiumOf() orders them the same way everywhere).

const LABEL: Record<PodiumPlace, string> = { gold: 'Hạng 1', silver: 'Hạng 2', bronze: 'Hạng 3' };
const MEDAL: Record<PodiumPlace, string> = { gold: '1', silver: '2', bronze: '3' };

/** A frame around any avatar (emoji, image, 3D thumbnail) when that student is in the top 3. */
export function PodiumFrame({ place, size = 56, children }: { place: PodiumPlace | null | undefined; size?: number; children: ReactNode }) {
  const color = place ? PODIUM_COLORS[place] : 'transparent';
  const style: CSSProperties = {
    position: 'relative',
    display: 'inline-grid',
    placeItems: 'center',
    width: size,
    height: size,
    borderRadius: '50%',
    background: place ? `conic-gradient(from 210deg, ${color}, #fff8 18%, ${color} 40%, ${color})` : 'transparent',
    padding: place ? 4 : 0,
    boxShadow: place ? `0 0 14px ${color}aa` : undefined,
  };
  return (
    <span style={style} aria-label={place ? LABEL[place] : undefined}>
      <span style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', borderRadius: '50%', background: '#0f172a', overflow: 'hidden', fontSize: size * 0.5 }}>{children}</span>
      {place && (
        <span style={{ position: 'absolute', right: -4, bottom: -4, display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', background: color, color: '#1f2937', fontSize: 13, fontWeight: 900, border: '2px solid #0f172a' }}>
          {MEDAL[place]}
        </span>
      )}
    </span>
  );
}

/** The class top 3 as a small strip (student HUD, tutor sidebar). */
export default function ClassPodium({ roster, scores, me }: { roster: Pick<MatchPlayerView, 'id' | 'nickname' | 'avatar'>[]; scores: Pick<MatchScores, 'players' | 'correct'>; me?: string | null }) {
  const podium = podiumOf(scores);
  const top = (['gold', 'silver', 'bronze'] as PodiumPlace[]).map((place) => {
    const id = Object.keys(podium).find((k) => podium[k] === place);
    return id ? { place, p: roster.find((r) => r.id === id), stars: scores.players[id] ?? 0, id } : null;
  });
  return (
    <ol style={{ display: 'flex', gap: 12, alignItems: 'flex-end', listStyle: 'none', margin: 0, padding: 0 }} aria-label="Top 3 của lớp">
      {top.map((t, i) =>
        t ? (
          <li key={t.place} style={{ display: 'grid', justifyItems: 'center', gap: 4, color: '#f8fafc', fontSize: 16, fontWeight: 800 }}>
            <PodiumFrame place={t.place} size={i === 0 ? 64 : 52}>
              {t.p?.avatar ?? '🙂'}
            </PodiumFrame>
            <span style={{ maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', outline: t.id === me ? '2px solid #fcd34d' : undefined, padding: '0 4px' }}>{t.p?.nickname ?? '…'}</span>
            <span style={{ fontSize: 14, color: PODIUM_COLORS[t.place] }}>★ {t.stars}</span>
          </li>
        ) : null,
      )}
    </ol>
  );
}

export { podiumOf };
