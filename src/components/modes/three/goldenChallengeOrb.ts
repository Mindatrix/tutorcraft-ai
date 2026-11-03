import * as THREE from 'three';
import type { QuestionSlot } from '../../../engine/questionSchedule';

// ============================================================================
// A5 — Vật phát sáng "Thử thách vàng" trong cảnh 3D (`GoldenChallengeOrb`)
// Contract: `docs/wp7_class_schedule_handoff.md`
// - Appears when `slot?.golden === true && !slot?.goldenTaken`
// - Hides when `!slot?.golden || slot?.goldenTaken === true`
// - Tapping/clicking it invokes the callback passed by Claude Code (`onTakeGolden`)
// - Never calls `/api/session/golden` directly!
// ============================================================================

export type GoldenSlotLike =
  | (Partial<Pick<QuestionSlot, 'golden'>> & { goldenTaken?: boolean })
  | null
  | undefined;

export interface GoldenChallengeUserData {
  kind: 'golden_challenge';
  active: boolean;
}

export function isGoldenChallengeVisible(slot: GoldenSlotLike): boolean {
  return Boolean(slot && slot.golden === true && !slot.goldenTaken);
}

export function isGoldenChallengeUserData(value: unknown): value is GoldenChallengeUserData {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>).kind === 'golden_challenge';
}

export interface GoldenChallengeOrbOptions {
  position?: [number, number, number];
  /** Callback supplied by parent / Claude Code when the student taps the Golden Challenge orb. */
  onTakeGolden?: () => void;
  /** Low-tier device mode: skips secondary halo ring to save draw calls. */
  lite?: boolean;
}

export interface GoldenChallengeOrbHandle {
  readonly group: THREE.Group;
  readonly hitMesh: THREE.Mesh;
  isVisible(): boolean;
  syncSlot(slot: GoldenSlotLike): boolean;
  triggerTakeGolden(): boolean;
  update(t: number): void;
  dispose(): void;
}

const sharedGoldenHits: THREE.Intersection[] = [];

/**
 * Builds the 3D glowing "Thử thách vàng" (`GoldenChallengeOrb`) artifact.
 */
export function createGoldenChallengeOrb(
  opts: GoldenChallengeOrbOptions = {},
): GoldenChallengeOrbHandle {
  const [px, py, pz] = opts.position ?? [0, 1.45, -3.2];
  const lite = Boolean(opts.lite);
  const disposables: { dispose(): void }[] = [];

  const group = new THREE.Group();
  group.name = 'GoldenChallengeOrbGroup';
  group.position.set(px, py, pz);
  group.visible = false; // Hidden until `slot.golden && !slot.goldenTaken`

  // Core radiant golden star octahedron (interactive raycast target)
  const coreGeo = new THREE.OctahedronGeometry(0.45, 1);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.15,
    roughness: 0.2,
    metalness: 0.45,
  });
  disposables.push(coreGeo, coreMat);

  const hitMesh = new THREE.Mesh(coreGeo, coreMat);
  hitMesh.name = 'GoldenChallengeHitMesh';
  const userData: GoldenChallengeUserData = {
    kind: 'golden_challenge',
    active: false,
  };
  hitMesh.userData = userData;
  group.add(hitMesh);

  // Orbiting golden halo ring
  let haloRing: THREE.Mesh | null = null;
  if (!lite) {
    const haloGeo = new THREE.TorusGeometry(0.68, 0.055, 8, 28);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.88,
      toneMapped: false,
    });
    disposables.push(haloGeo, haloMat);
    haloRing = new THREE.Mesh(haloGeo, haloMat);
    haloRing.rotation.x = Math.PI / 3;
    group.add(haloRing);
  }

  const baseY = py;
  let onTakeCallback = opts.onTakeGolden;

  return {
    group,
    hitMesh,

    isVisible() {
      return group.visible;
    },

    syncSlot(slot: GoldenSlotLike): boolean {
      const visible = isGoldenChallengeVisible(slot);
      group.visible = visible;
      userData.active = visible;
      return visible;
    },

    triggerTakeGolden(): boolean {
      if (!group.visible || !userData.active) return false;
      onTakeCallback?.();
      return true;
    },

    update(t: number) {
      if (!group.visible) return;
      group.position.y = baseY + Math.sin(t * 3.2) * 0.14;
      hitMesh.rotation.y = t * 1.9;
      hitMesh.rotation.x = Math.sin(t * 2.4) * 0.25;
      if (haloRing) {
        haloRing.rotation.z = -t * 2.4;
      }
    },

    dispose() {
      onTakeCallback = undefined;
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
}

/**
 * Raycasts against the Golden Challenge orb using a pre-allocated intersection buffer (zero per-frame heap allocation)
 * and invokes the orb's `triggerTakeGolden()` callback if hit while active.
 */
export function raycastAndTriggerGoldenOrb(
  raycaster: THREE.Raycaster,
  ndc: THREE.Vector2,
  camera: THREE.Camera,
  orb: GoldenChallengeOrbHandle | null | undefined,
): boolean {
  if (!orb || !orb.isVisible()) return false;
  raycaster.setFromCamera(ndc, camera);
  sharedGoldenHits.length = 0;
  raycaster.intersectObject(orb.group, true, sharedGoldenHits);
  if (sharedGoldenHits.length > 0) {
    return orb.triggerTakeGolden();
  }
  return false;
}
