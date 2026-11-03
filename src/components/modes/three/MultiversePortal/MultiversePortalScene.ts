import * as THREE from 'three';
import {
  createStage,
  damp,
  disposeObject,
  glow,
  lowpoly,
  mesh,
  roughen,
  Sparks,
  swapInGlb,
} from '../../kit';
import { lib, type AssetQuality } from '../../../../config/assetLibrary';
import type { PetState } from '../../../../client/phoneticStones';
import {
  raycastPhoneticStones,
  TapGestureTracker,
  type PhoneticStoneUserData,
} from '../phoneticStoneRaycaster';
import {
  auditMultiverseScenePerformance,
  buildMultiverseThemePrefab,
  MULTIVERSE_THEME_CONFIGS,
  type MultiverseEnvironmentPrefab,
  type MultiversePerformanceAudit,
  type MultiverseSceneId,
} from './multiverseEnvironments';
import {
  createLumiPetCompanionFX,
  createPhoneticStoneBurstFX,
  createPortalEnergyVortexFX,
  safeTextSprite,
  type LumiPetCompanionFX,
  type PhoneticStoneBurstFX,
  type PortalEnergyVortexFX,
  type PortalVortexState,
} from './multiverseVfx';
import {
  CENTRAL_PORTAL_STONE_ID,
  computePortalOpeningConfig,
  MULTIVERSE_PORTAL_TARGETS,
  type PortalGateState,
} from './portalRules';
import {
  createStonePositionalFormantRig,
  type StonePositionalFormantRig,
} from './positionalFormants';
import {
  createSpatialPortalCollider,
  type PortalStepThroughResult,
  type SpatialPortalCollider,
} from './portalCollision';
import { defaultNextRouteId } from '../../../../engine/questStateMachine';
import type { MoveInputMixer } from '../../../../client/spatialInput';
import { applyListenerPose, poseFromCamera, type SpatialAudioOut } from '../../../../client/spatialAudio';
import { createPhysicsWorld, loadRapier, type PhysicsWorld } from '../physics/rapierWorld';
import { createPortalExplorer, type PortalExplorer, type PortalTraverse } from './portalExplorer';

export interface MultiversePortalEnvironmentOptions {
  sceneId?: MultiverseSceneId;
  tier?: AssetQuality;
  loadGlb?: boolean;
  /** PR #6 integration: the game's shared audio for the stone's positional formants. */
  audio?: () => SpatialAudioOut | null;
}

export interface MultiversePortalSceneHandle {
  readonly root: THREE.Group;
  readonly interactiveGroup: THREE.Group;
  readonly portalGateGroup: THREE.Group;
  readonly centralPedestalGroup: THREE.Group;
  readonly petCompanionGroup: THREE.Group;
  readonly portalSparks: Sparks;
  readonly portalSpiralMesh: THREE.InstancedMesh;
  readonly portalVortexFX: PortalEnergyVortexFX;
  readonly stoneBurstFX: PhoneticStoneBurstFX;
  readonly lumiPetFX: LumiPetCompanionFX;
  readonly formantRig: StonePositionalFormantRig;
  readonly portalCollider: SpatialPortalCollider;
  getThemePrefab(): MultiverseEnvironmentPrefab;
  getSceneId(): MultiverseSceneId;
  getTier(): AssetQuality;
  setSceneTheme(sceneId: MultiverseSceneId, tier?: AssetQuality): MultiverseEnvironmentPrefab;
  getGateState(): PortalGateState;
  getVortexState(): PortalVortexState;
  setPortalVortexState(state: PortalVortexState): void;
  setActiveStone(targetId: string | null): void;
  setPetState(state: PetState): void;
  triggerPortalOpening(stars: 1 | 2 | 3): void;
  /** Evaluates AABB `THREE.Box3` step-through across the Render Target Portal plane and seamlessly transitions routes on the same WebGL context. */
  checkPortalStepThrough(
    prevPos: [number, number, number] | THREE.Vector3,
    nextPos: [number, number, number] | THREE.Vector3,
    autoAdvanceTheme?: boolean,
  ): PortalStepThroughResult;
  auditPerformance(): MultiversePerformanceAudit;
  update(dt: number, t: number, camera?: THREE.Camera): void;
  dispose(): void;
}

