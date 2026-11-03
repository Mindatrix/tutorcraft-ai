import * as THREE from 'three';
import { lib, type AssetQuality } from '../../../../config/assetLibrary';
import {
  disposeObject,
  glow,
  lowpoly,
  mesh,
  roughen,
  skyDome,
  swapInGlb,
} from '../../kit';
import { safeTextSprite } from './multiverseVfx';

// ============================================================================
// GDS-TC-2026-EXP v2.6 — Sections 1 & 3:
// 1. 3D Room & Environment Prefab Assembly (`mv-01` to `mv-05`)
//    - Procedural scene hierarchies, DirectionalLight, HemisphereLight,
//      ambient anchors, environmental FogExp2, and skyboxes.
//    - Visual anchors for interactive quest props (chests, altars,
//      stone pedestals, portal archways) without hardcoded gameplay logic.
// 3. Draw Call & LOD Optimization
//    - Repeated environmental meshes (ruins, vines, crystals, pipes) use
//      `THREE.InstancedMesh`.
//    - Complex 3D focal structures use `THREE.LOD` across `high` and `low`
//      device tiers.
//    - Performance budgets enforced:
//      Low-tier:  <= 15 MB VRAM / <= 300 draw calls
//      High-tier: <= 40 MB VRAM
// ============================================================================

export type MultiverseSceneId = 'mv-01' | 'mv-02' | 'mv-03' | 'mv-04' | 'mv-05';

export const MULTIVERSE_SCENE_IDS: readonly MultiverseSceneId[] = [
  'mv-01',
  'mv-02',
  'mv-03',
  'mv-04',
  'mv-05',
] as const;

export type QuestPropType = 'chest' | 'altar' | 'stone_pedestal' | 'portal_archway';

export interface QuestPropAnchorUserData {
  kind: 'quest_prop_anchor';
  anchorId: string;
  sceneId: MultiverseSceneId;
  propType: QuestPropType;
  label: string;
}

export interface MultiverseLightingRig {
  readonly directionalLight: THREE.DirectionalLight;
  readonly hemisphereLight: THREE.HemisphereLight;
  readonly ambientAnchorGroup: THREE.Group;
  readonly fog: THREE.FogExp2;
  readonly backgroundHex: number;
}

export interface MultiverseThemeMetadata {
  readonly id: MultiverseSceneId;
  readonly nameEn: string;
  readonly nameVi: string;
  readonly subtitle: string;
  readonly primaryColorHex: number;
  readonly secondaryColorHex: number;
  readonly fogColorHex: number;
  readonly fogDensity: number;
  readonly skyZenithHex: number;
  readonly skyHorizonHex: number;
  readonly skyGroundHex: number;
  readonly hemiSkyHex: number;
  readonly hemiGroundHex: number;
  readonly hemiIntensity: number;
  readonly dirLightHex: number;
  readonly dirLightIntensity: number;
  readonly dirLightPos: [number, number, number];
  /** Catalog GLB IDs referenced for LOD level 0 enrichment (kept well within VRAM budget). */
  readonly catalogAssetIds: readonly string[];
  /** Estimated catalog GLB footprint in MB for High and Low tiers (from content/asset_catalog.json). */
  readonly catalogVramMb: { readonly high: number; readonly low: number };
}

export const MULTIVERSE_THEME_CONFIGS: Record<MultiverseSceneId, MultiverseThemeMetadata> = {
  'mv-01': {
    id: 'mv-01',
    nameEn: 'Alexandria Archive',
    nameVi: 'Thư Viện Alexandria Ngầm',
    subtitle: 'Submerged marble ruins, papyrus pedestals & aquatic refraction lighting',
    primaryColorHex: 0x38bdf8,
    secondaryColorHex: 0x2dd4bf,
    fogColorHex: 0x06283d,
    fogDensity: 0.021,
    skyZenithHex: 0x041c2c,
    skyHorizonHex: 0x0c4a6e,
    skyGroundHex: 0x021019,
    hemiSkyHex: 0x7dd3fc,
    hemiGroundHex: 0x082f49,
    hemiIntensity: 0.92,
    dirLightHex: 0x38bdf8,
    dirLightIntensity: 1.35,
    dirLightPos: [5, 14, 7],
    catalogAssetIds: ['mv_ruin_building', 'mv_castle_module'],
    catalogVramMb: { high: 11.92, low: 4.43 },
  },
  'mv-02': {
    id: 'mv-02',
    nameEn: 'Cyber-Babel',
    nameVi: 'Hẻm Điện Toán Cyber-Babel',
    subtitle: 'Cyberpunk alleyways, neon hologram billboards & data conduits',
    primaryColorHex: 0x22d3ee,
    secondaryColorHex: 0xf472b6,
    fogColorHex: 0x14072b,
    fogDensity: 0.02,
    skyZenithHex: 0x05020f,
    skyHorizonHex: 0x4a044e,
    skyGroundHex: 0x090314,
    hemiSkyHex: 0xf472b6,
    hemiGroundHex: 0x0f0728,
    hemiIntensity: 0.9,
    dirLightHex: 0x22d3ee,
    dirLightIntensity: 1.3,
    dirLightPos: [-6, 13, 6],
    catalogAssetIds: ['mv_cyber_room', 'mv_salon_furniture_3'],
    catalogVramMb: { high: 4.22, low: 1.88 },
  },
  'mv-03': {
    id: 'mv-03',
    nameEn: 'Chrono-Forest',
    nameVi: 'Rừng Thời Gian Phát Quang',
    subtitle: 'Bioluminescent mushrooms, petrified giant trees & temporal fog',
    primaryColorHex: 0x34d399,
    secondaryColorHex: 0xa78bfa,
    fogColorHex: 0x082622,
    fogDensity: 0.023,
    skyZenithHex: 0x041b18,
    skyHorizonHex: 0x134e4a,
    skyGroundHex: 0x021210,
    hemiSkyHex: 0x6ee7b7,
    hemiGroundHex: 0x062c22,
    hemiIntensity: 0.95,
    dirLightHex: 0xa7f3d0,
    dirLightIntensity: 1.25,
    dirLightPos: [4, 15, 5],
    catalogAssetIds: ['mv_world_enchanted_candidate', 'mv_torch_4'],
    catalogVramMb: { high: 10.73, low: 3.56 },
  },
  'mv-04': {
    id: 'mv-04',
    nameEn: 'Nebula Spire',
    nameVi: 'Đài Tinh Vân Thiên Cầu',
    subtitle: 'Cosmic astrolabe platforms & floating crystal lenses',
    primaryColorHex: 0xfacc15,
    secondaryColorHex: 0x818cf8,
    fogColorHex: 0x0d0628,
    fogDensity: 0.015,
    skyZenithHex: 0x03010a,
    skyHorizonHex: 0x311068,
    skyGroundHex: 0x050212,
    hemiSkyHex: 0xc4b5fd,
    hemiGroundHex: 0x090418,
    hemiIntensity: 0.94,
    dirLightHex: 0xfde047,
    dirLightIntensity: 1.4,
    dirLightPos: [7, 14, 6],
    catalogAssetIds: ['mv_castle_module_4', 'mv_torch_5'],
    catalogVramMb: { high: 7.64, low: 3.08 },
  },
  'mv-05': {
    id: 'mv-05',
    nameEn: 'Steam Foundry',
    nameVi: 'Xưởng Đúc Hơi Nước Đồng Thau',
    subtitle: 'Brass pressure manometers, glowing furnaces & steam vents',
    primaryColorHex: 0xfb923c,
    secondaryColorHex: 0x38bdf8,
    fogColorHex: 0x23120b,
    fogDensity: 0.021,
    skyZenithHex: 0x120804,
    skyHorizonHex: 0x5c2410,
    skyGroundHex: 0x0c0503,
    hemiSkyHex: 0xfed7aa,
    hemiGroundHex: 0x1c1008,
    hemiIntensity: 0.92,
    dirLightHex: 0xfb923c,
    dirLightIntensity: 1.45,
    dirLightPos: [-5, 13, 7],
    catalogAssetIds: ['mv_wall_breach', 'mv_torch_2'],
    catalogVramMb: { high: 12.6, low: 5.0 },
  },
};

