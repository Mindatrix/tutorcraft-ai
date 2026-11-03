import { describe, it, before } from 'node:test';
import * as assert from 'node:assert';
import { KID_MOTION, yawDelta, cameraRelative, initialMotion, motionClip, stepMotion } from '../src/engine/characterMotion';
import { createPhysicsWorld, loadRapier, MAX_SUBSTEPS, type Rapier } from '../src/components/modes/three/physics/rapierWorld';
import { createCharacter } from '../src/components/modes/three/physics/characterController';

// Đại phẫu: player movement on Rapier (instead of Ecctrl, which needs React Three Fiber).

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

describe('characterMotion (pure)', () => {
  it('joystick is relative to the camera and never longer than 1', () => {
    const f = cameraRelative(0, 1, 0);
    assert.ok(near(f.dx, 0) && near(f.dz, -1), 'forward = −Z at yaw 0');
    const r = cameraRelative(1, 0, 0);
    assert.ok(near(r.dx, 1) && near(r.dz, 0), 'right = +X');
    const turned = cameraRelative(0, 1, Math.PI / 2);
    assert.ok(near(turned.dx, -1) && near(turned.dz, 0), 'camera turned left: forward = −X');
    const d = cameraRelative(1, 1, 0);
    assert.ok(near(Math.hypot(d.dx, d.dz), 1));
    assert.ok(near(yawDelta(3, -3), 2 * Math.PI - 6));
  });

  it('jumps on the ground, within coyote time after an edge, and from a buffered press', () => {
    const h = 1 / 60;
    const ground = stepMotion(initialMotion(), { x: 0, y: 0, jump: true }, 0, h, true);
    assert.ok(ground.vy > 0 && ground.jumping);
    // Walked off an edge 0.1 s ago (< 0.12 s coyote): still jumps.
    const coyote = stepMotion({ ...initialMotion(), airTime: 0.1 - h }, { x: 0, y: 0, jump: true }, 0, h, false);
    assert.ok(coyote.vy > 0);
    // 0.2 s off the edge: no jump, keeps falling.
    const late = stepMotion({ ...initialMotion(), airTime: 0.2 }, { x: 0, y: 0, jump: true }, 0, h, false);
    assert.ok(late.vy < 0);
    // Pressed in the air just before landing: jumps on the landing frame.
    const pressed = stepMotion({ ...initialMotion(), airTime: 0.5, vy: -5 }, { x: 0, y: 0, jump: true }, 0, h, false);
    assert.ok(pressed.jumpBuffer > 0 && pressed.vy < 0);
    const landed = stepMotion(pressed, { x: 0, y: 0, jump: false }, 0, h, true);
    assert.ok(landed.vy > 0, 'buffered jump fires on landing');
  });

  it('accelerates towards the target speed, faces the way it moves, picks the clip', () => {
    let s = { ...initialMotion(), grounded: true };
    for (let i = 0; i < 60; i++) s = stepMotion(s, { x: 1, y: 0, jump: false }, 0, 1 / 60, true);
    assert.ok(Math.abs(s.vx - KID_MOTION.walkSpeed) < 0.1);
    assert.ok(Math.abs(yawDelta(s.facing, -Math.PI / 2)) < 0.05, 'faces +X');
    assert.strictEqual(motionClip(s), 'walk');
    assert.strictEqual(motionClip({ ...s, vx: 0, vz: 0 }), 'idle');
    assert.strictEqual(motionClip({ ...s, grounded: false, vy: 3 }), 'jump');
    assert.strictEqual(stepMotion(s, { x: 0, y: 0, jump: false }, 0, 0, true), s, 'dt 0 = no change');
  });
});

describe('Rapier character (real WASM in Node)', () => {
  let R: Rapier;
  before(async () => {
    R = await loadRapier();
  });

  const run = (sec: number, fn: (h: number) => void, phys: ReturnType<typeof createPhysicsWorld>) => {
    for (let t = 0; t < sec; t += 1 / 60) phys.step(1 / 60, fn);
  };

  it('falls onto the ground and stands there', () => {
    const phys = createPhysicsWorld(R);
    phys.addGround(0);
    const c = createCharacter(phys, { position: { x: 0, y: 2, z: 0 } });
    run(1.5, (h) => c.update({ x: 0, y: 0, jump: false }, 0, h), phys);
    assert.ok(c.motion.grounded, 'grounded');
    assert.ok(Math.abs(c.position.y) < 0.1, `feet at ${c.position.y.toFixed(3)}`);
    c.dispose();
    phys.dispose();
  });

  it('walks forward, climbs a small step, is stopped by a wall', () => {
    const phys = createPhysicsWorld(R);
    phys.addGround(0);
    phys.addBox({ x: 0, y: 0.1, z: -3 }, { x: 2, y: 0.1, z: 1 }); // a 0.2 m step 2..4 m ahead
    phys.addBox({ x: 0, y: 1.5, z: -8 }, { x: 3, y: 1.5, z: 0.5 }); // a 3 m wall at 7.5 m
    const c = createCharacter(phys, { position: { x: 0, y: 0.05, z: 0 } });
    run(0.5, (h) => c.update({ x: 0, y: 0, jump: false }, 0, h), phys);
    run(1.0, (h) => c.update({ x: 0, y: 1, jump: false }, 0, h), phys);
    assert.ok(c.position.z < -2.2 && c.position.z > -4, `on the step: z=${c.position.z.toFixed(2)}`);
    assert.ok(c.position.y > 0.15, `climbed: y=${c.position.y.toFixed(2)}`);
    run(4, (h) => c.update({ x: 0, y: 1, jump: false }, 0, h), phys);
    assert.ok(c.position.z > -7.5, `wall stops it: z=${c.position.z.toFixed(2)}`);
    c.dispose();
    phys.dispose();
  });

  it('jumps about v²/2g high and lands again; teleport moves it at once', () => {
    const phys = createPhysicsWorld(R);
    phys.addGround(0);
    const c = createCharacter(phys, { position: { x: 0, y: 0.05, z: 0 } });
    run(0.5, (h) => c.update({ x: 0, y: 0, jump: false }, 0, h), phys);
    let jumped = false;
    let top = 0;
    run(1.5, (h) => {
      c.update({ x: 0, y: 0, jump: !jumped }, 0, h);
      jumped = true;
      top = Math.max(top, c.position.y);
    }, phys);
    const expected = KID_MOTION.jumpSpeed ** 2 / (2 * KID_MOTION.gravity);
    assert.ok(top > expected * 0.8 && top < expected * 1.2, `top ${top.toFixed(2)} ≈ ${expected.toFixed(2)}`);
    assert.ok(c.motion.grounded && c.position.y < 0.1, 'landed');
    c.teleport({ x: 10, y: 0, z: 5 });
    assert.deepStrictEqual(c.position, { x: 10, y: 0, z: 5 });
    assert.strictEqual(c.motion.vx, 0);
    c.dispose();
    phys.dispose();
  });

  it('a long frame never runs more than 4 fixed steps', () => {
    const phys = createPhysicsWorld(R);
    let n = 0;
    assert.strictEqual(phys.step(3, () => (n += 1)), MAX_SUBSTEPS);
    assert.strictEqual(n, MAX_SUBSTEPS);
    assert.strictEqual(phys.step(0), 0);
    phys.dispose();
  });
});
