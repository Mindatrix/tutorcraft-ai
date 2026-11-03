// Đại phẫu (03/11/2026): the walking rules of a player character, pure and deterministic so they are
// tested without WebGL or WASM. The physics layer (components/modes/three/physics) feeds the result
// to Rapier's kinematic character controller, which resolves collisions, steps and slopes.
//
// Units: metres, seconds. +Y is up; the camera looks along −Z at yaw 0.

export interface MoveInput {
  /** Joystick / WASD: x = right, y = forward, each −1..1 (length ≤ 1). */
  x: number;
  y: number;
  /** Jump pressed this frame (edge, not held). */
  jump: boolean;
  sprint?: boolean;
}

export const NO_INPUT: MoveInput = { x: 0, y: 0, jump: false };

export interface MotionConfig {
  walkSpeed: number;
  sprintSpeed: number;
  /** How fast the horizontal speed reaches the target on the ground / in the air (1/s). */
  groundAccel: number;
  airAccel: number;
  gravity: number;
  jumpSpeed: number;
  maxFallSpeed: number;
  /** A jump still works this long after walking off an edge. */
  coyoteSec: number;
  /** A jump pressed this long before landing still happens on landing. */
  jumpBufferSec: number;
  /** Turning speed of the character's facing (rad/s). */
  turnSpeed: number;
}

/** Tuned for kids on phones: slower than a shooter, forgiving jumps. */
export const KID_MOTION: MotionConfig = {
  walkSpeed: 3.2,
  sprintSpeed: 5.2,
  groundAccel: 12,
  airAccel: 3,
  gravity: 22,
  jumpSpeed: 7.2,
  maxFallSpeed: 30,
  coyoteSec: 0.12,
  jumpBufferSec: 0.15,
  turnSpeed: 12,
};

export interface MotionState {
  /** Velocity (m/s). */
  vx: number;
  vy: number;
  vz: number;
  /** Facing yaw (rad), the direction the character model looks. */
  facing: number;
  grounded: boolean;
  /** Seconds since last on the ground (coyote time). */
  airTime: number;
  /** Seconds left of a buffered jump press. */
  jumpBuffer: number;
  jumping: boolean;
}

export const initialMotion = (facing = 0): MotionState => ({ vx: 0, vy: 0, vz: 0, facing, grounded: false, airTime: 0, jumpBuffer: 0, jumping: false });

/** Joystick vector → world direction on the ground, relative to the camera's yaw. Length kept (≤ 1). */
export function cameraRelative(x: number, y: number, cameraYaw: number): { dx: number; dz: number } {
  const len = Math.hypot(x, y);
  const k = len > 1 ? 1 / len : 1;
  const sx = x * k;
  const sy = y * k;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  // Forward (y) is −Z at yaw 0; right (x) is +X.
  return { dx: sx * cos - sy * sin, dz: -sx * sin - sy * cos };
}

/** Shortest signed angle from a to b (rad), in (−π, π]. */
export function yawDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

const approach = (v: number, target: number, rate: number, dt: number) => v + (target - v) * Math.min(1, rate * dt);

/**
 * One step of the walking rules. `grounded` comes from the physics of the previous step.
 * Returns the new state; the desired translation for this step is (vx, vy, vz) × dt.
 */
export function stepMotion(s: MotionState, input: MoveInput, cameraYaw: number, dt: number, grounded: boolean, cfg: MotionConfig = KID_MOTION): MotionState {
  if (!(dt > 0)) return s;
  const { dx, dz } = cameraRelative(input.x, input.y, cameraYaw);
  const speed = input.sprint ? cfg.sprintSpeed : cfg.walkSpeed;
  const accel = grounded ? cfg.groundAccel : cfg.airAccel;
  const vx = approach(s.vx, dx * speed, accel, dt);
  const vz = approach(s.vz, dz * speed, accel, dt);

  const airTime = grounded ? 0 : s.airTime + dt;
  let jumpBuffer = input.jump ? cfg.jumpBufferSec : Math.max(0, s.jumpBuffer - dt);
  let jumping = grounded && s.vy <= 0 ? false : s.jumping;
  let vy = grounded && s.vy <= 0 ? -1 : s.vy; // a small push keeps the controller snapped to the ground
  const canJump = !jumping && (grounded || airTime <= cfg.coyoteSec);
  if (jumpBuffer > 0 && canJump) {
    vy = cfg.jumpSpeed;
    jumping = true;
    jumpBuffer = 0;
  }
  if (!grounded || jumping) vy = Math.max(-cfg.maxFallSpeed, vy - cfg.gravity * dt);

  // Face the way we move (only when actually moving, so standing still keeps the last facing).
  let facing = s.facing;
  if (Math.hypot(dx, dz) > 0.05) {
    const target = Math.atan2(-dx, -dz);
    facing = s.facing + yawDelta(s.facing, target) * Math.min(1, cfg.turnSpeed * dt);
  }
  return { vx, vy, vz, facing, grounded, airTime, jumpBuffer, jumping };
}

/** Horizontal speed (m/s), for picking idle / walk / run animations. */
export const groundSpeed = (s: MotionState) => Math.hypot(s.vx, s.vz);

/** Animation state from motion (matches the avatar clip names). */
export function motionClip(s: MotionState, cfg: MotionConfig = KID_MOTION): 'idle' | 'walk' | 'run' | 'jump' | 'fall' {
  if (!s.grounded) return s.vy > 0 ? 'jump' : 'fall';
  const v = groundSpeed(s);
  if (v < 0.25) return 'idle';
  return v > (cfg.walkSpeed + cfg.sprintSpeed) / 2 ? 'run' : 'walk';
}