export interface LODDistanceThresholds {
  readonly highDetailMaxDist: number;
  readonly mediumDetailMaxDist: number;
  readonly lowProxyStartDist: number;
}

export const LOD_DISTANCES_BY_TIER: Record<AssetQuality, LODDistanceThresholds> = {
  high: {
    highDetailMaxDist: 0,
    mediumDetailMaxDist: 18,
    lowProxyStartDist: 38,
  },
  mid: {
    highDetailMaxDist: 0,
    mediumDetailMaxDist: 14,
    lowProxyStartDist: 30,
  },
  low: {
    highDetailMaxDist: 0,
    mediumDetailMaxDist: 10,
    lowProxyStartDist: 22,
  },
};

export const PERFORMANCE_BUDGET_LIMITS: Record<
  AssetQuality,
  { readonly maxVramMb: number; readonly maxDrawCalls: number }
> = {
  low: {
    maxVramMb: 15,
    maxDrawCalls: 300,
  },
  mid: {
    maxVramMb: 28,
    maxDrawCalls: 360,
  },
  high: {
    maxVramMb: 40,
    maxDrawCalls: 450,
  },
} as const;

export interface MultiversePerformanceAudit {
  readonly sceneId: MultiverseSceneId;
  readonly tier: AssetQuality;
  readonly drawCalls: number;
  readonly instancedMeshCount: number;
  readonly totalInstances: number;
  readonly lodGroupCount: number;
  readonly geometryVramMb: number;
  readonly totalEstimatedVramMb: number;
  readonly withinVramBudget: boolean;
  readonly withinDrawCallBudget: boolean;
  readonly passesAllBudgets: boolean;
}

export interface MultiverseEnvironmentPrefab {
  readonly sceneId: MultiverseSceneId;
  readonly tier: AssetQuality;
  readonly meta: MultiverseThemeMetadata;
  readonly root: THREE.Group;
  readonly skybox: THREE.Mesh;
  readonly lighting: MultiverseLightingRig;
  readonly questAnchorsGroup: THREE.Group;
  readonly questAnchors: Record<QuestPropType, THREE.Group>;
  readonly instancedMeshes: Record<string, THREE.InstancedMesh>;
  readonly lodGroups: THREE.LOD[];
  update(dt: number, t: number, camera?: THREE.Camera): void;
  auditPerformance(): MultiversePerformanceAudit;
  dispose(): void;
}

export interface BuildMultiverseEnvironmentOptions {
  sceneId: MultiverseSceneId;
  tier?: AssetQuality;
  /** Set false in unit tests to skip asynchronous GLB network fetches while keeping full hierarchy. */
  loadGlb?: boolean;
  alive?: () => boolean;
}

// ---------------------------------------------------------------------------
// Shared helper: populate an InstancedMesh from a list of transforms & colors
// ---------------------------------------------------------------------------
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

export interface InstanceTransformSpec {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number] | number;
  colorHex?: number;
}

