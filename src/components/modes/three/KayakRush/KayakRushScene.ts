import * as THREE from 'three';
import {
  createStage,
  damp,
  disposeObject,
  glow,
  lowpoly,
  mesh,
  roughen,
  skyDome,
  Sparks,
  swapInGlb,
  textSprite,
  toon,
} from '../../kit';
import { lib } from '../../../../config/assetLibrary';
import type { PetState } from '../../../../client/phoneticStones';
import {
  raycastPhoneticStones,
  TapGestureTracker,
  type PhoneticStoneUserData,
} from '../phoneticStoneRaycaster';
import {
  KAYAK_RUSH_TARGETS,
  KAYAK_RUSH_WAYPOINTS,
  type KayakBoostMultiplier,
} from './waypoints';

export interface KayakRushSceneHandle {
  readonly root: THREE.Group;
  readonly interactiveGroup: THREE.Group;
  readonly kayakGroup: THREE.Group;
  readonly petCompanionGroup: THREE.Group;
  readonly wakeSparks: Sparks;
  setActiveStone(targetId: string | null): void;
  setClearedStones(clearedIds: string[]): void;
  setPetState(state: PetState): void;
  triggerSpeedBoost(multiplier: KayakBoostMultiplier, targetWaypointIndex: number): void;
  update(dt: number, t: number): void;
  dispose(): void;
}

function buildRiverTree(at: [number, number, number], scale = 1, alive: () => boolean = () => true): THREE.Group {
  const g = new THREE.Group();
  g.position.set(at[0], at[1], at[2]);
  g.scale.setScalar(scale);

  const trunk = mesh(
    new THREE.CylinderGeometry(0.14, 0.22, 0.9, 6),
    lowpoly(0x5c3d28, { rough: 0.9 }),
    [0, 0.45, 0],
  );
  const crown1 = mesh(
    roughen(new THREE.ConeGeometry(0.95, 1.5, 7), 0.05, 13),
    lowpoly(0x166534, { rough: 0.8 }),
    [0, 1.25, 0],
  );
  const crown2 = mesh(
    roughen(new THREE.ConeGeometry(0.72, 1.2, 7), 0.04, 29),
    lowpoly(0x15803d, { rough: 0.8 }),
    [0, 1.95, 0],
  );
  g.add(trunk, crown1, crown2);
  swapInGlb(g, lib('river_tree_pine'), 2.7, alive);
  return g;
}

function buildRiverRock(at: [number, number, number], scale = 1, alive: () => boolean = () => true): THREE.Group {
  const g = new THREE.Group();
  g.position.set(at[0], at[1], at[2]);
  g.scale.setScalar(scale);

  const rock = mesh(
    roughen(new THREE.DodecahedronGeometry(0.55, 1), 0.07, 41),
    lowpoly(0x64748b, { rough: 0.88 }),
    [0, 0.25, 0],
  );
  rock.scale.set(1.2, 0.75, 1.0);
  g.add(rock);
  swapInGlb(g, lib('river_rock_large'), 0.95, alive);
  return g;
}

function buildRiverBuoy(at: [number, number, number], alt = false, alive: () => boolean = () => true): THREE.Group {
  const g = new THREE.Group();
  g.position.set(at[0], at[1], at[2]);

  const ring = mesh(
    new THREE.TorusGeometry(0.32, 0.09, 8, 16),
    lowpoly(alt ? 0xf59e0b : 0xef4444, { rough: 0.45 }),
    [0, 0.14, 0],
  );
  ring.rotation.x = Math.PI / 2;
  const beacon = mesh(
    new THREE.ConeGeometry(0.16, 0.48, 8),
    lowpoly(0xf8fafc, { rough: 0.5, emissive: alt ? 0xfbbf24 : 0x38bdf8, glow: 0.35 }),
    [0, 0.38, 0],
  );
  g.add(ring, beacon);
  swapInGlb(g, lib(alt ? 'river_buoy__alt1' : 'river_buoy'), 0.85, alive);
  return g;
}

