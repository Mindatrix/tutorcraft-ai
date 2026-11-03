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
import type { PetState, SpeechGameEffect } from '../../../../client/phoneticStones';
import {
  createGoldenChallengeOrb,
  raycastAndTriggerGoldenOrb,
  type GoldenChallengeOrbHandle,
  type GoldenSlotLike,
} from '../goldenChallengeOrb';
import { buildMultiverseCollisionMesh } from '../physics/sceneColliders';
import {
  raycastPhoneticStones,
  TapGestureTracker,
  type PhoneticStoneUserData,
} from '../phoneticStoneRaycaster';
import {
  CENTRAL_PORTAL_STONE_ID,
  computePortalOpeningConfig,
  MULTIVERSE_PORTAL_TARGETS,
  type PortalGateState,
} from './portalRules';

export interface MultiversePortalSceneHandle {
  readonly root: THREE.Group;
  readonly collisionGroup: THREE.Group;
  readonly interactiveGroup: THREE.Group;
  readonly portalGateGroup: THREE.Group;
  readonly centralPedestalGroup: THREE.Group;
  readonly petCompanionGroup: THREE.Group;
  readonly portalSparks: Sparks;
  readonly portalSpiralMesh: THREE.InstancedMesh;
  readonly goldenOrb: GoldenChallengeOrbHandle;
  getGateState(): PortalGateState;
  setActiveStone(targetId: string | null): void;
  setPetState(state: PetState): void;
  triggerPortalOpening(stars: 1 | 2 | 3): void;
  /** Decoupled server effect handler (`reply.effect` with `kind === 'portal_open'`). */
  applyPortalSpeechEffect(
    effect: SpeechGameEffect | null | undefined,
    stars?: 1 | 2 | 3,
  ): boolean;
  syncGoldenSlot(slot: GoldenSlotLike): boolean;
  update(dt: number, t: number): void;
  dispose(): void;
}

function buildSanctumPillar(
  at: [number, number, number],
  variant: 1 | 2 = 1,
  alive: () => boolean = () => true,
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(at[0], at[1], at[2]);

  const col = mesh(
    roughen(new THREE.CylinderGeometry(0.45, 0.56, 4.2, 8), 0.04, 17),
    lowpoly(0x1e1b4b, { rough: 0.72, metal: 0.25, emissive: 0x312e81, glow: 0.28 }),
    [0, 2.1, 0],
  );
  const cap = mesh(
    new THREE.BoxGeometry(1.25, 0.45, 1.25),
    lowpoly(0x312e81, { rough: 0.6, metal: 0.3, emissive: 0x6366f1, glow: 0.35 }),
    [0, 4.3, 0],
  );
  g.add(col, cap);
  swapInGlb(
    g,
    lib(variant === 1 ? 'mv_castle_module' : 'mv_castle_module_2'),
    4.5,
    alive,
  );
  return g;
}

function buildArcaneTorch(
  at: [number, number, number],
  alt = false,
  alive: () => boolean = () => true,
): { group: THREE.Group; flame: THREE.Mesh } {
  const group = new THREE.Group();
  group.position.set(at[0], at[1], at[2]);

  const holder = new THREE.Group();
  const stand = mesh(
    new THREE.CylinderGeometry(0.14, 0.22, 1.35, 8),
    lowpoly(0x334155, { rough: 0.65, metal: 0.4 }),
    [0, 0.68, 0],
  );
  holder.add(stand);
  swapInGlb(holder, lib(alt ? 'mv_torch_3' : 'mv_torch'), 1.4, alive);

  const flame = mesh(
    new THREE.OctahedronGeometry(0.22, 1),
    glow(alt ? 0x38bdf8 : 0xc084fc, 0.9, true),
    [0, 1.55, 0],
  );
  flame.userData.keep = true;

  group.add(holder, flame);
  return { group, flame };
}