function buildInstancedCluster(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  specs: readonly InstanceTransformSpec[],
): THREE.InstancedMesh {
  const count = specs.length;
  const inst = new THREE.InstancedMesh(geometry, material, count);
  inst.name = name;

  for (let i = 0; i < count; i++) {
    const s = specs[i];
    _pos.set(s.position[0], s.position[1], s.position[2]);
    if (s.rotation) {
      _euler.set(s.rotation[0], s.rotation[1], s.rotation[2]);
      _quat.setFromEuler(_euler);
    } else {
      _quat.identity();
    }
    if (typeof s.scale === 'number') {
      _scale.setScalar(s.scale);
    } else if (s.scale) {
      _scale.set(s.scale[0], s.scale[1], s.scale[2]);
    } else {
      _scale.set(1, 1, 1);
    }
    _mat4.compose(_pos, _quat, _scale);
    inst.setMatrixAt(i, _mat4);
    if (s.colorHex !== undefined) {
      inst.setColorAt(i, _color.setHex(s.colorHex));
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) {
    inst.instanceColor.needsUpdate = true;
  }
  return inst;
}

// ---------------------------------------------------------------------------
// Shared helper: build a 3-level `THREE.LOD` asset node
// ---------------------------------------------------------------------------
function createThreeTierLOD(
  name: string,
  position: [number, number, number],
  tier: AssetQuality,
  levels: {
    high: THREE.Object3D;
    medium: THREE.Object3D;
    low: THREE.Object3D;
  },
  glbSpec?: {
    assetId: string;
    targetHeight: number;
    loadGlb: boolean;
    alive: () => boolean;
  },
): THREE.LOD {
  const lod = new THREE.LOD();
  lod.name = name;
  lod.position.set(position[0], position[1], position[2]);

  const d = LOD_DISTANCES_BY_TIER[tier];
  if (tier === 'low') {
    // Low-tier profile uses medium procedural geometry at close distance and low proxy early
    lod.addLevel(levels.medium, d.highDetailMaxDist);
    lod.addLevel(levels.low, d.mediumDetailMaxDist);
  } else {
    lod.addLevel(levels.high, d.highDetailMaxDist);
    lod.addLevel(levels.medium, d.mediumDetailMaxDist);
    lod.addLevel(levels.low, d.lowProxyStartDist);
  }

  if (glbSpec && glbSpec.loadGlb) {
    const closeHolder = tier === 'low' ? levels.medium : levels.high;
    if (closeHolder instanceof THREE.Group) {
      swapInGlb(closeHolder, lib(glbSpec.assetId, tier), glbSpec.targetHeight, glbSpec.alive);
    }
  }

  return lod;
}

// ---------------------------------------------------------------------------
// Visual Anchors for Interactive Quest Props (No Hardcoded Game Logic)
// ---------------------------------------------------------------------------
function buildQuestPropAnchors(
  sceneId: MultiverseSceneId,
  primaryHex: number,
  secondaryHex: number,
): {
  group: THREE.Group;
  anchors: Record<QuestPropType, THREE.Group>;
} {
  const group = new THREE.Group();
  group.name = `QuestPropAnchors_${sceneId}`;

  const createAnchor = (
    propType: QuestPropType,
    pos: [number, number, number],
    rotY: number,
    label: string,
    visualBuilder: () => THREE.Object3D,
  ): THREE.Group => {
    const anchor = new THREE.Group();
    anchor.name = `QuestAnchor_${propType}`;
    anchor.position.set(pos[0], pos[1], pos[2]);
    anchor.rotation.y = rotY;
    const userData: QuestPropAnchorUserData = {
      kind: 'quest_prop_anchor',
      anchorId: `${sceneId}_${propType}`,
      sceneId,
      propType,
      label,
    };
    anchor.userData = userData;
    anchor.add(visualBuilder());
    group.add(anchor);
    return anchor;
  };

  // 1. Chest anchor (`chest`)
  const chest = createAnchor('chest', [-3.8, 0.0, 1.4], 0.42, 'Relic Chest', () => {
    const g = new THREE.Group();
    const base = mesh(
      new THREE.BoxGeometry(0.95, 0.55, 0.65),
      lowpoly(0x334155, { rough: 0.5, metal: 0.45, emissive: primaryHex, glow: 0.22 }),
      [0, 0.28, 0],
    );
    const lid = mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.95, 8, 1, false, 0, Math.PI),
      lowpoly(0x475569, { rough: 0.4, metal: 0.55, emissive: secondaryHex, glow: 0.3 }),
      [0, 0.55, 0],
    );
    lid.rotation.z = Math.PI / 2;
    const ring = mesh(new THREE.RingGeometry(0.62, 0.76, 20), glow(primaryHex, 0.45, true), [
      0,
      0.03,
      0,
    ]);
    ring.rotation.x = -Math.PI / 2;
    g.add(base, lid, ring);
    return g;
  });

  // 2. Altar anchor (`altar`)
  const altar = createAnchor('altar', [3.8, 0.0, 1.4], -0.42, 'Harmonic Altar', () => {
    const g = new THREE.Group();
    const plinth = mesh(
      new THREE.CylinderGeometry(0.75, 0.95, 0.9, 8),
      lowpoly(0x1e293b, { rough: 0.55, metal: 0.35, emissive: secondaryHex, glow: 0.25 }),
      [0, 0.45, 0],
    );
    const chalice = mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      glow(secondaryHex, 0.85, true),
      [0, 1.18, 0],
    );
    g.add(plinth, chalice);
    return g;
  });

  // 3. Stone Pedestal anchor (`stone_pedestal`)
  const stone_pedestal = createAnchor(
    'stone_pedestal',
    [0, 0.0, 2.2],
    0,
    'Calibration Pedestal',
    () => {
      const g = new THREE.Group();
      const baseRing = mesh(
        new THREE.RingGeometry(0.95, 1.12, 24),
        glow(primaryHex, 0.4, true),
        [0, 0.03, 0],
      );
      baseRing.rotation.x = -Math.PI / 2;
      g.add(baseRing);
      return g;
    },
  );

  // 4. Portal Archway anchor (`portal_archway`)
  const portal_archway = createAnchor(
    'portal_archway',
    [0, 0.0, -2.0],
    0,
    'Spatial Portal Archway',
    () => {
      const g = new THREE.Group();
      const thresholdRing = mesh(
        new THREE.RingGeometry(2.6, 2.95, 28),
        glow(secondaryHex, 0.38, true),
        [0, 0.03, 0],
      );
      thresholdRing.rotation.x = -Math.PI / 2;
      g.add(thresholdRing);
      return g;
    },
  );

  return {
    group,
    anchors: {
      chest,
      altar,
      stone_pedestal,
      portal_archway,
    },
  };
}

// ---------------------------------------------------------------------------
// Theme Specific Procedural Builders (`mv-01` .. `mv-05`)
// ---------------------------------------------------------------------------

