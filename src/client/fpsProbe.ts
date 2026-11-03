import { summarizeFrames, type FpsSummary } from '../engine/fpsStats';

// Đại phẫu QA (03/11/2026): in-page FPS measurement. The page records requestAnimationFrame
// timestamps for N seconds and publishes the result on `window.__tcBench`, where
// scripts/fps-benchmark.mjs (Playwright, emulated phone or a real Android over ADB) reads it.
// On an iPhone the same page shows the numbers on screen for a screenshot.

export interface DeviceInfo {
  ua: string;
  gpu: string;
  dpr: number;
  viewport: string;
  cores: number | null;
  memoryGB: number | null;
}

export interface BenchResult {
  done: true;
  label: string;
  params: Record<string, string>;
  summary: FpsSummary;
  device: DeviceInfo;
  /** Scene numbers at the end (draw calls, triangles, GPU memory estimate). */
  scene?: Record<string, number | string>;
  at: string;
}

declare global {
  interface Window {
    __tcBench?: BenchResult | { done: false; label: string; phase: 'warmup' | 'measuring' };
  }
}

export function deviceInfo(gl?: WebGLRenderingContext | WebGL2RenderingContext | null): DeviceInfo {
  let gpu = 'unknown';
  try {
    const ctx = gl ?? document.createElement('canvas').getContext('webgl');
    const ext = ctx?.getExtension('WEBGL_debug_renderer_info');
    gpu = String((ext && ctx?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || ctx?.getParameter(ctx.RENDERER) || 'unknown');
  } catch {
    /* privacy mode: no GPU name */
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    ua: navigator.userAgent,
    gpu,
    dpr: window.devicePixelRatio || 1,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGB: nav.deviceMemory ?? null,
  };
}

/** Record frame timestamps for `seconds` after `warmupSec`, then summarise. */
export function measureFrames(seconds: number, warmupSec = 2, label = 'bench'): Promise<FpsSummary> {
  return new Promise((resolve) => {
    const stamps: number[] = [];
    let start = -1;
    window.__tcBench = { done: false, label, phase: 'warmup' };
    const tick = (now: number) => {
      if (start < 0) start = now;
      const sec = (now - start) / 1000;
      if (sec >= warmupSec) {
        if (!stamps.length) window.__tcBench = { done: false, label, phase: 'measuring' };
        stamps.push(now);
      }
      if (sec >= warmupSec + seconds) return resolve(summarizeFrames(stamps));
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
