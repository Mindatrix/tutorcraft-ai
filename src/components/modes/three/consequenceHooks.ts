'use client';

import * as THREE from 'three';
import { standardConsequences, type ConsequenceEvent, type ConsequencePlan, type ConsequenceSystem } from '../../../engine';
import { playQuestionSfx } from '../../../client/questionSfx';
import { textSprite } from '../kit';
import type { Avatar } from './avatar';
import { playEffect } from './director';
import type { Effects } from './effects';
import type { SceneRuntime } from './SceneRuntime';

// C4.13 the standard hooks in a 3D scene: every game's onCorrect / onWrong / onWrongStreak /
// recover play the plan from the content (effect, camera move, the avatar's six states, sound),
// put the caption and — after a wrong answer — the right answer on a sign next to the object for
// ~1.5 s. Games of phase D/E register their own hooks on top (C4.15) with the same contract.

export interface SceneConsequenceCtx {
  rt: Pick<SceneRuntime, 'director' | 'scene'>;
  effects: Effects;
  /** Where it happens (the asked-about object). */
  at: THREE.Vector3;
  avatar?: Pick<Avatar, 'setState'> | null;
  sound?: boolean;
  /** 2D / HUD caption, when the game shows text outside the scene. */
  onCaption?: (text: string, plan: ConsequencePlan) => void;
}

/** One plan, played in the scene. Resolves after its duration (the game does not wait for it). */
export async function runScenePlan(plan: ConsequencePlan, _e: ConsequenceEvent, ctx: SceneConsequenceCtx): Promise<void> {
  playEffect(ctx.effects, plan.effect, ctx.at);
  if (ctx.sound !== false) playQuestionSfx(plan.sfx);
  const [first, then] = plan.avatar;
  if (ctx.avatar && first) ctx.avatar.setState(first);
  const later = ctx.avatar && then ? setTimeout(() => ctx.avatar?.setState(then), 500) : null;
  ctx.onCaption?.(plan.caption, plan);
  const signs: THREE.Sprite[] = [];
  if (plan.sign) {
    const s = textSprite(plan.sign.text, { bg: '#f4d39b', color: '#3b2410', border: '#8a5a2b', height: 0.5 });
    s.position.copy(ctx.at).add(new THREE.Vector3(0, 2.1, 0));
    ctx.rt.scene.add(s);
    signs.push(s);
  }
  const cam = plan.camera ? ctx.rt.director.cameraMove(plan.camera, ctx.at) : Promise.resolve();
  await Promise.all([cam, new Promise((r) => setTimeout(r, plan.durationMs))]);
  if (later) clearTimeout(later);
  for (const s of signs) {
    ctx.rt.scene.remove(s);
    s.material.map?.dispose();
    s.material.dispose();
  }
}

/** All six games on the standard scene hooks. */
export function createSceneConsequences(): ConsequenceSystem<SceneConsequenceCtx> {
  return standardConsequences<SceneConsequenceCtx>(runScenePlan);
}
