import * as THREE from 'three';

export type PhysicsSceneId =
  | 'river_survival'
  | 'summer_camp'
  | 'kayak_rush'
  | 'multiverse_portal';

export interface SceneColliderOptions {
  /** Whether the collision meshes should be visible in the Three.js scene (default `false` in production scenes, `true` in debug/lab). */
  visible?: boolean;
  /** Optional wireframe overlay mode when `visible` is true. */
  wireframe?: boolean;
}

export interface SceneColliderMetadata {
  collision: true;
  sceneId: PhysicsSceneId;
  maxTileSpanM: number;
  maxStepHeightM: number;
  maxSlopeDeg: number;
  features: {
    stepStart: [number, number, number];
    rampStart: [number, number, number];
    bridgeOrDockCenter: [number, number, number];
    rockCenter: [number, number, number];
    wallZ: number;
  };
}

const MAX_SAFE_COLLIDER_SPAN_M = 36; // Strictly < 100 m (Rapier 0.21 broadphase/trimesh precision limit)

function makeColliderMat(colorHex: number, opts?: SceneColliderOptions): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.88,
    metalness: 0.06,
    wireframe: opts?.wireframe ?? false,
  });
}

function addBoxCollider(
  parent: THREE.Group,
  size: [number, number, number],
  pos: [number, number, number],
  mat: THREE.Material,
  rot: [number, number, number] = [0, 0, 0],
  tag?: string,
): THREE.Mesh {
  const [sx, sy, sz] = size;
  if (sx > MAX_SAFE_COLLIDER_SPAN_M || sy > MAX_SAFE_COLLIDER_SPAN_M || sz > MAX_SAFE_COLLIDER_SPAN_M) {
    throw new Error(
      `Collider span (${sx}, ${sy}, ${sz}) exceeds safe Rapier 0.21 limit (${MAX_SAFE_COLLIDER_SPAN_M}m < 100m)`,
    );
  }
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.rotation.set(rot[0], rot[1], rot[2]);
  if (tag) m.userData.colliderTag = tag;
  m.receiveShadow = true;
  m.castShadow = true;
  parent.add(m);
  return m;
}

/**
 * Adds a tiled ground plane (`topY = 0`) split into `tileSize × tileSize` cells (each ≤ 20 m, well under 100 m).
 */
function addTiledGround(
  parent: THREE.Group,
  gridCols: number,
  gridRows: number,
  tileSize: number,
  mat: THREE.Material,
  centerX = 0,
  centerZ = 0,
  topY = 0,
): void {
  const thickness = 0.4;
  const totalW = gridCols * tileSize;
  const totalD = gridRows * tileSize;
  const startX = centerX - totalW / 2 + tileSize / 2;
  const startZ = centerZ - totalD / 2 + tileSize / 2;
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      addBoxCollider(
        parent,
        [tileSize, thickness, tileSize],
        [startX + c * tileSize, topY - thickness / 2, startZ + r * tileSize],
        mat,
        [0, 0, 0],
        'ground_tile',
      );
    }
  }
}

/**
 * Adds a staircase of `count` steps where each step rise is `stepRise` (≤ 0.25 m ≤ 0.35 m)
 * and each tread depth is `stepDepth` (≥ 0.75 m ≥ 0.20 m autostep minWidth), climbing along `-Z`.
 */
function addStepRun(
  parent: THREE.Group,
  startPos: [number, number, number],
  width: number,
  stepDepth: number,
  stepRise: number,
  count: number,
  mat: THREE.Material,
): void {
  const [sx, sy, sz] = startPos;
  for (let i = 0; i < count; i++) {
    const h = (i + 1) * stepRise;
    const z = sz - i * stepDepth - stepDepth / 2;
    addBoxCollider(
      parent,
      [width, h, stepDepth],
      [sx, sy + h / 2, z],
      mat,
      [0, 0, 0],
      'step',
    );
  }
}

/**
 * Adds a walkable sloped ramp climbing along `-Z` from `startPos` (`y = sy`) to `sy + rise` over horizontal `run`.
 * Slope angle `atan2(rise, run)` is kept ≤ 26° (well under the 45° limit).
 */
