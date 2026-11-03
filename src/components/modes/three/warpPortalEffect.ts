'use client';

import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { WARP } from '../../../client/spatialInput';
import type { GfxTier } from './SceneRuntime';

// ============================================================================
// A3 — Hiệu ứng "Xuyên không" (3D Swirling Portal + 0.9 s Warp Transition)
// - Duration: exactly WARP.warpMs (900 ms = 0.9 s)
// - Respects `prefers-reduced-motion`
// - Low tier (`tier === 'low'`): lightweight version without full-screen post-processing or blur
// ============================================================================

export const WARP_DURATION_MS = WARP.warpMs; // 900 ms (0.9 s)
export const WARP_DURATION_SEC = WARP.warpMs / 1000; // 0.9 s

export interface WarpPortalRigOptions {
  position: { x: number; y: number; z: number };
  tier?: GfxTier;
  golden?: boolean;
  open?: boolean;
}

export interface WarpPortalRigHandle {
  readonly group: THREE.Group;
  setHighlight(state: { golden?: boolean; open?: boolean; near?: boolean }): void;
  update(t: number, reducedMotion?: boolean): void;
  dispose(): void;
}

/**
 * Builds a glowing, swirling 3D "Xuyên không" portal that intensifies when `slot.golden` or `open`/`near` is active.
 * On `tier === 'low'`, uses a compact 2-mesh unlit rig with no extra particle rings or lights.
 */
