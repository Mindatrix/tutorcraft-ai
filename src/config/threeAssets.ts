// ============================================================================
// 3D ASSET CONFIGURATION (THREE_ASSET_MANIFEST)
// ============================================================================
// Mọi ô đã được điền (A3.6, 26/10/2026) từ thư viện model thật (content/asset_catalog.json):
//   - lib('<id>')        = URL của model trong thư viện (bản web; bản thấp: withQuality(url, 'low')).
//   - ids('<thư mục>')   = danh sách id model của một gói (camp, fishing/ca, dino/khung_long…).
//   - PROCEDURAL         = phần này dựng bằng code (nước bằng shader, sprite 2D, mũ…): đã quyết, không phải ô trống.
// Ô bắt đầu bằng "[ĐIỀN TẠI ĐÂY" vẫn được hiểu là CHƯA CÓ (game tự dựng mô hình low-poly bằng code).
// Gọi `missingThreeAssets()` để xem ô còn trống (kiểm thử yêu cầu danh sách rỗng).
//
// 6 game chính thức (src/engine/gameModes.ts): kayak_rush · multiverse_portal · summer_camp · river_fishing · river_survival · dino_journey.
// Bộ "thế giới sông" và bộ nhân vật dùng chung cho Kayak, Trại Hè, Câu Cá, Sinh Tồn: điện thoại tải một lần rồi lưu cache
// (src/components/modes/three/assetLoader.ts). Ảnh trời HDRI (Poly Haven, CC0): bản 1K trong /public/assets/hdri,
// bản 2K nằm cùng thư viện model, ngoài git (hdri() trong assetLibrary.ts).

import { GameMode } from '../engine/types';
import { ASSET_LIBRARY, PROCEDURAL, hdri, lib } from './assetLibrary';

export { PROCEDURAL };
export const FILL = '[ĐIỀN TẠI ĐÂY]';
type Fill<T extends string = string> = T | `[ĐIỀN TẠI ĐÂY${string}`;
/** Ids of library models (content/asset_catalog.json). */
type AssetIds = string[];

/** 2D canvas fallback (máy yếu / không có WebGL): ảnh sprite sheet tuỳ chọn. */
interface Fallback2D {
  spriteSheetUrl: Fill;
}

export interface KayakRushAssets {
  kayakModelUrl: Fill;
  riverTextureUrl: Fill;
  skyboxUrl: Fill;
  /** Mũ gắn vào `hat_attachment_slot` trên đầu nhân vật. */
  hatModelUrls: { propeller: Fill; wizard: Fill; jester: Fill; hardhat: Fill };
  obstacleModelUrls: { spinningLog: Fill; iceBlock: Fill; plantMonster: Fill };
  palette: { river: Fill; riverDeep: Fill; foam: Fill; bank: Fill };
  fallback2d: Fallback2D;
}

export interface MultiversePortalAssets {
  heroModelUrl: Fill; // Scarlet Princess (rapier + chiến kỳ)
  heroAnimations: { idle: Fill; attack: Fill; hit: Fill; run: Fill; defeat: Fill };
  bossModelUrl: Fill;
  worldModelUrls: { castle: Fill; cyberpunk: Fill; desert: Fill };
  /** HDRI 360° (.hdr) hoặc ảnh equirectangular (.jpg/.png) cho từng thế giới. */
  hdriSkyboxUrls: { castle: Fill; cyberpunk: Fill; desert: Fill };
  portalRimColor: Fill;
  fallback2d: Fallback2D;
}

/** Thế giới sông dùng chung (cây, đá, nước, bến gỗ, trời): mỗi gói là danh sách id model trong thư viện. */
export interface RiverWorldAssets {
  /** Cây, bụi, dương xỉ, lau sậy, đá, sỏi, nấm, cỏ cao, gỗ mục. */
  natureIds: AssetIds;
  /** Bến gỗ, cầu, nhà gỗ, chòi, biển chỉ đường, làng, phao. */
  structureIds: AssetIds;
  /** Mặt đất, bãi cỏ, đường sỏi (khối nền dựng cảnh). */
  groundIds: AssetIds;
  /** Phông nền xa: đảo nổi, thung lũng, thác (vẽ ở xa, bản thấp trên điện thoại). */
  backdropIds: AssetIds;
  /** Thuyền nhôm nhỏ (Câu Cá) và kayak (Kayak Rush). */
  boatModelUrls: { aluminium: Fill; kayak: Fill };
  /** HDRI (Poly Haven, CC0): bản 2K cho máy tính (CDN); bản 1K trong /public cho điện thoại và làm đường lùi: hdriSize(url, '1k'). Tải bằng scripts/fetch-hdri.mjs. */
  hdriUrls: { dawn: Fill; day: Fill; sunset: Fill; night: Fill; cloudy: Fill };
  /** Vân đất PBR: PROCEDURAL (shader) cho tới khi có ảnh tex_mud / tex_sand trong thư viện. */
  groundTextureDirs: { grass: Fill; mud: Fill; sand: Fill; pebbles: Fill; rock: Fill };
  water: { normalMapUrl: Fill; foamMapUrl: Fill };
  palette: { water: Fill; waterDeep: Fill; foliage: Fill; sunlight: Fill };
}