function buildSpinningLog(at: [number, number, number], alive: () => boolean = () => true): THREE.Group {
  const g = new THREE.Group();
  g.position.set(at[0], at[1], at[2]);

  const logMesh = mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 2.2, 10),
    lowpoly(0x78350f, { rough: 0.88 }),
    [0, 0.12, 0],
  );
  logMesh.rotation.z = Math.PI / 2;
  g.add(logMesh);
  swapInGlb(g, lib('kayak_log_spinning'), 0.65, alive);
  return g;
}

function buildFinishArch(at: [number, number, number], alive: () => boolean = () => true): THREE.Group {
  const g = new THREE.Group();
  g.position.set(at[0], at[1], at[2]);

  const leftPillar = mesh(
    new THREE.CylinderGeometry(0.22, 0.26, 3.4, 10),
    lowpoly(0xf59e0b, { rough: 0.5, emissive: 0xd97706, glow: 0.25 }),
    [-2.4, 1.7, 0],
  );
  const rightPillar = mesh(
    new THREE.CylinderGeometry(0.22, 0.26, 3.4, 10),
    lowpoly(0xf59e0b, { rough: 0.5, emissive: 0xd97706, glow: 0.25 }),
    [2.4, 1.7, 0],
  );
  const crossBanner = mesh(
    new THREE.BoxGeometry(5.2, 0.55, 0.32),
    lowpoly(0x0284c7, { rough: 0.4, emissive: 0x38bdf8, glow: 0.35 }),
    [0, 3.25, 0],
  );
  const label = textSprite('FINISH RAPIDS', {
    color: '#fef08a',
    bg: 'rgba(12, 74, 110, 0.88)',
    border: '#38bdf8',
    height: 0.46,
  });
  label.position.set(0, 3.9, 0);
  label.userData.keep = true;

  g.add(leftPillar, rightPillar, crossBanner, label);
  swapInGlb(g, lib('kayak_finish_arch'), 3.6, alive);
  return g;
}

/**
 * Builds the 3D Pet Companion (Cú Pháp Thuật / River Otter Owl) that sits directly on the bow
 * or floats right next to the player's Kayak (`kayakGroup`).
 */