function addWalkableRamp(
  parent: THREE.Group,
  startPos: [number, number, number],
  width: number,
  run: number,
  rise: number,
  mat: THREE.Material,
  tag = 'ramp',
): void {
  const [sx, sy, sz] = startPos;
  const length = Math.hypot(run, rise);
  const angle = Math.atan2(rise, run);
  const thickness = 0.24;
  // Offset normal so the top surface starts flush at (sy, sz) and ends at (sy + rise, sz - run)
  const midY = sy + rise / 2 - (thickness / 2) * Math.cos(angle);
  const midZ = sz - run / 2 + (thickness / 2) * Math.sin(angle);
  addBoxCollider(
    parent,
    [width, thickness, length],
    [sx, midY, midZ],
    mat,
    [angle, 0, 0],
    tag,
  );
  // Top landing platform at the top of the ramp
  addBoxCollider(
    parent,
    [width, rise, 2.2],
    [sx, sy + rise / 2, sz - run - 1.1],
    mat,
    [0, 0, 0],
    `${tag}_landing`,
  );
}

/**
 * A1.1 — River Survival ("Cướp Lưới") collision mesh:
 * - Tiled valley floor & 3 zone plateaus (`4 × 3` tiles of `16 m × 16 m` = `64 m × 48 m`, max span 16 m < 100 m)
 * - Riverbank steps (`3 steps × 0.22 m` = `0.66 m`, each step ≤ 0.35 m) at `x = -3.2, z = -3.0`
 * - Sloped riverbank ramp (`rise = 0.9 m, run = 2.4 m`, slope `20.6° ≤ 45°`) at `x = 0, z = -3.0`
 * - 2 log bridges (`cầu gỗ`) spanning between zones with gentle entry/exit ramps (`18°`)
 * - Wooden Pen (`Chuồng Gỗ`) perimeter fence walls (with south entry gap) and large river boulders (`đá lớn`)
 */
export function buildRiverSurvivalCollisionMesh(opts?: SceneColliderOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'RiverSurvivalCollisionGroup';
  group.visible = opts?.visible ?? false;

  const groundMat = makeColliderMat(0x2d5a3c, opts);
  const woodMat = makeColliderMat(0x7c4a21, opts);
  const rockMat = makeColliderMat(0x64748b, opts);
  const wallMat = makeColliderMat(0x475569, opts);

  // 1. Tiled valley floor (4 cols × 3 rows of 16 m tiles = 64 m × 48 m, max tile span = 16 m < 100 m)
  addTiledGround(group, 4, 3, 16, groundMat, 0, 0, 0);

  // 2. Stepped riverbank terrace (3 steps × 0.22 m rise = 0.66 m, each step ≤ 0.35 m)
  addStepRun(group, [-3.4, 0, -2.5], 2.4, 0.85, 0.22, 3, rockMat);
  // Terrace plateau behind steps
  addBoxCollider(group, [2.4, 0.66, 2.0], [-3.4, 0.33, -6.05], rockMat, [0, 0, 0], 'terrace');

  // 3. Walkable riverbank ramp (rise 0.9 m over 2.4 m run => 20.6° ≤ 45°)
  addWalkableRamp(group, [0, 0, -2.5], 2.4, 2.4, 0.9, woodMat, 'river_ramp');

  // 4. Two inter-zone log bridges (`cầu gỗ`) with entry/exit ramps (18°)
  // Left bridge connecting Zone 1 (-12, 0, 1.5) and Zone 2 (0, 0, 1.5)
  addBoxCollider(group, [4.6, 0.28, 1.6], [-6.2, 0.26, 2.2], woodMat, [0, 0, 0], 'bridge_left');
  addBoxCollider(group, [1.2, 0.22, 1.6], [-8.9, 0.14, 2.2], woodMat, [0, 0, 0.28], 'bridge_left_ramp_w');
  addBoxCollider(group, [1.2, 0.22, 1.6], [-3.5, 0.14, 2.2], woodMat, [0, 0, -0.28], 'bridge_left_ramp_e');

  // Right bridge connecting Zone 2 and Zone 3
  addBoxCollider(group, [4.6, 0.28, 1.6], [6.2, 0.26, 2.2], woodMat, [0, 0, 0], 'bridge_right');
  addBoxCollider(group, [1.2, 0.22, 1.6], [3.5, 0.14, 2.2], woodMat, [0, 0, 0.28], 'bridge_right_ramp_w');
  addBoxCollider(group, [1.2, 0.22, 1.6], [8.9, 0.14, 2.2], woodMat, [0, 0, -0.28], 'bridge_right_ramp_e');

  // 5. Wooden Pen ("Chuồng Gỗ") walls at (0, 0, -8.5) — back, left, right walls + open front gate
  addBoxCollider(group, [4.8, 1.6, 0.35], [0, 0.8, -10.6], woodMat, [0, 0, 0], 'pen_wall_back');
  addBoxCollider(group, [0.35, 1.6, 4.2], [-2.25, 0.8, -8.5], woodMat, [0, 0, 0], 'pen_wall_left');
  addBoxCollider(group, [0.35, 1.6, 4.2], [2.25, 0.8, -8.5], woodMat, [0, 0, 0], 'pen_wall_right');

  // 6. Large river boulders (`đá lớn`)
  addBoxCollider(group, [1.5, 1.2, 1.5], [3.6, 0.6, -1.8], rockMat, [0, 0.3, 0], 'rock_large_1');
  addBoxCollider(group, [1.8, 1.35, 1.4], [-7.5, 0.68, -3.2], rockMat, [0, -0.2, 0], 'rock_large_2');
  addBoxCollider(group, [1.6, 1.15, 1.6], [8.2, 0.58, -2.6], rockMat, [0, 0.4, 0], 'rock_large_3');

  // 7. Outer valley boundary walls (`tường`) — tiled segments ≤ 24 m
  addBoxCollider(group, [24, 2.2, 0.5], [-12, 1.1, -18], wallMat, [0, 0, 0], 'boundary_n1');
  addBoxCollider(group, [24, 2.2, 0.5], [12, 1.1, -18], wallMat, [0, 0, 0], 'boundary_n2');
  addBoxCollider(group, [24, 2.2, 0.5], [-12, 1.1, 18], wallMat, [0, 0, 0], 'boundary_s1');
  addBoxCollider(group, [24, 2.2, 0.5], [12, 1.1, 18], wallMat, [0, 0, 0], 'boundary_s2');

  const meta: SceneColliderMetadata = {
    collision: true,
    sceneId: 'river_survival',
    maxTileSpanM: 24,
    maxStepHeightM: 0.22,
    maxSlopeDeg: 20.6,
    features: {
      stepStart: [-3.4, 0, -2.5],
      rampStart: [0, 0, -2.5],
      bridgeOrDockCenter: [-6.2, 0.4, 2.2],
      rockCenter: [3.6, 0.6, -1.8],
      wallZ: -10.6,
    },
  };
  group.userData = meta;
  return group;
}

