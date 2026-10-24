'use client';

import { useEffect, useRef, useState } from 'react';
import { SCENARIOS, SCENARIO_IDS } from '../engine';
import type { ScenarioId } from '../engine';
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
        className={`text-left rounded-2xl p-4 text-white bg-gradient-to-br ${l.grad} border-2 ${on ? 'border-white shadow-[0_0_0_3px_rgba(255,255,255,.25)]' : 'border-white/10'} w-[150px] h-[190px] flex flex-col justify-between shrink-0`}
      >
        <span className="text-4xl" aria-hidden>{l.icon}</span>
        <span>
          <span className="block font-extrabold leading-tight">{sc.nameVi}</span>
          <span className="block text-[11px] opacity-80 mt-1 leading-snug">{l.blurb}</span>
        </span>
      </button>
    );
  };

  const sel = LOOK[value];

  return (
    <div>
      <div className="flex justify-end gap-1 mb-1" role="group" aria-label="Kiểu hiển thị">
        {(['ring', 'strip'] as Mode[]).map((m) => (
          <button type="button" key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`text-xs px-2 py-1 rounded-lg border ${mode === m ? 'border-blue-500 text-blue-300' : 'border-slate-700 text-slate-400'}`}>
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

      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-3" aria-live="polite">
        <div className="font-bold text-sm">{LOOK[value].icon} {SCENARIOS[value].nameVi}</div>
        <div className="text-xs text-slate-400">{SCENARIOS[value].style}</div>
        <ul className="mt-2 text-xs text-slate-300 list-disc pl-4 space-y-0.5">
          {sel.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </div>
    </div>
  );
}
