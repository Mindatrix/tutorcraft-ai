import {
  lib,
  libraryAsset,
  type AssetQuality,
} from '../../../../config/assetLibrary';
import { THREE_ASSET_MANIFEST } from '../../../../config/threeAssets';

export type SurvivalZoneId = 'zone_alpha' | 'zone_bravo' | 'zone_charlie';

export interface ZoneAssetPlacement {
  id: string;
  category: 'ground' | 'tree' | 'hide_spot' | 'fence' | 'prop';
  /** Offset relative to the zone center [dx, dy, dz]. */
  offset: [number, number, number];
  /** Y rotation in radians. */
  rotationY: number;
  /** Target height/scale in world meters. */
  height: number;
}

export interface SurvivalZoneSpec {
  id: SurvivalZoneId;
  code: 'A' | 'B' | 'C';
  nameVi: string;
  nameEn: string;
  roleVi: string;
  /** World-space center [x, y, z] of the zone. */
  center: [number, number, number];
  /** Zone radius in meters. */
  radius: number;
  /** Team/zone accent color hex. */
  accentHex: string;
  /** Ground base color hex for procedural terrain fallback. */
  groundHex: number;
  /** Coordinates of this zone's Wooden Pen (Chuồng Gỗ) relative to world origin. */
  penPosition: [number, number, number];
  /** Coordinates of the Tag Net station / crate in this zone. */
  netStationPosition: [number, number, number];
  /** Placements of catalog assets (trees, ground, simple fences, hide spots, props). */
  placements: ZoneAssetPlacement[];
}

/**
 * Curated catalog asset IDs from `content/asset_catalog.json` & `src/config/threeAssets.ts`
 * used to assemble the River Survival ("Cướp Lưới") 3D scene.
 */
export const RIVER_SURVIVAL_CATALOG_ASSETS = {
  groundIds: [
    'ground_clearing',
    'ground_sand_slab',
    'ground_grass_emerald',
    'ground_cobble_circle',
    'ground_cobble_path_a',
    'ground_cobble_path_b',
  ],
  treeIds: [
    'river_tree_pine',
    'river_tree_pine__alt1',
    'tree_x01',
    'tree_x07_elm',
    'tree_x08_verdant',
  ],
  hideSpotIds: [
    'river_bush',
    'river_bush__alt1',
    'river_fern',
    'river_reed',
  ],
  fenceIds: [
    'river_fence',
    'river_fence__alt1',
    'river_fence__alt2',
    'surv_stake_1',
  ],
  penWallIds: [
    'surv_holding_pen',
    'surv_pen_wall_stone',
    'surv_pen_wall_window',
    'surv_rope',
    'surv_rope_cut',
    'surv_sharp_rock',
  ],
  netIds: [
    'surv_capture_net',
    'surv_net_launcher_a',
    'surv_net_launcher_b',
    'fish_net',
    'surv_crate_1',
  ],
  propIds: [
    'surv_rival_tent',
    'surv_flag',
    'surv_spring',
    'surv_letter_1',
    'surv_map',
    'surv_compass',
  ],
} as const;

/**
 * The 3 distinct tactical zones required by the River Survival ("Cướp Lưới") blueprint:
 * - Zone A (`zone_alpha`): North Bank & Pine Grove (Escaper shelter, spring water & cipher clearing)
 * - Zone B (`zone_bravo`): Central River Ford & Orange Flag Camp (Main Wooden Pen & Tag Net crate)
 * - Zone C (`zone_charlie`): South Reed Marsh & Safe Cave (Deep hiding reeds, footprint sandbar & compass outpost)
 */