/** Nhân vật dùng chung: thân có xương (kèm clip hoạt ảnh bên trong) và thân chưa có xương (hoạt ảnh phụ bằng code). */
export interface CharacterAssets {
  /** Nhân vật có xương; mỗi file mang sẵn clip (Walking, Running, Big_Wave_Hello…). */
  riggedIds: AssetIds;
  /** Nhân vật tĩnh: nhún, xoay, nhảy bằng code (C2.3). */
  staticIds: AssetIds;
  /** Trang phục/màu đổi bằng vật liệu (C2.2), không cần gói quần áo riêng. */
  wardrobe: Fill;
  /** Clip nằm trong từng file nhân vật. */
  animations: Fill;
}

export interface SummerCampAssets {
  /** Lều, bếp lửa, vỉ nướng, chảo, ba lô, dây thừng… */
  campIds: AssetIds;
  /** Thực phẩm sống / chín và xiên nướng. */
  foodIds: AssetIds;
  /** Ảnh 2D biểu tượng công cụ mở khoá. */
  toolIconDir: Fill;
  /** Ảnh hạt lửa, khói, tia lửa (lửa trại dựng bằng shader trong code). */
  fxTextureDir: Fill;
  palette: { fire: Fill; smoke: Fill; tent: Fill };
  fallback2d: Fallback2D;
}

export interface RiverFishingAssets {
  /** Cần câu 4 cấp, giá cần, hộp đồ, giỏ, bến nổi, đèn bến, bảng kỷ lục, ghế thuyền. */
  gearIds: AssetIds;
  /** Mỗi loài một model tĩnh (bơi bằng code). */
  fishIds: AssetIds;
  fishIconDir: Fill;
  splashTextureUrl: Fill;
  palette: { line: Fill; tensionSafe: Fill; tensionDanger: Fill };
  fallback2d: Fallback2D;
}

export interface RiverSurvivalAssets {
  /** Cọc gỗ, dây thừng, đá sắc, trại đối thủ, thùng, container, trực thăng rơi, bẫy, mật thư, bản đồ, la bàn, ống nhòm, đèn pin. */
  survivalIds: AssetIds;
  /** Bụi rậm, dương xỉ, cỏ cao, lau sậy để lẩn trốn. */
  hideSpotIds: AssetIds;
  /** Lưới bắt của đội Săn Tìm — đội Chạy Trốn cướp được để đuổi ngược hoặc giải cứu đồng đội. */
  captureToolModelUrl: Fill;
  /** Khu giữ người bị bắt (không đáng sợ). */
  holdingPenModelUrl: Fill;
  footprintDecalDir: Fill;
  minimapUrl: Fill;
  palette: { escapers: Fill; pursuers: Fill; dusk: Fill };
  fallback2d: Fallback2D;
}

export interface DinoJourneyAssets {
  /** Khủng long: cha (T-Rex nâu), bạn đồng hành, bầy cổ dài, sừng ba, lưng gai. */
  dinoIds: AssetIds;
  /** Sinh vật nhỏ: linh dương, thỏ, chuột, sói (kẻ nhặt xác trong cảnh bắt nạt). */
  critterIds: AssetIds;
  /** Cao nguyên khô, rừng nổi, tổ trứng. */
  worldIds: AssetIds;
  /** Ảnh thu nhỏ để chọn loài và màu khi chơi cả lớp. */
  speciesIconDir: Fill;
  palette: { grass: Fill; dusk: Fill; storm: Fill };
  fallback2d: Fallback2D;
}

