// PR #6 integration (03/11/2026): positional sound follows the player.
//
// Web Audio places every PannerNode relative to ONE listener per AudioContext. The game's sounds all
// go through one context (src/client/sfx.ts, the 3 buses of audio.ts), so the listener is moved to
// the camera every frame: a stone's formant resonance then comes from the stone, louder as you walk
// up to it, left/right as you turn. Pure helpers (no React, no import of the audio switchboard) so
// they are tested in Node with a fake context; gameSpatialAudio.ts connects them to the real buses.

export type Vec3Tuple = [number, number, number];

export interface ListenerPose {
  position: Vec3Tuple;
  /** Unit vector the listener faces. */
  forward: Vec3Tuple;
  /** Unit up vector. */
  up: Vec3Tuple;
}

/** The parts of a three.js camera we need (matrixWorld columns: right, up, −forward, position). */
export interface CameraLike {
  updateMatrixWorld?: (force?: boolean) => void;
  matrixWorld: { elements: ArrrayLikeNumbers };
}
type ArrrayLikeNumbers = ArrayLike<number>;

const norm = (v: Vec3Tuple): Vec3Tuple => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Listener pose of a camera (world space). */
export function poseFromCamera(cam: CameraLike): ListenerPose {
  cam.updateMatrixWorld?.(false);
  const e = cam.matrixWorld.elements;
  return {
    position: [e[12], e[13], e[14]],
    forward: norm([-e[8], -e[9], -e[10]]),
    up: norm([e[4], e[5], e[6]]),
  };
}

interface ParamLike {
  value: number;
  setTargetAtTime?: (v: number, t: number, k: number) => unknown;
}

interface ListenerLike {
  positionX?: ParamLike;
  positionY?: ParamLike;
  positionZ?: ParamLike;
  forwardX?: ParamLike;
  forwardY?: ParamLike;
  forwardZ?: ParamLike;
  upX?: ParamLike;
  upY?: ParamLike;
  upZ?: ParamLike;
  setPosition?: (x: number, y: number, z: number) => void;
  setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
}

export interface ContextLike {
  currentTime: number;
  listener: ListenerLike;
}

/**
 * Move the context's listener. AudioParams are eased over `smoothSec` (no zipper noise when the
 * camera jumps); old Safari without AudioParams on the listener uses setPosition / setOrientation.
 */
export function applyListenerPose(ctx: ContextLike, pose: ListenerPose, smoothSec = 0.03): void {
  const l = ctx.listener;
  const t = ctx.currentTime;
  const set = (p: ParamLike | undefined, v: number) => {
    if (!p) return;
    if (p.setTargetAtTime && smoothSec > 0) p.setTargetAtTime(v, t, smoothSec);
    else p.value = v;
  };
  if (l.positionX && l.forwardX && l.upX) {
    set(l.positionX, pose.position[0]);
    set(l.positionY, pose.position[1]);
    set(l.positionZ, pose.position[2]);
    set(l.forwardX, pose.forward[0]);
    set(l.forwardY, pose.forward[1]);
    set(l.forwardZ, pose.forward[2]);
    set(l.upX, pose.up[0]);
    set(l.upY, pose.up[1]);
    set(l.upZ, pose.up[2]);
    return;
  }
  l.setPosition?.(pose.position[0], pose.position[1], pose.position[2]);
  l.setOrientation?.(pose.forward[0], pose.forward[1], pose.forward[2], pose.up[0], pose.up[1], pose.up[2]);
}

/** Where a scene's positional sounds go: the shared context, the effects bus, and its on/off switch. */
export interface SpatialAudioOut {
  context: BaseAudioContext;
  output: AudioNode;
  /** Effects on and the class not muted by the tutor. */
  enabled: () => boolean;
}