export const RIVER_SURVIVAL_ZONES: readonly SurvivalZoneSpec[] = [
  {
    id: 'zone_alpha',
    code: 'A',
    nameVi: 'Khu A · Bờ Bắc & Rừng Thông',
    nameEn: 'Zone A · North Pine Bank',
    roleVi: 'Bãi xuất phát Đội Chạy Trốn · Suối nước & Mật thư',
    center: [-22, 0, -12],
    radius: 13,
    accentHex: THREE_ASSET_MANIFEST.gameModes.river_survival.palette.escapers,
    groundHex: 0x3b7a47,
    penPosition: [-26, 0, -16],
    netStationPosition: [-18, 0, -9],
    placements: [
      { id: 'ground_clearing', category: 'ground', offset: [0, -0.04, 0], rotationY: 0, height: 1.2 },
      { id: 'ground_cobble_path_a', category: 'ground', offset: [5.5, 0.01, 3.2], rotationY: 0.5, height: 0.4 },
      { id: 'river_tree_pine', category: 'tree', offset: [-6.5, 0, -5.5], rotationY: 0.2, height: 5.2 },
      { id: 'tree_x01', category: 'tree', offset: [6.0, 0, -6.2], rotationY: 1.4, height: 4.8 },
      { id: 'river_tree_pine__alt1', category: 'tree', offset: [-7.2, 0, 4.8], rotationY: 2.3, height: 5.0 },
      { id: 'river_bush', category: 'hide_spot', offset: [-3.2, 0, 3.4], rotationY: 0.6, height: 1.4 },
      { id: 'river_fern', category: 'hide_spot', offset: [3.4, 0, 4.0], rotationY: 1.8, height: 1.1 },
      { id: 'river_fence', category: 'fence', offset: [-4.5, 0, -7.5], rotationY: 0, height: 1.3 },
      { id: 'river_fence__alt1', category: 'fence', offset: [0, 0, -7.5], rotationY: 0, height: 1.3 },
      { id: 'surv_spring', category: 'prop', offset: [4.2, 0, -1.8], rotationY: 0.4, height: 1.4 },
      { id: 'surv_letter_1', category: 'prop', offset: [1.5, 0.4, 1.2], rotationY: -0.3, height: 0.5 },
    ],
  },
  {
    id: 'zone_bravo',
    code: 'B',
    nameVi: 'Khu B · Bãi Giữa & Chuồng Gỗ Chính',
    nameEn: 'Zone B · Central Crossing & Main Wooden Pen',
    roleVi: 'Trại Cờ Cam Đội Săn Tìm · Chuồng Gỗ & Thùng Lưới Gắn Thẻ',
    center: [0, 0, 0],
    radius: 15,
    accentHex: THREE_ASSET_MANIFEST.gameModes.river_survival.palette.pursuers,
    groundHex: 0x8c734b,
    penPosition: [0, 0, -5.5],
    netStationPosition: [5.2, 0, 2.8],
    placements: [
      { id: 'ground_sand_slab', category: 'ground', offset: [0, -0.04, 0], rotationY: 0, height: 1.0 },
      { id: 'ground_cobble_circle', category: 'ground', offset: [0, 0.02, -5.5], rotationY: 0, height: 0.5 },
      { id: 'tree_x07_elm', category: 'tree', offset: [-9.2, 0, -6.5], rotationY: 0.8, height: 5.4 },
      { id: 'tree_x08_verdant', category: 'tree', offset: [9.4, 0, -6.0], rotationY: 2.1, height: 5.2 },
      { id: 'river_bush__alt1', category: 'hide_spot', offset: [-6.4, 0, 4.6], rotationY: 1.1, height: 1.5 },
      { id: 'river_reed', category: 'hide_spot', offset: [7.2, 0, 5.2], rotationY: 0.3, height: 1.6 },
      { id: 'river_fence', category: 'fence', offset: [-7.5, 0, -2.0], rotationY: Math.PI / 2, height: 1.3 },
      { id: 'river_fence__alt2', category: 'fence', offset: [7.5, 0, -2.0], rotationY: Math.PI / 2, height: 1.3 },
      { id: 'surv_rival_tent', category: 'prop', offset: [6.2, 0, -3.5], rotationY: -0.6, height: 2.8 },
      { id: 'surv_flag', category: 'prop', offset: [4.2, 0, -4.5], rotationY: 0.2, height: 2.6 },
      { id: 'surv_crate_1', category: 'prop', offset: [5.2, 0, 2.8], rotationY: 0.4, height: 1.0 },
    ],
  },
  {
    id: 'zone_charlie',
    code: 'C',
    nameVi: 'Khu C · Đầm Lau & Hang Trú Nam',
    nameEn: 'Zone C · South Reed Marsh & Safe Cave',
    roleVi: 'Bãi xóa dấu chân · Bụi lau ẩn nấp & La bàn kiểm lâm',
    center: [22, 0, 12],
    radius: 13,
    accentHex: '#34d399',
    groundHex: 0x2f6f4e,
    penPosition: [26, 0, 15.5],
    netStationPosition: [18, 0, 9],
    placements: [
      { id: 'ground_grass_emerald', category: 'ground', offset: [0, -0.04, 0], rotationY: 0, height: 1.2 },
      { id: 'ground_cobble_path_b', category: 'ground', offset: [-5.2, 0.01, -3.0], rotationY: -0.5, height: 0.4 },
      { id: 'tree_x08_verdant', category: 'tree', offset: [6.8, 0, 5.8], rotationY: 0.9, height: 5.3 },
      { id: 'river_tree_pine', category: 'tree', offset: [-6.0, 0, 6.2], rotationY: 2.6, height: 5.0 },
      { id: 'river_reed', category: 'hide_spot', offset: [-3.8, 0, -3.2], rotationY: 0.4, height: 1.7 },
      { id: 'river_fern', category: 'hide_spot', offset: [3.5, 0, -4.0], rotationY: 1.9, height: 1.2 },
      { id: 'river_bush', category: 'hide_spot', offset: [0.8, 0, 4.8], rotationY: 2.4, height: 1.5 },
      { id: 'river_fence__alt1', category: 'fence', offset: [0, 0, 7.5], rotationY: 0, height: 1.3 },
      { id: 'river_fence__alt2', category: 'fence', offset: [4.5, 0, 7.5], rotationY: 0, height: 1.3 },
      { id: 'surv_compass', category: 'prop', offset: [-2.2, 0.35, 0.8], rotationY: 0.5, height: 0.45 },
      { id: 'surv_map', category: 'prop', offset: [2.0, 0.35, -1.2], rotationY: -0.4, height: 0.55 },
    ],
  },
] as const;