export interface ThreeAssetManifest {
  blenderMcp: {
    port: number | null;
    exportFormat: Fill<'glb' | 'gltf'>;
    dracoCompression: boolean | null;
  };
  /** Dùng chung cho 4 game sông nước. */
  riverWorld: RiverWorldAssets;
  /** Dùng chung cho mọi game có nhân vật học viên. */
  characters: CharacterAssets;
  gameModes: {
    [GameMode.KAYAK_RUSH_3D]: KayakRushAssets;
    [GameMode.MULTIVERSE_PORTAL_RPG]: MultiversePortalAssets;
    [GameMode.SUMMER_CAMP_QUESTS]: SummerCampAssets;
    [GameMode.RIVER_FISHING]: RiverFishingAssets;
    [GameMode.RIVER_SURVIVAL]: RiverSurvivalAssets;
    [GameMode.DINO_JOURNEY]: DinoJourneyAssets;
  };
  graphicsSettings: {
    defaultCameraFov: number | null;
    bloomIntensity: number | null;
    shadowMapSize: number | null;
    /** Dưới ngưỡng FPS này liên tục trong `fpsFallbackWindowMs` → tự lùi về 2D canvas. */
    fpsFallbackThreshold: number | null;
    fpsFallbackWindowMs: number | null;
    maxPixelRatio: number | null;
  };
}

/** Ids of the library models in a folder of the 3D library (e.g. "camp", "dino/khung_long"). */
export function ids(folder: string, filter: (id: string) => boolean = () => true): string[] {
  const prefix = folder.endsWith('/') ? folder : `${folder}/`;
  return ASSET_LIBRARY.filter((a) => a.file.startsWith(prefix) && !a.file.slice(prefix.length).includes('/') && filter(a.id)).map((a) => a.id);
}
const RIVER = [...ids('river_world'), ...ids('river_world/cay_phu'), ...ids('river_world/phu'), ...ids('river_world/lang')];
const pick = (list: string[], re: RegExp) => list.filter((id) => re.test(id));

export const THREE_ASSET_MANIFEST: ThreeAssetManifest = {
  blenderMcp: {
    port: 9876, // đã kiểm chứng: Blender MCP add-on đang lắng nghe cổng 9876 (24/10/2026)
    exportFormat: 'glb',
    dracoCompression: false, // đã chốt: dùng nén Meshopt (scripts/optimize-glb.mjs) thay cho Draco
  },
  riverWorld: {
    natureIds: pick(RIVER, /^(river_(bush|fern|reed|rock|pebbles|grass|tree|lilypad|stump|log|driftwood|flower|moss|woodpile)|tree_|palm_|mushrooms)/),
    structureIds: pick(RIVER, /^(river_(dock|bridge|cabin|sign|fence|shed|boat|buoy|waterfall|cave|well|birds|butterfly)|watchtower|tree_fort|wood_plank|village_)/),
    groundIds: ids('river_world/ground'),
    backdropIds: ids('river_world/mini'),
    boatModelUrls: { aluminium: lib('river_boat_row'), kayak: lib('kayak_boat') },
    hdriUrls: {
      dawn: hdri('dawn'),
      day: hdri('day'),
      sunset: hdri('sunset'),
      night: hdri('night'),
      cloudy: hdri('cloudy'),
    },
    groundTextureDirs: { grass: PROCEDURAL, mud: PROCEDURAL, sand: PROCEDURAL, pebbles: PROCEDURAL, rock: PROCEDURAL },
    water: { normalMapUrl: PROCEDURAL, foamMapUrl: PROCEDURAL },
    palette: { water: '#2fb5b0', waterDeep: '#0f6f7a', foliage: '#4f8f3a', sunlight: '#fff1c9' },
  },
  characters: {
    riggedIds: ids('characters'),
    staticIds: ids('characters/chua_co_xuong'),
    wardrobe: PROCEDURAL,
    animations: 'embedded',
  },
  gameModes: {
    [GameMode.KAYAK_RUSH_3D]: {
      kayakModelUrl: lib('kayak_boat'),
      riverTextureUrl: PROCEDURAL,
      skyboxUrl: hdri('day'),
      hatModelUrls: { propeller: PROCEDURAL, wizard: PROCEDURAL, jester: PROCEDURAL, hardhat: PROCEDURAL },
      obstacleModelUrls: { spinningLog: lib('river_log_fallen'), iceBlock: PROCEDURAL, plantMonster: PROCEDURAL },
      palette: { river: '#36c3cf', riverDeep: '#1b8fa6', foam: '#f4fbff', bank: '#7cc36a' },
      fallback2d: { spriteSheetUrl: PROCEDURAL },
    },
    [GameMode.MULTIVERSE_PORTAL_RPG]: {
      heroModelUrl: lib('mv_hero_scarlet'),
      // Clip names inside mv_hero_scarlet.glb (Mixamo); defeat is played in code (fall + fade).
      heroAnimations: { idle: 'Idle_Step_Turn_Left', attack: 'Large_step_then_high_kick', hit: 'Step_Back', run: 'Running', defeat: PROCEDURAL },
      bossModelUrl: lib('mv_boss'),
      worldModelUrls: { castle: lib('mv_world_castle'), cyberpunk: lib('mv_world_cyberpunk'), desert: lib('mv_world_desert') },
      hdriSkyboxUrls: { castle: hdri('cloudy'), cyberpunk: hdri('night'), desert: hdri('sunset') },
      portalRimColor: '#c084fc',
      fallback2d: { spriteSheetUrl: PROCEDURAL },
    },
    [GameMode.SUMMER_CAMP_QUESTS]: {
      campIds: ids('camp', (id) => !/^(food_|camp_skewer)/.test(id)),
      foodIds: ids('camp', (id) => /^(food_|camp_skewer)/.test(id)),
      toolIconDir: PROCEDURAL,
      fxTextureDir: PROCEDURAL,
      palette: { fire: '#ff8a3d', smoke: '#cfc7bd', tent: '#f2a541' },
      fallback2d: { spriteSheetUrl: PROCEDURAL },
    },
    [GameMode.RIVER_FISHING]: {
      gearIds: ids('fishing'),
      fishIds: ids('fishing/ca'),
      fishIconDir: PROCEDURAL,
      splashTextureUrl: PROCEDURAL,
      palette: { line: '#f8fafc', tensionSafe: '#34d399', tensionDanger: '#f43f5e' },
      fallback2d: { spriteSheetUrl: PROCEDURAL },
    },
    [GameMode.RIVER_SURVIVAL]: {
      survivalIds: ids('survival'),
      hideSpotIds: pick(RIVER, /^(river_(bush|fern|reed)|river_grass_tall)/),
      captureToolModelUrl: lib('surv_net_launcher_a'),
      holdingPenModelUrl: lib('surv_holding_pen'),
      footprintDecalDir: '/assets/textures/footprints/',
      minimapUrl: PROCEDURAL,
      palette: { escapers: '#38bdf8', pursuers: '#f97316', dusk: '#3b2f5c' },
      fallback2d: { spriteSheetUrl: PROCEDURAL },
    },
    [GameMode.DINO_JOURNEY]: {
      dinoIds: ids('dino/khung_long'),
      critterIds: ids('dino/thu_nho'),
      worldIds: ids('dino/the_gioi'),
      speciesIconDir: PROCEDURAL,
      palette: { grass: '#8fbf5a', dusk: '#e0894d', storm: '#3d4a6b' },
      fallback2d: { spriteSheetUrl: PROCEDURAL },
    },
  },
  graphicsSettings: {
    defaultCameraFov: 50,
    bloomIntensity: 0, // đã chốt: không Bloom (giữ nhẹ cho điện thoại)
    shadowMapSize: 1024,
    fpsFallbackThreshold: 30, // đã chốt: FPS < 30 …
    fpsFallbackWindowMs: 5000, // … liên tục 5 giây → lùi về 2D canvas
    maxPixelRatio: 1.75, // đã chốt: đủ nét, không quá nặng cho điện thoại
  },
};

