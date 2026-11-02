'use client';

import { useEffect, useRef } from 'react';
import { angleDelta } from '../../engine/kayakCourse';

// Minimap and coordinate bar (WP10 U3, 02/11/2026). Both are fed by the game, not by a second scene:
//  - Minimap: a small canvas the game draws into ~10 times a second (its own terrain, obstacles, players).
//  - CoordBar: a see-through compass strip under the toolbar; long and short ticks pointing down,
//    numbers under them, the facing in the middle, teammates (with where they look) on the strip,
//    and my coordinates. Read every frame from `read()` and written to the DOM directly, so a
//    turning camera never re-renders React.

/** Draws the map from the game's live data (read from a ref inside the paint loop, never in render). */
export type DrawMap<T = unknown> = (ctx: CanvasRenderingContext2D, w: number, h: number, data: T) => void;

export function Minimap<T>({ draw, source, label = 'Bản đồ nhỏ', fps = 10, size = 128, tall = 1, round }: { draw: DrawMap<T>; source: { current: T }; label?: string; fps?: number; size?: number; tall?: number; round?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = size;
    const h = Math.round(size * tall);
    c.width = w * dpr;
    c.height = h * dpr;
    const paint = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawRef.current(ctx, w, h, source.current);
    };
    paint();
    const id = setInterval(paint, 1000 / fps);
    return () => clearInterval(id);
  }, [fps, size, tall, source]);
  return <canvas ref={canvas} className="tc-hud-minimap" role="img" aria-label={label} style={{ width: size, height: Math.round(size * tall), borderRadius: round ? '50%' : undefined }} />;
}

export interface CoordMark {
  id: string;
  /** Compass bearing from me to them (0 = north, clockwise). */
  bearing: number;
  color: string;
  label: string;
  /** Where they look (bearing), drawn as a small arrow. */
  facing?: number;
}
export interface CoordState {
  /** Where I look (0 = north, clockwise). */
  heading: number;
  x: number;
  z: number;
  marks: CoordMark[];
}

const NAMES: Record<number, string> = { 0: 'B', 45: 'ĐB', 90: 'Đ', 135: 'ĐN', 180: 'N', 225: 'TN', 270: 'T', 315: 'TB' };
const PX_PER_DEG = 3;

/** Compass strip: long ticks every 15°, short every 5°, a number or a direction under each long tick. */
export function CoordBar<T>({ source, state }: { source: { current: T }; state: (data: T) => CoordState }) {
  const strip = useRef<HTMLDivElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const pos = useRef<HTMLSpanElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const s = stateRef.current(source.current);
      const width = strip.current?.parentElement?.clientWidth ?? 300;
      // The strip holds ticks for 0..720°. Centre the tick labelled h, taken from 180..540 so that at
      // least 180° of ticks exist on both sides.
      const h = ((s.heading % 360) + 360) % 360;
      const at = h < 180 ? h + 360 : h;
      const offset = width / 2 - at * PX_PER_DEG;
      if (strip.current) strip.current.style.transform = `translateX(${offset.toFixed(1)}px)`;
      const key = `${Math.round(s.x)},${Math.round(s.z)},${Math.round(h)},${s.marks.map((m) => `${m.id}:${Math.round(m.bearing)}:${Math.round(m.facing ?? -1)}`).join('|')}`;
      if (key === last) return;
      last = key;
      if (pos.current) pos.current.textContent = `X ${Math.round(s.x)} · Z ${Math.round(-s.z)}`;
      if (head.current) head.current.textContent = `${Math.round(h)}°`;
      const box = marks.current;
      if (!box) return;
      const half = width / 2;
      box.replaceChildren(
        ...s.marks.map((m) => {
          const d = angleDelta(m.bearing, h);
          const edge = Math.abs(d) * PX_PER_DEG > half - 10;
          const x = edge ? half + Math.sign(d) * (half - 10) : half + d * PX_PER_DEG;
          const el = document.createElement('span');
          el.className = `tc-hud-mark${edge ? ' tc-hud-mark-edge' : ''}`;
          el.style.left = `${x.toFixed(1)}px`;
          el.style.setProperty('--c', m.color);
          el.title = `${m.label} · ${Math.round(m.bearing)}°`;
          el.setAttribute('aria-label', `${m.label}, hướng ${Math.round(m.bearing)} độ`);
          if (m.facing !== undefined) {
            const arrow = document.createElement('i');
            arrow.style.transform = `rotate(${angleDelta(m.facing, h).toFixed(0)}deg)`;
            el.appendChild(arrow);
          }
          return el;
        }),
      );
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [source]);
  const ticks = [];
  for (let a = 0; a <= 720; a += 5) {
    const deg = a % 360;
    const long = a % 15 === 0;
    ticks.push(
      <span key={a} className={long ? 'tc-hud-tick tc-hud-tick-long' : 'tc-hud-tick'} style={{ left: a * PX_PER_DEG }}>
        {long && <b className={NAMES[deg] ? 'tc-hud-dir' : undefined}>{NAMES[deg] ?? deg}</b>}
      </span>,
    );
  }
  return (
    <div className="tc-hud-coord" role="group" aria-label="Thanh tọa độ">
      <div className="tc-hud-coord-track">
        <div ref={strip} className="tc-hud-coord-strip">
          {ticks}
        </div>
        <div ref={marks} className="tc-hud-coord-marks" />
        <span className="tc-hud-coord-needle" aria-hidden />
      </div>
      <div className="tc-hud-coord-read">
        <span ref={head} />
        <span ref={pos} />
      </div>
    </div>
  );
}