function buildPortalPetCompanion(at: [number, number, number]): {
  group: THREE.Group;
  auraMat: THREE.MeshBasicMaterial;
  bodyMat: THREE.MeshToonMaterial;
  wingLeft: THREE.Mesh;
  wingRight: THREE.Mesh;
} {
  const group = new THREE.Group();
  group.name = 'PortalPetCompanion';
  group.position.set(at[0], at[1], at[2]);

  const bodyMat = toon(0xa855f7, 0x6b21a8, 0.35);
  const body = mesh(new THREE.SphereGeometry(0.3, 16, 14), bodyMat, [0, 0.34, 0]);
  body.scale.set(1, 1.14, 0.95);

  const belly = mesh(
    new THREE.SphereGeometry(0.21, 12, 10),
    toon(0xf3e8ff, 0xd8b4fe, 0.18),
    [0, 0.3, 0.13],
  );

  const eyeWhiteMat = glow(0xffffff, 1);
  const pupilMat = glow(0x1e1b4b, 1);
  const leftEye = mesh(new THREE.SphereGeometry(0.065, 10, 10), eyeWhiteMat, [-0.1, 0.42, 0.22]);
  const rightEye = mesh(new THREE.SphereGeometry(0.065, 10, 10), eyeWhiteMat, [0.1, 0.42, 0.22]);
  const leftPupil = mesh(new THREE.SphereGeometry(0.032, 8, 8), pupilMat, [-0.1, 0.42, 0.27]);
  const rightPupil = mesh(new THREE.SphereGeometry(0.032, 8, 8), pupilMat, [0.1, 0.42, 0.27]);

  const beak = mesh(
    new THREE.ConeGeometry(0.06, 0.14, 6),
    toon(0xfacc15, 0xd97706, 0.4),
    [0, 0.36, 0.3],
  );
  beak.rotation.x = Math.PI / 2;

  const wingGeo = new THREE.BoxGeometry(0.12, 0.25, 0.18);
  const wingMat = toon(0x7e22ce, 0x581c87, 0.28);
  const wingLeft = mesh(wingGeo, wingMat, [-0.31, 0.34, 0]);
  const wingRight = mesh(wingGeo, wingMat, [0.31, 0.34, 0]);

  const auraMat = glow(0xc084fc, 0.48, true);
  const auraRing = mesh(
    new THREE.RingGeometry(0.32, 0.44, 24),
    auraMat,
    [0, 0.05, 0],
  );
  auraRing.rotation.x = -Math.PI / 2;

  const label = textSprite('PET KEEPER', {
    color: '#f3e8ff',
    bg: 'rgba(59, 7, 100, 0.85)',
    border: '#c084fc',
    height: 0.24,
  });
  label.position.set(0, 0.84, 0);

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
 * Builds the Multiverse Portal 3D environment:
 * - Majestic 3D Portal Gate with twin obsidian pillars, counter-rotating rune rings, and dimensional iris vortex
 * - Central Phonetic Stone pedestal directly in front of the gate serving as the voice-passcode lock
 * - Glowing particle animation (pooled Sparks burst + 48-particle spiral vortex ring) for the portal opening sequence
 */
export function buildMultiversePortalEnvironment(
  alive: () => boolean = () => true,
  onTakeGolden?: () => void,
): MultiversePortalSceneHandle {
  const root = new THREE.Group();
  root.name = 'MultiversePortalRoot';

  // A1: Attach dedicated Multiverse collision mesh (`userData.collision = true`: room floors, portal thresholds, steps, ramp, walls)
  const collisionGroup = buildMultiverseCollisionMesh({ visible: false });
  root.add(collisionGroup);

  const interactiveGroup = new THREE.Group();
  interactiveGroup.name = 'PhoneticStonesInteractiveGroup';
  root.add(interactiveGroup);

  // A5: 3D Glowing Golden Challenge Orb (`slot.golden && !slot.goldenTaken`)
  const goldenOrb = createGoldenChallengeOrb({
    position: [-1.45, 1.55, 2.1],
    onTakeGolden,
  });
  root.add(goldenOrb.group);

  // Starry multiverse twilight sky dome & dramatic lighting
  root.add(skyDome(0x090418, 0x1e1b4b, 0x3b0764, { radius: 170, stars: 1.4 }));

  const hemi = new THREE.HemisphereLight(0xe9d5ff, 0x1e1b4b, 0.88);
  const keyLight = new THREE.DirectionalLight(0xc084fc, 1.25);
  keyLight.position.set(6, 12, 8);
  const portalCoreLight = new THREE.PointLight(0x38bdf8, 1.6, 20);
  portalCoreLight.position.set(0, 2.8, -1.8);
  const pedestalLight = new THREE.PointLight(0xfacc15, 1.1, 10);
  pedestalLight.position.set(0, 1.8, 2.2);
  root.add(hemi, keyLight, portalCoreLight, pedestalLight);

  // Astral sanctum floor platform + stepped causeway
  const sanctumFloor = mesh(
    new THREE.CylinderGeometry(8.2, 9.0, 0.5, 32),
    lowpoly(0x0f172a, { rough: 0.78, metal: 0.25, emissive: 0x1e1b4b, glow: 0.25 }),
    [0, -0.25, 0],
  );
  const innerRunway = mesh(
    new THREE.BoxGeometry(3.2, 0.14, 7.2),
    lowpoly(0x1e1b4b, { rough: 0.55, metal: 0.35, emissive: 0x4c1d95, glow: 0.3 }),
    [0, 0.05, 0.8],
  );
  root.add(sanctumFloor, innerRunway);

  // Background sanctum ruins & flanking castle pillars
  const leftRuin = new THREE.Group();
  leftRuin.position.set(-5.6, 0, -2.6);
  swapInGlb(leftRuin, lib('mv_ruin_building'), 3.8, alive);
  const rightRuin = new THREE.Group();
  rightRuin.position.set(5.6, 0, -2.6);
  swapInGlb(rightRuin, lib('mv_ruin_building'), 3.8, alive);

  root.add(
    leftRuin,
    rightRuin,
    buildSanctumPillar([-4.2, 0, -1.8], 1, alive),
    buildSanctumPillar([4.2, 0, -1.8], 2, alive),
  );

  // Flanking arcane torches
  const torches = [
    buildArcaneTorch([-2.2, 0, 1.4], false, alive),
    buildArcaneTorch([2.2, 0, 1.4], false, alive),
    buildArcaneTorch([-2.9, 0, -1.2], true, alive),
    buildArcaneTorch([2.9, 0, -1.2], true, alive),
  ];
  for (const t of torches) {
    root.add(t.group);
  }

  // =========================================================================
  // MAJESTIC 3D PORTAL GATE (`portalGateGroup`)
  // =========================================================================
  const portalGateGroup = new THREE.Group();
  portalGateGroup.name = 'MajesticPortalGate';
  portalGateGroup.position.set(0, 0, -2.0);
  root.add(portalGateGroup);

  // Dais steps under the gate
  const gateBase1 = mesh(
    new THREE.CylinderGeometry(3.4, 3.8, 0.32, 24),
    lowpoly(0x1e1b4b, { rough: 0.6, metal: 0.3, emissive: 0x312e81, glow: 0.25 }),
    [0, 0.16, 0],
  );
  const gateBase2 = mesh(
    new THREE.CylinderGeometry(2.8, 3.1, 0.28, 24),
    lowpoly(0x312e81, { rough: 0.5, metal: 0.35, emissive: 0x4f46e5, glow: 0.3 }),
    [0, 0.42, 0],
  );
  portalGateGroup.add(gateBase1, gateBase2);

  // Left & Right Obsidian Arch Pillars + Keystone Crown
  const leftGateObelisk = mesh(
    roughen(new THREE.BoxGeometry(0.75, 4.4, 0.75), 0.03, 51),
    lowpoly(0x0f172a, { rough: 0.45, metal: 0.45, emissive: 0x4c1d95, glow: 0.4 }),
    [-2.15, 2.5, 0],
  );
  const rightGateObelisk = mesh(
    roughen(new THREE.BoxGeometry(0.75, 4.4, 0.75), 0.03, 53),
    lowpoly(0x0f172a, { rough: 0.45, metal: 0.45, emissive: 0x4c1d95, glow: 0.4 }),
    [2.15, 2.5, 0],
  );
  const archCrown = mesh(
    roughen(new THREE.BoxGeometry(5.3, 0.72, 0.88), 0.03, 59),
    lowpoly(0x1e1b4b, { rough: 0.4, metal: 0.5, emissive: 0x6d28d9, glow: 0.45 }),
    [0, 4.85, 0],
  );
  portalGateGroup.add(leftGateObelisk, rightGateObelisk, archCrown);

  // Outer & Inner Counter-Rotating Arcane Rings around the portal aperture
  const outerRuneRing = new THREE.Group();
  outerRuneRing.position.set(0, 2.75, 0.08);
  const outerTorusMat = lowpoly(0x7c3aed, {
    rough: 0.3,
    metal: 0.5,
    emissive: 0x8b5cf6,
    glow: 0.75,
  });
  const outerTorus = mesh(new THREE.TorusGeometry(2.05, 0.14, 14, 48), outerTorusMat);
  outerRuneRing.add(outerTorus);

  // 8 glowing rune nodes embedded along the outer ring
  const runeNodeMats: THREE.MeshBasicMaterial[] = [];
  const runeNodeGeo = new THREE.OctahedronGeometry(0.16, 0);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const nodeMat = glow(0x38bdf8, 0.75, true);
    runeNodeMats.push(nodeMat);
    const node = mesh(runeNodeGeo, nodeMat, [
      Math.cos(angle) * 2.05,
      Math.sin(angle) * 2.05,
      0.08,
    ]);
    outerRuneRing.add(node);
  }

  const innerRuneRing = new THREE.Group();
  innerRuneRing.position.set(0, 2.75, 0.14);
  const innerTorusMat = glow(0x38bdf8, 0.7, true);
  const innerTorus = mesh(new THREE.TorusGeometry(1.68, 0.07, 12, 40), innerTorusMat);
  innerRuneRing.add(innerTorus);

  // Swirling Portal Vortex Iris (`portalVortexGroup`)
  const portalVortexGroup = new THREE.Group();
  portalVortexGroup.name = 'PortalVortexIris';
  portalVortexGroup.position.set(0, 2.75, 0.05);
  // Starts tightly contracted (`0.08`) while locked; expands to `1.0+` on activation
  portalVortexGroup.scale.setScalar(0.08);

  const vortexCoreMat = glow(0x38bdf8, 0.82, true);
  const vortexCoreDisc = mesh(new THREE.CircleGeometry(1.62, 40), vortexCoreMat, [0, 0, 0]);
  const vortexSwirlMat = glow(0xc084fc, 0.68, true);
  const vortexSwirlRing = mesh(
    new THREE.RingGeometry(0.75, 1.45, 32),
    vortexSwirlMat,
    [0, 0, 0.04],
  );
  const vortexInnerStarMat = glow(0xfacc15, 0.9, true);
  const vortexInnerStar = mesh(
    new THREE.RingGeometry(0.2, 0.58, 6),
    vortexInnerStarMat,
    [0, 0, 0.08],
  );
  portalVortexGroup.add(vortexCoreDisc, vortexSwirlRing, vortexInnerStar);

  const gateBanner = textSprite('MULTIVERSE PORTAL GATE', {
    color: '#e9d5ff',
    bg: 'rgba(30, 27, 75, 0.9)',
    border: '#a855f7',
    height: 0.42,
  });
  gateBanner.position.set(0, 5.55, 0);

  portalGateGroup.add(outerRuneRing, innerRuneRing, portalVortexGroup, gateBanner);

  // =========================================================================
  // CENTRAL PHONETIC STONE PEDESTAL (`centralPedestalGroup`) — Voice Passcode Lock
  // =========================================================================
  const centralTarget = MULTIVERSE_PORTAL_TARGETS[0];
  const centralPedestalGroup = new THREE.Group();
  centralPedestalGroup.name = 'CentralPhoneticStonePedestal';
  centralPedestalGroup.position.set(0, 0, 2.2);
  root.add(centralPedestalGroup);

  const pedestalBase = mesh(
    new THREE.CylinderGeometry(0.75, 0.95, 0.35, 12),
    lowpoly(0x1e1b4b, { rough: 0.6, metal: 0.35, emissive: 0x312e81, glow: 0.3 }),
    [0, 0.18, 0],
  );
  const pedestalColumn = mesh(
    new THREE.CylinderGeometry(0.45, 0.58, 0.85, 10),
    lowpoly(0x312e81, { rough: 0.5, metal: 0.4, emissive: 0x4c1d95, glow: 0.4 }),
    [0, 0.75, 0],
  );
  const pedestalRuneRingMat = glow(0xfacc15, 0.65, true);
  const pedestalRuneRing = mesh(
    new THREE.RingGeometry(0.82, 1.05, 32),
    pedestalRuneRingMat,
    [0, 0.08, 0],
  );
  pedestalRuneRing.rotation.x = -Math.PI / 2;

  const pedestalLabel = textSprite(
    `🔮 ${centralTarget.text} ${centralTarget.ipa}`,
    {
      color: '#fef08a',
      bg: 'rgba(30, 27, 75, 0.92)',
      border: '#facc15',
      height: 0.36,
    },
  );
  pedestalLabel.position.set(0, 2.35, 0);

  centralPedestalGroup.add(pedestalBase, pedestalColumn, pedestalRuneRing, pedestalLabel);

  // Central Interactive Phonetic Stone placed inside `interactiveGroup`
  const centralStoneGeo = roughen(new THREE.OctahedronGeometry(0.52, 1), 0.03, 73);
  const centralStoneMat = lowpoly(0xa855f7, {
    rough: 0.22,
    metal: 0.3,
    emissive: 0x7e22ce,
    glow: 0.85,
  });
  const centralStoneMesh = mesh(centralStoneGeo, centralStoneMat, [0, 1.62, 2.2]);
  centralStoneMesh.name = `PhoneticStone_${CENTRAL_PORTAL_STONE_ID}`;

  const centralUserData: PhoneticStoneUserData = {
    kind: 'phonetic_stone',
    targetId: centralTarget.targetId,
    ipa: centralTarget.ipa,
    word: centralTarget.text,
    mode: centralTarget.modes[0] ?? 'shadow',
    stationId: centralTarget.stationId,
  };
  centralStoneMesh.userData = centralUserData;
  interactiveGroup.add(centralStoneMesh);

  // Energy Conduit Beam connecting the Central Pedestal to the Portal Gate
  const conduitBeamMat = glow(0x38bdf8, 0.25, true);
  const conduitBeam = mesh(
    new THREE.CylinderGeometry(0.08, 0.14, 4.2, 12),
    conduitBeamMat,
    [0, 1.45, 0.1],
  );
  conduitBeam.rotation.x = Math.PI / 2;
  root.add(conduitBeam);

  // 3D Pet Companion hovering beside the central pedestal
  const petBuilt = buildPortalPetCompanion([1.35, 0.55, 2.1]);
  const petCompanionGroup = petBuilt.group;
  root.add(petCompanionGroup);

  // =========================================================================
  // GLOWING PARTICLE ANIMATION FOR PORTAL OPENING SEQUENCE
  // =========================================================================
  // 1. Burst emitter (`portalSparks` - pooled InstancedMesh)
  const portalSparks = new Sparks(180, new THREE.IcosahedronGeometry(0.085, 0), true);
  root.add(portalSparks.mesh);

  // 2. Swirling Multidimensional Spiral Ring (`portalSpiralMesh` - 48 orbiting particles, zero per-frame allocations)
  const SPIRAL_COUNT = 48;
  const spiralGeo = new THREE.OctahedronGeometry(0.09, 0);
  const spiralMat = new THREE.MeshBasicMaterial({
    toneMapped: false,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const portalSpiralMesh = new THREE.InstancedMesh(spiralGeo, spiralMat, SPIRAL_COUNT);
  portalSpiralMesh.name = 'PortalOpeningSpiralParticles';
  portalSpiralMesh.frustumCulled = false;
  portalSpiralMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(portalSpiralMesh);

  // Pre-allocated transforms & colors for zero per-frame allocation in `update(dt, t)`
  const spiralMatrix = new THREE.Matrix4();
  const spiralPos = new THREE.Vector3();
  const spiralQuat = new THREE.Quaternion();
  const spiralScale = new THREE.Vector3();
  const spiralColor = new THREE.Color();
  const pedestalEmitPos = new THREE.Vector3(0, 1.65, 2.2);
  const gateEmitPos = new THREE.Vector3(0, 2.75, -1.9);
  const gateSpread = new THREE.Vector3(2.2, 2.2, 0.6);

  for (let i = 0; i < SPIRAL_COUNT; i++) {
    spiralMatrix.makeScale(0, 0, 0);
    portalSpiralMesh.setMatrixAt(i, spiralMatrix);
    portalSpiralMesh.setColorAt(i, spiralColor.setHex(i % 2 === 0 ? 0xfacc15 : 0x38bdf8));
  }
  if (portalSpiralMesh.instanceColor) {
    portalSpiralMesh.instanceColor.needsUpdate = true;
  }

  let gateState: PortalGateState = 'locked';
  let activeStoneId: string | null = null;
  let currentPetState: PetState = 'idle';
  let vortexTargetScale = 0.08;
  let spiralOrbitSpeed = 1.2;
  let openingPulseTimer = 0;

  function refreshCentralStoneVisual() {
    const isSelected = activeStoneId === CENTRAL_PORTAL_STONE_ID;
    if (gateState === 'open' || gateState === 'opening') {
      centralStoneMat.color.setHex(0xfacc15);
      centralStoneMat.emissive.setHex(0xd97706);
      centralStoneMat.emissiveIntensity = 1.25;
      pedestalRuneRingMat.color.setHex(0x34d399);
      pedestalRuneRingMat.opacity = 0.92;
    } else if (isSelected) {
      centralStoneMat.color.setHex(0x38bdf8);
      centralStoneMat.emissive.setHex(0x0284c7);
      centralStoneMat.emissiveIntensity = 1.15;
      pedestalRuneRingMat.color.setHex(0x38bdf8);
      pedestalRuneRingMat.opacity = 0.88;
    } else {
      centralStoneMat.color.setHex(0xa855f7);
      centralStoneMat.emissive.setHex(0x7e22ce);
      centralStoneMat.emissiveIntensity = 0.85;
      pedestalRuneRingMat.color.setHex(0xfacc15);
      pedestalRuneRingMat.opacity = 0.65;
    }
  }

  function firePortalOpening(stars: 1 | 2 | 3) {
    const cfg = computePortalOpeningConfig(stars);
    gateState = 'opening';
    openingPulseTimer = 1.8;
    vortexTargetScale = cfg.vortexTargetScale;
    spiralOrbitSpeed = cfg.spiralOrbitSpeed;

    for (let i = 0; i < SPIRAL_COUNT; i++) {
      portalSpiralMesh.setColorAt(
        i,
        spiralColor.setHex(i % 2 === 0 ? cfg.primaryColorHex : cfg.secondaryColorHex),
      );
    }
    if (portalSpiralMesh.instanceColor) {
      portalSpiralMesh.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < runeNodeMats.length; i++) {
      runeNodeMats[i].color.setHex(i % 2 === 0 ? cfg.primaryColorHex : cfg.secondaryColorHex);
      runeNodeMats[i].opacity = 0.98;
    }
    conduitBeamMat.color.setHex(cfg.primaryColorHex);
    conduitBeamMat.opacity = 0.88;
    vortexCoreMat.color.setHex(cfg.secondaryColorHex);
    vortexSwirlMat.color.setHex(cfg.primaryColorHex);
    portalCoreLight.color.setHex(cfg.primaryColorHex);
    portalCoreLight.intensity = 3.2;

    portalSparks.emit(pedestalEmitPos, Math.round(cfg.burstParticleCount * 0.45), {
      color: cfg.primaryColorHex,
      speed: 4.2,
      life: 1.05,
      size: 1.25,
      gravity: 1.5,
      up: 2.2,
    });
    portalSparks.emit(gateEmitPos, cfg.burstParticleCount, {
      color: cfg.secondaryColorHex,
      speed: 5.0,
      life: 1.35,
      size: 1.4,
      gravity: 0.4,
      up: 0.8,
      spread: gateSpread,
    });

    refreshCentralStoneVisual();
  }

  return {
    root,
    collisionGroup,
    interactiveGroup,
    portalGateGroup,
    centralPedestalGroup,
    petCompanionGroup,
    portalSparks,
    portalSpiralMesh,
    goldenOrb,

    getGateState() {
      return gateState;
    },

    setActiveStone(targetId: string | null) {
      activeStoneId = targetId;
      refreshCentralStoneVisual();
    },

    setPetState(state: PetState) {
      currentPetState = state;
      if (state === 'listening') {
        petBuilt.auraMat.color.setHex(0x34d399);
        petBuilt.auraMat.opacity = 0.9;
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
        petBuilt.auraMat.color.setHex(0xc084fc);
        petBuilt.auraMat.opacity = 0.48;
        petBuilt.bodyMat.emissive.setHex(0x6b21a8);
      }
    },

    triggerPortalOpening(stars: 1 | 2 | 3) {
      firePortalOpening(stars);
    },

    applyPortalSpeechEffect(
      effect: SpeechGameEffect | null | undefined,
      stars: 1 | 2 | 3 = 3,
    ): boolean {
      if (!effect || effect.kind !== 'portal_open') return false;
      firePortalOpening(stars);
      return true;
    },

    syncGoldenSlot(slot: GoldenSlotLike) {
      return goldenOrb.syncSlot(slot);
    },

    update(dt: number, t: number) {
      if (openingPulseTimer > 0) {
        openingPulseTimer = Math.max(0, openingPulseTimer - dt);
        if (openingPulseTimer === 0 && gateState === 'opening') {
          gateState = 'open';
        }
      }

      // Levitate and rotate the Central Phonetic Stone on the pedestal
      const isSelected = activeStoneId === CENTRAL_PORTAL_STONE_ID;
      centralStoneMesh.position.y =
        1.62 + Math.sin(t * 2.8) * 0.1 + (isSelected ? 0.14 : 0);
      centralStoneMesh.rotation.y =
        t * (gateState !== 'locked' ? 2.8 : isSelected ? 2.2 : 1.1);
      centralStoneMesh.rotation.x = Math.sin(t * 1.9) * 0.22;

      // Counter-rotate portal arcane rings & vortex iris
      const ringSpeedMultiplier = gateState === 'locked' ? 1.0 : 2.8;
      outerRuneRing.rotation.z = t * 0.45 * ringSpeedMultiplier;
      innerRuneRing.rotation.z = -t * 0.75 * ringSpeedMultiplier;

      const currentVortexScale = damp(
        portalVortexGroup.scale.x,
        vortexTargetScale,
        3.4,
        dt,
      );
      portalVortexGroup.scale.setScalar(currentVortexScale);
      vortexSwirlRing.rotation.z = -t * 1.9 * ringSpeedMultiplier;
      vortexInnerStar.rotation.z = t * 2.6 * ringSpeedMultiplier;

      // Animate glowing spiral particles around the portal aperture during opening / open state
      const spiralActiveFactor = clampScale((currentVortexScale - 0.08) / 0.92);
      for (let i = 0; i < SPIRAL_COUNT; i++) {
        if (spiralActiveFactor <= 0.02) {
          spiralMatrix.makeScale(0, 0, 0);
          portalSpiralMesh.setMatrixAt(i, spiralMatrix);
          continue;
        }
        const norm = i / SPIRAL_COUNT;
        const theta = norm * Math.PI * 4 + t * spiralOrbitSpeed;
        const radius =
          (0.55 + (i % 6) * 0.24) * spiralActiveFactor +
          Math.sin(t * 3.2 + i) * 0.08;
        const zWave = Math.cos(t * 2.5 + i * 0.5) * 0.32 * spiralActiveFactor;
        spiralPos.set(
          Math.cos(theta) * radius,
          2.75 + Math.sin(theta) * radius,
          -1.85 + zWave,
        );
        const pScale =
          spiralActiveFactor * (0.75 + 0.45 * Math.sin(t * 5.0 + i * 0.7));
        spiralScale.setScalar(Math.max(0.05, pScale));
        portalSpiralMesh.setMatrixAt(
          i,
          spiralMatrix.compose(spiralPos, spiralQuat, spiralScale),
        );
      }
      portalSpiralMesh.instanceMatrix.needsUpdate = true;

      // Flicker arcane torches
      for (let i = 0; i < torches.length; i++) {
        const f = torches[i].flame;
        const flick = 0.88 + Math.sin(t * 9.5 + i * 1.7) * 0.16;
        f.scale.set(flick, flick * 1.25, flick);
      }

      // Animate 3D Pet Companion beside the pedestal
      const petBob =
        currentPetState === 'celebrate'
          ? Math.abs(Math.sin(t * 8.5)) * 0.25
          : Math.sin(t * 3.1) * 0.08;
      petCompanionGroup.position.y = 0.55 + petBob;
      const wingRate = currentPetState === 'celebrate' ? 12 : 4.2;
      const wingAmp = currentPetState === 'celebrate' ? 0.55 : 0.22;
      petBuilt.wingLeft.rotation.z = Math.sin(t * wingRate) * wingAmp;
      petBuilt.wingRight.rotation.z = -Math.sin(t * wingRate) * wingAmp;

      // Update pooled spark burst particles & Golden Challenge Orb
      portalSparks.update(dt);
      goldenOrb.update(t);
    },

    dispose() {
      goldenOrb.dispose();
      disposeObject(root);
    },
  };
}

function clampScale(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export interface MountMultiversePortalOptions {
  container: HTMLElement;
  onStoneSelected?: (userData: PhoneticStoneUserData) => void;
  onTakeGolden?: () => void;
}

export interface MountedMultiversePortalStage {
  readonly sceneHandle: MultiversePortalSceneHandle;
  dispose(): void;
}

/**
 * Mounts the Multiverse Portal 3D WebGL stage inside `container` and wires
 * `THREE.Raycaster` tap detection against the central Phonetic Stone pedestal.
 */
export function mountMultiversePortalScene(
  options: MountMultiversePortalOptions,
): MountedMultiversePortalStage {
  const { container, onStoneSelected, onTakeGolden } = options;
  let alive = true;

  const stage = createStage(container, {
    fov: 50,
    near: 0.1,
    far: 200,
    background: 0x090418,
  });

  stage.camera.position.set(0, 3.6, 7.6);
  stage.camera.lookAt(0, 2.1, -0.8);

  const sceneHandle = buildMultiversePortalEnvironment(() => alive, onTakeGolden);
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
    if (
      raycastAndTriggerGoldenOrb(
        raycaster,
        pointerNdc,
        stage.camera,
        sceneHandle.goldenOrb,
      )
    ) {
      return;
    }
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