export function createWarpPortalRig(opts: WarpPortalRigOptions): WarpPortalRigHandle {
  const tier = opts.tier ?? 'high';
  const group = new THREE.Group();
  group.name = 'WarpPortalRig';
  group.position.set(opts.position.x, opts.position.y + 1.85, opts.position.z);

  const disposables: { dispose(): void }[] = [];

  const outerGeo = new THREE.TorusGeometry(1.65, 0.14, tier === 'low' ? 6 : 12, tier === 'low' ? 24 : 44);
  const outerMat = new THREE.MeshBasicMaterial({
    color: 0xa855f7,
    toneMapped: false,
  });
  disposables.push(outerGeo, outerMat);
  const outerRing = new THREE.Mesh(outerGeo, outerMat);
  group.add(outerRing);

  const vortexGeo = new THREE.RingGeometry(0.28, 1.48, tier === 'low' ? 18 : 32);
  const vortexMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.62,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  disposables.push(vortexGeo, vortexMat);
  const vortexDisc = new THREE.Mesh(vortexGeo, vortexMat);
  vortexDisc.position.z = 0.02;
  group.add(vortexDisc);

  let innerStarRing: THREE.Mesh | null = null;
  let innerStarMat: THREE.MeshBasicMaterial | null = null;
  if (tier === 'high') {
    const starGeo = new THREE.RingGeometry(0.55, 1.15, 6);
    innerStarMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    disposables.push(starGeo, innerStarMat);
    innerStarRing = new THREE.Mesh(starGeo, innerStarMat);
    innerStarRing.position.z = 0.05;
    group.add(innerStarRing);
  }

  let isGolden = Boolean(opts.golden);
  let isOpen = opts.open ?? true;
  let isNear = false;

  const applyColors = () => {
    if (isGolden) {
      outerMat.color.setHex(0xfacc15);
      vortexMat.color.setHex(0xfef08a);
      vortexMat.opacity = isNear ? 0.92 : 0.78;
      if (innerStarMat) {
        innerStarMat.color.setHex(0xf59e0b);
        innerStarMat.opacity = 0.95;
      }
    } else if (isOpen || isNear) {
      outerMat.color.setHex(isNear ? 0x38bdf8 : 0xa855f7);
      vortexMat.color.setHex(isNear ? 0x67e8f9 : 0xc084fc);
      vortexMat.opacity = isNear ? 0.88 : 0.65;
      if (innerStarMat) {
        innerStarMat.color.setHex(isNear ? 0xfacc15 : 0x38bdf8);
        innerStarMat.opacity = isNear ? 0.9 : 0.68;
      }
    } else {
      outerMat.color.setHex(0x64748b);
      vortexMat.color.setHex(0x475569);
      vortexMat.opacity = 0.32;
      if (innerStarMat) {
        innerStarMat.opacity = 0.25;
      }
    }
  };

  applyColors();

  return {
    group,
    setHighlight(state) {
      if (state.golden !== undefined) isGolden = state.golden;
      if (state.open !== undefined) isOpen = state.open;
      if (state.near !== undefined) isNear = state.near;
      applyColors();
    },
    update(t: number, reducedMotion = false) {
      if (reducedMotion) {
        outerRing.rotation.z = 0;
        vortexDisc.scale.setScalar(1);
        return;
      }
      const speed = isGolden ? 2.4 : isNear ? 2.0 : 1.1;
      outerRing.rotation.z = t * 0.8 * speed;
      vortexDisc.rotation.z = -t * 1.65 * speed;
      const pulse = 1 + Math.sin(t * (isGolden ? 4.5 : 2.8)) * (isNear || isGolden ? 0.08 : 0.04);
      vortexDisc.scale.setScalar(pulse);
      if (innerStarRing) {
        innerStarRing.rotation.z = t * 2.2 * speed;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}

export interface WarpTransitionVisualState {
  active: boolean;
  progress: number;
  durationMs: number;
  opacity: number;
  tunnelScale: number;
  ringRotationDeg: number;
  reducedMotion: boolean;
  lite: boolean;
}

/**
 * Pure deterministic calculation of the 0.9 s (`WARP.warpMs = 900`) warp transition envelope.
 * Used by both React overlay rendering and unit tests.
 */
export function computeWarpTransitionState(opts: {
  active: boolean;
  elapsedMs: number;
  reducedMotion?: boolean;
  lite?: boolean;
  durationMs?: number;
}): WarpTransitionVisualState {
  const durationMs = opts.durationMs ?? WARP_DURATION_MS;
  const reducedMotion = Boolean(opts.reducedMotion);
  const lite = Boolean(opts.lite);

  if (!opts.active || opts.elapsedMs < 0 || opts.elapsedMs >= durationMs) {
    return {
      active: false,
      progress: opts.elapsedMs >= durationMs ? 1 : 0,
      durationMs,
      opacity: 0,
      tunnelScale: 1,
      ringRotationDeg: 0,
      reducedMotion,
      lite,
    };
  }

  const progress = Math.min(1, Math.max(0, opts.elapsedMs / durationMs));
  // Smooth bell curve peaking at 0.35 of the 0.9 s warp (right after teleport) and fading out cleanly by 0.9 s
  const envelope = Math.sin(progress * Math.PI);
  const opacity = Number((envelope * (reducedMotion ? 0.55 : lite ? 0.72 : 0.88)).toFixed(3));
  const tunnelScale = reducedMotion ? 1 : Number((0.65 + progress * 1.15).toFixed(3));
  const ringRotationDeg = reducedMotion || lite ? 0 : Math.round(progress * 240);

  return {
    active: true,
    progress: Number(progress.toFixed(3)),
    durationMs,
    opacity,
    tunnelScale,
    ringRotationDeg,
    reducedMotion,
    lite,
  };
}

export function detectPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface WarpTransitionOverlayProps {
  /** True while the 0.9 s (`WARP.warpMs`) warp is active. */
  active: boolean;
  /** Low-tier device mode: skips streak rings and uses a single cheap radial gradient (no blur / post-processing). */
  lite?: boolean;
  /** Highlight golden warp tint when `slot.golden` is active. */
  golden?: boolean;
}

/**
 * 0.9 s (`WARP.warpMs = 900`) "Xuyên không" dimensional warp transition overlay.
 * Replaces the temporary `bg-violet-200` flash in `PhysicsLab.tsx`, respects `prefers-reduced-motion`,
 * and avoids heavy full-screen filters on `lite` (`tier === 'low'`).
 */
export function WarpTransitionOverlay({
  active,
  lite = false,
  golden = false,
}: WarpTransitionOverlayProps) {
  const [reducedMotion, setReducedMotion] = useState(() => detectPrefersReducedMotion());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  if (!active) return null;

  const coreColor = golden ? 'rgba(250, 204, 21, 0.78)' : 'rgba(56, 189, 248, 0.78)';
  const edgeColor = golden ? 'rgba(168, 85, 247, 0.85)' : 'rgba(88, 28, 135, 0.88)';
  const peakOpacity = reducedMotion ? 0.55 : lite ? 0.72 : 0.92;
  const keyframesCss = `
    @keyframes tcWarpFade {
      0% { opacity: 0; }
      32% { opacity: ${peakOpacity}; }
      100% { opacity: 0; }
    }
    @keyframes tcWarpTunnel {
      0% { transform: scale(0.55) rotate(0deg); opacity: 0.95; }
      100% { transform: scale(1.85) rotate(180deg); opacity: 0; }
    }
  `;

  return React.createElement(
    'div',
    {
      'aria-hidden': 'true',
      'data-testid': 'warp-transition-overlay',
      'data-duration-ms': WARP_DURATION_MS,
      'data-lite': lite ? 'true' : 'false',
      'data-reduced-motion': reducedMotion ? 'true' : 'false',
      className:
        'pointer-events-none absolute inset-0 z-40 flex items-center justify-center overflow-hidden',
      style: {
        animation: `tcWarpFade ${WARP_DURATION_MS}ms ease-in-out forwards`,
        background: lite
          ? `radial-gradient(circle at center, ${coreColor} 0%, rgba(15, 23, 42, 0.0) 75%)`
          : `radial-gradient(circle at center, ${coreColor} 0%, ${edgeColor} 52%, rgba(9, 4, 24, 0.0) 88%)`,
      },
    },
    React.createElement('style', null, keyframesCss),
    !reducedMotion && !lite
      ? React.createElement('div', {
          className: 'h-72 w-72 rounded-full border-4 border-cyan-300/80',
          style: {
            boxShadow: golden
              ? '0 0 48px rgba(250, 204, 21, 0.85), inset 0 0 36px rgba(250, 204, 21, 0.65)'
              : '0 0 48px rgba(56, 189, 248, 0.85), inset 0 0 36px rgba(192, 132, 252, 0.65)',
            animation: `tcWarpTunnel ${WARP_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
          },
        })
      : null,
  );
}