function buildKayakPetCompanion(): {
  group: THREE.Group;
  auraMat: THREE.MeshBasicMaterial;
  bodyMat: THREE.MeshToonMaterial;
  wingLeft: THREE.Mesh;
  wingRight: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.name = 'KayakPetCompanion';
  // Positioned on the front-right bow of the player's kayak so it rides with the boat
  group.position.set(0.36, 0.58, -0.52);
  group.userData.keep = true;

  const bodyMat = toon(0x38bdf8, 0x0284c7, 0.32);
  const body = mesh(new THREE.SphereGeometry(0.26, 16, 14), bodyMat, [0, 0.28, 0]);
  body.scale.set(1, 1.12, 0.95);

  const belly = mesh(
    new THREE.SphereGeometry(0.19, 12, 10),
    toon(0xe0f2fe, 0xbae6fd, 0.15),
    [0, 0.25, 0.12],
  );

  // Mini kayak lifejacket on the Pet
  const vest = mesh(
    new THREE.TorusGeometry(0.22, 0.055, 8, 16),
    lowpoly(0xf97316, { rough: 0.5, emissive: 0xea580c, glow: 0.2 }),
    [0, 0.24, 0],
  );
  vest.rotation.x = Math.PI / 2;

  const eyeWhiteMat = glow(0xffffff, 1);
  const pupilMat = glow(0x0f172a, 1);
  const leftEye = mesh(new THREE.SphereGeometry(0.06, 10, 10), eyeWhiteMat, [-0.09, 0.36, 0.2]);
  const rightEye = mesh(new THREE.SphereGeometry(0.06, 10, 10), eyeWhiteMat, [0.09, 0.36, 0.2]);
  const leftPupil = mesh(new THREE.SphereGeometry(0.03, 8, 8), pupilMat, [-0.09, 0.36, 0.25]);
  const rightPupil = mesh(new THREE.SphereGeometry(0.03, 8, 8), pupilMat, [0.09, 0.36, 0.25]);

  const beak = mesh(
    new THREE.ConeGeometry(0.055, 0.13, 6),
    toon(0xfbbf24, 0xf59e0b, 0.35),
    [0, 0.31, 0.27],
  );
  beak.rotation.x = Math.PI / 2;

  const wingGeo = new THREE.BoxGeometry(0.11, 0.22, 0.16);
  const wingMat = toon(0x0284c7, 0x0369a1, 0.25);
  const wingLeft = mesh(wingGeo, wingMat, [-0.27, 0.28, 0]);
  const wingRight = mesh(wingGeo, wingMat, [0.27, 0.28, 0]);

  const auraMat = glow(0x38bdf8, 0.45, true);
  const auraRing = mesh(
    new THREE.RingGeometry(0.28, 0.38, 24),
    auraMat,
    [0, 0.04, 0],
  );
  auraRing.rotation.x = -Math.PI / 2;

  const label = textSprite('PET', {
    color: '#e0f2fe',
    bg: 'rgba(12, 74, 110, 0.82)',
    border: '#38bdf8',
    height: 0.22,
  });
  label.position.set(0, 0.72, 0);

  group.add(
    body,
    belly,
    vest,
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
 * Builds the player's Kayak (`kayakGroup`) with hull, paddle, lifejacket, and attached 3D Pet Companion.
 */
function buildPlayerKayak(
  petCompanionGroup: THREE.Group,
  alive: () => boolean = () => true,
): {
  kayakGroup: THREE.Group;
  paddleGroup: THREE.Group;
} {
  const kayakGroup = new THREE.Group();
  kayakGroup.name = 'PlayerKayakGroup';
  kayakGroup.position.set(0, 0.18, 4.2);

  const boatHolder = new THREE.Group();
  const hull = mesh(
    roughen(new THREE.ConeGeometry(0.52, 2.5, 10), 0.02, 7),
    lowpoly(0xf97316, { rough: 0.38, metal: 0.1, emissive: 0xea580c, glow: 0.2 }),
    [0, 0.12, 0],
  );
  hull.rotation.x = -Math.PI / 2;
  hull.scale.set(1, 1, 0.42);

  const cockpit = mesh(
    new THREE.CylinderGeometry(0.32, 0.28, 0.24, 12),
    lowpoly(0x1e293b, { rough: 0.7 }),
    [0, 0.22, 0.1],
  );
  boatHolder.add(hull, cockpit);
  swapInGlb(boatHolder, lib('kayak_boat'), 0.75, alive);

  const jacketHolder = new THREE.Group();
  jacketHolder.position.set(0, 0.38, 0.12);
  const jacketTorso = mesh(
    new THREE.BoxGeometry(0.42, 0.38, 0.28),
    lowpoly(0xfacc15, { rough: 0.5, emissive: 0xeab308, glow: 0.2 }),
    [0, 0, 0],
  );
  jacketHolder.add(jacketTorso);
  swapInGlb(jacketHolder, lib('kayak_lifejacket'), 0.48, alive);

  const paddleGroup = new THREE.Group();
  paddleGroup.position.set(0, 0.44, 0.05);
  const shaft = mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.75, 8),
    lowpoly(0xe2e8f0, { rough: 0.4, metal: 0.3 }),
    [0, 0, 0],
  );
  shaft.rotation.z = Math.PI / 2;
  const bladeL = mesh(
    new THREE.BoxGeometry(0.32, 0.14, 0.03),
    lowpoly(0x38bdf8, { rough: 0.35, emissive: 0x0284c7, glow: 0.3 }),
    [-0.88, 0, 0],
  );
  const bladeR = mesh(
    new THREE.BoxGeometry(0.32, 0.14, 0.03),
    lowpoly(0x38bdf8, { rough: 0.35, emissive: 0x0284c7, glow: 0.3 }),
    [0.88, 0, 0],
  );
  paddleGroup.add(shaft, bladeL, bladeR);
  swapInGlb(paddleGroup, lib('kayak_paddle'), 0.35, alive);

  kayakGroup.add(boatHolder, jacketHolder, paddleGroup, petCompanionGroup);
  return { kayakGroup, paddleGroup };
}

/**
 * Builds the Kayak Rush 3D environment with floating Phonetic Stone river waypoints
 * and the 3D Pet Companion attached to the player's Kayak.
 */