function assembleAlexandriaArchive(
  root: THREE.Group,
  tier: AssetQuality,
  instancedMeshes: Record<string, THREE.InstancedMesh>,
  lodGroups: THREE.LOD[],
  loadGlb: boolean,
  alive: () => boolean,
): (dt: number, t: number) => void {
  // 1. Sunken marble floor + aquatic refraction shader plane
  const marbleFloor = mesh(
    new THREE.CylinderGeometry(11.5, 12.2, 0.5, 28),
    lowpoly(0x0f293a, { rough: 0.45, metal: 0.25, emissive: 0x0c4a6e, glow: 0.25 }),
    [0, -0.26, 0],
  );
  root.add(marbleFloor);

  const causticMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWaterColor: { value: new THREE.Color(0x38bdf8) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 6.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uWaterColor;
      varying vec2 vUv;
      void main() {
        float w1 = sin(vUv.x * 3.1 + uTime * 1.6) * cos(vUv.y * 2.9 - uTime * 1.3);
        float w2 = sin((vUv.x + vUv.y) * 2.4 - uTime * 2.1);
        float caustic = smoothstep(0.35, 0.92, abs(w1 + w2 * 0.5));
        gl_FragColor = vec4(uWaterColor * (0.45 + caustic * 0.85), caustic * 0.36);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const causticPlane = mesh(new THREE.RingGeometry(1.1, 9.8, 32), causticMat, [0, 0.03, 0]);
  causticPlane.rotation.x = -Math.PI / 2;
  causticPlane.name = 'AquaticRefractionCaustics';
  root.add(causticPlane);

  // 2. Instanced Submerged Marble Ruins (`ruins` - 12 fluted columns & broken architraves)
  const ruinSpecs: InstanceTransformSpec[] = [];
  const columnCount = tier === 'low' ? 8 : 12;
  for (let i = 0; i < columnCount; i++) {
    const angle = (i / columnCount) * Math.PI * 2 + 0.22;
    const radius = i % 2 === 0 ? 7.2 : 9.4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius - 1.2;
    if (z > 3.6 && Math.abs(x) < 3.4) continue;
    const hScale = 0.75 + ((i * 29) % 50) * 0.012;
    ruinSpecs.push({
      position: [x, 1.9 * hScale, z],
      rotation: [(i % 3 - 1) * 0.06, angle, 0],
      scale: [1, hScale, 1],
      colorHex: i % 2 === 0 ? 0xbae6fd : 0x7dd3fc,
    });
  }
  const ruinGeo = roughen(new THREE.CylinderGeometry(0.42, 0.52, 3.8, 8), 0.03, 19);
  const ruinMat = lowpoly(0xcffafe, {
    rough: 0.55,
    metal: 0.2,
    emissive: 0x0284c7,
    glow: 0.24,
  });
  const instancedRuins = buildInstancedCluster('InstancedMarbleRuins', ruinGeo, ruinMat, ruinSpecs);
  instancedMeshes.ruins = instancedRuins;
  root.add(instancedRuins);

  // 3. Papyrus Pedestal Shrines (`THREE.LOD` x 2 flanking the sanctum)
  const papyrusPositions: [number, number, number][] = [
    [-4.8, 0, -2.4],
    [4.8, 0, -2.4],
  ];
  for (let i = 0; i < papyrusPositions.length; i++) {
    const highGrp = new THREE.Group();
    const stand = mesh(
      new THREE.CylinderGeometry(0.55, 0.72, 1.4, 12),
      lowpoly(0xe0f2fe, { rough: 0.45, metal: 0.3, emissive: 0x0369a1, glow: 0.3 }),
      [0, 0.7, 0],
    );
    const scroll = mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.85, 10),
      glow(0xfef08a, 0.88, true),
      [0, 1.65, 0],
    );
    scroll.rotation.z = Math.PI / 2;
    highGrp.add(stand, scroll);

    const medGrp = new THREE.Group();
    medGrp.add(
      mesh(
        new THREE.CylinderGeometry(0.52, 0.68, 1.4, 8),
        lowpoly(0xbae6fd, { rough: 0.6, metal: 0.2 }),
        [0, 0.7, 0],
      ),
    );

    const lowProxy = mesh(
      new THREE.BoxGeometry(0.9, 1.4, 0.9),
      lowpoly(0x0c4a6e),
      [0, 0.7, 0],
    );

    const lod = createThreeTierLOD(
      `PapyrusPedestalLOD_${i}`,
      papyrusPositions[i],
      tier,
      { high: highGrp, medium: medGrp, low: lowProxy },
      {
        assetId: i === 0 ? 'mv_ruin_building' : 'mv_castle_module',
        targetHeight: 3.4,
        loadGlb,
        alive,
      },
    );
    lodGroups.push(lod);
    root.add(lod);
  }

  return (_dt: number, t: number) => {
    causticMat.uniforms.uTime.value = t;
  };
}

