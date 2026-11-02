import * as THREE from 'three';
import type {
  PetState,
  PhoneticStoneStateMachine,
  PhoneticStoneTarget,
  PhoneticWorldId,
} from '../../../client/phoneticStones';
import {
  CAMP_STATION_LAYOUT,
  FISHING_DOCK_SPECS,
  type FishingWeightMultiplier,
} from '../../../client/phoneticWorldRules';
import type { CameraDirector } from './cameraDirector';
import { damp, glow, lowpoly, mesh, roughen, textSprite, toon } from '../kit';
import {
  findPhoneticStoneAncestor,
  HOVER_THROTTLE_MS,
  isPhoneticStoneUserData,
  MAX_PHONETIC_STONES,
  raycastPhoneticStones,
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVE_PX,
  TapGestureTracker,
  type PhoneticStoneUserData,
  type PointerDownState,
} from './phoneticStoneRaycaster';

export {
  findPhoneticStoneAncestor,
  HOVER_THROTTLE_MS,
  isPhoneticStoneUserData,
  MAX_PHONETIC_STONES,
  raycastPhoneticStones,
  TAP_MAX_DURATION_MS,
  TAP_MAX_MOVE_PX,
  TapGestureTracker,
  type PhoneticStoneUserData,
  type PointerDownState,
};

interface StoneVisual {
  root: THREE.Group;
  body: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  runeRing: THREE.Mesh;
  runeMat: THREE.MeshBasicMaterial;
  starMeshes: THREE.Mesh[];
  baseY: number;
  target: PhoneticStoneTarget;
}

interface PetVisual {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  earL: THREE.Mesh;
  earR: THREE.Mesh;
  mouthRing: THREE.Mesh;
  mouthMat: THREE.MeshBasicMaterial;
  listenHalo: THREE.Mesh;
  listenMat: THREE.MeshBasicMaterial;
  celebrateRing: THREE.Mesh;
  celebrateMat: THREE.MeshBasicMaterial;
}

interface CampPropsVisual {
  group: THREE.Group;
  flame: THREE.Mesh;
  flagBanner: THREE.Mesh;
  flagMat: THREE.MeshStandardMaterial;
  boardFill: THREE.Mesh;
}

interface FishingPropsVisual {
  group: THREE.Group;
  rodPivot: THREE.Group;
  bobber: THREE.Mesh;
  leapFish: THREE.Group;
  rippleRing: THREE.Mesh;
  rippleMat: THREE.MeshBasicMaterial;
}

function buildPetCompanion(): PetVisual {
  const root = new THREE.Group();
  root.name = 'phonetic-pet-companion';

  const body = new THREE.Group();
  body.position.y = 0.65;
  root.add(body);

  const furMat = toon(0xfb923c, 0x3b1504, 0.35);
  const bellyMat = toon(0xfff7e0, 0x261c08, 0.2);
  const darkMat = toon(0x1b1448);

  const torso = mesh(
    roughen(new THREE.CylinderGeometry(0.32, 0.42, 0.72, 10, 2), 0.02, 11),
    furMat,
    [0, 0, 0],
  );
  torso.castShadow = true;
  body.add(torso);

  const belly = mesh(new THREE.SphereGeometry(0.28, 10, 8), bellyMat, [0, -0.02, 0.16]);
  belly.scale.set(0.85, 1.05, 0.45);
  body.add(belly);

  const head = new THREE.Group();
  head.position.set(0, 0.56, 0.04);
  body.add(head);

  const skull = mesh(roughen(new THREE.SphereGeometry(0.36, 12, 10), 0.015, 19), furMat);
  skull.scale.set(1.08, 0.96, 1);
  skull.castShadow = true;
  head.add(skull);

  for (const sx of [-0.14, 0.14]) {
    const eye = mesh(new THREE.SphereGeometry(0.055, 8, 8), darkMat, [sx, 0.05, 0.31]);
    const shine = mesh(new THREE.SphereGeometry(0.02, 6, 6), glow(0xffffff), [sx + 0.018, 0.07, 0.35]);
    head.add(eye, shine);
  }

  const earGeo = new THREE.ConeGeometry(0.13, 0.34, 6);
  const earL = mesh(earGeo, furMat, [-0.22, 0.34, 0]);
  earL.rotation.z = 0.25;
  const earR = mesh(earGeo, furMat, [0.22, 0.34, 0]);
  earR.rotation.z = -0.25;
  head.add(earL, earR);

  const mouthMat = glow(0xfcd34d, 0.9, true);
  const mouthRing = mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 20), mouthMat, [0, -0.09, 0.34]);
  head.add(mouthRing);

  const listenMat = glow(0x5eead4, 0, true);
  const listenHalo = mesh(new THREE.RingGeometry(0.62, 0.76, 32), listenMat, [0, 0.08, 0]);
  listenHalo.rotation.x = -Math.PI / 2;
  root.add(listenHalo);

  const celebrateMat = glow(0xfcd34d, 0, true);
  const celebrateRing = mesh(new THREE.RingGeometry(0.75, 0.95, 36), celebrateMat, [0, 0.12, 0]);
  celebrateRing.rotation.x = -Math.PI / 2;
  root.add(celebrateRing);

  return {
    root,
    body,
    head,
    earL,
    earR,
    mouthRing,
    mouthMat,
    listenHalo,
    listenMat,
    celebrateRing,
    celebrateMat,
  };
}