export function buildKayakRushEnvironment(alive: () => boolean = () => true): KayakRushSceneHandle {
  const root = new THREE.Group();
  root.name = 'KayakRushRoot';

  const interactiveGroup = new THREE.Group();
  interactiveGroup.name = 'PhoneticStonesInteractiveGroup';
  root.add(interactiveGroup);

  // Sky & river lighting
  root.add(skyDome(0x0c4a6e, 0x0284c7, 0xbae6fd, { radius: 160, stars: 0.15 }));

  const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x0369a1, 0.95);
  const sun = new THREE.DirectionalLight(0xfef08a, 1.3);
  sun.position.set(7, 14, 8);
  const rapidFill = new THREE.PointLight(0x38bdf8, 1.15, 22);
  rapidFill.position.set(0, 3.5, -2);
  root.add(hemi, sun, rapidFill);

  // Rush river channel water plane
  const riverWater = mesh(
    new THREE.PlaneGeometry(8.6, 28, 24, 32),
    lowpoly(0x0284c7, { rough: 0.22, metal: 0.15, emissive: 0x0369a1, glow: 0.28 }),
    [0, 0, -3.5],
  );
  riverWater.rotation.x = -Math.PI / 2;
  root.add(riverWater);

  // Whitewater foam strips along the rapids
  const foamStrips: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const strip = mesh(
      new THREE.PlaneGeometry(0.32, 2.2),
      glow(0xe0f2fe, 0.42, true),
      [(i % 2 === 0 ? -1 : 1) * (1.1 + (i % 3) * 0.45), 0.03, 3.0 - i * 2.4],
    );
    strip.rotation.x = -Math.PI / 2;
    root.add(strip);
    foamStrips.push(strip);
  }

  // Left and right canyon riverbanks
  const leftBank = mesh(
    roughen(new THREE.BoxGeometry(4.5, 1.2, 28, 6, 2, 16), 0.12, 19),
    lowpoly(0x15803d, { rough: 0.9 }),
    [-6.2, 0.35, -3.5],
  );
  const rightBank = mesh(
    roughen(new THREE.BoxGeometry(4.5, 1.2, 28, 6, 2, 16), 0.12, 23),
    lowpoly(0x166534, { rough: 0.9 }),
    [6.2, 0.35, -3.5],
  );
  root.add(leftBank, rightBank);

  // Populate banks with pine trees, rocks, buoys, spinning logs, and finish arch
  const bankProps = new THREE.Group();
  bankProps.name = 'KayakRiverProps';
  bankProps.add(
    buildRiverTree([-5.1, 0.8, 3.2], 1.05, alive),
    buildRiverTree([-5.6, 0.8, -0.8], 1.18, alive),
    buildRiverTree([-4.9, 0.8, -5.2], 0.95, alive),
    buildRiverTree([-5.4, 0.8, -9.0], 1.12, alive),
    buildRiverTree([5.2, 0.8, 2.8], 1.1, alive),
    buildRiverTree([5.5, 0.8, -1.6], 0.96, alive),
    buildRiverTree([4.9, 0.8, -5.8], 1.15, alive),
    buildRiverTree([5.3, 0.8, -9.4], 1.04, alive),
    buildRiverRock([-3.4, 0.05, 0.2], 1.1, alive),
    buildRiverRock([3.5, 0.05, -3.8], 1.2, alive),
    buildRiverRock([-3.3, 0.05, -7.5], 1.0, alive),
    buildRiverBuoy([-2.8, 0.02, 2.0], false, alive),
    buildRiverBuoy([2.8, 0.02, -1.8], true, alive),
    buildRiverBuoy([-2.7, 0.02, -5.5], false, alive),
    buildFinishArch([0, 0, -11.2], alive),
  );
  const spinningLog = buildSpinningLog([0.2, 0.06, -4.1], alive);
  bankProps.add(spinningLog);
  root.add(bankProps);

  // Floating Phonetic Stone Waypoints along the river path (4 interactive stone meshes)
  interface WaypointVisual {
    specIndex: number;
    targetId: string;
    basePosition: [number, number, number];
    stoneMesh: THREE.Mesh;
    stoneMat: THREE.MeshStandardMaterial;
    ringMat: THREE.MeshBasicMaterial;
    buoyRing: THREE.Mesh;
    phaseOffset: number;
  }

  const waypointVisuals: WaypointVisual[] = [];
  const stoneGeo = roughen(new THREE.OctahedronGeometry(0.46, 1), 0.035, 31);
  const ringGeo = new THREE.RingGeometry(0.54, 0.72, 28);
  const floatPadGeo = new THREE.CylinderGeometry(0.62, 0.7, 0.16, 16);

  KAYAK_RUSH_WAYPOINTS.forEach((wp, idx) => {
    const target = KAYAK_RUSH_TARGETS[idx];
    const [x, y, z] = wp.position;

    // Floating buoy pad under the waypoint stone (non-interactive visual anchor)
    const padGroup = new THREE.Group();
    padGroup.position.set(x, 0.04, z);
    const padMesh = mesh(
      floatPadGeo,
      lowpoly(0x0f172a, { rough: 0.6, metal: 0.2, emissive: 0x0284c7, glow: 0.25 }),
      [0, 0, 0],
    );
    const ringMat = glow(0x38bdf8, 0.55, true);
    const buoyRing = mesh(ringGeo, ringMat, [0, 0.09, 0]);
    buoyRing.rotation.x = -Math.PI / 2;

    const label = textSprite(`⚡ ${wp.word} ${wp.ipa}`, {
      color: '#f8fafc',
      bg: 'rgba(12, 74, 110, 0.88)',
      border: '#38bdf8',
      height: 0.34,
    });
    label.position.set(0, 1.25, 0);
    padGroup.add(padMesh, buoyRing, label);
    root.add(padGroup);

    // Interactive Phonetic Stone mesh placed inside `interactiveGroup`
    const stoneMat = lowpoly(0x0ea5e9, {
      rough: 0.25,
      metal: 0.2,
      emissive: 0x0284c7,
      glow: 0.65,
    });
    const stoneMesh = mesh(stoneGeo, stoneMat, [x, y + 0.35, z]);
    stoneMesh.name = `PhoneticStone_${wp.targetId}`;

    const userData: PhoneticStoneUserData = {
      kind: 'phonetic_stone',
      targetId: wp.targetId,
      ipa: wp.ipa,
      word: wp.word,
      mode: target.modes[0] ?? 'shadow',
      stationId: target.stationId,
    };
    stoneMesh.userData = userData;
    interactiveGroup.add(stoneMesh);

    waypointVisuals.push({
      specIndex: idx,
      targetId: wp.targetId,
      basePosition: [x, y + 0.35, z],
      stoneMesh,
      stoneMat,
      ringMat,
      buoyRing,
      phaseOffset: idx * 1.35,
    });
  });

  // Build 3D Pet Companion & attach it directly to the player's Kayak
  const petBuilt = buildKayakPetCompanion();
  const petCompanionGroup = petBuilt.group;
  const { kayakGroup, paddleGroup } = buildPlayerKayak(petCompanionGroup, alive);
  root.add(kayakGroup);

  // Water wake & speed boost particles (pooled InstancedMesh, zero per-frame allocation)
  const wakeSparks = new Sparks(140, new THREE.IcosahedronGeometry(0.07, 0), true);
  root.add(wakeSparks.mesh);

  // Runtime state (pre-allocated vectors for zero per-frame allocations)
  let activeStoneId: string | null = null;
  const clearedIds = new Set<string>();
  let currentPetState: PetState = 'idle';
  let kayakTargetX = 0;
  let kayakTargetZ = 3.8;
  let boostTimer = 0;
  let activeBoostMultiplier: KayakBoostMultiplier = 1.0;
  const emitOrigin = new THREE.Vector3();
  const emitSpread = new THREE.Vector3(0.55, 0.2, 0.55);
  const emitDir = new THREE.Vector3(0, 0.3, 1.8);

  function refreshStoneVisuals() {
    for (let i = 0; i < waypointVisuals.length; i++) {
      const v = waypointVisuals[i];
      const isSelected = v.targetId === activeStoneId;
      const isCleared = clearedIds.has(v.targetId);
      if (isSelected) {
        v.stoneMat.color.setHex(0xfef08a);
        v.stoneMat.emissive.setHex(0xf59e0b);
        v.stoneMat.emissiveIntensity = 1.15;
        v.ringMat.color.setHex(0xfacc15);
        v.ringMat.opacity = 0.92;
      } else if (isCleared) {
        v.stoneMat.color.setHex(0x34d399);
        v.stoneMat.emissive.setHex(0x059669);
        v.stoneMat.emissiveIntensity = 0.9;
        v.ringMat.color.setHex(0x34d399);
        v.ringMat.opacity = 0.78;
      } else {
        v.stoneMat.color.setHex(0x0ea5e9);
        v.stoneMat.emissive.setHex(0x0284c7);
        v.stoneMat.emissiveIntensity = 0.65;
        v.ringMat.color.setHex(0x38bdf8);
        v.ringMat.opacity = 0.55;
      }
    }
  }

  return {
    root,
    interactiveGroup,
    kayakGroup,
    petCompanionGroup,
    wakeSparks,

    setActiveStone(targetId: string | null) {
      activeStoneId = targetId;
      refreshStoneVisuals();
    },

    setClearedStones(ids: string[]) {
      clearedIds.clear();
      for (let i = 0; i < ids.length; i++) {
        clearedIds.add(ids[i]);
      }
      refreshStoneVisuals();
    },

    setPetState(state: PetState) {
      currentPetState = state;
      if (state === 'listening') {
        petBuilt.auraMat.color.setHex(0x34d399);
        petBuilt.auraMat.opacity = 0.88;
        petBuilt.bodyMat.emissive.setHex(0x059669);
      } else if (state === 'celebrate') {
        petBuilt.auraMat.color.setHex(0xfacc15);
        petBuilt.auraMat.opacity = 0.95;
        petBuilt.bodyMat.emissive.setHex(0xd97706);
      } else if (state === 'coach') {
        petBuilt.auraMat.color.setHex(0xfb923c);
        petBuilt.auraMat.opacity = 0.85;
        petBuilt.bodyMat.emissive.setHex(0xea580c);
      } else {
        petBuilt.auraMat.color.setHex(0x38bdf8);
        petBuilt.auraMat.opacity = 0.45;
        petBuilt.bodyMat.emissive.setHex(0x0284c7);
      }
    },

    triggerSpeedBoost(multiplier: KayakBoostMultiplier, targetWaypointIndex: number) {
      activeBoostMultiplier = multiplier;
      boostTimer = 1.6;
      const wp =
        KAYAK_RUSH_WAYPOINTS[
          Math.max(0, Math.min(KAYAK_RUSH_WAYPOINTS.length - 1, targetWaypointIndex))
        ];
      if (wp) {
        kayakTargetX = wp.position[0] * 0.65;
        kayakTargetZ = wp.position[2] + 1.35;
      }

      emitOrigin.copy(kayakGroup.position);
      emitOrigin.y += 0.25;
      emitOrigin.z += 0.7;
      wakeSparks.emit(emitOrigin, multiplier >= 1.5 ? 36 : 22, {
        color: multiplier >= 1.5 ? 0xfacc15 : 0x38bdf8,
        speed: 3.4 * multiplier,
        life: 0.75,
        size: 1.15,
        gravity: 3.5,
        up: 1.4,
        spread: emitSpread,
        dir: emitDir,
      });
    },

    update(dt: number, t: number) {
      if (boostTimer > 0) {
        boostTimer = Math.max(0, boostTimer - dt);
      }

      // Animate floating Phonetic Stone waypoints
      for (let i = 0; i < waypointVisuals.length; i++) {
        const v = waypointVisuals[i];
        const isSelected = v.targetId === activeStoneId;
        const bob = Math.sin(t * 2.8 + v.phaseOffset) * 0.09;
        v.stoneMesh.position.y = v.basePosition[1] + bob + (isSelected ? 0.14 : 0);
        v.stoneMesh.rotation.y = t * (isSelected ? 2.4 : 1.1) + v.phaseOffset;
        const pulse = 1 + Math.sin(t * 3.5 + v.phaseOffset) * 0.08;
        v.buoyRing.scale.setScalar(pulse);
      }

      // Spin obstacle log
      spinningLog.rotation.x = t * 1.8;

      // Scroll whitewater foam strips for rushing current feel
      const flowSpeed = boostTimer > 0 ? 4.8 * activeBoostMultiplier : 2.4;
      for (let i = 0; i < foamStrips.length; i++) {
        const s = foamStrips[i];
        s.position.z += flowSpeed * dt;
        if (s.position.z > 5.5) {
          s.position.z -= 16.0;
        }
      }

      // Smoothly move player's Kayak toward current target waypoint & bob on waves
      const prevX = kayakGroup.position.x;
      kayakGroup.position.x = damp(kayakGroup.position.x, kayakTargetX, 3.2, dt);
      kayakGroup.position.z = damp(kayakGroup.position.z, kayakTargetZ, 2.6, dt);
      kayakGroup.position.y = 0.18 + Math.sin(t * 3.8) * 0.045;

      const lateralVel = (kayakGroup.position.x - prevX) / Math.max(dt, 0.001);
      kayakGroup.rotation.z = damp(kayakGroup.rotation.z, -lateralVel * 0.12, 6, dt);
      kayakGroup.rotation.x = boostTimer > 0 ? 0.08 : Math.sin(t * 2.6) * 0.03;

      // Animate kayak paddle strokes
      const paddleRate = boostTimer > 0 ? 9.5 : 4.5;
      paddleGroup.rotation.z = Math.sin(t * paddleRate) * 0.38;
      paddleGroup.rotation.y = Math.cos(t * paddleRate) * 0.25;

      // Animate attached 3D Pet Companion on the bow of the kayak
      const petBounce =
        currentPetState === 'celebrate'
          ? Math.abs(Math.sin(t * 8.5)) * 0.22
          : Math.sin(t * 3.4) * 0.05;
      petCompanionGroup.position.y = 0.58 + petBounce;
      const wingSpeed = currentPetState === 'celebrate' || boostTimer > 0 ? 12 : 4.2;
      const wingAmp = currentPetState === 'celebrate' ? 0.55 : 0.22;
      petBuilt.wingLeft.rotation.z = Math.sin(t * wingSpeed) * wingAmp;
      petBuilt.wingRight.rotation.z = -Math.sin(t * wingSpeed) * wingAmp;

      // Update pooled wake/boost sparks
      wakeSparks.update(dt);
    },

    dispose() {
      disposeObject(root);
    },
  };
}

