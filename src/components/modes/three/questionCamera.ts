'use client';

import * as THREE from 'three';
import type { RenderTier } from '../gfxTier';
import type { SceneRuntime } from './SceneRuntime';

// C4.3 the camera side of a question moment, by render tier:
//   high: glide to the asked-about object in 0.4 s and stay; the rest of the scene dims (the scene
//         keeps running behind); closing glides back while the frame shrinks into the object;
//   low:  no camera move, no 3D dimming: the frame and a CSS blur do it (cheaper);
//   2d:   no 3D at all: the frame and a CSS blur.
// The object is framed in the half of the screen the question panel leaves free (panel at the
// bottom → object in the upper part), so the frame never hides what it asks about.

export interface QuestionCamera {
  /** What the frame should do on top: dim the 3D scene itself, or blur with CSS. */
  overlay: 'light' | 'blur';
  close: () => void;
}

export function openQuestionCamera(
  rt: Pick<SceneRuntime, 'director'> | null,
  tier: RenderTier,
  target: { object: THREE.Object3D | THREE.Vector3; focus?: THREE.Object3D[]; placement?: 'bottom' | 'top' },
): QuestionCamera {
  if (!rt || tier !== 'high') return { overlay: 'blur', close: () => undefined };
  const at = (target.object as THREE.Object3D).isObject3D ? (target.object as THREE.Object3D).getWorldPosition(new THREE.Vector3()) : (target.object as THREE.Vector3).clone();
  // The director looks 0.9 m above its anchor: aim below the object to lift it into the free half.
  const lift = target.placement === 'top' ? -0.4 : 1.6;
  const anchor = at.clone().setY(at.y - lift);
  void rt.director.dollyTo(anchor, { duration: 0.4, hold: Infinity, distance: 3.4, height: 1.2 + lift });
  if (target.focus?.length) rt.director.focus(target.focus, 0.5);
  let closed = false;
  return {
    overlay: 'light',
    close() {
      if (closed) return;
      closed = true;
      rt.director.dollyBack();
      rt.director.clearFocus();
    },
  };
}