function assembleCyberBabel(
  root: THREE.Group,
  tier: AssetQuality,
  instancedMeshes: Record<string, THREE.InstancedMesh>,
  lodGroups: THREE.LOD[],
  loadGlb: boolean,
  alive: () => boolean,
): (dt: number, t: number) => void {
  // 1. Cyber-grid floor
  const floor = mesh(
    new THREE.CylinderGeometry(11.5, 12.0, 0.45, 24),
    lowpoly(0x0f0728, { rough: 0.35, metal: 0.65, emissive: 0x3b0764, glow: 0.35 }),
    [0, -0.24, 0],
  );
  root.add(floor);

  // 2. Instanced Data Conduits (`pipes` / `conduits` along the cyberpunk alleyway)
  const conduitSpecs: InstanceTransformSpec[] = [];
  const count = tier === 'low' ? 10 : 16;
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const x = side * (4.8 + (row % 2) * 1.8);
    const z = -6.0 + row * 1.65;
    conduitSpecs.push({
      position: [x, 2.2 + (row % 3) * 0.45, z],
      rotation: [0, 0, side * 0.14],
      scale: [1, 1 + (row % 3) * 0.3, 1],
      colorHex: i % 2 === 0 ? 0x22d3ee : 0xf472b6,
    });
  }
  const conduitGeo = new THREE.CylinderGeometry(0.16, 0.16, 4.4, 8);
  const conduitMat = lowpoly(0x22d3ee, {
    rough: 0.25,
    metal: 0.7,
    emissive: 0x06b6d4,
    glow: 0.65,
  });
  const instancedConduits = buildInstancedCluster(
    'InstancedDataConduits',
    conduitGeo,
    conduitMat,
    conduitSpecs,
  );
  instancedMeshes.pipes = instancedConduits;
  root.add(instancedConduits);

  // 3. Neon Hologram Billboards (`THREE.LOD`)
  const billboardPositions: [number, number, number][] = [
    [-5.4, 3.2, -3.2],
    [5.4, 3.2, -3.2],
  ];
  const holoFrames: THREE.Mesh[] = [];
  for (let i = 0; i < billboardPositions.length; i++) {
    const highGrp = new THREE.Group();
    const frame = mesh(
      new THREE.BoxGeometry(2.8, 1.5, 0.14),
      lowpoly(0x1e1b4b, { rough: 0.3, metal: 0.7, emissive: 0xec4899, glow: 0.55 }),
    );
    const holoScreen = mesh(
      new THREE.PlaneGeometry(2.5, 1.25),
      glow(i === 0 ? 0x22d3ee : 0xf472b6, 0.75, true),
      [0, 0, 0.1],
    );
    const banner = safeTextSprite(i === 0 ? 'CYBER-BABEL // NET.02' : 'VOICE SYNC // ACTIVE', {
      color: '#67e8f9',
      bg: 'rgba(15, 7, 40, 0.85)',
      border: '#f472b6',
      height: 0.32,
    });
    banner.position.set(0, 1.05, 0);
    highGrp.add(frame, holoScreen, banner);
    holoFrames.push(holoScreen);

    const medGrp = new THREE.Group();
    medGrp.add(
      mesh(
        new THREE.BoxGeometry(2.6, 1.4, 0.12),
        glow(i === 0 ? 0x22d3ee : 0xf472b6, 0.65, true),
      ),
    );

    const lowProxy = mesh(new THREE.BoxGeometry(2.4, 1.2, 0.1), lowpoly(0x3b0764));

    const lod = createThreeTierLOD(
      `CyberHoloBillboardLOD_${i}`,
      billboardPositions[i],
      tier,
      { high: highGrp, medium: medGrp, low: lowProxy },
      {
        assetId: i === 0 ? 'mv_cyber_room' : 'mv_salon_furniture_3',
        targetHeight: 2.8,
        loadGlb,
        alive,
      },
    );
    lod.rotation.y = i === 0 ? 0.35 : -0.35;
    lodGroups.push(lod);
    root.add(lod);
  }

  return (_dt: number, t: number) => {
    for (let i = 0; i < holoFrames.length; i++) {
      holoFrames[i].position.y = Math.sin(t * 3.5 + i * 1.7) * 0.06;
    }
  };
}

function assembleChronoForest(
  root: THREE.Group,
  tier: AssetQuality,
  instancedMeshes: Record<string, THREE.InstancedMesh>,
  lodGroups: THREE.LOD[],
  loadGlb: boolean,
  alive: () => boolean,
): (dt: number, t: number) => void {
  // 1. Mossy forest floor
  const floor = mesh(
    new THREE.CylinderGeometry(11.5, 12.2, 0.5, 28),
    lowpoly(0x062c22, { rough: 0.8, metal: 0.1, emissive: 0x064e3b, glow: 0.25 }),
    [0, -0.25, 0],
  );
  root.add(floor);

  // 2. Instanced Bioluminescent Vines & Mushrooms (`vines`)
  const vineSpecs: InstanceTransformSpec[] = [];
  const count = tier === 'low' ? 12 : 18;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.15;
    const radius = 5.4 + (i % 3) * 1.65;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius - 1.0;
    if (z > 3.5 && Math.abs(x) < 3.2) continue;
    vineSpecs.push({
      position: [x, 0.55 + (i % 3) * 0.35, z],
      rotation: [0.08, angle, 0],
      scale: [0.8 + (i % 3) * 0.25, 1.0 + (i % 4) * 0.35, 0.8 + (i % 3) * 0.25],
      colorHex: i % 2 === 0 ? 0x34d399 : 0xa78bfa,
    });
  }
  const mushroomGeo = new THREE.ConeGeometry(0.42, 1.1, 7);
  const mushroomMat = lowpoly(0x34d399, {
    rough: 0.4,
    metal: 0.15,
    emissive: 0x10b981,
    glow: 0.65,
  });
  const instancedVines = buildInstancedCluster(
    'InstancedBioluminescentVinesAndMushrooms',
    mushroomGeo,
    mushroomMat,
    vineSpecs,
  );
  instancedMeshes.vines = instancedVines;
  root.add(instancedVines);

  // 3. Petrified Giant Trees (`THREE.LOD`)
  const treePositions: [number, number, number][] = [
    [-5.8, 0, -2.8],
    [5.8, 0, -2.8],
  ];
  const temporalRings: THREE.Mesh[] = [];
  for (let i = 0; i < treePositions.length; i++) {
    const highGrp = new THREE.Group();
    const trunk = mesh(
      roughen(new THREE.CylinderGeometry(0.55, 0.88, 4.8, 9), 0.05, 31 + i),
      lowpoly(0x334155, { rough: 0.75, metal: 0.2, emissive: 0x065f46, glow: 0.25 }),
      [0, 2.4, 0],
    );
    const canopy = mesh(
      roughen(new THREE.DodecahedronGeometry(1.65, 1), 0.08, 41 + i),
      lowpoly(0x10b981, { rough: 0.5, metal: 0.1, emissive: 0x34d399, glow: 0.45 }),
      [0, 4.9, 0],
    );
    const chronoRing = mesh(
      new THREE.TorusGeometry(1.35, 0.06, 8, 28),
      glow(0xa78bfa, 0.8, true),
      [0, 3.2, 0],
    );
    chronoRing.rotation.x = Math.PI / 2;
    temporalRings.push(chronoRing);
    highGrp.add(trunk, canopy, chronoRing);

    const medGrp = new THREE.Group();
    medGrp.add(
      mesh(
        new THREE.CylinderGeometry(0.5, 0.82, 4.6, 6),
        lowpoly(0x1e293b),
        [0, 2.3, 0],
      ),
      mesh(new THREE.OctahedronGeometry(1.45, 0), lowpoly(0x059669), [0, 4.7, 0]),
    );

    const lowProxy = mesh(new THREE.ConeGeometry(1.2, 4.8, 5), lowpoly(0x064e3b), [0, 2.4, 0]);

    const lod = createThreeTierLOD(
      `PetrifiedGiantTreeLOD_${i}`,
      treePositions[i],
      tier,
      { high: highGrp, medium: medGrp, low: lowProxy },
      {
        assetId: i === 0 ? 'mv_world_enchanted_candidate' : 'mv_torch_4',
        targetHeight: 4.6,
        loadGlb,
        alive,
      },
    );
    lodGroups.push(lod);
    root.add(lod);
  }

  return (_dt: number, t: number) => {
    for (let i = 0; i < temporalRings.length; i++) {
      temporalRings[i].rotation.z = t * (i % 2 === 0 ? 1.1 : -1.1);
    }
  };
}

