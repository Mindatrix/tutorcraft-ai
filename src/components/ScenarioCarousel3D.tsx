'use client';

import { useEffect, useRef, useState } from 'react';
import { SCENARIOS, SCENARIO_IDS } from '../engine';
import type { ScenarioId } from '../engine';
import Scenery from './scenery/Scenery';
import { LOOK } from './scenarioLook';
import Tilt from './Tilt';

type Mode = 'ring' | 'strip';

/**
 * Pick a game scenario with CSS-3D cards: a slowly turning ring, a flat strip
 * (better on phones), and a detail panel for the selected card. No WebGL needed.
 */
export default function ScenarioCarousel3D({ value, onChange }: { value: ScenarioId; onChange: (id: ScenarioId) => void }) {
  const [mode, setMode] = useState<Mode>('ring');
  const n = SCENARIO_IDS.length;
  const step = 360 / n;
  const [angle, setAngle] = useState(() => -Math.max(0, SCENARIO_IDS.indexOf(value)) * (360 / SCENARIO_IDS.length));
  const hover = useRef(false);

  useEffect(() => {
    if (mode !== 'ring') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      if (!hover.current) setAngle((a) => a + dt * 0.012);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  // Selecting a card turns the ring so it faces the front.
  const pick = (id: ScenarioId, i: number) => {
    onChange(id);
    setAngle(-i * step);
  };

  const card = (id: ScenarioId, i: number, style?: React.CSSProperties) => {
    const sc = SCENARIOS[id];
    const l = LOOK[id];
    const on = value === id;
    return (
      <button
        type="button"
        key={id}
        onClick={() => pick(id, i)}
        aria-pressed={on}
        style={style}
        className={`relative overflow-hidden rounded-t-[999px] bg-slate-900 text-left text-white border-[3px] ${on ? 'border-amber-300 shadow-[0_0_0_3px_rgba(252,211,77,.3)]' : 'border-slate-950'} w-[150px] h-[200px] shrink-0`}
      >
        <Scenery id={id} className="absolute inset-0 h-full w-full" />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute left-0 right-0 top-9 text-center text-4xl drop-shadow" aria-hidden>{l.icon}</span>
        <span className={`absolute inset-x-0 bottom-0 border-t-[3px] border-slate-950 p-2.5 text-slate-950 ${on ? 'bg-amber-300' : 'bg-slate-200'}`}>
          <span className="block text-sm font-extrabold leading-tight">{sc.nameVi}</span>
          <span className="mt-0.5 block text-[10px] leading-snug opacity-80">{l.blurb}</span>
        </span>
      </button>
    );
  };

  const sel = LOOK[value];

  return (
    <div>
      <div className="flex justify-end gap-1 mb-1" role="group" aria-label="Kiểu hiển thị">
        {(['ring', 'strip'] as Mode[]).map((m) => (
          <button type="button" key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`border-b-2 px-2 py-1 text-xs ${mode === m ? 'border-amber-300 text-amber-300' : 'border-transparent text-slate-400'}`}>
            {m === 'ring' ? 'Vòng xoay' : 'Dải ngang'}
          </button>
        ))}
      </div>

      {mode === 'ring' ? (
        <div
          className="relative h-[240px] overflow-hidden"
          style={{ perspective: 1000 }}
          onMouseEnter={() => { hover.current = true; }}
          onMouseLeave={() => { hover.current = false; }}
        >
          <div className="absolute left-1/2 top-1/2" style={{ transformStyle: 'preserve-3d' }}>
            {SCENARIO_IDS.map((id, i) => {
              const a = ((i * step + angle) * Math.PI) / 180;
              const front = Math.cos(a);
              return card(id, i, {
                position: 'absolute',
                left: -75,
                top: -95,
                transform: `translateX(${Math.sin(a) * 230}px) translateZ(${(front - 1) * 160}px) rotateY(${Math.sin(a) * 38}deg) scale(${0.8 + 0.2 * front})`,
                opacity: front < -0.2 ? 0 : 0.55 + 0.45 * Math.max(front, 0),
                pointerEvents: front < 0 ? 'none' : 'auto',
                zIndex: Math.round((front + 1) * 10),
              });
            })}
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x py-2 px-1">
          {SCENARIO_IDS.map((id, i) => <Tilt key={id} className="snap-center shrink-0">{card(id, i)}</Tilt>)}
        </div>
      )}

      <div className="mt-3 border-l-4 border-amber-300 bg-white/5 p-3" aria-live="polite">
        <div className="font-bold text-sm">{LOOK[value].icon} {SCENARIOS[value].nameVi}</div>
        <div className="text-xs text-slate-400">{SCENARIOS[value].style}</div>
        <ul className="mt-2 text-xs text-slate-300 list-disc pl-4 space-y-0.5">
          {sel.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </div>
  );
}