function buildArcaneTorch(
  at: [number, number, number],
  alt = false,
  loadGlb = true,
  tier: AssetQuality = 'high',
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
  if (loadGlb) {
    swapInGlb(holder, lib(alt ? 'mv_torch_3' : 'mv_torch', tier), 1.4, alive);
  }

  const flame = mesh(
    new THREE.OctahedronGeometry(0.22, 1),
    glow(alt ? 0x38bdf8 : 0xc084fc, 0.9, true),
    [0, 1.55, 0],
  );
  flame.userData.keep = true;

  group.add(holder, flame);
  return { group, flame };
}

/**
 * Builds the Multiverse Portal 3D environment (`GDS-TC-2026-EXP v2.6`):
 * - Modular theme prefab (`mv-01` Alexandria Archive .. `mv-05` Steam Foundry) with
 *   `THREE.InstancedMesh` clusters, `THREE.LOD` hierarchy, lighting rig, fog & skybox,
 *   and quest prop visual anchors (`chest`, `altar`, `stone_pedestal`, `portal_archway`).
 * - Majestic 3D Portal Gate with GPU `PortalEnergyVortexFX` (`IDLE` / `PORTAL_CHARGING` / `PORTAL_STABILIZED`).
 * - Central Phonetic Stone pedestal with GPU `PhoneticStoneBurstFX` upon voice/text calibration.
 * - Lumi Pet 3D Companion (`LumiPetCompanionFX`) with harmonic floating bob curve, soft glow aura,
 *   and movement particle trail.
 */