function assembleNebulaSpire(
  root: THREE.Group,
  tier: AssetQuality,
  instancedMeshes: Record<string, THREE.InstancedMesh>,
  lodGroups: THREE.LOD[],
  loadGlb: boolean,
  alive: () => boolean,
): (dt: number, t: number) => void {
  // 1. Cosmic Astrolabe Platform + Rotating Brass Celestial Rings
  const basePlatform = mesh(
    new THREE.CylinderGeometry(10.8, 11.4, 0.45, 32),
    lowpoly(0x1e1b4b, { rough: 0.4, metal: 0.65, emissive: 0x312e81, glow: 0.35 }),
    [0, -0.24, 0],
  );
  const astrolabeRing1 = mesh(
    new THREE.TorusGeometry(6.4, 0.11, 10, 48),
    lowpoly(0xfacc15, { rough: 0.25, metal: 0.8, emissive: 0xd97706, glow: 0.55 }),
    [0, 0.08, -0.5],
  );
  astrolabeRing1.rotation.x = Math.PI / 2;

  const astrolabeRing2 = mesh(
    new THREE.TorusGeometry(4.6, 0.09, 10, 40),
    glow(0x818cf8, 0.72, true),
    [0, 0.12, -0.5],
  );
  astrolabeRing2.rotation.x = Math.PI / 2;
  root.add(basePlatform, astrolabeRing1, astrolabeRing2);

  // 2. Instanced Floating Crystal Lenses (`crystals`)
  const crystalSpecs: InstanceTransformSpec[] = [];
  const count = tier === 'low' ? 10 : 16;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radius = 5.8 + (i % 3) * 1.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius - 1.2;
    if (z > 3.4 && Math.abs(x) < 3.0) continue;
    crystalSpecs.push({
      position: [x, 1.8 + (i % 4) * 0.65, z],
      rotation: [0.25, angle, 0.18],
      scale: [0.45, 1.15 + (i % 3) * 0.25, 0.45],
      colorHex: i % 2 === 0 ? 0xfde047 : 0x818cf8,
    });
  }
  const crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
  const crystalMat = lowpoly(0xc4b5fd, {
    rough: 0.18,
    metal: 0.45,
    emissive: 0x6366f1,
    glow: 0.75,
  });
  const instancedCrystals = buildInstancedCluster(
    'InstancedFloatingCrystalLenses',
    crystalGeo,
    crystalMat,
    crystalSpecs,
  );
  instancedMeshes.crystals = instancedCrystals;
  root.add(instancedCrystals);

  // 3. Cosmic Resonator Spires (`THREE.LOD`)
  const spirePositions: [number, number, number][] = [
    [-5.2, 0, -2.5],
    [5.2, 0, -2.5],
  ];
  for (let i = 0; i < spirePositions.length; i++) {
    const highGrp = new THREE.Group();
    const obelisk = mesh(
      new THREE.ConeGeometry(0.65, 4.4, 6),
      lowpoly(0x312e81, { rough: 0.3, metal: 0.6, emissive: 0x4f46e5, glow: 0.45 }),
      [0, 2.2, 0],
    );
    const crownLens = mesh(
      new THREE.OctahedronGeometry(0.48, 1),
      glow(0xfacc15, 0.9, true),
      [0, 4.75, 0],
    );
    highGrp.add(obelisk, crownLens);

    const medGrp = new THREE.Group();
    medGrp.add(
      mesh(new THREE.ConeGeometry(0.62, 4.2, 5), lowpoly(0x312e81), [0, 2.1, 0]),
    );

    const lowProxy = mesh(new THREE.BoxGeometry(0.85, 4.0, 0.85), lowpoly(0x1e1b4b), [
      0,
      2.0,
      0,
    ]);

    const lod = createThreeTierLOD(
      `NebulaSpireCrystalLOD_${i}`,
      spirePositions[i],
      tier,
      { high: highGrp, medium: medGrp, low: lowProxy },
      {
        assetId: i === 0 ? 'mv_castle_module_4' : 'mv_torch_5',
        targetHeight: 4.4,
        loadGlb,
        alive,
      },
    );
    lodGroups.push(lod);
    root.add(lod);
  }

  return (_dt: number, t: number) => {
    astrolabeRing1.rotation.z = t * 0.25;
    astrolabeRing2.rotation.z = -t * 0.42;
    instancedCrystals.position.y = Math.sin(t * 2.1) * 0.14;
  };
}

