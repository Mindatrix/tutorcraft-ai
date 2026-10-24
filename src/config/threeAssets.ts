// ============================================================================
// 3D ASSET CONFIGURATION & PLACEHOLDERS (THREE_ASSET_MANIFEST)
// ============================================================================
// Founder điền tài nguyên 3D vào đây. Quy ước:
//   - Chuỗi còn bắt đầu bằng "[ĐIỀN TẠI ĐÂY" = CHƯA CÓ  → game tự dựng mô hình low-poly bằng code (fallback).
//   - Số / mảng còn là `null`                 = CHƯA CÓ  → dùng giá trị trong THREE_DEFAULTS bên dưới.
// Gọi `missingThreeAssets()` để xem danh sách ô còn trống (kèm đường dẫn, vd "gameModes.kayak_rush.kayakModelUrl").
//
// Đường dẫn file đặt trong /public, ví dụ file public/assets/3d/kayak.glb → '/assets/3d/kayak.glb'.
// Chỉ dùng tài nguyên CC0 / miễn phí (Kenney.nl, Kay Lousberg, Poly Haven) hoặc do bạn tự làm.
// Màu sắc đã điền sẵn là màu đã chọn theo ảnh tham khảo (có thể đổi).
//
// 5 game chính thức (src/engine/gameModes.ts): kayak_rush · multiverse_portal · cosmic_card · dino_island · ai_agent_world.
// Đã huỷ: Wasteland Survival, Dungeon Labyrinth, Magic Tower 1v1.

import { GameMode } from '../engine/types';

export const FILL = '[ĐIỀN TẠI ĐÂY]';
type Fill<T extends string = string> = T | `[ĐIỀN TẠI ĐÂY${string}`;

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

export interface CosmicCardAssets {
  tableModelUrl: Fill;
  cardBackTextureUrl: Fill;
  /** Thư mục ảnh Anime / Splash Art: 0.png … 3.png (A–D). */
  cardArtDir: Fill;
  laserBeamShader: Fill;
  palette: { beam: Fill; critical: Fill; nebula: Fill };
  fallback2d: Fallback2D;
}

export interface DinoIslandAssets {
  dinoModelUrl: Fill;
  friendModelUrl: Fill;
  cageModelUrl: Fill;
  monsterModelUrl: Fill;
  eggGachaModelUrl: Fill;
  backgroundUrl: Fill; // tranh nền thác nước (tuỳ chọn)
  palette: { dino: Fill; sky: Fill; lava: Fill };
  fallback2d: Fallback2D;
}

export interface AgentWorldAssets {
  officeModelUrl: Fill;
  agentModelUrls: { orion: Fill; kai: Fill; quinn: Fill };
  studentModelUrl: Fill;
  zoneColors: { tech: Fill; cafe: Fill; gameZone: Fill; meetingRoom: Fill; lounge: Fill };
  fallback2d: Fallback2D;
}

