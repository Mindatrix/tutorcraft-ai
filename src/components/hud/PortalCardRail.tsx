'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { BedDouble, Building2, Castle, Cpu, Snowflake, Sofa, Sun, type LucideIcon } from 'lucide-react';
import type { RailCard } from '../../engine/portalRail';
import { useReducedMotion } from '../fx/RainbowEdge';

// Multiverse "next spaces" rail (WP10 U3, 02/11/2026): small and see-through, top-left (Multiverse has
// no minimap). The cards of the route stand on a ring that turns slowly all the way round, like the
// scenario picker of the site (stops while hovered; a new stage brings its card to the front). The
// current space is lit, spaces ahead dimmed, passed ones fainter; the line below names now and next.
// Reduced motion: a still row. A room's 512 px preview (D6) replaces its drawn card when it exists.

const LOOK: Record<string, { icon: LucideIcon; from: string; to: string }> = {
  r_bedroom: { icon: BedDouble, from: '#f9a8d4', to: '#7c3aed' },
  r_cyber: { icon: Cpu, from: '#22d3ee', to: '#1e1b4b' },
  r_courtyard: { icon: Snowflake, from: '#e0f2fe', to: '#475569' },
  r_salon: { icon: Sofa, from: '#fcd34d', to: '#7c2d12' },
  r_fortress: { icon: Castle, from: '#94a3b8', to: '#1f2937' },
  r_desert: { icon: Sun, from: '#fde68a', to: '#b45309' },
  r_future: { icon: Building2, from: '#a5b4fc', to: '#0f172a' },
};

export default function PortalCardRail({ cards }: { cards: RailCard[] }) {
  const n = Math.max(1, cards.length);
  const step = 360 / n;
  const nowIdx = Math.max(0, cards.findIndex((c) => c.state === 'now'));
  const [spin, setSpin] = useState(0);
  const hover = useRef(false);
  const still = useReducedMotion();
  // A new stage brings its card back to the front (adjusted during render, React's pattern).
  const [shownIdx, setShownIdx] = useState(nowIdx);
  if (shownIdx !== nowIdx) {
    setShownIdx(nowIdx);
    setSpin(0);
  }
  useEffect(() => {
    if (still) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      if (!hover.current) setSpin((a) => (a + dt * 0.01) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [still]);
  const next = cards.find((c) => c.state === 'next');
  return (
    <div className="tc-hud-rail" role="group" aria-label="Các không gian sắp xuyên tới" onPointerEnter={() => (hover.current = true)} onPointerLeave={() => (hover.current = false)}>
      <div className={`tc-hud-rail-stage${still ? ' tc-hud-rail-still' : ''}`}>
        <div className="tc-hud-rail-ring" style={still ? undefined : ({ transform: `translateZ(-60px) rotateY(${-nowIdx * step - spin}deg)` } as CSSProperties)}>
          {cards.map((c, i) => {
            const look = LOOK[c.room] ?? LOOK.r_future;
            const Icon = look.icon;
            return (
              <div
                key={c.key}
                className={`tc-hud-rail-card tc-hud-rail-${c.state}`}
                style={{ transform: still ? undefined : `rotateY(${i * step}deg) translateZ(60px)`, background: c.image ? `center/cover url(${c.image})` : `linear-gradient(160deg, ${look.from}, ${look.to})` } as CSSProperties}
                title={`${i + 1}. ${c.name}`}
                aria-current={c.state === 'now' ? 'step' : undefined}
              >
                {!c.image && <Icon aria-hidden />}
                <span>{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p className="tc-hud-rail-text">
        <b>{cards[nowIdx]?.name}</b>
        {next && <span>Tiếp theo: {next.name}</span>}
      </p>
    </div>
  );
}
