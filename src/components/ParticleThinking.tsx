'use client';

import { useEffect, useRef } from 'react';

const COLORS = ['#f472b6', '#fb923c', '#34d399', '#60a5fa', '#a78bfa', '#fbbf24'];

type P = { hx: number; hy: number; x: number; y: number; r: number; c: string; ph: number };

/**
 * "Thinking…" waiting screen: the text is made of small coloured dots that swirl
 * and re-settle. Canvas 2D only, no assets; respects prefers-reduced-motion.
 */
export default function ParticleThinking({ text = 'Đang soạn bài…', hint, height = 140 }: { text?: string; hint?: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let parts: P[] = [];
    let w = 0;
    let h = 0;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Sample the text mask.
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const o = off.getContext('2d', { willReadFrequently: true });
      if (!o) return;
      let size = Math.min(64, h * 0.5);
      o.font = `700 ${size}px system-ui, sans-serif`;
      while (o.measureText(text).width > w * 0.9 && size > 16) {
        size -= 2;
        o.font = `700 ${size}px system-ui, sans-serif`;
      }
      o.textAlign = 'center';
      o.textBaseline = 'middle';
      o.fillText(text, w / 2, h / 2);
      const data = o.getImageData(0, 0, w, h).data;
      const step = Math.max(3, Math.round(size / 12));
      parts = [];
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          if (data[(y * w + x) * 4 + 3] > 128) {
            parts.push({
              hx: x, hy: y,
              x: x + (Math.random() - 0.5) * 200, y: y + (Math.random() - 0.5) * 120,
              r: step * (0.5 + Math.random() * 0.6),
              c: COLORS[Math.floor(Math.random() * COLORS.length)],
              ph: Math.random() * Math.PI * 2,
            });
          }
        }
      }
    };

    const t0 = performance.now();
    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      // Each cycle (~3s) the dots scatter a little then pull back into the letters.
      const pulse = reduce ? 0 : Math.max(0, Math.sin(t * 2.1)) ** 3;
      for (const p of parts) {
        const wob = reduce ? 0 : 1.2;
        const tx = p.hx + Math.cos(t * 3 + p.ph) * wob + Math.cos(p.ph * 3 + t) * 26 * pulse;
        const ty = p.hy + Math.sin(t * 3 + p.ph) * wob + Math.sin(p.ph * 2 + t) * 20 * pulse;
        p.x += (tx - p.x) * 0.12;
        p.y += (ty - p.y) * 0.12;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };

    build();
    raf = requestAnimationFrame(frame);
    if (reduce) requestAnimationFrame((n) => frame(n + 1000));
    const ro = new ResizeObserver(() => { build(); });
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [text, height]);

  return (
    <div role="status" aria-live="polite" className="w-full text-center">
      <canvas ref={ref} style={{ width: '100%', height }} aria-label={text} />
      {hint && <p className="text-sm text-slate-400 -mt-2">{hint}</p>}
    </div>
  );
}
