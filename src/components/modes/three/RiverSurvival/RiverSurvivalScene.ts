'use client';

import * as THREE from 'three';
import { lib, type AssetQuality } from '../../../../config/assetLibrary';
import type { PetState } from '../../../../client/phoneticStones';
import { disposeObject, glow, lowpoly, mesh, roughen, swapInGlb, textSprite, toon } from '../../kit';
import { createRuntime, type GfxTier, type SceneRuntime } from '../SceneRuntime';
import type { CameraDirector } from '../cameraDirector';
import {
  createGoldenChallengeOrb,
  raycastAndTriggerGoldenOrb,
  type GoldenChallengeOrbHandle,
  type GoldenSlotLike,
} from '../goldenChallengeOrb';
import { buildRiverSurvivalCollisionMesh } from '../physics/sceneColliders';
import {
  raycastPhoneticStones,
  TapGestureTracker,
  type PhoneticStoneUserData,
} from '../phoneticStoneRaycaster';
import {
  RIVER_SURVIVAL_CLEARING_STONES,
  type SurvivalClearingStoneSpec,
} from './clearingStones';
import type { SurvivalClueReveal } from './speechEffects';
import { createTagNet, type TagNetOwnerState, type TagNetRig } from './TagNet';
import { createWoodenPen, type WoodenPenRig } from './WoodenPen';
import {
  RIVER_SURVIVAL_ZONES,
  type SurvivalZoneId,
  type SurvivalZoneSpec,
  type ZoneAssetPlacement,
} from './zones';

export interface RiverSurvivalEnvOptions {
  tier?: GfxTier;
  director?: CameraDirector;
  /** Number of tagged Escapers initially shown inside the main Wooden Pen. */
  initialTaggedCount?: number;
  /** Initial Tag Net owner state (`pursuers` | `snatched` | `crate_idle`). */
  initialNetOwner?: TagNetOwnerState;
  /** Optional callback when a Decoder clearing stone is tapped in 3D space. */
  onStoneSelected?: (userData: PhoneticStoneUserData, zoneId: SurvivalZoneId) => void;
  /** Optional callback when the 3D Golden Challenge orb is tapped (`slot.golden`). */
  onTakeGolden?: () => void;
}

export interface RiverSurvivalEnvironment {
  readonly rootGroup: THREE.Group;
  readonly collisionGroup: THREE.Group;
  readonly interactiveGroup: THREE.Group;
  readonly zoneGroups: Record<SurvivalZoneId, THREE.Group>;
  readonly woodenPens: Record<SurvivalZoneId, WoodenPenRig>;
  readonly mainWoodenPen: WoodenPenRig;
  readonly tagNet: TagNetRig;
  readonly petCompanionGroup: THREE.Group;
  readonly clueMarkerGroup: THREE.Group;
  readonly goldenOrb: GoldenChallengeOrbHandle;
  /** Focus or dolly camera to one of the 3 zones (`zone_alpha`, `zone_bravo`, `zone_charlie`). */
  focusZone(zoneId: SurvivalZoneId): void;
  /** Highlight the currently selected Decoder clearing stone. */
  setActiveStone(targetId: string | null): void;
  /** Mark solved Decoder clearing stones with an emerald rune glow. */
  setSolvedStones(targetIds: string[]): void;
  /** Update the 3D Pet Companion state (`idle` | `listening` | `celebrate` | `coach`). */
  setPetState(state: PetState): void;
  /** Show or update the 3D beacon marker at a revealed clue position (`pen` or `net`). */
  showClueReveal(reveal: SurvivalClueReveal | null): void;
  /** Sync the 3D Golden Challenge orb visibility (`slot.golden && !slot.goldenTaken`). */
  syncGoldenSlot(slot: GoldenSlotLike): boolean;
  update(dt: number, t: number): void;
  dispose(): void;
}

