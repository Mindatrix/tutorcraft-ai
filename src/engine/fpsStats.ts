// Đại phẫu QA (03/11/2026): frame-rate statistics for the mobile FPS benchmark. Pure, so the
// numbers the browser shows, the Playwright script reads and the tests check are the same.
//
// Gate (cổng C, project_state 7.5): on a weak / mid-range phone the average is ≥ 30 FPS and the
// worst full second is ≥ 25 FPS.

export const FPS_GATE = { avgFps: 30, worstSecondFps: 25 } as const;

export interface FpsSummary {
  frames: number;
  durationMs: number;
  avgFps: number;
  /** Frame time percentiles (ms). */
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  /** Average FPS of the slowest 1 % of frames ("1 % low"). */
  low1Fps: number;
  /** Frames in the worst full 1-second window. */
  worstSecondFps: number;
  longestMs: number;
  /** Frames longer than 50 ms (visible stutter). */
  jank: number;
  pass: boolean;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

/** From requestAnimationFrame timestamps (ms, increasing). */
export function summarizeFrames(stamps: number[], gate = FPS_GATE): FpsSummary {
  const t = stamps.filter((x) => Number.isFinite(x));
  if (t.length < 2) return { frames: 0, durationMs: 0, avgFps: 0, medianMs: 0, p95Ms: 0, p99Ms: 0, low1Fps: 0, worstSecondFps: 0, longestMs: 0, jank: 0, pass: false };
  const deltas: number[] = [];
  for (let i = 1; i < t.length; i++) deltas.push(Math.max(0, t[i] - t[i - 1]));
  const durationMs = t[t.length - 1] - t[0];
  const sorted = [...deltas].sort((a, b) => a - b);
  const avgFps = durationMs > 0 ? (deltas.length * 1000) / durationMs : 0;
  const slow = sorted.slice(Math.floor(sorted.length * 0.99));
  const slowMean = slow.reduce((s, x) => s + x, 0) / Math.max(1, slow.length);
  // Worst full second: for each frame, the frames that END within the next 1000 ms.
  let worst = Infinity;
  let j = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] + 1000 > t[t.length - 1]) break;
    while (j < t.length && t[j] < t[i] + 1000) j++;
    worst = Math.min(worst, j - i - 1);
  }
  if (worst === Infinity) worst = Math.round(avgFps);
  const longestMs = sorted[sorted.length - 1];
  const out = {
    frames: deltas.length,
    durationMs: Math.round(durationMs),
    avgFps: round1(avgFps),
    medianMs: round1(percentile(sorted, 50)),
    p95Ms: round1(percentile(sorted, 95)),
    p99Ms: round1(percentile(sorted, 99)),
    low1Fps: round1(slowMean > 0 ? 1000 / slowMean : 0),
    worstSecondFps: worst,
    longestMs: round1(longestMs),
    jank: deltas.filter((d) => d > 50).length,
    pass: false,
  };
  out.pass = out.avgFps >= gate.avgFps && out.worstSecondFps >= gate.worstSecondFps;
  return out;
}

/** One line for a report table. */
export function fpsLine(s: FpsSummary): string {
  return `${s.avgFps} FPS tb · giây tệ nhất ${s.worstSecondFps} · 1% thấp ${s.low1Fps} · p95 ${s.p95Ms} ms · khung dài nhất ${s.longestMs} ms · giật ${s.jank} · ${s.pass ? 'ĐẠT' : 'CHƯA ĐẠT'}`;
}