/**
 * Resolves all catalog asset IDs used by the River Survival scene into Cloudflare R2 / local asset URLs.
 */
export function resolveSurvivalAssetUrls(
  quality: AssetQuality = 'high',
): Record<string, string> {
  const allIds = new Set<string>([
    ...RIVER_SURVIVAL_CATALOG_ASSETS.groundIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.treeIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.hideSpotIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.fenceIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.penWallIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.netIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.propIds,
  ]);
  const out: Record<string, string> = {};
  for (const id of allIds) {
    out[id] = lib(id, quality);
  }
  return out;
}

/**
 * Verifies that every asset ID referenced by the River Survival scene resolves in `ASSET_LIBRARY` (or aliases).
 */
export function verifySurvivalCatalogAssets(): { valid: boolean; missing: string[] } {
  const allIds = new Set<string>([
    ...RIVER_SURVIVAL_CATALOG_ASSETS.groundIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.treeIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.hideSpotIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.fenceIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.penWallIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.netIds,
    ...RIVER_SURVIVAL_CATALOG_ASSETS.propIds,
  ]);
  const missing: string[] = [];
  for (const id of allIds) {
    if (!libraryAsset(id)) {
      missing.push(id);
    }
  }
  return { valid: missing.length === 0, missing };
}

/**
 * Finds which of the 3 River Survival zones contains or is closest to `(x, z)`.
 */
export function findZoneAtPosition(x: number, z: number): SurvivalZoneSpec {
  let best = RIVER_SURVIVAL_ZONES[0];
  let bestDistSq = Infinity;
  for (const zone of RIVER_SURVIVAL_ZONES) {
    const dx = x - zone.center[0];
    const dz = z - zone.center[2];
    const d2 = dx * dx + dz * dz;
    if (d2 < bestDistSq) {
      bestDistSq = d2;
      best = zone;
    }
  }
  return best;
}

/**
 * Computes deterministic holding positions inside a Wooden Pen ("Chuồng Gỗ")
 * so tagged players stand comfortably in a circle around the cipher table.
 */
export function computePenSlotPositions(
  penCenter: [number, number, number],
  capacity = 8,
  innerRadius = 2.1,
): Array<[number, number, number]> {
  const count = Math.max(1, capacity);
  const slots: Array<[number, number, number]> = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = Math.round((penCenter[0] + Math.cos(angle) * innerRadius) * 100) / 100;
    const z = Math.round((penCenter[2] + Math.sin(angle) * innerRadius) * 100) / 100;
    slots.push([x, penCenter[1], z]);
  }
  return slots;
}