/**
 * Builds the 3D Summer Camp hub station props:
 * - Tent station (left-back), Kitchen/grill station (right-back),
 *   Water station (left-front), Firewood & Quest Board + Flagpole (right-front/centre).
 */
function buildSummerCampStations(): CampPropsVisual {
  const group = new THREE.Group();
  group.name = 'summer-camp-stations';

  const woodMat = lowpoly(0x6b4423, { rough: 0.9 });
  const tentMat = lowpoly(0xf59e0b, { rough: 0.75 });
  const metalMat = lowpoly(0x334155, { rough: 0.4, metal: 0.5 });
  const waterMat = lowpoly(0x38bdf8, { rough: 0.3, emissive: 0x0284c7, glow: 0.3 });

  // 1. Tent station (-5.2, 0, -3.2)
  const tentGroup = new THREE.Group();
  tentGroup.position.set(-5.2, 0, -3.2);
  const tentBody = mesh(new THREE.ConeGeometry(1.55, 1.9, 4), tentMat, [0, 0.95, 0]);
  tentBody.rotation.y = Math.PI / 4;
  tentBody.castShadow = true;
  tentGroup.add(tentBody);
  if (typeof document !== 'undefined') {
    const lbl = textSprite('⛺ Trạm Lều', { bg: 'rgba(27,20,72,0.85)', color: '#fcd34d', height: 0.32 });
    lbl.position.set(0, 2.25, 0);
    tentGroup.add(lbl);
  }
  group.add(tentGroup);

  // 2. Kitchen / grill station (5.2, 0, -3.0)
  const kitchenGroup = new THREE.Group();
  kitchenGroup.position.set(5.2, 0, -3.0);
  const table = mesh(new THREE.BoxGeometry(1.6, 0.72, 0.95), woodMat, [-0.5, 0.36, 0]);
  table.castShadow = true;
  const grillBowl = mesh(new THREE.CylinderGeometry(0.45, 0.38, 0.35, 12), metalMat, [0.75, 0.65, 0]);
  const embers = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12), glow(0xf97316, 0.9, true), [0.75, 0.84, 0]);
  kitchenGroup.add(table, grillBowl, embers);
  if (typeof document !== 'undefined') {
    const lbl = textSprite('🍳 Trạm Bếp & Nướng', { bg: 'rgba(27,20,72,0.85)', color: '#fb923c', height: 0.32 });
    lbl.position.set(0, 1.85, 0);
    kitchenGroup.add(lbl);
  }
  group.add(kitchenGroup);

  // 3. Water & First-aid station (-4.2, 0, 1.8)
  const waterGroup = new THREE.Group();
  waterGroup.position.set(-4.2, 0, 1.8);
  const tank = mesh(new THREE.CylinderGeometry(0.48, 0.52, 1.05, 12), waterMat, [0, 0.52, 0]);
  const crate = mesh(new THREE.BoxGeometry(0.65, 0.45, 0.5), lowpoly(0xfef3c7), [0.8, 0.22, 0.1]);
  waterGroup.add(tank, crate);
  if (typeof document !== 'undefined') {
    const lbl = textSprite('💧 Trạm Nước & Kho', { bg: 'rgba(27,20,72,0.85)', color: '#7dd3fc', height: 0.32 });
    lbl.position.set(0, 1.75, 0);
    waterGroup.add(lbl);
  }
  group.add(waterGroup);

  // 4. Central Campfire + Quest Board + Tent Flagpole
  const firePit = mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.22, 12), lowpoly(0x475569), [0, 0.11, -1.5]);
  const flame = mesh(new THREE.ConeGeometry(0.45, 1.05, 7), glow(0xfb923c, 0.92, true), [0, 0.65, -1.5]);
  group.add(firePit, flame);

  const boardGroup = new THREE.Group();
  boardGroup.position.set(4.3, 0, 1.6);
  boardGroup.rotation.y = -0.35;
  const postL = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), woodMat, [-0.85, 1.1, 0]);
  const postR = mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), woodMat, [0.85, 1.1, 0]);
  const boardBack = mesh(new THREE.BoxGeometry(1.85, 1.15, 0.12), woodMat, [0, 1.45, 0]);
  const boardFill = mesh(
    new THREE.BoxGeometry(1.6, 0.18, 0.16),
    glow(0x34d399, 0.9),
    [0, 1.05, 0.04],
  );
  boardFill.scale.x = 0.08;
  boardGroup.add(postL, postR, boardBack, boardFill);

  // Tent Flagpole next to Quest Board
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 8), metalMat, [1.35, 1.7, 0]);
  const flagMat = lowpoly(0xfcd34d, { emissive: 0xb45309, glow: 0.7 });
  const flagBanner = mesh(new THREE.BoxGeometry(0.95, 0.52, 0.04), flagMat, [1.82, 1.2, 0]);
  boardGroup.add(pole, flagBanner);

  if (typeof document !== 'undefined') {
    const lbl = textSprite('📋 Bảng Nhiệm Vụ Trại', { bg: 'rgba(27,20,72,0.9)', color: '#6ee7b7', height: 0.34 });
    lbl.position.set(0, 2.35, 0);
    boardGroup.add(lbl);
  }
  group.add(boardGroup);

  return { group, flame, flagBanner, flagMat, boardFill };
}