export interface MountKayakRushOptions {
  container: HTMLElement;
  onStoneSelected?: (userData: PhoneticStoneUserData) => void;
}

export interface MountedKayakRushStage {
  readonly sceneHandle: KayakRushSceneHandle;
  dispose(): void;
}

/**
 * Mounts the Kayak Rush 3D WebGL stage inside `container` and wires `THREE.Raycaster`
 * tap detection against the floating Phonetic Stone waypoints.
 */
export function mountKayakRushScene(options: MountKayakRushOptions): MountedKayakRushStage {
  const { container, onStoneSelected } = options;
  let alive = true;

  const stage = createStage(container, {
    fov: 50,
    near: 0.1,
    far: 200,
    background: 0x0c4a6e,
  });

  stage.camera.position.set(0, 4.8, 8.6);
  stage.camera.lookAt(0, 0.4, -1.8);

  const sceneHandle = buildKayakRushEnvironment(() => alive);
  stage.scene.add(sceneHandle.root);

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const tapTracker = new TapGestureTracker();
  const canvas = stage.renderer.domElement;

  const onPointerDown = (e: PointerEvent) => {
    tapTracker.onPointerDown(e.clientX, e.clientY, performance.now(), e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    tapTracker.onPointerMove(e.clientX, e.clientY, e.pointerId);
  };

  const onPointerUp = (e: PointerEvent) => {
    const isTap = tapTracker.onPointerUp(
      e.clientX,
      e.clientY,
      performance.now(),
      e.pointerId,
    );
    if (!isTap) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    pointerNdc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const hit = raycastPhoneticStones(
      raycaster,
      pointerNdc,
      stage.camera,
      sceneHandle.interactiveGroup,
    );
    if (hit) {
      sceneHandle.setActiveStone(hit.userData.targetId);
      onStoneSelected?.(hit.userData);
    }
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);

  stage.run((dt: number, t: number) => {
    sceneHandle.update(dt, t);
  });

  return {
    sceneHandle,
    dispose() {
      alive = false;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      stage.dispose();
    },
  };
}