function buildCatalogPlacement(
  placement: ZoneAssetPlacement,
  quality: AssetQuality,
  isAlive: () => boolean,
): THREE.Group {
  const holder = new THREE.Group();
  holder.name = `asset-${placement.id}`;
  holder.position.set(placement.offset[0], placement.offset[1], placement.offset[2]);
  holder.rotation.y = placement.rotationY;
  holder.userData = {
    assetId: placement.id,
    category: placement.category,
  };

  if (placement.category === 'tree') {
    const trunk = mesh(
      new THREE.CylinderGeometry(0.22, 0.34, placement.height * 0.35, 7),
      lowpoly(0x6b4423, { rough: 0.92 }),
      [0, placement.height * 0.17, 0],
    );
    const crown = mesh(
      roughen(new THREE.ConeGeometry(placement.height * 0.36, placement.height * 0.72, 8), 0.08, 3),
      lowpoly(0x2d6a4f, { rough: 0.88 }),
      [0, placement.height * 0.58, 0],
    );
    trunk.castShadow = true;
    crown.castShadow = true;
    holder.add(trunk, crown);
  } else if (placement.category === 'hide_spot') {
    const bush = mesh(
      roughen(new THREE.DodecahedronGeometry(placement.height * 0.55, 1), 0.06, 5),
      lowpoly(0x40916c, { rough: 0.9 }),
      [0, placement.height * 0.42, 0],
    );
    bush.castShadow = true;
    holder.add(bush);
  } else if (placement.category === 'fence') {
    const p1 = mesh(
      new THREE.CylinderGeometry(0.1, 0.12, placement.height, 6),
      lowpoly(0x78350f, { rough: 0.9 }),
      [-0.9, placement.height * 0.5, 0],
    );
    const p2 = mesh(
      new THREE.CylinderGeometry(0.1, 0.12, placement.height, 6),
      lowpoly(0x78350f, { rough: 0.9 }),
      [0.9, placement.height * 0.5, 0],
    );
    const rail1 = mesh(
      new THREE.BoxGeometry(2.0, 0.14, 0.1),
      lowpoly(0x92400e, { rough: 0.88 }),
      [0, placement.height * 0.78, 0],
    );
    const rail2 = mesh(
      new THREE.BoxGeometry(2.0, 0.14, 0.1),
      lowpoly(0x92400e, { rough: 0.88 }),
      [0, placement.height * 0.42, 0],
    );
    holder.add(p1, p2, rail1, rail2);
  } else if (placement.category === 'ground') {
    const slab = mesh(
      new THREE.CylinderGeometry(3.2, 3.4, 0.1, 16),
      lowpoly(0x52796f, { rough: 0.98 }),
      [0, 0.04, 0],
    );
    slab.receiveShadow = true;
    holder.add(slab);
  } else {
    const propMesh = mesh(
      new THREE.BoxGeometry(placement.height * 0.7, placement.height * 0.7, placement.height * 0.7),
      lowpoly(0xd97706, { rough: 0.8 }),
      [0, placement.height * 0.35, 0],
    );
    holder.add(propMesh);
  }

  swapInGlb(holder, lib(placement.id, quality), placement.height, isAlive);
  return holder;
}

function buildZoneGroup(
  spec: SurvivalZoneSpec,
  quality: AssetQuality,
  isAlive: () => boolean,
): THREE.Group {
  const zoneGroup = new THREE.Group();
  zoneGroup.name = spec.id;
  zoneGroup.position.set(spec.center[0], spec.center[1], spec.center[2]);
  zoneGroup.userData = {
    kind: 'river_survival_zone',
    zoneId: spec.id,
    code: spec.code,
    nameVi: spec.nameVi,
  };

  const plateau = mesh(
    roughen(new THREE.CylinderGeometry(spec.radius, spec.radius + 1.4, 0.45, 28, 1), 0.05, 9),
    lowpoly(spec.groundHex, { rough: 0.95 }),
    [0, -0.22, 0],
  );
  plateau.receiveShadow = true;
  zoneGroup.add(plateau);

  const accentColor = new THREE.Color(spec.accentHex).getHex();
  const ringMat = glow(accentColor, 0.28, true);
  ringMat.side = THREE.DoubleSide;
  const boundaryRing = mesh(
    new THREE.RingGeometry(spec.radius - 0.35, spec.radius, 48),
    ringMat,
    [0, 0.03, 0],
  );
  boundaryRing.rotation.x = -Math.PI / 2;
  zoneGroup.add(boundaryRing);

  for (const placement of spec.placements) {
    zoneGroup.add(buildCatalogPlacement(placement, quality, isAlive));
  }

  const zoneBanner = textSprite(`${spec.nameVi}`, {
    color: '#ffffff',
    bg: 'rgba(15,23,42,0.88)',
    border: spec.accentHex,
    height: 0.62,
  });
  zoneBanner.position.set(0, 4.2, -spec.radius * 0.55);
  zoneGroup.add(zoneBanner);

  return zoneGroup;
}