/**
 * Builds the 3D Wooden Fishing Dock before the casting point (`river_fishing`).
 */
function buildFishingDockProps(): FishingPropsVisual {
  const group = new THREE.Group();
  group.name = 'river-fishing-dock';

  const plankMat = lowpoly(0x7c4a21, { rough: 0.88 });
  const postMat = lowpoly(0x4a2c11, { rough: 0.92 });

  // Wooden pier extending from z = +3.2 toward casting point at z = -2.4
  for (let i = 0; i < 12; i++) {
    const z = 3.0 - i * 0.48;
    const plank = mesh(new THREE.BoxGeometry(3.8, 0.14, 0.42), plankMat, [0, 0.28, z]);
    plank.receiveShadow = true;
    plank.castShadow = true;
    group.add(plank);
  }

  for (const x of [-1.75, 1.75]) {
    for (const z of [2.6, 0.2, -2.2]) {
      const piling = mesh(new THREE.CylinderGeometry(0.14, 0.16, 1.4, 8), postMat, [x, 0.2, z]);
      piling.castShadow = true;
      group.add(piling);
    }
  }

  // Casting point ring at the tip of the wooden dock (z = -2.3)
  const castZone = mesh(
    new THREE.RingGeometry(0.55, 0.72, 28),
    glow(0xfcd34d, 0.8, true),
    [0, 0.37, -2.25],
  );
  castZone.rotation.x = -Math.PI / 2;
  group.add(castZone);

  if (typeof document !== 'undefined') {
    const lbl = textSprite('🎣 Điểm Quăng Cần (Đọc tên cá trên Đá Bến Gỗ trước)', {
      bg: 'rgba(11,11,46,0.9)',
      color: '#fcd34d',
      height: 0.34,
    });
    lbl.position.set(0, 2.25, -2.25);
    group.add(lbl);
  }

  // Fishing rod at the dock tip
  const rodPivot = new THREE.Group();
  rodPivot.position.set(0.65, 0.85, -2.15);
  rodPivot.rotation.x = 0.55;
  const rodPole = mesh(
    new THREE.CylinderGeometry(0.02, 0.055, 2.4, 8),
    lowpoly(0xf59e0b, { metal: 0.35, rough: 0.4 }),
    [0, 1.1, -0.4],
  );
  rodPole.rotation.x = -0.45;
  rodPivot.add(rodPole);
  group.add(rodPivot);

  // Bobber & ripple out in the river water (z = -4.6)
  const bobber = mesh(
    new THREE.SphereGeometry(0.16, 10, 10),
    glow(0xfb7185, 0.95),
    [0, 0.08, -4.6],
  );
  group.add(bobber);

  const rippleMat = glow(0x7dd3fc, 0.55, true);
  const rippleRing = mesh(new THREE.RingGeometry(0.35, 0.48, 28), rippleMat, [0, 0.03, -4.6]);
  rippleRing.rotation.x = -Math.PI / 2;
  group.add(rippleRing);

  // Leaping 3D fish for catch animation
  const leapFish = new THREE.Group();
  leapFish.position.set(0, -1.2, -4.6);
  const fishBody = mesh(
    new THREE.ConeGeometry(0.26, 0.85, 8),
    lowpoly(0x38bdf8, { emissive: 0x0284c7, glow: 0.45 }),
    [0, 0, 0],
  );
  fishBody.rotation.z = Math.PI / 2;
  const fishTail = mesh(
    new THREE.ConeGeometry(0.22, 0.32, 3),
    lowpoly(0xfcd34d),
    [-0.48, 0, 0],
  );
  fishTail.rotation.z = -Math.PI / 2;
  leapFish.add(fishBody, fishTail);
  group.add(leapFish);

  return { group, rodPivot, bobber, leapFish, rippleRing, rippleMat };
}