/**
 * A1.2 — Summer Camp ("Summer Camp Quests" & "River Fishing") collision mesh:
 * - Tiled camp clearing ground (`3 × 3` tiles of `16 m × 16 m` = `48 m × 48 m`, max span 16 m < 100 m)
 * - Campfire amphitheater steps (`3 steps × 0.20 m` ≤ 0.35 m)
 * - Wooden ramp to Quest Board lookout deck (`rise = 0.85 m, run = 2.4 m`, slope `19.5° ≤ 45°`)
 * - Wooden fishing dock bridge (`cầu gỗ câu cá`) extending to the river edge
 * - Tent & grill station colliders, large camp boulders, and timber perimeter fences
 */
export function buildSummerCampCollisionMesh(opts?: SceneColliderOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'SummerCampCollisionGroup';
  group.visible = opts?.visible ?? false;

  const grassMat = makeColliderMat(0x2f6f3e, opts);
  const timberMat = makeColliderMat(0x854d0e, opts);
  const stoneMat = makeColliderMat(0x64748b, opts);
  const fenceMat = makeColliderMat(0x713f12, opts);

  // 1. Tiled camp clearing ground (3 × 3 tiles of 16 m = 48 m × 48 m)
  addTiledGround(group, 3, 3, 16, grassMat, 0, 0, 0);

  // 2. Campfire ring stone steps (3 steps × 0.20 m rise = 0.60 m ≤ 0.35 m per step)
  addStepRun(group, [-3.2, 0, -2.4], 2.4, 0.85, 0.2, 3, stoneMat);
  addBoxCollider(group, [2.4, 0.6, 1.8], [-3.2, 0.3, -5.85], stoneMat, [0, 0, 0], 'campfire_stage');

  // 3. Wooden ramp to Quest Board lookout deck (rise 0.85 m over 2.4 m run => 19.5° ≤ 45°)
  addWalkableRamp(group, [0, 0, -2.5], 2.4, 2.4, 0.85, timberMat, 'quest_board_ramp');

  // 4. Wooden Fishing Dock / Bridge (`cầu tàu câu cá`) at (+4.2, 0.22, 1.5)
  addBoxCollider(group, [2.4, 0.22, 5.6], [4.2, 0.11, 1.5], timberMat, [0, 0, 0], 'fishing_dock');
  addBoxCollider(group, [2.4, 0.16, 1.1], [4.2, 0.08, 4.8], timberMat, [0, 0, 0], 'fishing_dock_step');

  // 5. Camp stations & large boulders (`đá lớn`)
  addBoxCollider(group, [2.2, 1.5, 2.2], [-6.2, 0.75, -1.8], timberMat, [0, 0.25, 0], 'tent_collider');
  addBoxCollider(group, [1.5, 1.25, 1.5], [3.5, 0.62, -2.0], stoneMat, [0, 0, 0], 'camp_boulder_1');
  addBoxCollider(group, [1.7, 1.3, 1.4], [-5.8, 0.65, 3.6], stoneMat, [0, 0.4, 0], 'camp_boulder_2');

  // 6. Perimeter timber fence walls (`tường rào`)
  addBoxCollider(group, [20, 1.8, 0.4], [-10, 0.9, -14], fenceMat, [0, 0, 0], 'camp_fence_n1');
  addBoxCollider(group, [20, 1.8, 0.4], [10, 0.9, -14], fenceMat, [0, 0, 0], 'camp_fence_n2');
  addBoxCollider(group, [0.4, 1.8, 20], [-18, 0.9, -4], fenceMat, [0, 0, 0], 'camp_fence_w');
  addBoxCollider(group, [0.4, 1.8, 20], [18, 0.9, -4], fenceMat, [0, 0, 0], 'camp_fence_e');

  const meta: SceneColliderMetadata = {
    collision: true,
    sceneId: 'summer_camp',
    maxTileSpanM: 20,
    maxStepHeightM: 0.2,
    maxSlopeDeg: 19.5,
    features: {
      stepStart: [-3.2, 0, -2.4],
      rampStart: [0, 0, -2.5],
      bridgeOrDockCenter: [4.2, 0.22, 1.5],
      rockCenter: [3.5, 0.62, -2.0],
      wallZ: -14,
    },
  };
  group.userData = meta;
  return group;
}