function buildSurvivalPetCompanion(at: [number, number, number]): {
  group: THREE.Group;
  auraMat: THREE.MeshBasicMaterial;
  bodyMat: THREE.MeshToonMaterial;
  wingLeft: THREE.Mesh;
  wingRight: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.name = 'SurvivalDecoderPetCompanion';
  group.position.set(at[0], at[1], at[2]);

  const bodyMat = toon(0x34d399, 0x059669, 0.32);
  const body = mesh(new THREE.SphereGeometry(0.32, 14, 12), bodyMat, [0, 0.36, 0]);
  body.scale.set(1, 1.12, 0.95);

  const belly = mesh(
    new THREE.SphereGeometry(0.22, 12, 10),
    toon(0xd1fae5, 0xa7f3d0, 0.16),
    [0, 0.32, 0.14],
  );

  const eyeWhiteMat = glow(0xffffff, 1);
  const pupilMat = glow(0x0f172a, 1);
  const leftEye = mesh(new THREE.SphereGeometry(0.065, 10, 10), eyeWhiteMat, [-0.1, 0.44, 0.22]);
  const rightEye = mesh(new THREE.SphereGeometry(0.065, 10, 10), eyeWhiteMat, [0.1, 0.44, 0.22]);
  const leftPupil = mesh(new THREE.SphereGeometry(0.032, 8, 8), pupilMat, [-0.1, 0.44, 0.27]);
  const rightPupil = mesh(new THREE.SphereGeometry(0.032, 8, 8), pupilMat, [0.1, 0.44, 0.27]);

  const beak = mesh(
    new THREE.ConeGeometry(0.06, 0.14, 6),
    toon(0xfbbf24, 0xd97706, 0.35),
    [0, 0.38, 0.3],
  );
  beak.rotation.x = Math.PI / 2;

  const wingGeo = new THREE.BoxGeometry(0.12, 0.26, 0.18);
  const wingMat = toon(0x059669, 0x047857, 0.26);
  const wingLeft = mesh(wingGeo, wingMat, [-0.32, 0.35, 0]);
  const wingRight = mesh(wingGeo, wingMat, [0.32, 0.35, 0]);

  const auraMat = glow(0x34d399, 0.5, true);
  const auraRing = mesh(new THREE.RingGeometry(0.34, 0.46, 24), auraMat, [0, 0.05, 0]);
  auraRing.rotation.x = -Math.PI / 2;

  const label = textSprite('LUMI · GIẢI MÃ', {
    color: '#d1fae5',
    bg: 'rgba(6, 78, 59, 0.88)',
    border: '#34d399',
    height: 0.28,
  });
  label.position.set(0, 0.88, 0);

  group.add(
    body,
    belly,
    leftEye,
    rightEye,
    leftPupil,
    rightPupil,
    beak,
    wingLeft,
    wingRight,
    auraRing,
    label,
  );

  return { group, auraMat, bodyMat, wingLeft, wingRight };
}

/**
 * Assembles the foundational 3D scene for "River Survival" (Cướp Lưới):
 * - A1: Dedicated collision mesh (`collisionGroup` with `userData.collision = true`, tiles < 100 m)
 * - 3 distinct zones (`zone_alpha`, `zone_bravo`, `zone_charlie`) connected across a flowing river
 * - "Wooden Pen" (Chuồng Gỗ) holding enclosures (`createWoodenPen`)
 * - "Tag Net" (Lưới Gắn Thẻ) launcher & woven canopy (`createTagNet`)
 * - A4: 6 Decoder Clearing Phonetic Stones (`RIVER_SURVIVAL_CLEARING_STONES`, ≤ 12 budget) + Clue Reveal marker
 * - A5: 3D Glowing Golden Challenge Orb (`goldenOrb`)
 */
