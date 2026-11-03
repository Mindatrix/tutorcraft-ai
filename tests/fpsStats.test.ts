import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { FPS_GATE, fpsLine, summarizeFrames } from '../src/engine/fpsStats';

// Đại phẫu QA: the numbers of the mobile FPS benchmark (gate: avg ≥ 30, worst second ≥ 25).

const steady = (fps: number, sec: number, from = 0) => Array.from({ length: Math.round(fps * sec) + 1 }, (_, i) => from + (i * 1000) / fps);

describe('summarizeFrames', () => {
  it('a steady 60 FPS passes; a steady 24 FPS fails', () => {
    const s60 = summarizeFrames(steady(60, 10));
    assert.strictEqual(Math.round(s60.avgFps), 60);
    assert.ok(s60.worstSecondFps >= 59);
    assert.strictEqual(s60.jank, 0);
    assert.strictEqual(s60.pass, true);
    const s24 = summarizeFrames(steady(24, 10));
    assert.strictEqual(s24.pass, false);
  });

  it('one bad second fails the gate even when the average is fine', () => {
    // 9 s at 60 FPS, then 1 s at 15 FPS, then 2 s at 60 FPS.
    const a = steady(60, 9);
    const b = steady(15, 1, a[a.length - 1]).slice(1);
    const c = steady(60, 2, b[b.length - 1]).slice(1);
    const s = summarizeFrames([...a, ...b, ...c]);
    assert.ok(s.avgFps >= FPS_GATE.avgFps, `avg ${s.avgFps}`);
    assert.ok(s.worstSecondFps < FPS_GATE.worstSecondFps, `worst ${s.worstSecondFps}`);
    assert.strictEqual(s.pass, false);
    assert.ok(s.longestMs > 60 && s.jank > 0);
    assert.match(fpsLine(s), /CHƯA ĐẠT/);
  });

  it('empty or one-frame input is a fail, not a crash', () => {
    assert.strictEqual(summarizeFrames([]).pass, false);
    assert.strictEqual(summarizeFrames([5]).frames, 0);
  });
});