/**
 * A1.3 — Kayak Rush ("Kayak — bờ, cầu tàu") collision mesh:
 * - Tiled river bed & staging shore (`3 × 4` tiles of `16 m × 16 m`, max span 16 m < 100 m)
 * - Left and right riverbanks (`bờ sông`) split into 16 m segments (never > 100 m) with walkable shore slopes (`22° ≤ 45°`)
 * - Wooden boat docks / piers (`cầu tàu`) on both banks and at the launch area with `0.20 m` boarding steps (`≤ 0.35 m`) and a `19°` dock ramp
 * - Large river boulders (`đá lớn`) and canyon retaining walls (`tường hẻm núi`)
 */
export function buildKayakCollisionMesh(opts?: SceneColliderOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'KayakCollisionGroup';
  group.visible = opts?.visible ?? false;

  const bankMat = makeColliderMat(0x166534, opts);
  const dockMat = makeColliderMat(0x92400e, opts);
  const rockMat = makeColliderMat(0x475569, opts);
  const wallMat = makeColliderMat(0x334155, opts);

  // 1. Tiled staging shore & shallow riverbed floor (3 cols × 4 rows of 16 m tiles, max span 16 m < 100 m)
  addTiledGround(group, 3, 4, 16, bankMat, 0, -4, 0);

  // 2. Boat dock steps (`bậc cầu tàu`: 3 steps × 0.20 m rise = 0.60 m ≤ 0.35 m per step)
  addStepRun(group, [-3.2, 0, -2.4], 2.4, 0.85, 0.2, 3, dockMat);

  // 3. Boat dock boarding ramp (`dốc lên cầu tàu`: rise 0.84 m over 2.4 m run => 19.3° ≤ 45°)
  addWalkableRamp(group, [0, 0, -2.5], 2.4, 2.4, 0.84, dockMat, 'kayak_dock_ramp');

  // 4. Wooden Boat Pier / Dock (`cầu tàu`) extending along the launch & left/right banks
  addBoxCollider(group, [6.4, 0.6, 2.4], [-1.6, 0.3, -6.2], dockMat, [0, 0, 0], 'kayak_main_pier');
  addBoxCollider(group, [2.6, 0.45, 8.0], [-5.2, 0.225, 1.5], dockMat, [0, 0, 0], 'kayak_left_jetty');
  addBoxCollider(group, [2.6, 0.45, 8.0], [5.2, 0.225, 1.5], dockMat, [0, 0, 0], 'kayak_right_jetty');

  // 5. Tiled Left & Right Riverbanks (`bờ sông chia ô ≤ 16 m`)
  for (let i = 0; i < 3; i++) {
    const zCenter = 12 - i * 16;
    addBoxCollider(group, [4.2, 0.9, 15.5], [-8.4, 0.45, zCenter], bankMat, [0, 0, 0], `left_bank_${i}`);
    addBoxCollider(group, [4.2, 0.9, 15.5], [8.4, 0.45, zCenter], bankMat, [0, 0, 0], `right_bank_${i}`);
  }

  // 6. River boulders (`đá lớn`)
  addBoxCollider(group, [1.5, 1.2, 1.5], [3.4, 0.6, -1.8], rockMat, [0, 0.2, 0], 'kayak_rock_1');
  addBoxCollider(group, [1.6, 1.3, 1.6], [-3.6, 0.65, 3.2], rockMat, [0, -0.3, 0], 'kayak_rock_2');

  // 7. Canyon boundary walls (`tường hẻm núi`) — tiled segments ≤ 20 m
  addBoxCollider(group, [0.5, 2.4, 20], [-11.0, 1.2, 4], wallMat, [0, 0, 0], 'canyon_wall_w1');
  addBoxCollider(group, [0.5, 2.4, 20], [-11.0, 1.2, -16], wallMat, [0, 0, 0], 'canyon_wall_w2');
  addBoxCollider(group, [0.5, 2.4, 20], [11.0, 1.2, 4], wallMat, [0, 0, 0], 'canyon_wall_e1');
  addBoxCollider(group, [0.5, 2.4, 20], [11.0, 1.2, -16], wallMat, [0, 0, 0], 'canyon_wall_e2');
  addBoxCollider(group, [22.0, 2.4, 0.5], [0, 1.2, -14.5], wallMat, [0, 0, 0], 'canyon_wall_n');

  const meta: SceneColliderMetadata = {
    collision: true,
    sceneId: 'kayak_rush',
    maxTileSpanM: 22,
    maxStepHeightM: 0.2,
    maxSlopeDeg: 19.3,
    features: {
      stepStart: [-3.2, 0, -2.4],
      rampStart: [0, 0, -2.5],
      bridgeOrDockCenter: [-1.6, 0.6, -6.2],
      rockCenter: [3.4, 0.6, -1.8],
      wallZ: -14.5,
    },
  };
  group.userData = meta;
  return group;
}