export function buildRiverSurvivalEnvironment(
  opts: RiverSurvivalEnvOptions = {},
): RiverSurvivalEnvironment {
  const {
    tier = 'high',
    director,
    initialTaggedCount = 2,
    initialNetOwner = 'pursuers',
    onTakeGolden,
  } = opts;

  const quality: AssetQuality = tier === 'low' ? 'low' : 'high';
  let alive = true;
  const isAlive = () => alive;

  const rootGroup = new THREE.Group();
  rootGroup.name = 'river-survival-root';

  // A1: Attach the simple collision mesh (`userData.collision = true`, invisible in rendering, < 3,000 tris, tiles ≤ 24 m)
  const collisionGroup = buildRiverSurvivalCollisionMesh({ visible: false });
  rootGroup.add(collisionGroup);

  // Interactive group for Decoder Phonetic Stones (max 12 meshes per scene)
  const interactiveGroup = new THREE.Group();
  interactiveGroup.name = 'RiverSurvivalPhoneticStonesGroup';
  rootGroup.add(interactiveGroup);

  // 1. Tiled valley meadow floor (tiles of 35 m × 35 m so no mesh exceeds 100 m)
  const valleyFloorMat = lowpoly(0x1f3a2d, { rough: 1 });
  const valleyTileGeo = new THREE.PlaneGeometry(35, 35);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const tile = mesh(valleyTileGeo, valleyFloorMat, [-52.5 + c * 35, -0.45, -35 + r * 35]);
      tile.rotation.x = -Math.PI / 2;
      tile.receiveShadow = tier === 'high';
      rootGroup.add(tile);
    }
  }

  const riverWaterMat = lowpoly(0x167a8a, {
    rough: 0.25,
    metal: 0.1,
    emissive: 0x0f4c5c,
    glow: 0.35,
  });
  const riverStream = mesh(
    new THREE.PlaneGeometry(80, 14, 24, 6),
    riverWaterMat,
    [0, -0.18, 0],
  );
  riverStream.rotation.x = -Math.PI / 2;
  riverStream.rotation.z = -0.38;
  rootGroup.add(riverStream);

  // Two wooden log bridges connecting Zone A <-> Zone B and Zone B <-> Zone C
  const bridgeOffsets: Array<[number, number, number]> = [
    [-11, 0.05, -6],
    [11, 0.05, 6],
  ];
  for (const [bx, by, bz] of bridgeOffsets) {
    const bridge = mesh(
      new THREE.BoxGeometry(6.8, 0.22, 2.2),
      lowpoly(0x78350f, { rough: 0.9 }),
      [bx, by, bz],
    );
    bridge.rotation.y = 0.55;
    bridge.receiveShadow = tier === 'high';
    rootGroup.add(bridge);
  }

  // 2. Build the 3 distinct zones (`zone_alpha`, `zone_bravo`, `zone_charlie`)
  const zoneGroups = {} as Record<SurvivalZoneId, THREE.Group>;
  const woodenPens = {} as Record<SurvivalZoneId, WoodenPenRig>;

  for (const spec of RIVER_SURVIVAL_ZONES) {
    const zg = buildZoneGroup(spec, quality, isAlive);
    zoneGroups[spec.id] = zg;
    rootGroup.add(zg);

    const isMain = spec.id === 'zone_bravo';
    const pen = createWoodenPen({
      zoneId: spec.id,
      labelVi: isMain
        ? '🪵 Chuồng Gỗ Chính (Khu giữ người & Giải mật thư)'
        : `🪵 Chuồng Gỗ Khu ${spec.code}`,
      position: spec.penPosition,
      radius: isMain ? 3.8 : 3.0,
      capacity: isMain ? 10 : 6,
      quality,
      isMainPen: isMain,
    });
    if (isMain) {
      pen.setTaggedCount(initialTaggedCount);
    }
    woodenPens[spec.id] = pen;
    rootGroup.add(pen.group);

    if (director) {
      director.setAnchor(spec.id, zg);
    }
  }

  const mainWoodenPen = woodenPens.zone_bravo;

  // 3. Build the visual representation of the "Tag Net" (Lưới Gắn Thẻ) in Zone B
  const tagNet = createTagNet({
    stationPosition: RIVER_SURVIVAL_ZONES[1].netStationPosition,
    initialOwner: initialNetOwner,
    quality,
  });
  rootGroup.add(tagNet.group);

  if (director) {
    director.setAnchor('wooden_pen', mainWoodenPen.group);
    director.setAnchor('tag_net', tagNet.group);
  }

  // 4. A4 — Build the 6 Decoder Clearing Phonetic Stones (`RIVER_SURVIVAL_CLEARING_STONES`)
  interface ClearingStoneVisual {
    spec: SurvivalClearingStoneSpec;
    stoneMesh: THREE.Mesh;
    stoneMat: THREE.MeshStandardMaterial;
    ringMat: THREE.MeshBasicMaterial;
    ringMesh: THREE.Mesh;
    phaseOffset: number;
  }

  const stoneVisuals: ClearingStoneVisual[] = [];
  const stoneGeo = roughen(new THREE.OctahedronGeometry(0.48, 1), 0.03, 43);
  const plinthGeo = new THREE.CylinderGeometry(0.55, 0.68, 0.28, 12);
  const plinthMat = lowpoly(0x1e293b, { rough: 0.7, metal: 0.2 });
  const ringGeo = new THREE.RingGeometry(0.62, 0.82, 24);

  RIVER_SURVIVAL_CLEARING_STONES.forEach((spec, idx) => {
    const [x, y, z] = spec.position;

    // Non-interactive clearing station plinth + label
    const stationGroup = new THREE.Group();
    stationGroup.name = `ClearingStation_${spec.stationId}`;
    stationGroup.position.set(x, 0, z);
    const plinth = mesh(plinthGeo, plinthMat, [0, 0.14, 0]);
    const ringMat = glow(0x38bdf8, 0.58, true);
    const ringMesh = mesh(ringGeo, ringMat, [0, 0.04, 0]);
    ringMesh.rotation.x = -Math.PI / 2;

    const label = textSprite(`🔍 ${spec.word} ${spec.ipa}`, {
      color: '#f8fafc',
      bg: 'rgba(15, 23, 42, 0.88)',
      border: '#38bdf8',
      height: 0.38,
    });
    label.position.set(0, 1.55, 0);
    stationGroup.add(plinth, ringMesh, label);
    rootGroup.add(stationGroup);

    // Interactive Phonetic Stone mesh placed inside `interactiveGroup`
    const stoneMat = lowpoly(0x38bdf8, {
      rough: 0.25,
      metal: 0.25,
      emissive: 0x0284c7,
      glow: 0.72,
    });
    const stoneMesh = mesh(stoneGeo, stoneMat, [x, y + 0.35, z]);
    stoneMesh.name = `PhoneticStone_${spec.targetId}`;
    const userData: PhoneticStoneUserData = {
      kind: 'phonetic_stone',
      targetId: spec.targetId,
      ipa: spec.ipa,
      word: spec.word,
      mode: 'shadow',
      stationId: spec.stationId,
    };
    stoneMesh.userData = userData;
    interactiveGroup.add(stoneMesh);

    stoneVisuals.push({
      spec,
      stoneMesh,
      stoneMat,
      ringMat,
      ringMesh,
      phaseOffset: idx * 1.15,
    });
  });

  // 5. 3D Pet Companion ("Lumi · Giải Mã") stationed near Zone B clearing
  const petBuilt = buildSurvivalPetCompanion([-2.2, 0.35, 1.6]);
  const petCompanionGroup = petBuilt.group;
  rootGroup.add(petCompanionGroup);

  // 6. 3D Clue Reveal Beacon Marker (`clueMarkerGroup`) shown when `applySurvivalSpeechEffect` unlocks `'pen'` or `'net'`
  const clueMarkerGroup = new THREE.Group();
  clueMarkerGroup.name = 'SurvivalClueRevealMarker';
  clueMarkerGroup.visible = false;
  const beaconMat = glow(0xfacc15, 0.72, true);
  const beaconPillar = mesh(
    new THREE.CylinderGeometry(0.35, 0.85, 5.2, 16, 1, true),
    beaconMat,
    [0, 2.6, 0],
  );
  const beaconRingMat = glow(0xfef08a, 0.9, true);
  const beaconRing = mesh(new THREE.RingGeometry(0.95, 1.35, 32), beaconRingMat, [0, 0.08, 0]);
  beaconRing.rotation.x = -Math.PI / 2;
  clueMarkerGroup.add(beaconPillar, beaconRing);
  rootGroup.add(clueMarkerGroup);

  // 7. A5 — 3D Glowing Golden Challenge Orb (`goldenOrb`)
  const goldenOrb = createGoldenChallengeOrb({
    position: [0, 1.65, 3.8],
    lite: tier === 'low',
    onTakeGolden,
  });
  rootGroup.add(goldenOrb.group);

  let activeStoneId: string | null = null;
  const solvedStoneIds = new Set<string>();
  let currentPetState: PetState = 'idle';

  function refreshStoneColors() {
    for (let i = 0; i < stoneVisuals.length; i++) {
      const v = stoneVisuals[i];
      const isSelected = v.spec.targetId === activeStoneId;
      const isSolved = solvedStoneIds.has(v.spec.targetId);
      if (isSelected) {
        v.stoneMat.color.setHex(0xfacc15);
        v.stoneMat.emissive.setHex(0xd97706);
        v.stoneMat.emissiveIntensity = 1.2;
        v.ringMat.color.setHex(0xfef08a);
        v.ringMat.opacity = 0.95;
      } else if (isSolved) {
        v.stoneMat.color.setHex(0x34d399);
        v.stoneMat.emissive.setHex(0x059669);
        v.stoneMat.emissiveIntensity = 0.95;
        v.ringMat.color.setHex(0x34d399);
        v.ringMat.opacity = 0.85;
      } else {
        v.stoneMat.color.setHex(0x38bdf8);
        v.stoneMat.emissive.setHex(0x0284c7);
        v.stoneMat.emissiveIntensity = 0.72;
        v.ringMat.color.setHex(0x38bdf8);
        v.ringMat.opacity = 0.58;
      }
    }
  }

  return {
    rootGroup,
    collisionGroup,
    interactiveGroup,
    zoneGroups,
    woodenPens,
    mainWoodenPen,
    tagNet,
    petCompanionGroup,
    clueMarkerGroup,
    goldenOrb,

    focusZone(zoneId: SurvivalZoneId) {
      const target = zoneGroups[zoneId];
      if (target && director) {
        void director.dollyTo(target, { hold: 1.4 });
      }
    },

    setActiveStone(targetId: string | null) {
      activeStoneId = targetId;
      if (targetId) {
        const found = RIVER_SURVIVAL_CLEARING_STONES.find((s) => s.targetId === targetId);
        if (found) {
          petCompanionGroup.position.set(
            found.position[0] + 1.15,
            0.35,
            found.position[2] + 0.65,
          );
        }
      }
      refreshStoneColors();
    },

    setSolvedStones(targetIds: string[]) {
      solvedStoneIds.clear();
      for (let i = 0; i < targetIds.length; i++) {
        solvedStoneIds.add(targetIds[i]);
      }
      refreshStoneColors();
    },

    setPetState(state: PetState) {
      currentPetState = state;
      if (state === 'listening') {
        petBuilt.auraMat.color.setHex(0x38bdf8);
        petBuilt.auraMat.opacity = 0.9;
        petBuilt.bodyMat.emissive.setHex(0x0284c7);
      } else if (state === 'celebrate') {
        petBuilt.auraMat.color.setHex(0xfacc15);
        petBuilt.auraMat.opacity = 0.95;
        petBuilt.bodyMat.emissive.setHex(0xd97706);
      } else if (state === 'coach') {
        petBuilt.auraMat.color.setHex(0xfb923c);
        petBuilt.auraMat.opacity = 0.88;
        petBuilt.bodyMat.emissive.setHex(0xea580c);
      } else {
        petBuilt.auraMat.color.setHex(0x34d399);
        petBuilt.auraMat.opacity = 0.5;
        petBuilt.bodyMat.emissive.setHex(0x059669);
      }
    },

    showClueReveal(reveal: SurvivalClueReveal | null) {
      if (!reveal) {
        clueMarkerGroup.visible = false;
        return;
      }
      clueMarkerGroup.visible = true;
      clueMarkerGroup.position.set(reveal.position[0], reveal.position[1], reveal.position[2]);
      const hex = reveal.clue === 'pen' ? 0xfacc15 : 0x38bdf8;
      beaconMat.color.setHex(hex);
      beaconRingMat.color.setHex(hex);
    },

    syncGoldenSlot(slot: GoldenSlotLike): boolean {
      return goldenOrb.syncSlot(slot);
    },

    update(dt: number, t: number) {
      riverStream.position.y = -0.18 + Math.sin(t * 1.8) * 0.03;
      for (const z of RIVER_SURVIVAL_ZONES) {
        woodenPens[z.id].update(dt, t);
      }
      tagNet.update(dt, t);

      // Animate Decoder Clearing Phonetic Stones (zero per-frame allocations)
      for (let i = 0; i < stoneVisuals.length; i++) {
        const v = stoneVisuals[i];
        const isSelected = v.spec.targetId === activeStoneId;
        const bob = Math.sin(t * 2.6 + v.phaseOffset) * 0.09;
        v.stoneMesh.position.y = v.spec.position[1] + 0.35 + bob + (isSelected ? 0.14 : 0);
        v.stoneMesh.rotation.y = t * (isSelected ? 2.3 : 1.0) + v.phaseOffset;
        v.ringMesh.scale.setScalar(1 + Math.sin(t * 3.2 + v.phaseOffset) * 0.07);
      }

      // Animate 3D Pet Companion
      const petBob =
        currentPetState === 'celebrate'
          ? Math.abs(Math.sin(t * 8.2)) * 0.24
          : Math.sin(t * 3.2) * 0.06;
      petCompanionGroup.position.y = 0.35 + petBob;
      const wingSpeed = currentPetState === 'celebrate' ? 12 : 4.2;
      const wingAmp = currentPetState === 'celebrate' ? 0.52 : 0.2;
      petBuilt.wingLeft.rotation.z = Math.sin(t * wingSpeed) * wingAmp;
      petBuilt.wingRight.rotation.z = -Math.sin(t * wingSpeed) * wingAmp;

      // Animate Clue Reveal Beacon if visible
      if (clueMarkerGroup.visible) {
        beaconRing.scale.setScalar(1 + Math.sin(t * 4.5) * 0.16);
        beaconPillar.rotation.y = t * 1.2;
      }

      // Animate Golden Challenge Orb
      goldenOrb.update(t);
    },

    dispose() {
      alive = false;
      for (const z of RIVER_SURVIVAL_ZONES) {
        woodenPens[z.id].dispose();
      }
      tagNet.dispose();
      goldenOrb.dispose();
      rootGroup.removeFromParent();
      disposeObject(rootGroup);
    },
  };
}