export interface ThreeAssetManifest {
  blenderMcp: {
    port: number | null;
    exportFormat: Fill<'glb' | 'gltf'>;
    dracoCompression: boolean | null;
  };
  gameModes: {
    [GameMode.KAYAK_RUSH_3D]: KayakRushAssets;
    [GameMode.MULTIVERSE_PORTAL_RPG]: MultiversePortalAssets;
    [GameMode.COSMIC_CARD_BATTLER]: CosmicCardAssets;
    [GameMode.DINO_ISLAND_RUN_2D]: DinoIslandAssets;
    [GameMode.AI_AGENT_WORLD_3D]: AgentWorldAssets;
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

const glb = (name: string) => `[ĐIỀN TẠI ĐÂY: Link URL file ${name}.glb]` as const;

export const THREE_ASSET_MANIFEST: ThreeAssetManifest = {
  blenderMcp: {
    port: 9876, // đã kiểm chứng: Blender MCP add-on đang lắng nghe cổng 9876 (24/10/2026)
    exportFormat: 'glb', // đã kiểm chứng: toàn bộ asset hiện có trong /public/models là .glb
    dracoCompression: null, // [ĐIỀN TẠI ĐÂY: true/false] — true cần thêm DRACOLoader + decoder trong /public
  },
  gameModes: {
    [GameMode.KAYAK_RUSH_3D]: {
      kayakModelUrl: glb('kayak'),
      riverTextureUrl: '[ĐIỀN TẠI ĐÂY: Link URL texture mặt sông]',
      skyboxUrl: '[ĐIỀN TẠI ĐÂY: Link URL ảnh trời 360° (.hdr/.jpg)]',
      hatModelUrls: { propeller: glb('hat_propeller'), wizard: glb('hat_wizard'), jester: glb('hat_jester'), hardhat: glb('hat_hardhat') },
      obstacleModelUrls: { spinningLog: glb('log_spinning'), iceBlock: glb('ice_block'), plantMonster: glb('plant_monster') },
      palette: { river: '#36c3cf', riverDeep: '#1b8fa6', foam: '#f4fbff', bank: '#7cc36a' },
      fallback2d: { spriteSheetUrl: '[ĐIỀN TẠI ĐÂY: Link URL sprite sheet thuyền 2D]' },
    },
    [GameMode.MULTIVERSE_PORTAL_RPG]: {
      heroModelUrl: glb('scarlet_princess'),
      heroAnimations: {
        idle: '[ĐIỀN TẠI ĐÂY: Tên clip animation, ví dụ: "Idle"]',
        attack: '[ĐIỀN TẠI ĐÂY: Tên clip animation, ví dụ: "Slash"]',
        hit: '[ĐIỀN TẠI ĐÂY: Tên clip animation, ví dụ: "TakeHit"]',
        run: '[ĐIỀN TẠI ĐÂY: Tên clip animation, ví dụ: "Run"]',
        defeat: '[ĐIỀN TẠI ĐÂY: Tên clip animation, ví dụ: "Death"]',
      },
      bossModelUrl: glb('boss'),
      worldModelUrls: { castle: glb('world_castle'), cyberpunk: glb('world_cyberpunk'), desert: glb('world_desert') },
      hdriSkyboxUrls: {
        castle: '[ĐIỀN TẠI ĐÂY: HDRI lâu đài sương mù (Poly Haven)]',
        cyberpunk: '[ĐIỀN TẠI ĐÂY: HDRI thành phố đêm]',
        desert: '[ĐIỀN TẠI ĐÂY: HDRI sa mạc]',
      },
      portalRimColor: '#c084fc',
      fallback2d: { spriteSheetUrl: '[ĐIỀN TẠI ĐÂY: Link URL sprite sheet Scarlet 2D]' },
    },
    [GameMode.COSMIC_CARD_BATTLER]: {
      tableModelUrl: glb('cosmic_table'),
      cardBackTextureUrl: '[ĐIỀN TẠI ĐÂY: Link URL mặt sau thẻ bài]',
      cardArtDir: '[ĐIỀN TẠI ĐÂY: Thư mục ảnh thẻ, ví dụ: "/assets/cards/"]',
      laserBeamShader: 'EnergyBeamShader', // đã viết sẵn trong CosmicCardBattler.tsx
      palette: { beam: '#5eead4', critical: '#facc15', nebula: '#6d28d9' },
      fallback2d: { spriteSheetUrl: '[ĐIỀN TẠI ĐÂY: Link URL sprite sheet thẻ 2D]' },
    },
    [GameMode.DINO_ISLAND_RUN_2D]: {
      dinoModelUrl: glb('dino_green'),
      friendModelUrl: glb('dino_friend'),
      cageModelUrl: glb('iron_cage'),
      monsterModelUrl: glb('spiky_beetle'),
      eggGachaModelUrl: glb('gacha_egg'),
      backgroundUrl: '[ĐIỀN TẠI ĐÂY: Link URL tranh nền thác nước]',
      palette: { dino: '#5cc93b', sky: '#8fd3ff', lava: '#ff6a1a' },
      fallback2d: { spriteSheetUrl: '[ĐIỀN TẠI ĐÂY: Link URL sprite sheet Dino 2D]' },
    },
    [GameMode.AI_AGENT_WORLD_3D]: {
      officeModelUrl: glb('isometric_office'),
      agentModelUrls: { orion: glb('agent_orion'), kai: glb('agent_kai'), quinn: glb('agent_quinn') },
      studentModelUrl: glb('student_avatar'),
      zoneColors: { tech: '#9fb889', cafe: '#6b4a32', gameZone: '#e9845f', meetingRoom: '#5b7bd6', lounge: '#2a2d35' },
      fallback2d: { spriteSheetUrl: '[ĐIỀN TẠI ĐÂY: Link URL sprite sheet văn phòng 2D]' },
    },
  },
  graphicsSettings: {
    defaultCameraFov: null, // [ĐIỀN TẠI ĐÂY: ví dụ 50] — mỗi game có góc máy riêng (Agent World cố định fov 30)
    bloomIntensity: null, // [ĐIỀN TẠI ĐÂY: ví dụ 0.5] — hiện chưa có hậu kỳ Bloom (giữ nhẹ cho điện thoại)
    shadowMapSize: null, // [ĐIỀN TẠI ĐÂY: ví dụ 1024]
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

/** URL đã điền, hoặc null nếu ô còn trống. */
export function assetUrl(value: string): string | null {
  return isUnfilled(value) ? null : value;
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