export function buildMultiversePortalEnvironment(
  alive: () => boolean = () => true,
  options: MultiversePortalEnvironmentOptions = {},
): MultiversePortalSceneHandle {
  let currentSceneId: MultiverseSceneId = options.sceneId ?? 'mv-01';
  let currentTier: AssetQuality = options.tier ?? 'high';
  const loadGlb = options.loadGlb ?? true;

  const root = new THREE.Group();
  root.name = 'MultiversePortalRoot';

  const themeHostGroup = new THREE.Group();
  themeHostGroup.name = 'MultiverseThemeHost';
  root.add(themeHostGroup);

  let themePrefab = buildMultiverseThemePrefab({
    sceneId: currentSceneId,
    tier: currentTier,
    loadGlb,
    alive,
  });
  themeHostGroup.add(themePrefab.root);

  const interactiveGroup = new THREE.Group();
  interactiveGroup.name = 'PhoneticStonesInteractiveGroup';
  root.add(interactiveGroup);

  // Stepped inner causeway leading from the central pedestal to the portal archway
  const innerRunway = mesh(
    new THREE.BoxGeometry(3.2, 0.14, 7.2),
    lowpoly(0x1e1b4b, { rough: 0.55, metal: 0.35, emissive: 0x4c1d95, glow: 0.3 }),
    [0, 0.05, 0.8],
  );
  root.add(innerRunway);

  // Arcane torches flanking the central stone pedestal
  const torches = [
    buildArcaneTorch([-2.3, 0, 1.8], false, loadGlb, currentTier, alive),
    buildArcaneTorch([2.3, 0, 1.8], false, loadGlb, currentTier, alive),
    buildArcaneTorch([-2.9, 0, -1.2], true, loadGlb, currentTier, alive),
    buildArcaneTorch([2.9, 0, -1.2], true, loadGlb, currentTier, alive),
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
  const outerTorus = mesh(new THREE.TorusGeometry(2.05, 0.14, 12, 36), outerTorusMat);
  outerRuneRing.add(outerTorus);

  // Instanced rune nodes along the outer ring (1 draw call instead of 8)
  const runeNodeGeo = new THREE.OctahedronGeometry(0.16, 0);
  const runeNodeMat = glow(0x38bdf8, 0.8, true);
  const runeNodesInstanced = new THREE.InstancedMesh(runeNodeGeo, runeNodeMat, 8);
  runeNodesInstanced.name = 'PortalOuterRuneNodes';
  const tmpM = new THREE.Matrix4();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    tmpM.makeTranslation(Math.cos(angle) * 2.05, Math.sin(angle) * 2.05, 0.08);
    runeNodesInstanced.setMatrixAt(i, tmpM);
  }
  runeNodesInstanced.instanceMatrix.needsUpdate = true;
  outerRuneRing.add(runeNodesInstanced);

  const innerRuneRing = new THREE.Group();
  innerRuneRing.position.set(0, 2.75, 0.14);
  const innerTorusMat = glow(0x38bdf8, 0.7, true);
  const innerTorus = mesh(new THREE.TorusGeometry(1.68, 0.07, 10, 32), innerTorusMat);
  innerRuneRing.add(innerTorus);

  // Swirling Portal Vortex Iris (`portalVortexGroup`)
  const portalVortexGroup = new THREE.Group();
  portalVortexGroup.name = 'PortalVortexIris';
  portalVortexGroup.position.set(0, 2.75, 0.05);
  portalVortexGroup.scale.setScalar(0.08);

  const vortexCoreMat = glow(0x38bdf8, 0.82, true);
  const vortexCoreDisc = mesh(new THREE.CircleGeometry(1.62, 32), vortexCoreMat, [0, 0, 0]);
  const vortexSwirlMat = glow(0xc084fc, 0.68, true);
  const vortexSwirlRing = mesh(
    new THREE.RingGeometry(0.75, 1.45, 28),
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

  // 2a) GPU Portal Energy Vortex FX (`THREE.Points` + custom ShaderMaterial)
  const portalVortexFX = createPortalEnergyVortexFX({
    particleCount: currentTier === 'low' ? 96 : 160,
    primaryColor: themePrefab.meta.primaryColorHex,
    secondaryColor: themePrefab.meta.secondaryColorHex,
    position: [0, 2.75, 0.18],
  });

  const gateBanner = safeTextSprite('MULTIVERSE PORTAL GATE', {
    color: '#e9d5ff',
    bg: 'rgba(30, 27, 75, 0.9)',
    border: '#a855f7',
    height: 0.42,
  });
  gateBanner.position.set(0, 5.55, 0);

  portalGateGroup.add(
    outerRuneRing,
    innerRuneRing,
    portalVortexGroup,
    portalVortexFX.group,
    gateBanner,
  );

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
    new THREE.RingGeometry(0.82, 1.05, 28),
    pedestalRuneRingMat,
    [0, 0.08, 0],
  );
  pedestalRuneRing.rotation.x = -Math.PI / 2;

  const pedestalLabel = safeTextSprite(`🔮 ${centralTarget.text} ${centralTarget.ipa}`, {
    color: '#fef08a',
    bg: 'rgba(30, 27, 75, 0.92)',
    border: '#facc15',
    height: 0.36,
  });
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

  // 2b) Phonetic Stone Burst FX (radiant energy ring expansion + GPU particle burst)
  const stoneBurstFX = createPhoneticStoneBurstFX({
    particleCount: currentTier === 'low' ? 64 : 96,
    origin: [0, 1.62, 2.2],
  });
  root.add(stoneBurstFX.group);

  // 3.1) Web Audio API Positional Formants anchored at the Phonetic Stone coordinates
  const formantRig = createStonePositionalFormantRig({
    stonePosition: [0, 1.62, 2.2],
    ipa: centralTarget.ipa,
    audio: options.audio,
  });
  root.add(formantRig.anchorNode);

  // 3.2) Spatial Portal AABB (`THREE.Box3`) Collider along the Render Target Portal plane
  const portalCollider = createSpatialPortalCollider({
    center: [0, 2.2, -2.0],
    width: 3.6,
    height: 4.4,
    thickness: 0.65,
  });

  // Energy Conduit Beam connecting the Central Pedestal to the Portal Gate
  const conduitBeamMat = glow(0x38bdf8, 0.25, true);
  const conduitBeam = mesh(
    new THREE.CylinderGeometry(0.08, 0.14, 4.2, 10),
    conduitBeamMat,
    [0, 1.45, 0.1],
  );
  conduitBeam.rotation.x = Math.PI / 2;
  root.add(conduitBeam);

  // 2c) Lumi Pet Companion FX (floating bob curve, soft ambient glow aura, movement trail)
  const lumiPetFX = createLumiPetCompanionFX({
    position: [1.35, 0.55, 2.1],
    trailCount: currentTier === 'low' ? 24 : 36,
    label: 'LUMI PET',
  });
  const petCompanionGroup = lumiPetFX.petMeshGroup;
  root.add(lumiPetFX.group);

  // =========================================================================
  // GLOWING PARTICLE ANIMATION FOR PORTAL OPENING SEQUENCE
  // =========================================================================
  const portalSparks = new Sparks(180, new THREE.IcosahedronGeometry(0.085, 0), true);
  root.add(portalSparks.mesh);

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

  return {
    root,
    interactiveGroup,
    portalGateGroup,
    centralPedestalGroup,
    petCompanionGroup,
    portalSparks,
    portalSpiralMesh,
    portalVortexFX,
    stoneBurstFX,
    lumiPetFX,
    formantRig,
    portalCollider,

    getThemePrefab() {
      return themePrefab;
    },

    getSceneId() {
      return currentSceneId;
    },

    getTier() {
      return currentTier;
    },

    setSceneTheme(sceneId: MultiverseSceneId, tier: AssetQuality = currentTier) {
      currentSceneId = sceneId;
      currentTier = tier;
      themeHostGroup.remove(themePrefab.root);
      themePrefab.dispose();

      themePrefab = buildMultiverseThemePrefab({
        sceneId,
        tier,
        loadGlb,
        alive,
      });
      themeHostGroup.add(themePrefab.root);
      portalVortexFX.setThemeColors(
        themePrefab.meta.primaryColorHex,
        themePrefab.meta.secondaryColorHex,
      );
      return themePrefab;
    },

    getGateState() {
      return gateState;
    },

    getVortexState() {
      return portalVortexFX.getState();
    },

    setPortalVortexState(state: PortalVortexState) {
      portalVortexFX.setState(state);
    },

    setActiveStone(targetId: string | null) {
      activeStoneId = targetId;
      if (targetId && gateState === 'locked') {
        portalVortexFX.setState('PORTAL_CHARGING');
      } else if (!targetId && gateState === 'locked') {
        portalVortexFX.setState('IDLE');
      }
      refreshCentralStoneVisual();
    },

    setPetState(state: PetState) {
      lumiPetFX.setPetState(state);
    },

    triggerPortalOpening(stars: 1 | 2 | 3) {
      const cfg = computePortalOpeningConfig(stars);
      gateState = 'opening';
      openingPulseTimer = 1.8;
      vortexTargetScale = cfg.vortexTargetScale;
      spiralOrbitSpeed = cfg.spiralOrbitSpeed;

      // Transition Portal Energy Vortex to PORTAL_STABILIZED, fire Phonetic Stone Burst FX & Positional Formant Resonance
      portalVortexFX.setThemeColors(cfg.primaryColorHex, cfg.secondaryColorHex);
      portalVortexFX.setState('PORTAL_STABILIZED');
      stoneBurstFX.triggerBurst(pedestalEmitPos, stars);
      formantRig.triggerFormantResonance({ ipa: centralTarget.ipa, stars });

      for (let i = 0; i < SPIRAL_COUNT; i++) {
        portalSpiralMesh.setColorAt(
          i,
          spiralColor.setHex(i % 2 === 0 ? cfg.primaryColorHex : cfg.secondaryColorHex),
        );
      }
      if (portalSpiralMesh.instanceColor) {
        portalSpiralMesh.instanceColor.needsUpdate = true;
      }

      runeNodeMat.color.setHex(cfg.primaryColorHex);
      runeNodeMat.opacity = 0.98;
      conduitBeamMat.color.setHex(cfg.primaryColorHex);
      conduitBeamMat.opacity = 0.88;
      vortexCoreMat.color.setHex(cfg.secondaryColorHex);
      vortexSwirlMat.color.setHex(cfg.primaryColorHex);

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
    },

    checkPortalStepThrough(prevPos, nextPos, autoAdvanceTheme = true) {
      const stabilized =
        gateState === 'open' ||
        gateState === 'opening' ||
        portalVortexFX.getState() === 'PORTAL_STABILIZED';
      const result = portalCollider.detectStepThrough(prevPos, nextPos, stabilized);
      if (result.triggeredWarp && autoAdvanceTheme) {
        const nextRoute = defaultNextRouteId(currentSceneId);
        if (nextRoute) {
          this.setSceneTheme(nextRoute, currentTier);
        }
      }
      return result;
    },

    auditPerformance() {
      return auditMultiverseScenePerformance({
        sceneId: currentSceneId,
        tier: currentTier,
        meta: MULTIVERSE_THEME_CONFIGS[currentSceneId],
        root,
        instancedMeshes: {
          ...themePrefab.instancedMeshes,
          portalSpiral: portalSpiralMesh,
          runeNodes: runeNodesInstanced,
        },
        lodGroups: themePrefab.lodGroups,
      });
    },

    update(dt: number, t: number, camera?: THREE.Camera) {
      if (openingPulseTimer > 0) {
        openingPulseTimer = Math.max(0, openingPulseTimer - dt);
        if (openingPulseTimer === 0 && gateState === 'opening') {
          gateState = 'open';
        }
      }

      // Update active Multiverse room prefab (shaders, animations, LOD levels)
      themePrefab.update(dt, t, camera);

      // Update GPU VFX systems (`PortalEnergyVortexFX`, `PhoneticStoneBurstFX`, `LumiPetCompanionFX`)
      portalVortexFX.update(dt, t);
      stoneBurstFX.update(dt, t);
      lumiPetFX.update(dt, t);

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

      // Update pooled spark burst particles
      portalSparks.update(dt);
    },

    dispose() {
      formantRig.dispose();
      disposeObject(root);
    },
  };
}