export interface PhoneticStonesRigOptions {
  targets: PhoneticStoneTarget[];
  machine: PhoneticStoneStateMachine;
  director?: CameraDirector;
  radius?: number;
  center?: [number, number, number];
  /** World-specific station & prop layout ('summer_camp' | 'river_fishing'). */
  worldMode?: PhoneticWorldId | 'hub';
  /** Returns true when a QuestionFrame modal is open or match is paused (ignores taps). */
  isBlocked?: () => boolean;
}

export interface PhoneticStonesRig {
  /** Group holding only interactive phonetic stones (passed to Raycaster, ≤ 12 stones). */
  interactiveGroup: THREE.Group;
  /** Root group containing `interactiveGroup`, the 3D Pet companion, and world station props. */
  rootGroup: THREE.Group;
  petGroup: THREE.Group;
  /** Attach pointer and keyboard listeners to a WebGL canvas. */
  attachCanvas(canvas: HTMLElement): () => void;
  /** Update stone, Pet, and station animations in the scene loop (zero per-frame allocations). */
  update(dt: number, elapsedSec: number): void;
  /** Rebuild stones when targets change. */
  setTargets(targets: PhoneticStoneTarget[]): void;
  /** Update 3D Summer Camp Quest Board progress (0..1) and flagpole height. */
  setCampQuestProgress(progressRatio: number, flagUnlocked: boolean): void;
  /** Trigger 3D fishing rod cast & leaping fish animation with catch weight multiplier. */
  triggerFishingCast(multiplier: FishingWeightMultiplier): void;
  dispose(): void;
}

function resolveStonePosition(
  target: PhoneticStoneTarget,
  idx: number,
  count: number,
  radius: number,
  worldMode: PhoneticWorldId | 'hub',
): [number, number, number] {
  if (worldMode === 'summer_camp') {
    const stationMatch = CAMP_STATION_LAYOUT.find(
      (s) => s.targetId === target.targetId || s.stationId === target.stationId,
    );
    if (stationMatch) {
      // If multiple targets share the firewood/quest board station, offset slightly
      const extraX = target.kind === 'sentence' ? 1.25 : 0;
      return [
        stationMatch.offset[0] + extraX,
        stationMatch.offset[1],
        stationMatch.offset[2],
      ];
    }
  } else if (worldMode === 'river_fishing') {
    const dockMatch = FISHING_DOCK_SPECS.find((s) => s.targetId === target.targetId);
    if (dockMatch) {
      return dockMatch.dockOffset;
    }
    const row = Math.floor(idx / 2);
    const side = idx % 2 === 0 ? -1.35 : 1.35;
    return [side, 0.35, 1.8 - row * 2.2];
  }

  const angle =
    count === 1
      ? 0
      : -Math.PI * 0.62 + (idx / (count - 1)) * (Math.PI * 1.24);
  return [Math.sin(angle) * radius, 0, -Math.cos(angle) * radius * 0.82];
}