/** Giá trị dùng khi ô số còn trống (an toàn cho máy yếu / điện thoại học sinh). */
export const THREE_DEFAULTS = {
  dracoCompression: false,
  bossScale: [1, 1, 1] as [number, number, number],
  defaultCameraFov: 50,
  bloomIntensity: 0,
  shadowMapSize: 1024,
  fpsFallbackThreshold: 30,
  fpsFallbackWindowMs: 5000,
  maxPixelRatio: 1.75,
};

/** true nếu ô này chưa được Founder điền. */
export function isUnfilled(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim().startsWith('[ĐIỀN TẠI ĐÂY'));
}

/** Trả về giá trị đã điền, hoặc `fallback` nếu ô còn trống — renderer dùng hàm này thay vì đọc trực tiếp. */
export function assetOr<T>(value: T | string | null, fallback: T): T {
  return isUnfilled(value) ? fallback : (value as T);
}

/** URL đã điền, hoặc null nếu ô còn trống hoặc phần đó dựng bằng code (PROCEDURAL). */
export function assetUrl(value: string): string | null {
  return isUnfilled(value) || value === PROCEDURAL ? null : value;
}

/** Danh sách đường dẫn các ô còn trống, ví dụ ["gameModes.kayak_rush.kayakModelUrl", "graphicsSettings.bloomIntensity"]. */
export function missingThreeAssets(manifest: ThreeAssetManifest = THREE_ASSET_MANIFEST): string[] {
  const out: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (isUnfilled(node)) {
      out.push(path);
      return;
    }
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    }
  };
  walk(manifest, '');
  return out;
}