function clampScale(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export interface MountMultiversePortalOptions {
  container: HTMLElement;
  sceneId?: MultiverseSceneId;
  tier?: AssetQuality;
  onStoneSelected?: (userData: PhoneticStoneUserData) => void;
  /**
   * PR #6 integration: the game's shared audio. The Web Audio listener follows the camera every
   * frame so the stone's formant resonance is heard from the stone.
   */
  audio?: () => SpatialAudioOut | null;
  /**
   * PR #6 integration: the player walks the room (Rapier character, joystick / keys from the mixer).
   * Stepping through a STABILISED portal fires onPortalTraverse (WARP_TRANSITION) and the room
   * changes on the same WebGL context.
   */
  player?: {
    mixer: MoveInputMixer;
    onPortalTraverse?: (t: PortalTraverse & { fromRoute: MultiverseSceneId; toRoute: MultiverseSceneId }) => void;
  };
}

export interface MountedMultiversePortalStage {
  readonly sceneHandle: MultiversePortalSceneHandle;
  /** Present once physics has loaded (player option only). */
  readonly explorer: PortalExplorer | null;
  dispose(): void;
}

/** Entry point of every room: in front of the central pedestal, facing the portal (−Z). */
export const MULTIVERSE_SPAWN = { x: 0, y: 0.05, z: 5.2 };

/**
 * Mounts the Multiverse Portal 3D WebGL stage inside `container` and wires
 * `THREE.Raycaster` tap detection against the central Phonetic Stone pedestal.
 */
export function mountMultiversePortalScene(
  options: MountMultiversePortalOptions,
): MountedMultiversePortalStage {
  const { container, sceneId = 'mv-01', tier = 'high', onStoneSelected } = options;
  let alive = true;

  const initialMeta = MULTIVERSE_THEME_CONFIGS[sceneId];
  const stage = createStage(container, {
    fov: 50,
    near: 0.1,
    far: 200,
    background: initialMeta.fogColorHex,
  });
  stage.scene.fog = new THREE.FogExp2(initialMeta.fogColorHex, initialMeta.fogDensity);

  stage.camera.position.set(0, 3.6, 7.6);
  stage.camera.lookAt(0, 2.1, -0.8);

  const sceneHandle = buildMultiversePortalEnvironment(() => alive, {
    sceneId,
    tier,
    audio: options.audio,
  });
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

  // Player physics (optional): loaded lazily, the room is usable before it arrives.
  let phys: PhysicsWorld | null = null;
  let explorer: PortalExplorer | null = null;
  if (options.player) {
    const player = options.player;
    void loadRapier().then((R) => {
      if (!alive) return;
      phys = createPhysicsWorld(R);
      phys.addGround(0, 60);
      // The central pedestal is solid; the portal arch is NOT (it is walked through).
      const pedestal = new THREE.Box3().setFromObject(sceneHandle.centralPedestalGroup);
      if (!pedestal.isEmpty()) {
        const c = pedestal.getCenter(new THREE.Vector3());
        const h = pedestal.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        phys.addBox({ x: c.x, y: c.y, z: c.z }, { x: Math.max(0.2, h.x), y: Math.max(0.2, h.y), z: Math.max(0.2, h.z) });
      }
      explorer = createPortalExplorer(phys, {
        spawn: MULTIVERSE_SPAWN,
        checkPortal: (prev, next) => {
          const fromRoute = sceneHandle.getSceneId();
          const r = sceneHandle.checkPortalStepThrough(prev, next, true);
          if (r.triggeredWarp) lastTraverse = { fromRoute, toRoute: sceneHandle.getSceneId() };
          return r;
        },
        onTraverse: (t) => {
          if (lastTraverse) player.onPortalTraverse?.({ ...t, ...lastTraverse });
          lastTraverse = null;
        },
      });
    });
  }
  let lastTraverse: { fromRoute: MultiverseSceneId; toRoute: MultiverseSceneId } | null = null;
  const camTarget = new THREE.Vector3();

  stage.run((dt: number, t: number) => {
    const prefab = sceneHandle.getThemePrefab();
    stage.scene.fog = prefab.lighting.fog;
    if (explorer && options.player) {
      explorer.step(dt, options.player.mixer.read(), 0);
      const p = explorer.character.renderPosition(phys?.alpha ?? 1);
      camTarget.set(p.x, p.y + 3.4, p.z + 6.2);
      stage.camera.position.lerp(camTarget, Math.min(1, dt * 4));
      stage.camera.lookAt(p.x, p.y + 1.4, p.z - 2);
    }
    sceneHandle.update(dt, t, stage.camera);
    // The listener follows the camera: positional sounds come from where they are in the room.
    const out = options.audio?.();
    if (out) applyListenerPose(out.context, poseFromCamera(stage.camera));
  });

  return {
    sceneHandle,
    get explorer() {
      return explorer;
    },
    dispose() {
      alive = false;
      explorer?.dispose();
      (phys as PhysicsWorld | null)?.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      sceneHandle.dispose();
      stage.dispose();
    },
  };
}