export interface MountedRiverSurvivalScene {
  readonly runtime: SceneRuntime;
  readonly environment: RiverSurvivalEnvironment;
  dispose(): void;
}

/**
 * Initializes a standalone Three.js `SceneRuntime` inside `container` and mounts
 * the River Survival ("Cướp Lưới") 3-zone environment, Wooden Pen, Tag Net, and Decoder Phonetic Stones.
 */
export function mountRiverSurvivalScene(
  container: HTMLElement,
  opts: RiverSurvivalEnvOptions = {},
): MountedRiverSurvivalScene {
  const tier = opts.tier ?? 'high';
  const runtime = createRuntime(container, {
    tier,
    fov: 50,
    near: 0.2,
    far: 320,
    lights: 'outdoor',
    sky: { hdri: 'day', gradient: [0x1e293b, 0x3b2f5c, 0x0f172a] },
    fog: { color: 0x1e293b, near: 28, far: 145 },
  });

  runtime.camera.position.set(0, 16, 28);
  runtime.camera.lookAt(0, 0.8, -2);

  const environment = buildRiverSurvivalEnvironment({
    ...opts,
    tier,
    director: runtime.director,
  });
  runtime.scene.add(environment.rootGroup);

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const tapTracker = new TapGestureTracker();
  const canvas = runtime.renderer.domElement;

  const onPointerDown = (e: PointerEvent) => {
    tapTracker.onPointerDown(e.clientX, e.clientY, performance.now(), e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    tapTracker.onPointerMove(e.clientX, e.clientY, e.pointerId);
  };
  const onPointerUp = (e: PointerEvent) => {
    if (!tapTracker.onPointerUp(e.clientX, e.clientY, performance.now(), e.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    if (raycastAndTriggerGoldenOrb(raycaster, pointerNdc, runtime.camera, environment.goldenOrb)) {
      return;
    }
    const hit = raycastPhoneticStones(
      raycaster,
      pointerNdc,
      runtime.camera,
      environment.interactiveGroup,
    );
    if (hit) {
      const spec = RIVER_SURVIVAL_CLEARING_STONES.find((s) => s.targetId === hit.userData.targetId);
      const zoneId = spec?.zoneId ?? 'zone_bravo';
      opts.onStoneSelected?.(hit.userData, zoneId);
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);

  runtime.run((dt, t) => {
    environment.update(dt, t);
  });

  return {
    runtime,
    environment,
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      environment.dispose();
      runtime.dispose();
    },
  };
}
