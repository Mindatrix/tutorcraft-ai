'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { canUseWebGL } from '../modes/gfx';
import { RAINBOW_FRAGMENT, RAINBOW_PERIOD_MS, RAINBOW_VERTEX_RAW, rainbowDefaults, type RainbowShape } from './rainbowEdgeCore';
import './rainbowEdge.css';

/** Class names of rainbowEdge.css (plain global CSS: this project's Turbopack rule turns every .css into global CSS). */
const styles = { canvas: 'tc-rb-canvas', content: 'tc-rb-content', halo: 'tc-rb-halo', host: 'tc-rb-host', inner: 'tc-rb-inner', layer: 'tc-rb-layer', ring: 'tc-rb-ring', sparkle: 'tc-rb-sparkle', sparkles: 'tc-rb-sparkles', still: 'tc-rb-still' } as const;

// The one RainbowEdge component (C4.1 question frame, D6.4 portal ring). Shader on capable devices
// (the 'high' tier), CSS conic gradient on weak ones and the 2D tier; both honour reduced motion
// (the band stops turning, sparkles stand still). The 3D portal uses the same shader through
// src/components/modes/three/rainbowEdgeMaterial.ts.

export type RainbowMode = 'shader' | 'css';

export interface RainbowEdgeProps {
  shape?: RainbowShape;
  /** 'auto' = shader on the high tier when WebGL works, CSS otherwise. */
  mode?: RainbowMode | 'auto';
  tier?: 'high' | 'low' | '2d';
  /** Portal opening: the band runs faster. */
  bloom?: boolean;
  /** Force reduced motion (otherwise the system setting decides). */
  still?: boolean;
  width?: number;
  radius?: number;
  glow?: number;
  /** Darkness of the inside, 0..1. */
  inner?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Which version actually rendered (for the lab). */
  onMode?: (m: RainbowMode) => void;
}

const subscribeMotion = (cb: () => void) => {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : null;
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
};
const reducedNow = () => (typeof window !== 'undefined' ? !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches : false);

/** prefers-reduced-motion, live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, reducedNow, () => false);
}

let webgl: boolean | null = null;
const webglOk = () => (webgl ??= typeof window !== 'undefined' && canUseWebGL());
const noSubscribe = () => () => undefined;

export default function RainbowEdge(props: RainbowEdgeProps) {
  const { shape = 'rect', mode = 'auto', tier = 'high', bloom = false, className, style, children, onMode } = props;
  const p = rainbowDefaults(shape, { width: props.width, radius: props.radius, glow: props.glow, inner: props.inner, bloom });
  const systemReduced = useReducedMotion();
  const still = props.still ?? systemReduced;
  const [failed, setFailed] = useState(false);
  const wantShader = mode === 'shader' || (mode === 'auto' && tier === 'high');
  // WebGL can only be probed in the browser: the server (and hydration) render the CSS version.
  const canShader = useSyncExternalStore(noSubscribe, webglOk, () => false);
  const used: RainbowMode = canShader && wantShader && !failed ? 'shader' : 'css';
  const fail = useCallback(() => setFailed(true), []);
  useEffect(() => onMode?.(used), [used, onMode]);

  const radiusCss = shape === 'circle' ? '50%' : `${p.radius}px`;
  const lap = `${(RAINBOW_PERIOD_MS[shape] / (bloom ? 2.6 : 1)).toFixed(0)}ms`;
  const vars = {
    '--tc-rb-radius': radiusCss,
    '--tc-rb-width': `${p.width}px`,
    '--tc-rb-blur': `${Math.round(p.glow * 0.45)}px`,
    '--tc-rb-inner': String(p.inner),
    '--tc-rb-lap': lap,
  } as CSSProperties;

  return (
    <div className={`${styles.host} ${still ? styles.still : ''} ${className ?? ''}`} style={{ ...vars, ...style }} data-rainbow={used}>
      {used === 'shader' ? (
        <div className={styles.layer} style={{ inset: -p.glow }}>
          <ShaderCanvas shape={shape} params={p} still={still} onFail={fail} />
        </div>
      ) : (
        <div className={styles.layer} style={{ inset: 0 }}>
          <div className={styles.inner} />
          <div className={styles.halo} />
          <div className={styles.ring} />
          {p.sparkles && (
            <div className={styles.sparkles}>
              {Array.from({ length: 10 }, (_, i) => (
                <span
                  key={i}
                  className={styles.sparkle}
                  style={{ left: `${50 + (50 + (i % 3) * 3 - 3) * Math.cos((i * Math.PI) / 5)}%`, top: `${50 + (50 + (i % 3) * 3 - 3) * Math.sin((i * Math.PI) / 5)}%`, animationDelay: `${(i * 0.37) % 1.4}s` }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <div className={styles.content}>{children}</div>
    </div>
  );
}

function ShaderCanvas({ shape, params, still, onFail }: { shape: RainbowShape; params: ReturnType<typeof rainbowDefaults>; still: boolean; onFail: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const live = useRef({ params, still, onFail });
  useEffect(() => {
    live.current = { params, still, onFail };
  });

  useEffect(() => {
    const box = holder.current;
    if (!box) return;
    // A fresh canvas per run: React's dev double-mount would otherwise get the context the first
    // run just gave back (lost), and every shader call on it fails.
    const canvas = document.createElement('canvas');
    canvas.className = styles.canvas;
    canvas.setAttribute('aria-hidden', 'true');
    box.appendChild(canvas);
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: true, antialias: false }) as WebGLRenderingContext | null;
    if (!gl) {
      canvas.remove();
      live.current.onFail();
      return;
    }
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
      return sh;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, RAINBOW_VERTEX_RAW));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, `precision mediump float;\n${RAINBOW_FRAGMENT}`));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
    } catch (e) {
      console.warn('RainbowEdge shader failed, using CSS:', (e as Error).message);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      live.current.onFail();
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const U = { time: u('uTime'), res: u('uRes'), shape: u('uShape'), radius: u('uRadius'), width: u('uWidth'), glow: u('uGlow'), speed: u('uSpeed'), sparkle: u('uSparkle'), inner: u('uInner'), opacity: u('uOpacity') };

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let w = 1;
    let h = 1;
    let lost = false;
    const t0 = performance.now();
    const draw = (now: number) => {
      if (lost) return;
      const { params: q, still: s } = live.current;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(U.time, s ? 0.15 : (now - t0) / 1000);
      // The shader works in CSS px so widths match the CSS version.
      gl.uniform2f(U.res, w, h);
      gl.uniform1f(U.shape, shape === 'circle' ? 1 : 0);
      gl.uniform1f(U.radius, q.radius);
      gl.uniform1f(U.width, q.width);
      gl.uniform1f(U.glow, q.glow);
      gl.uniform1f(U.speed, q.speed);
      gl.uniform1f(U.sparkle, q.sparkles ? 1 : 0);
      gl.uniform1f(U.inner, q.inner);
      gl.uniform1f(U.opacity, 1);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const resize = () => {
      w = canvas.clientWidth || 1;
      h = canvas.clientHeight || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      draw(performance.now());
    };
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || live.current.still) return;
      draw(now);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(loop);
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      live.current.onFail();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
  }, [shape]);

  return <div ref={holder} style={{ width: '100%', height: '100%' }} />;
}
