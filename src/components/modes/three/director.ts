'use client';

import * as THREE from 'three';
import { effectRecipe, type EffectRecipe } from '../../../engine';
import type { Effects } from './effects';
import type { SceneRuntime } from './SceneRuntime';
import { AVATAR_STATES, type AvatarState } from './avatar';

// Plays one outcome of content/consequences_v2.json in a 3D scene (groundwork for C4):
//   { effect: "food_burnt_smoke", camera: "zoom_grill", avatarAnim: "sad", durationMs: 1500 }
// → the effect's recipe (engine/director.ts) on the Effects system, the camera move on the
// runtime's director (anchors such as "grill" are registered by the scene with setAnchor), and the
// avatar state. Sounds and captions stay with the game's UI layer.

export interface Outcome {
  effect?: string;
  camera?: string;
  avatarAnim?: string;
  durationMs?: number;
}

interface Animated {
  setState: (s: AvatarState) => void;
}

/** Play a named effect at a point; returns the recipe used. */
export function playEffect(effects: Effects, name: string, at: THREE.Vector3): EffectRecipe {
  const r = effectRecipe(name);
  effects.play(r, at);
  return r;
}

/** Effect + camera move + avatar state together. Resolves when the camera is back (or right away). */
export function playOutcome(rt: Pick<SceneRuntime, 'director'>, effects: Effects, o: Outcome, at: THREE.Vector3, avatar?: Animated | null): Promise<void> {
  if (o.effect) playEffect(effects, o.effect, at);
  if (avatar && o.avatarAnim && (AVATAR_STATES as string[]).includes(o.avatarAnim)) avatar.setState(o.avatarAnim as AvatarState);
  return o.camera ? rt.director.cameraMove(o.camera, at) : Promise.resolve();
}