export function createPhoneticStonesRig(opts: PhoneticStonesRigOptions): PhoneticStonesRig {
  const { machine, director } = opts;
  const radius = opts.radius ?? 4.2;
  const worldMode = opts.worldMode ?? 'hub';
  const [cx, cy, cz] = opts.center ?? [0, 0, 0];

  const rootGroup = new THREE.Group();
  rootGroup.name = 'phonetic-stones-root';
  rootGroup.position.set(cx, cy, cz);

  const interactiveGroup = new THREE.Group();
  interactiveGroup.name = 'interactiveGroup';
  rootGroup.add(interactiveGroup);

  const pet = buildPetCompanion();
  if (worldMode === 'river_fishing') {
    // Pet stands beside the casting point on the wooden dock
    pet.root.position.set(-0.75, 0.35, -1.9);
  } else {
    pet.root.position.set(0, 0, -0.35);
  }
  rootGroup.add(pet.root);

  let campProps: CampPropsVisual | null = null;
  let fishingProps: FishingPropsVisual | null = null;
  if (worldMode === 'summer_camp') {
    campProps = buildSummerCampStations();
    rootGroup.add(campProps.group);
  } else if (worldMode === 'river_fishing') {
    fishingProps = buildFishingDockProps();
    rootGroup.add(fishingProps.group);
  }

  const stones = new Map<string, StoneVisual>();
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const tapTracker = new TapGestureTracker();

  let hoveredId: string | null = null;
  let selectedId: string | null = null;
  let petState: PetState = 'idle';
  let petHint: 'mouth_shape' | undefined;
  let campProgressRatio = 0;
  let campFlagUnlocked = false;
  let castAnimUntil = 0;
  let castClock = 0;
  let castScale = 1.0;

  const clearStones = () => {
    for (const v of stones.values()) {
      v.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        for (const mat of mats) mat.dispose();
      });
      v.root.removeFromParent();
    }
    stones.clear();
  };

  const buildStones = (list: PhoneticStoneTarget[]) => {
    clearStones();
    const capped = list.slice(0, MAX_PHONETIC_STONES);
    const count = Math.max(1, capped.length);

    capped.forEach((target, idx) => {
      const [x, y, z] = resolveStonePosition(target, idx, count, radius, worldMode);

      const userData: PhoneticStoneUserData = {
        kind: 'phonetic_stone',
        targetId: target.targetId,
        ...(target.ipa ? { ipa: target.ipa } : {}),
        word: target.text,
        mode: target.modes[0] ?? 'shadow',
        ...(target.stationId ? { stationId: target.stationId } : {}),
      };

      const stoneRoot = new THREE.Group();
      stoneRoot.name = `phonetic-stone-${target.targetId}`;
      stoneRoot.position.set(x, y, z);
      stoneRoot.userData = userData;

      const pedestalMat = lowpoly(0x1e293b, { rough: 0.9 });
      const pedestal = mesh(
        roughen(new THREE.CylinderGeometry(0.68, 0.82, 0.24, 8, 1), 0.02, idx + 1),
        pedestalMat,
        [0, 0.12, 0],
      );
      pedestal.receiveShadow = true;
      pedestal.userData = userData;
      stoneRoot.add(pedestal);

      const bodyMat = lowpoly(0x64748b, {
        rough: 0.55,
        metal: 0.12,
        emissive: 0x0f172a,
        glow: 0.4,
      });
      const body = mesh(
        roughen(new THREE.DodecahedronGeometry(0.58, 1), 0.04, idx + 31),
        bodyMat,
        [0, 0.76, 0],
      );
      body.scale.set(0.88, 1.38, 0.72);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData = userData;
      stoneRoot.add(body);

      const runeMat = glow(0x38bdf8, 0.45, true);
      const runeRing = mesh(new THREE.RingGeometry(0.74, 0.88, 28), runeMat, [0, 0.04, 0]);
      runeRing.rotation.x = -Math.PI / 2;
      runeRing.userData = userData;
      stoneRoot.add(runeRing);

      const starMeshes: THREE.Mesh[] = [];
      for (let s = 0; s < 3; s++) {
        const starMat = lowpoly(0x334155, { emissive: 0x000000, glow: 0.8 });
        const star = mesh(
          new THREE.OctahedronGeometry(0.11, 0),
          starMat,
          [(s - 1) * 0.28, 1.68 + (s === 1 ? 0.08 : 0), 0],
        );
        star.userData = userData;
        stoneRoot.add(star);
        starMeshes.push(star);
      }

      if (typeof document !== 'undefined') {
        const shortWord =
          target.text.length > 18 ? `${target.text.slice(0, 17)}…` : target.text;
        const label = textSprite(
          target.ipa ? `${shortWord} ${target.ipa}` : shortWord,
          {
            color: '#fff7e0',
            bg: 'rgba(11, 11, 46, 0.88)',
            border: '#fcd34d',
            height: 0.34,
          },
        );
        label.position.set(0, 2.08, 0);
        label.userData = userData;
        stoneRoot.add(label);
      }

      interactiveGroup.add(stoneRoot);
      director?.setAnchor(`stone:${target.targetId}`, stoneRoot);
      stones.set(target.targetId, {
        root: stoneRoot,
        body,
        bodyMat,
        runeRing,
        runeMat,
        starMeshes,
        baseY: 0.76,
        target,
      });
    });
  };

  buildStones(opts.targets);

  const syncStoneVisuals = () => {
    const snap = machine.getSnapshot();
    hoveredId = snap.hoveredTargetId;
    selectedId = snap.selectedTargetId;
    petState = snap.petState;
    petHint = snap.petHint;

    for (const [id, v] of stones.entries()) {
      const prog = snap.progressByTarget[id];
      const isSelected = id === selectedId;
      const isHovered = id === hoveredId;
      const isPassed = !!prog?.passed;
      const stars = prog?.bestStars ?? 0;

      if (isPassed) {
        v.bodyMat.color.setHex(stars >= 3 ? 0xfcd34d : 0x34d399);
        v.bodyMat.emissive.setHex(stars >= 3 ? 0xb45309 : 0x065f46);
        v.bodyMat.emissiveIntensity = isSelected ? 1.15 : 0.75;
        v.runeMat.color.setHex(stars >= 3 ? 0xfcd34d : 0x6ee7b7);
        v.runeMat.opacity = isSelected || isHovered ? 0.95 : 0.65;
      } else if (isSelected) {
        v.bodyMat.color.setHex(0x7dd3fc);
        v.bodyMat.emissive.setHex(0x0284c7);
        v.bodyMat.emissiveIntensity = 1.1;
        v.runeMat.color.setHex(0xfcd34d);
        v.runeMat.opacity = 0.95;
      } else if (isHovered) {
        v.bodyMat.color.setHex(0x94a3b8);
        v.bodyMat.emissive.setHex(0x38bdf8);
        v.bodyMat.emissiveIntensity = 0.8;
        v.runeMat.color.setHex(0x7dd3fc);
        v.runeMat.opacity = 0.85;
      } else {
        v.bodyMat.color.setHex(0x64748b);
        v.bodyMat.emissive.setHex(0x0f172a);
        v.bodyMat.emissiveIntensity = 0.35;
        v.runeMat.color.setHex(0x38bdf8);
        v.runeMat.opacity = 0.4;
      }

      v.starMeshes.forEach((starMesh, idx) => {
        const mat = starMesh.material as THREE.MeshStandardMaterial;
        const lit = idx < stars;
        mat.color.setHex(lit ? 0xfcd34d : 0x334155);
        mat.emissive.setHex(lit ? 0xf59e0b : 0x000000);
        mat.emissiveIntensity = lit ? 1.1 : 0.2;
      });
    }
  };

  const unsubSelect = machine.bus.on('stone:select', ({ targetId }) => {
    syncStoneVisuals();
    const v = stones.get(targetId);
    if (v && director) {
      director.focus([v.root, pet.root], 0.42);
      void director.dollyTo(v.root, { duration: 0.4, hold: Infinity, distance: 3.6, height: 1.5 });
    }
  });

  const unsubHover = machine.bus.on('stone:hover', () => {
    syncStoneVisuals();
  });

  const unsubResult = machine.bus.on('stone:result', () => {
    syncStoneVisuals();
  });

  const unsubPet = machine.bus.on('pet:state', ({ state, hint }) => {
    petState = state;
    petHint = hint;
  });

  const unsubState = machine.bus.on('state:change', ({ next }) => {
    syncStoneVisuals();
    if (next === 'idle' && director) {
      director.clearFocus();
      director.dollyBack();
    }
  });

  syncStoneVisuals();

  return {
    interactiveGroup,
    rootGroup,
    petGroup: pet.root,

    attachCanvas(canvas: HTMLElement) {
      let lastHoverAt = 0;

      const computeNdc = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
        return true;
      };

      const findCamera = (): THREE.Camera | null => {
        let root: THREE.Object3D = rootGroup;
        while (root.parent) root = root.parent;
        let found: THREE.Camera | null = null;
        root.traverse((o) => {
          if ((o as THREE.Camera).isCamera && !found) found = o as THREE.Camera;
        });
        return found;
      };

      const onPointerDown = (e: PointerEvent) => {
        if (opts.isBlocked?.()) return;
        tapTracker.onPointerDown(e.clientX, e.clientY, performance.now(), e.pointerId);
        if (e.pointerType !== 'mouse' && computeNdc(e.clientX, e.clientY)) {
          const cam = findCamera() ?? (director as unknown as { camera?: THREE.Camera })?.camera ?? null;
          if (cam) {
            const hit = raycastPhoneticStones(raycaster, ndc, cam, interactiveGroup);
            machine.hoverStone(hit?.userData.targetId ?? null);
          }
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        tapTracker.onPointerMove(e.clientX, e.clientY, e.pointerId);
        if (e.pointerType !== 'mouse') return;
        const now = performance.now();
        if (now - lastHoverAt < HOVER_THROTTLE_MS) return;
        lastHoverAt = now;
        if (opts.isBlocked?.() || !computeNdc(e.clientX, e.clientY)) return;
        const cam = findCamera() ?? (director as unknown as { camera?: THREE.Camera })?.camera ?? null;
        if (!cam) return;
        const hit = raycastPhoneticStones(raycaster, ndc, cam, interactiveGroup);
        const nextHover = hit?.userData.targetId ?? null;
        machine.hoverStone(nextHover);
        canvas.style.cursor = nextHover ? 'pointer' : '';
      };

      const onPointerUp = (e: PointerEvent) => {
        if (opts.isBlocked?.()) {
          tapTracker.cancel();
          return;
        }
        const isTap = tapTracker.onPointerUp(e.clientX, e.clientY, performance.now(), e.pointerId);
        if (!isTap || !computeNdc(e.clientX, e.clientY)) return;
        const cam = findCamera() ?? (director as unknown as { camera?: THREE.Camera })?.camera ?? null;
        if (!cam) return;
        const hit = raycastPhoneticStones(raycaster, ndc, cam, interactiveGroup);
        if (hit) {
          machine.selectStone(hit.userData.targetId);
        } else {
          const cur = machine.getSnapshot().state;
          if (cur === 'passed' || cur === 'retry') {
            machine.dismissToIdle();
          }
        }
      };

      const onPointerCancel = () => {
        tapTracker.cancel();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          const cur = machine.getSnapshot().state;
          if (cur !== 'idle') {
            machine.dismissToIdle();
          }
        }
      };

      canvas.addEventListener('pointerdown', onPointerDown);
      canvas.addEventListener('pointermove', onPointerMove);
      canvas.addEventListener('pointerup', onPointerUp);
      canvas.addEventListener('pointercancel', onPointerCancel);
      window.addEventListener('keydown', onKeyDown);

      return () => {
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerCancel);
        window.removeEventListener('keydown', onKeyDown);
        canvas.style.cursor = '';
      };
    },

    update(dt: number, t: number) {
      castClock = t;
      let idx = 0;
      for (const [id, v] of stones.entries()) {
        const isSelected = id === selectedId;
        const isHovered = id === hoveredId;
        const targetLift = isSelected ? 0.22 : isHovered ? 0.1 : 0;
        const bob = Math.sin(t * 2.4 + idx * 0.9) * (isSelected ? 0.06 : 0.025);
        v.body.position.y = damp(v.body.position.y, v.baseY + targetLift + bob, 8, dt);
        v.body.rotation.y += dt * (isSelected ? 1.1 : 0.25);
        const pulseScale = isSelected || isHovered ? 1 + Math.sin(t * 5) * 0.06 : 1;
        v.runeRing.scale.setScalar(pulseScale);
        v.starMeshes.forEach((s, sIdx) => {
          s.rotation.y = t * 1.8 + sIdx;
        });
        idx++;
      }

      // Summer Camp 3D station props animation (zero allocation)
      if (campProps) {
        campProps.flame.scale.set(1, 1 + Math.sin(t * 11) * 0.18, 1);
        const targetFlagY = 1.15 + campProgressRatio * 1.95;
        campProps.flagBanner.position.y = damp(campProps.flagBanner.position.y, targetFlagY, 6, dt);
        campProps.flagBanner.rotation.y = Math.sin(t * 4) * 0.14;
        campProps.flagMat.emissiveIntensity = campFlagUnlocked ? 1.25 : 0.5;
        campProps.boardFill.scale.x = Math.max(0.08, campProgressRatio);
      }

      // River Fishing 3D dock & cast animation (zero allocation)
      if (fishingProps) {
        fishingProps.bobber.position.y = 0.06 + Math.sin(t * 3.8) * 0.04;
        fishingProps.rippleRing.scale.setScalar(1 + ((t * 0.85) % 0.9));
        fishingProps.rippleMat.opacity = 0.65 * (1 - ((t * 0.85) % 0.9));

        if (t < castAnimUntil) {
          const rem = castAnimUntil - t;
          const phase = 1 - Math.min(1, Math.max(0, rem / 1.6));
          fishingProps.rodPivot.rotation.x = 0.55 - Math.sin(phase * Math.PI) * 0.65;
          fishingProps.leapFish.position.y = -0.4 + Math.sin(phase * Math.PI) * 2.1;
          fishingProps.leapFish.rotation.z = (phase - 0.5) * 1.8;
          fishingProps.leapFish.scale.setScalar(castScale);
        } else {
          fishingProps.rodPivot.rotation.x = damp(fishingProps.rodPivot.rotation.x, 0.55, 6, dt);
          fishingProps.leapFish.position.y = damp(fishingProps.leapFish.position.y, -1.2, 8, dt);
        }
      }

      // 3D Pet Companion animation
      if (petState === 'celebrate') {
        pet.body.position.y = 0.65 + Math.abs(Math.sin(t * 7.5)) * 0.28;
        pet.body.rotation.y = Math.sin(t * 4) * 0.35;
        pet.earL.rotation.z = 0.15;
        pet.earR.rotation.z = -0.15;
        pet.celebrateMat.opacity = 0.85;
        pet.celebrateRing.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
        pet.listenMat.opacity = 0;
        pet.mouthMat.opacity = 0.3;
      } else if (petState === 'listening') {
        pet.body.position.y = damp(pet.body.position.y, 0.7, 8, dt);
        pet.head.rotation.x = damp(pet.head.rotation.x, -0.12, 8, dt);
        pet.earL.rotation.z = damp(pet.earL.rotation.z, 0.04, 10, dt);
        pet.earR.rotation.z = damp(pet.earR.rotation.z, -0.04, 10, dt);
        pet.listenMat.opacity = 0.55 + Math.sin(t * 6) * 0.3;
        pet.listenHalo.scale.setScalar(1 + ((t * 1.4) % 0.6));
        pet.celebrateMat.opacity = 0;
        pet.mouthMat.opacity = 0.4;
      } else if (petState === 'coach' || petHint === 'mouth_shape') {
        pet.body.position.y = damp(pet.body.position.y, 0.68, 8, dt);
        pet.head.rotation.x = Math.sin(t * 3.5) * 0.08;
        pet.earL.rotation.z = damp(pet.earL.rotation.z, 0.18, 8, dt);
        pet.earR.rotation.z = damp(pet.earR.rotation.z, -0.18, 8, dt);
        pet.mouthMat.opacity = 0.95;
        pet.mouthRing.scale.set(
          1 + Math.sin(t * 6.5) * 0.35,
          1 + Math.cos(t * 6.5) * 0.42,
          1,
        );
        pet.listenMat.opacity = 0;
        pet.celebrateMat.opacity = 0;
      } else {
        pet.body.position.y = 0.65 + Math.sin(t * 2.2) * 0.04;
        pet.body.rotation.y = damp(pet.body.rotation.y, 0, 5, dt);
        pet.head.rotation.x = damp(pet.head.rotation.x, 0, 5, dt);
        pet.earL.rotation.z = damp(pet.earL.rotation.z, 0.25, 6, dt);
        pet.earR.rotation.z = damp(pet.earR.rotation.z, -0.25, 6, dt);
        pet.mouthRing.scale.setScalar(1);
        pet.mouthMat.opacity = 0.35;
        pet.listenMat.opacity = 0;
        pet.celebrateMat.opacity = 0;
      }
    },

    setTargets(targets: PhoneticStoneTarget[]) {
      buildStones(targets);
      syncStoneVisuals();
    },

    setCampQuestProgress(progressRatio: number, flagUnlocked: boolean) {
      campProgressRatio = Math.max(0, Math.min(1, progressRatio));
      campFlagUnlocked = flagUnlocked;
    },

    triggerFishingCast(multiplier: FishingWeightMultiplier) {
      castScale = multiplier === 1.2 ? 1.35 : multiplier === 1.1 ? 1.18 : 1.0;
      castAnimUntil = castClock + 1.6;
    },

    dispose() {
      unsubSelect();
      unsubHover();
      unsubResult();
      unsubPet();
      unsubState();
      clearStones();
      rootGroup.removeFromParent();
    },
  };
}
