import * as THREE from 'three';
import type { SpeechMode } from '../../../engine/pronunciation';

export const TAP_MAX_DURATION_MS = 300;
export const TAP_MAX_MOVE_PX = 8;
export const HOVER_THROTTLE_MS = 1000 / 30;
export const MAX_PHONETIC_STONES = 12;

export interface PhoneticStoneUserData {
  kind: 'phonetic_stone';
  targetId: string;
  ipa?: string;
  word: string;
  mode: SpeechMode;
  stationId?: string;
}

export function isPhoneticStoneUserData(value: unknown): value is PhoneticStoneUserData {
  if (!value || typeof value !== 'object') return false;
  const u = value as Record<string, unknown>;
  return u.kind === 'phonetic_stone' && typeof u.targetId === 'string' && typeof u.word === 'string';
}

/**
 * Walk up the parent chain from a raycast hit to the first ancestor with `userData.kind === 'phonetic_stone'`.
 */
export function findPhoneticStoneAncestor(obj: THREE.Object3D | null): THREE.Object3D | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (isPhoneticStoneUserData(cur.userData)) return cur;
    cur = cur.parent;
  }
  return null;
}

const sharedRaycastHits: THREE.Intersection[] = [];

/**
 * Raycast against `interactiveGroup.children` (recursive) and return the hit phonetic stone object.
 * Reuses caller-provided `Raycaster`, `Vector2`, and a pre-allocated `hits` buffer to avoid per-frame allocations (Blueprint §3.5).
 */
export function raycastPhoneticStones(
  raycaster: THREE.Raycaster,
  ndc: THREE.Vector2,
  camera: THREE.Camera,
  interactiveGroup: THREE.Group,
  hitsOut: THREE.Intersection[] = sharedRaycastHits,
): { stone: THREE.Object3D; userData: PhoneticStoneUserData; hit: THREE.Intersection } | null {
  if (!interactiveGroup.children.length) return null;
  raycaster.setFromCamera(ndc, camera);
  hitsOut.length = 0;
  raycaster.intersectObjects(interactiveGroup.children, true, hitsOut);
  for (let i = 0; i < hitsOut.length; i++) {
    const hit = hitsOut[i];
    const stone = findPhoneticStoneAncestor(hit.object);
    if (stone && isPhoneticStoneUserData(stone.userData)) {
      return { stone, userData: stone.userData, hit };
    }
  }
  return null;
}

export interface PointerDownState {
  x: number;
  y: number;
  t: number;
  id: number;
  cancelled: boolean;
}

/**
 * Pure tap detector (Blueprint §3.5):
 * - `pointerdown` stores `{x, y, t, id}`
 * - `pointermove` > 8 px cancels the tap (camera drag)
 * - `pointerup` within 300 ms and ≤ 8 px = valid tap
 */
export class TapGestureTracker {
  private current: PointerDownState | null = null;

  onPointerDown(x: number, y: number, t: number, id = 0): void {
    this.current = { x, y, t, id, cancelled: false };
  }

  onPointerMove(x: number, y: number, id = 0): boolean {
    if (!this.current || this.current.id !== id) return false;
    if (Math.hypot(x - this.current.x, y - this.current.y) > TAP_MAX_MOVE_PX) {
      this.current.cancelled = true;
    }
    return !this.current.cancelled;
  }

  onPointerUp(x: number, y: number, t: number, id = 0): boolean {
    const down = this.current;
    this.current = null;
    if (!down || down.id !== id || down.cancelled) return false;
    const dt = t - down.t;
    const dist = Math.hypot(x - down.x, y - down.y);
    return dt >= 0 && dt <= TAP_MAX_DURATION_MS && dist <= TAP_MAX_MOVE_PX;
  }

  cancel(): void {
    this.current = null;
  }
}
