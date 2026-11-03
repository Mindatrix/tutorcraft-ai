import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { JOYSTICK, JoystickTracker, MoveInputMixer, WARP, WarpController, joystickVector } from '../src/client/spatialInput';

// Đại phẫu: Spatial UI controls (floating joystick, hold-to-warp "Xuyên không", keyboard merge).

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('joystick', () => {
  it('dead zone, full speed at the rim, knob clamped to the ring, screen up = forward', () => {
    assert.deepStrictEqual(joystickVector(0, 0), { x: 0, y: 0, magnitude: 0, knobX: 0, knobY: 0 });
    const jitter = joystickVector(3, 2);
    assert.strictEqual(jitter.magnitude, 0, 'inside the dead zone');
    const up = joystickVector(0, -JOYSTICK.radius);
    assert.ok(near(up.y, 1) && near(up.x, 0) && near(up.magnitude, 1));
    const far = joystickVector(300, 0);
    assert.ok(near(far.x, 1));
    assert.ok(near(far.knobX, JOYSTICK.radius), 'knob stays on the ring');
    const half = joystickVector(JOYSTICK.radius * (JOYSTICK.deadZone + (1 - JOYSTICK.deadZone) / 2), 0);
    assert.ok(near(half.magnitude, 0.5), 'linear after the dead zone');
  });

  it('follows one finger only; a second finger (buttons) is ignored', () => {
    const j = new JoystickTracker();
    assert.ok(j.down(1, 100, 400));
    assert.strictEqual(j.down(2, 600, 400), false);
    j.move(2, 900, 400);
    assert.strictEqual(j.vector.magnitude, 0);
    j.move(1, 100, 400 - JOYSTICK.radius);
    assert.ok(near(j.vector.y, 1));
    j.up(2);
    assert.ok(j.active, 'lifting the other finger does not release the stick');
    j.up(1);
    assert.strictEqual(j.active, false);
    assert.strictEqual(j.vector.magnitude, 0);
  });
});

describe('Xuyên không (warp) button', () => {
  it('only ready when the game allows it; hold to charge, release early cancels', () => {
    const w = new WarpController();
    assert.deepStrictEqual(w.press(0), [], 'locked: nothing');
    assert.deepStrictEqual(w.setAvailable(true, 0), ['ready']);
    assert.deepStrictEqual(w.press(100), ['charge']);
    assert.deepStrictEqual(w.release(100 + WARP.holdMs / 2), ['cancel']);
    assert.strictEqual(w.phase, 'ready');
  });

  it('a full hold warps once, then cools down, then is ready again', () => {
    const w = new WarpController();
    w.setAvailable(true, 0);
    w.press(1_000);
    assert.ok(w.progress(1_000 + WARP.holdMs / 2) > 0.4 && w.progress(1_000 + WARP.holdMs / 2) < 0.6);
    assert.deepStrictEqual(w.tick(1_000 + WARP.holdMs), ['warp']);
    assert.deepStrictEqual(w.release(1_000 + WARP.holdMs + 50), [], 'release after the warp started: nothing more');
    const t1 = 1_000 + WARP.holdMs + WARP.warpMs;
    assert.deepStrictEqual(w.tick(t1), ['arrived']);
    assert.deepStrictEqual(w.press(t1 + 10), [], 'no warp during the cooldown');
    assert.strictEqual(w.cooldownLeft(t1 + 10), Math.ceil(WARP.cooldownMs / 1000));
    assert.deepStrictEqual(w.tick(t1 + WARP.cooldownMs), ['ready']);
  });

  it('a long frame still emits every step in order; leaving the portal cancels a charge', () => {
    const w = new WarpController();
    w.setAvailable(true, 0);
    w.press(0);
    assert.deepStrictEqual(w.tick(WARP.holdMs + WARP.warpMs + 5), ['warp', 'arrived']);
    const v = new WarpController();
    v.setAvailable(true, 0);
    v.press(0);
    assert.deepStrictEqual(v.setAvailable(false, 100), ['cancel']);
    assert.strictEqual(v.phase, 'locked');
    // Cooldown ends while away from the portal → locked, not ready.
    const c = new WarpController();
    c.setAvailable(true, 0);
    c.press(0);
    c.tick(WARP.holdMs + WARP.warpMs);
    c.setAvailable(false, WARP.holdMs + WARP.warpMs + 1);
    assert.deepStrictEqual(c.tick(WARP.holdMs + WARP.warpMs + WARP.cooldownMs), []);
    assert.strictEqual(c.phase, 'locked');
  });
});

describe('keyboard + joystick + jump button', () => {
  it('merges, normalises diagonals, jump is a single edge, blur releases keys', () => {
    const m = new MoveInputMixer();
    assert.ok(m.key('KeyW', true));
    assert.ok(m.key('KeyD', true));
    assert.strictEqual(m.key('KeyQ', true), false, 'not a game key');
    const diag = m.read();
    assert.ok(near(Math.hypot(diag.x, diag.y), 1));
    m.key('Space', true);
    assert.strictEqual(m.read().jump, true);
    m.key('Space', true); // key repeat while held
    assert.strictEqual(m.read().jump, false, 'held space = one jump');
    m.jump();
    assert.strictEqual(m.read().jump, true, 'on-screen button');
    m.clear();
    const idle = m.read();
    assert.deepStrictEqual([idle.x, idle.y, idle.jump], [0, 0, false]);
    m.stick = joystickVector(0, -JOYSTICK.radius);
    assert.ok(near(m.read().y, 1));
  });
});
