import type * as RAPIER_NS from '@dimforge/rapier3d-compat';
import { KID_MOTION, NO_INPUT, initialMotion, motionClip, stepMotion, type MotionConfig, type MotionState, type MoveInput } from '../../../../engine/characterMotion';
import type { PhysicsWorld, Vec3 } from './rapierWorld';

// Đại phẫu (03/11/2026): the player character on Rapier's kinematic character controller — the
// same job Ecctrl does in React Three Fiber, for our imperative scenes:
//   capsule body, walks up small steps (autostep), sticks to slopes going down (snap to ground),
//   climbs slopes up to 45°, slides on steeper ones, pushes light dynamic objects, jumps with
//   coyote time and a jump buffer (engine/characterMotion.ts).
//
// Call `update(input, cameraYaw, h)` once per FIXED physics step (PhysicsWorld.step's callback),
// then read `renderPosition(alpha)` each frame to place the avatar smoothly.

export interface CharacterOptions {
  position: Vec3;
  /** Capsule: radius and half height of the cylinder part (total height = 2·(half + radius)). */
  radius?: number;
  halfHeight?: number;
  /** Steps up to this height are climbed automatically (m). */
  maxStep?: number;
  maxSlopeDeg?: number;
  motion?: MotionConfig;
  facing?: number;
}

export interface Character {
  readonly motion: MotionState;
  /** Feet position after the last fixed step. */
  readonly position: Vec3;
  /** Feet position interpolated between the last two steps (alpha from PhysicsWorld). */
  renderPosition(alpha: number): Vec3;
  readonly clip: ReturnType<typeof motionClip>;
  update(input: MoveInput, cameraYaw: number, h: number): void;
  /** Move instantly (Xuyên không / respawn): no sweep, velocity reset. */
  teleport(to: Vec3, facing?: number): void;
  dispose(): void;
}

export function createCharacter(phys: PhysicsWorld, opts: CharacterOptions): Character {
  const { R, world } = phys;
  const radius = opts.radius ?? 0.3;
  const half = opts.halfHeight ?? 0.45;
  const toCenter = half + radius; // feet → capsule centre
  const cfg = opts.motion ?? KID_MOTION;

  const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(opts.position.x, opts.position.y + toCenter, opts.position.z));
  const collider = world.createCollider(R.ColliderDesc.capsule(half, radius), body);
  const ctl: RAPIER_NS.KinematicCharacterController = world.createCharacterController(0.02);
  ctl.setUp({ x: 0, y: 1, z: 0 });
  ctl.enableAutostep(opts.maxStep ?? 0.35, 0.15, false);
  ctl.enableSnapToGround(0.3);
  ctl.setMaxSlopeClimbAngle(((opts.maxSlopeDeg ?? 45) * Math.PI) / 180);
  ctl.setMinSlopeSlideAngle(((opts.maxSlopeDeg ?? 45) * Math.PI) / 180);
  ctl.setSlideEnabled(true);
  ctl.setApplyImpulsesToDynamicBodies(true);
  ctl.setCharacterMass(35);

  let motion = initialMotion(opts.facing ?? 0);
  let prev: Vec3 = { ...opts.position };
  let cur: Vec3 = { ...opts.position };
  let disposed = false;

  return {
    get motion() {
      return motion;
    },
    get position() {
      return cur;
    },
    get clip() {
      return motionClip(motion, cfg);
    },
    renderPosition(alpha: number) {
      const a = Math.max(0, Math.min(1, alpha));
      return { x: prev.x + (cur.x - prev.x) * a, y: prev.y + (cur.y - prev.y) * a, z: prev.z + (cur.z - prev.z) * a };
    },
    update(input: MoveInput = NO_INPUT, cameraYaw: number, h: number) {
      if (disposed) return;
      motion = stepMotion(motion, input, cameraYaw, h, motion.grounded, cfg);
      ctl.computeColliderMovement(collider, { x: motion.vx * h, y: motion.vy * h, z: motion.vz * h });
      const m = ctl.computedMovement();
      const grounded = ctl.computedGrounded();
      const t = body.translation();
      body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
      // Bumping a ceiling stops the rise; landing stops the fall.
      const vy = h > 0 && motion.vy > 0 && m.y < motion.vy * h * 0.5 ? 0 : motion.vy;
      motion = { ...motion, vy: grounded && vy < 0 ? 0 : vy, grounded };
      prev = cur;
      cur = { x: t.x + m.x, y: t.y + m.y - toCenter, z: t.z + m.z };
    },
    teleport(to: Vec3, facing?: number) {
      if (disposed) return;
      body.setTranslation({ x: to.x, y: to.y + toCenter, z: to.z }, true);
      body.setNextKinematicTranslation({ x: to.x, y: to.y + toCenter, z: to.z });
      motion = { ...initialMotion(facing ?? motion.facing) };
      prev = { ...to };
      cur = { ...to };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      world.removeCharacterController(ctl);
      world.removeRigidBody(body);
    },
  };
}

/** Feet position helper for tests and debugging. */
export function characterFeet(c: Character): Vec3 {
  return { ...c.position };
}