function assembleSteamFoundry(
  root: THREE.Group,
  tier: AssetQuality,
  instancedMeshes: Record<string, THREE.InstancedMesh>,
  lodGroups: THREE.LOD[],
  loadGlb: boolean,
  alive: () => boolean,
): (dt: number, t: number) => void {
  // 1. Foundry iron grate floor + molten channels
  const floor = mesh(
    new THREE.CylinderGeometry(11.5, 12.2, 0.5, 24),
    lowpoly(0x27170e, { rough: 0.55, metal: 0.75, emissive: 0x7c2d12, glow: 0.28 }),
    [0, -0.25, 0],
  );
  const moltenRing = mesh(
    new THREE.RingGeometry(4.2, 4.65, 28),
    glow(0xf97316, 0.82, true),
    [0, 0.03, -0.4],
  );
  moltenRing.rotation.x = -Math.PI / 2;
  root.add(floor, moltenRing);

  // 2. Instanced Brass Steam Pipes (`pipes`)
  const pipeSpecs: InstanceTransformSpec[] = [];
  const count = tier === 'low' ? 10 : 16;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + 0.18;
    const radius = 6.2 + (i % 2) * 1.9;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius - 1.1;
    if (z > 3.5 && Math.abs(x) < 3.3) continue;
    pipeSpecs.push({
      position: [x, 2.0, z],
      rotation: [0, angle, (i % 2 === 0 ? 1 : -1) * 0.08],
      scale: [1, 1 + (i % 3) * 0.25, 1],
      colorHex: i % 2 === 0 ? 0xf59e0b : 0xd97706,
    });
  }
  const pipeGeo = new THREE.CylinderGeometry(0.24, 0.28, 4.0, 8);
  const pipeMat = lowpoly(0xd97706, {
    rough: 0.32,
    metal: 0.82,
    emissive: 0x9a3412,
    glow: 0.35,
  });
  const instancedPipes = buildInstancedCluster(
    'InstancedFoundrySteamPipes',
    pipeGeo,
    pipeMat,
    pipeSpecs,
  );
  instancedMeshes.pipes = instancedPipes;
  root.add(instancedPipes);

  // 3. Glowing Furnaces & Brass Pressure Manometers (`THREE.LOD`)
  const furnacePositions: [number, number, number][] = [
    [-5.4, 0, -2.6],
    [5.4, 0, -2.6],
  ];
  const gaugeNeedles: THREE.Mesh[] = [];
  for (let i = 0; i < furnacePositions.length; i++) {
    const highGrp = new THREE.Group();
    const body = mesh(
      new THREE.CylinderGeometry(0.95, 1.15, 3.2, 10),
      lowpoly(0x431407, { rough: 0.5, metal: 0.7, emissive: 0x9a3412, glow: 0.4 }),
      [0, 1.6, 0],
    );
    const moltenCore = mesh(
      new THREE.SphereGeometry(0.65, 10, 8),
      glow(0xfb923c, 0.92, true),
      [0, 1.35, 0.45],
    );
    const manometerDial = mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.14, 14),
      lowpoly(0xfbbf24, { rough: 0.25, metal: 0.85, emissive: 0xb45309, glow: 0.35 }),
      [0, 2.65, 0.82],
    );
    manometerDial.rotation.x = Math.PI / 2;
    const needle = mesh(
      new THREE.BoxGeometry(0.06, 0.34, 0.04),
      glow(0xef4444, 1.0),
      [0, 2.65, 0.92],
    );
    gaugeNeedles.push(needle);
    highGrp.add(body, moltenCore, manometerDial, needle);

    const medGrp = new THREE.Group();
    medGrp.add(
      mesh(new THREE.CylinderGeometry(0.9, 1.1, 3.0, 8), lowpoly(0x431407), [0, 1.5, 0]),
    );

    const lowProxy = mesh(new THREE.BoxGeometry(1.6, 2.8, 1.6), lowpoly(0x27170e), [0, 1.4, 0]);

    const lod = createThreeTierLOD(
      `SteamFoundryFurnaceManometerLOD_${i}`,
      furnacePositions[i],
      tier,
      { high: highGrp, medium: medGrp, low: lowProxy },
      {
        assetId: i === 0 ? 'mv_wall_breach' : 'mv_torch_2',
        targetHeight: 3.4,
        loadGlb,
        alive,
      },
    );
    lodGroups.push(lod);
    root.add(lod);
  }

  // 4. Steam Vent Plumes (`THREE.Points` lightweight GPU steam)
  const steamCount = tier === 'low' ? 24 : 48;
  const steamPositions = new Float32Array(steamCount * 3);
  for (let i = 0; i < steamCount; i++) {
    const side = i % 2 === 0 ? -4.2 : 4.2;
    steamPositions[i * 3] = side + (((i * 17) % 10) - 5) * 0.08;
    steamPositions[i * 3 + 1] = ((i / steamCount) * 3.2) % 3.2;
    steamPositions[i * 3 + 2] = -1.8 + (((i * 23) % 10) - 5) * 0.08;
  }
  const steamGeo = new THREE.BufferGeometry();
  const steamPosAttr = new THREE.BufferAttribute(steamPositions, 3);
  steamPosAttr.setUsage(THREE.DynamicDrawUsage);
  steamGeo.setAttribute('position', steamPosAttr);
  const steamMat = new THREE.PointsMaterial({
    color: 0xfed7aa,
    size: 0.32,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const steamPoints = new THREE.Points(steamGeo, steamMat);
  steamPoints.name = 'SteamFoundryVentPlumes';
  root.add(steamPoints);

  return (dt: number, t: number) => {
    for (let i = 0; i < gaugeNeedles.length; i++) {
      gaugeNeedles[i].rotation.z = Math.sin(t * 4.5 + i * 1.9) * 0.95;
    }
    for (let i = 0; i < steamCount; i++) {
      let y = steamPositions[i * 3 + 1] + dt * 1.35;
      if (y > 3.6) y = 0.2;
      steamPositions[i * 3 + 1] = y;
    }
    steamPosAttr.needsUpdate = true;
  };
}

// ---------------------------------------------------------------------------
// Performance Budget & Draw Call Auditor
// ---------------------------------------------------------------------------

/**
 * Estimates VRAM usage (geometry attributes/indices + textures + catalog GLB budget)
 * and active draw calls for a built Multiverse environment prefab.
 */
export function auditMultiverseScenePerformance(
  prefab: {
    sceneId: MultiverseSceneId;
    tier: AssetQuality;
    meta: MultiverseThemeMetadata;
    root: THREE.Group;
    instancedMeshes: Record<string, THREE.InstancedMesh>;
    lodGroups: THREE.LOD[];
  },
): MultiversePerformanceAudit {
  const { sceneId, tier, meta, root, instancedMeshes, lodGroups } = prefab;

  let drawCalls = 0;
  let geometryBytes = 0;
  const seenGeometries = new Set<string>();

  root.traverse((obj) => {
    if (!obj.visible) return;
    if (
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.Points ||
      obj instanceof THREE.Line
    ) {
      drawCalls += 1;
      const geo = obj.geometry;
      if (geo && !seenGeometries.has(geo.uuid)) {
        seenGeometries.add(geo.uuid);
        for (const attrName of Object.keys(geo.attributes)) {
          const attr = geo.getAttribute(attrName);
          if (attr && attr.array) {
            geometryBytes += attr.array.byteLength;
          }
        }
        if (geo.index && geo.index.array) {
          geometryBytes += geo.index.array.byteLength;
        }
      }
    }
  });

  // Each THREE.LOD only renders 1 active level at a time, so subtract inactive LOD children
  for (const lod of lodGroups) {
    if (lod.levels.length > 1) {
      drawCalls = Math.max(1, drawCalls - (lod.levels.length - 1));
    }
  }

  let totalInstances = 0;
  const instancedKeys = Object.keys(instancedMeshes);
  for (const k of instancedKeys) {
    totalInstances += instancedMeshes[k].count;
  }

  const geometryVramMb = Number((geometryBytes / (1024 * 1024)).toFixed(3));
  const catalogMb = tier === 'low' ? meta.catalogVramMb.low : meta.catalogVramMb.high;
  const totalEstimatedVramMb = Number((geometryVramMb + catalogMb).toFixed(2));

  const limits = PERFORMANCE_BUDGET_LIMITS[tier];
  const withinVramBudget = totalEstimatedVramMb <= limits.maxVramMb;
  const withinDrawCallBudget = drawCalls <= limits.maxDrawCalls;

  return {
    sceneId,
    tier,
    drawCalls,
    instancedMeshCount: instancedKeys.length,
    totalInstances,
    lodGroupCount: lodGroups.length,
    geometryVramMb,
    totalEstimatedVramMb,
    withinVramBudget,
    withinDrawCallBudget,
    passesAllBudgets: withinVramBudget && withinDrawCallBudget,
  };
}

// ---------------------------------------------------------------------------
// Main Multiverse Prefab Factory (`buildMultiverseThemePrefab`)
// ---------------------------------------------------------------------------

export function buildMultiverseThemePrefab(
  options: BuildMultiverseEnvironmentOptions,
): MultiverseEnvironmentPrefab {
  const { sceneId, tier = 'high', loadGlb = true, alive = () => true } = options;
  const meta = MULTIVERSE_THEME_CONFIGS[sceneId];

  const root = new THREE.Group();
  root.name = `MultiversePrefab_${sceneId}`;

  // 1. Skybox (`skyDome`)
  const skybox = skyDome(meta.skyZenithHex, meta.skyHorizonHex, meta.skyGroundHex, {
    radius: 155,
    stars: sceneId === 'mv-04' ? 1.8 : 1.1,
  });
  skybox.name = `Skybox_${sceneId}`;
  root.add(skybox);

  // 2. Lighting Setup (DirectionalLight, HemisphereLight, Ambient Anchors, Environmental Fog)
  const hemisphereLight = new THREE.HemisphereLight(
    meta.hemiSkyHex,
    meta.hemiGroundHex,
    meta.hemiIntensity,
  );
  hemisphereLight.name = `HemisphereLight_${sceneId}`;

  const directionalLight = new THREE.DirectionalLight(
    meta.dirLightHex,
    meta.dirLightIntensity,
  );
  directionalLight.name = `DirectionalLight_${sceneId}`;
  directionalLight.position.set(
    meta.dirLightPos[0],
    meta.dirLightPos[1],
    meta.dirLightPos[2],
  );

  const ambientAnchorGroup = new THREE.Group();
  ambientAnchorGroup.name = `AmbientLightAnchors_${sceneId}`;
  const portalCoreAnchor = new THREE.PointLight(meta.primaryColorHex, 1.5, 18);
  portalCoreAnchor.position.set(0, 2.8, -1.8);
  portalCoreAnchor.name = 'PortalCoreLightAnchor';
  const pedestalAnchor = new THREE.PointLight(meta.secondaryColorHex, 1.1, 10);
  pedestalAnchor.position.set(0, 1.8, 2.2);
  pedestalAnchor.name = 'PedestalLightAnchor';
  ambientAnchorGroup.add(portalCoreAnchor, pedestalAnchor);

  const fog = new THREE.FogExp2(meta.fogColorHex, meta.fogDensity);
  root.add(hemisphereLight, directionalLight, ambientAnchorGroup);

  const lighting: MultiverseLightingRig = {
    directionalLight,
    hemisphereLight,
    ambientAnchorGroup,
    fog,
    backgroundHex: meta.fogColorHex,
  };

  // 3. Quest Prop Visual Anchors (chests, altars, stone pedestals, portal archways)
  const builtAnchors = buildQuestPropAnchors(
    sceneId,
    meta.primaryColorHex,
    meta.secondaryColorHex,
  );
  root.add(builtAnchors.group);

  // 4. Theme-specific Procedural Hierarchy, InstancedMeshes & THREE.LODs
  const instancedMeshes: Record<string, THREE.InstancedMesh> = {};
  const lodGroups: THREE.LOD[] = [];

  let tickTheme: (dt: number, t: number) => void;
  switch (sceneId) {
    case 'mv-01':
      tickTheme = assembleAlexandriaArchive(
        root,
        tier,
        instancedMeshes,
        lodGroups,
        loadGlb,
        alive,
      );
      break;
    case 'mv-02':
      tickTheme = assembleCyberBabel(
        root,
        tier,
        instancedMeshes,
        lodGroups,
        loadGlb,
        alive,
      );
      break;
    case 'mv-03':
      tickTheme = assembleChronoForest(
        root,
        tier,
        instancedMeshes,
        lodGroups,
        loadGlb,
        alive,
      );
      break;
    case 'mv-04':
      tickTheme = assembleNebulaSpire(
        root,
        tier,
        instancedMeshes,
        lodGroups,
        loadGlb,
        alive,
      );
      break;
    case 'mv-05':
      tickTheme = assembleSteamFoundry(
        root,
        tier,
        instancedMeshes,
        lodGroups,
        loadGlb,
        alive,
      );
      break;
  }

  return {
    sceneId,
    tier,
    meta,
    root,
    skybox,
    lighting,
    questAnchorsGroup: builtAnchors.group,
    questAnchors: builtAnchors.anchors,
    instancedMeshes,
    lodGroups,

    update(dt: number, t: number, camera?: THREE.Camera) {
      tickTheme(dt, t);
      if (camera) {
        for (let i = 0; i < lodGroups.length; i++) {
          lodGroups[i].update(camera);
        }
      }
    },

    auditPerformance() {
      return auditMultiverseScenePerformance({
        sceneId,
        tier,
        meta,
        root,
        instancedMeshes,
        lodGroups,
      });
    },

    dispose() {
      disposeObject(root);
    },
  };
}
