'use client';

import { canUseWebGL } from './gfx';
import type { GfxTier } from './three/SceneRuntime';

// Three-tier renderer ladder (plan C1.3): Three.js high → Three.js low → 2D canvas. The tier a
// device ended on is remembered for the browser session, so a weak phone starts on the right one
// next time instead of stuttering for a few seconds first.

export type RenderTier = GfxTier | '2d';

const KEY = 'tc:gfx-tier';
const OLD_LITE_KEY = 'tc:gfx-lite';

export function readTier(): RenderTier {
  if (typeof window === 'undefined') return 'high';
  if (!canUseWebGL()) return '2d';
  try {
    const v = window.sessionStorage.getItem(KEY);
    if (v === 'high' || v === 'low' || v === '2d') return v;
    if (window.sessionStorage.getItem(OLD_LITE_KEY) === '1') return '2d';
  } catch {
    /* storage blocked: decide from WebGL alone */
  }
  return 'high';
}

export function saveTier(tier: RenderTier | null): void {
  try {
    if (tier) window.sessionStorage.setItem(KEY, tier);
    else window.sessionStorage.removeItem(KEY);
    window.sessionStorage.removeItem(OLD_LITE_KEY);
  } catch {
    /* ignore */
  }
}