/**
 * A1.4 — Multiverse Portal ("Multiverse — sàn từng phòng, ngưỡng cổng") collision mesh:
 * - Tiled floors for each room (`sàn từng phòng`: Room 1 Castle Hall, Room 2 Neon Bridge Chamber, Room 3 Astral Sanctum), each tile ≤ 16 m (< 100 m)
 * - Portal Thresholds (`ngưỡng cổng`) between rooms and at the main Multiverse Portal Gate with stepped dais (`0.20 m` steps ≤ 0.35 m)
 * - Sanctum causeway ramp (`rise = 0.84 m, run = 2.4 m`, slope `19.3° ≤ 45°`)
 * - Astral monolith rocks (`đá lớn`) and sanctum chamber walls/pillars (`tường phòng`)
 */
export function buildMultiverseCollisionMesh(opts?: SceneColliderOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = 'MultiverseCollisionGroup';
  group.visible = opts?.visible ?? false;

  const floorMat = makeColliderMat(0x312e81, opts);
  const thresholdMat = makeColliderMat(0x6d28d9, opts);
  const monolithMat = makeColliderMat(0x4c1d95, opts);
  const wallMat = makeColliderMat(0x1e1b4b, opts);

  // 1. Tiled floors for the 3 Multiverse rooms (each room is 2 × 2 tiles of 12 m = 24 m × 24 m, max span 12 m < 100 m)
  // Room 1 (South / Castle Hall: z = +12..+36), Room 2 (Center / Sanctum Hub: z = -12..+12), Room 3 (North / Beyond Gate: z = -36..-12)
  addTiledGround(group, 2, 2, 12, floorMat, 0, 24, 0);
  addTiledGround(group, 2, 2, 12, floorMat, 0, 0, 0);
  addTiledGround(group, 2, 2, 12, floorMat, 0, -24, 0);

  // 2. Stepped Portal Dais (`bậc thềm ngưỡng cổng`: 3 steps × 0.20 m rise = 0.60 m ≤ 0.35 m per step)
  addStepRun(group, [-3.2, 0, -2.4], 2.4, 0.85, 0.2, 3, thresholdMat);

  // 3. Astral Causeway Ramp (`dốc dẫn lên ngưỡng cổng`: rise 0.84 m over 2.4 m run => 19.3° ≤ 45°)
  addWalkableRamp(group, [0, 0, -2.5], 2.4, 2.4, 0.84, thresholdMat, 'portal_causeway_ramp');

  // 4. Portal Thresholds (`ngưỡng cổng`) with flanking arch pillars
  // Main Portal Threshold platform at z = -6.2
  addBoxCollider(group, [6.4, 0.6, 2.4], [-1.6, 0.3, -6.2], thresholdMat, [0, 0, 0], 'portal_threshold_main');
  addBoxCollider(group, [0.85, 3.6, 0.85], [-4.2, 1.8, -6.2], wallMat, [0, 0, 0], 'portal_pillar_left');
  addBoxCollider(group, [0.85, 3.6, 0.85], [1.2, 1.8, -6.2], wallMat, [0, 0, 0], 'portal_pillar_right');

  // South Room-to-Room Portal Threshold at z = +12.0 (step height 0.18 m ≤ 0.35 m so player walks right over it)
  addBoxCollider(group, [4.8, 0.18, 1.4], [0, 0.09, 12.0], thresholdMat, [0, 0, 0], 'portal_threshold_room1_2');
  // North Room-to-Room Portal Threshold at z = -12.0
  addBoxCollider(group, [4.8, 0.18, 1.4], [0, 0.09, -12.0], thresholdMat, [0, 0, 0], 'portal_threshold_room2_3');

  // 5. Astral monolith rocks (`đá lớn`)
  addBoxCollider(group, [1.5, 1.3, 1.5], [3.5, 0.65, -1.8], monolithMat, [0, 0.35, 0], 'astral_monolith_1');
  addBoxCollider(group, [1.5, 1.3, 1.5], [-6.2, 0.65, 2.4], monolithMat, [0, -0.25, 0], 'astral_monolith_2');

  // 6. Sanctum chamber walls (`tường phòng`) — tiled ≤ 24 m
  addBoxCollider(group, [24, 2.6, 0.5], [0, 1.3, -15.5], wallMat, [0, 0, 0], 'sanctum_wall_n');
  addBoxCollider(group, [0.5, 2.6, 24], [-11.5, 1.3, 0], wallMat, [0, 0, 0], 'sanctum_wall_w');
  addBoxCollider(group, [0.5, 2.6, 24], [11.5, 1.3, 0], wallMat, [0, 0, 0], 'sanctum_wall_e');

  const meta: SceneColliderMetadata = {
    collision: true,
    sceneId: 'multiverse_portal',
    maxTileSpanM: 24,
    maxStepHeightM: 0.2,
    maxSlopeDeg: 19.3,
    features: {
      stepStart: [-3.2, 0, -2.4],
      rampStart: [0, 0, -2.5],
      bridgeOrDockCenter: [-1.6, 0.6, -6.2],
      rockCenter: [3.5, 0.65, -1.8],
      wallZ: -15.5,
    },
  };
  group.userData = meta;
  return group;
}

/**
 * Builds the collision mesh (`userData.collision = true`) for the requested `sceneId`.
 */
export function buildSceneCollisionMesh(
  sceneId: PhysicsSceneId,
  opts?: SceneColliderOptions,
): THREE.Group {
  switch (sceneId) {
    case 'river_survival':
      return buildRiverSurvivalCollisionMesh(opts);
    case 'summer_camp':
      return buildSummerCampCollisionMesh(opts);
    case 'kayak_rush':
      return buildKayakCollisionMesh(opts);
    case 'multiverse_portal':
      return buildMultiverseCollisionMesh(opts);
  }
}

/**
 * Traverses `root` to find the collision group marked with `userData.collision === true`
 * so Claude Code can pass it directly into `trianglesFrom(collisionGroup)`.
 */
export function findCollisionGroup(root: THREE.Object3D): THREE.Group | null {
  let found: THREE.Group | null = null;
  root.traverse((obj) => {
    if (!found && obj.userData?.collision === true && obj instanceof THREE.Group) {
      found = obj;
    }
  });
  return found;
}
