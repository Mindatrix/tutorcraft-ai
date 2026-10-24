'use client';

import { useRef } from 'react';

/** Wrapper that tilts its child toward the pointer (max ±8°). No-op for touch and reduced motion. */
export default function Tilt({ children, className = '', max = 8 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (rx: number, ry: number) => {
    const el = ref.current;
    if (el) el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  };
  return (
    <div
      ref={ref}
      className={`transition-transform duration-150 ease-out ${className}`}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        set(-y * 2 * max, x * 2 * max);
      }}
      onPointerLeave={() => set(0, 0)}
    >
      {children}
    </div>
  );
}
