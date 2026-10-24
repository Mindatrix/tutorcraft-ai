// ============================================================================
// 3D ASSET CONFIGURATION & PLACEHOLDERS (THREE_ASSET_MANIFEST)
// ============================================================================
// Founder điền tài nguyên 3D vào đây. Quy ước:
//   - Chuỗi còn bắt đầu bằng "[ĐIỀN TẠI ĐÂY" = CHƯA CÓ  → renderer dùng fallback (Three.js tự vẽ / 2D).
//   - Số / mảng còn là `null`                 = CHƯA CÓ  → dùng giá trị trong DEFAULTS bên dưới.
// Gọi `missingThreeAssets()` để xem danh sách ô còn trống (kèm đường dẫn, vd "characters.heroModelUrl").
//
// Đường dẫn file đặt trong /public, ví dụ file public/assets/3d/hero.glb → '/assets/3d/hero.glb'.
// Giá trị đã điền sẵn là những thứ đã KIỂM CHỨNG trong repo / máy dev (ghi chú "đã kiểm chứng").

export const FILL = '[ĐIỀN TẠI ĐÂY]';
type Fill<T extends string = string> = T | `[ĐIỀN TẠI ĐÂY${string}`;

export interface ThreeAssetManifest {
  blenderMcp: {
    port: number | null;
    exportFormat: Fill<'glb' | 'gltf'>;
    dracoCompression: boolean | null;
  };
  characters: {
    heroModelUrl: Fill;
    heroAnimations: { idle: Fill; attack: Fill; hit: Fill; castSpell: Fill; defeat: Fill };
    bossModelUrl: Fill;
    bossScale: [number, number, number] | null;
  };
  gameModes: {
    racer: { vehicleModelUrl: Fill; trackTextureUrl: Fill; gateNeonColor: Fill };
    survival: { environmentModelUrl: Fill; towerModelUrl: Fill; fogColor: Fill };
    towerRpg: { arenaModelUrl: Fill; particleColor: Fill };
    cardBattler: { tableModelUrl: Fill; cardBackTextureUrl: Fill; laserBeamShader: Fill };
    labyrinth: { wallTextureUrl: Fill; chestGachaModelUrl: Fill; chestOpenAnimation: Fill };
  };
  graphicsSettings: {
    defaultCameraFov: number | null;
    bloomIntensity: number | null;
    shadowMapSize: number | null;
  };
}

export const THREE_ASSET_MANIFEST: ThreeAssetManifest = {
  blenderMcp: {
    port: 9876, // đã kiểm chứng: Blender MCP add-on đang lắng nghe cổng 9876 (24/10/2026)
    exportFormat: 'glb', // đã kiểm chứng: toàn bộ asset hiện có trong /public/models là .glb
    dracoCompression: null, // [ĐIỀN TẠI ĐÂY: true/false] — true cần thêm DRACOLoader + decoder trong /public
  },
  characters: {
    heroModelUrl: '[ĐIỀN TẠI ĐÂY: Link URL hoặc đường dẫn file /assets/3d/hero.glb]',
    // Ghi chú: /models/kit/body/base.glb là bộ nhân vật lắp ghép (không có xương / animation Mixamo).
    heroAnimations: {
      idle: '[ĐIỀN TẠI ĐÂY: Tên clip animation Mixamo, ví dụ: "Mixamo_Idle"]',
      attack: '[ĐIỀN TẠI ĐÂY: Tên clip animation, ví dụ: "Mixamo_Slash"]',
      hit: '[ĐIỀN TẠI ĐÂY: Tên clip animation, ví dụ: "Mixamo_TakeHit"]',
      castSpell: '[ĐIỀN TẠI ĐÂY: Tên clip animation, ví dụ: "Mixamo_Cast"]',
      defeat: '[ĐIỀN TẠI ĐÂY: Tên clip animation, ví dụ: "Mixamo_Death"]',
    },
    // Gợi ý: Blender đang mở cảnh "Boss_Battle_Sample" (Boss_Root + 24 mesh) — có thể xuất thành boss .glb.
    bossModelUrl: '[ĐIỀN TẠI ĐÂY: Link URL hoặc đường dẫn file /assets/3d/boss_gargoyle.glb]',
    bossScale: null, // [ĐIỀN TẠI ĐÂY: ví dụ [1.5, 1.5, 1.5]]
  },
  gameModes: {
    racer: {
      vehicleModelUrl: '[ĐIỀN TẠI ĐÂY: Link URL file cyber_car.glb]',
      trackTextureUrl: '[ĐIỀN TẠI ĐÂY: Link URL texture đường đua]',
      gateNeonColor: '[ĐIỀN TẠI ĐÂY: Mã màu Hex Neon, ví dụ: "#00ffcc"]',
    },
    survival: {
      environmentModelUrl: '[ĐIỀN TẠI ĐÂY: Link URL file desert_ruins.glb]',
      towerModelUrl: '[ĐIỀN TẠI ĐÂY: Link URL file defense_turret.glb]',
      fogColor: '[ĐIỀN TẠI ĐÂY: Màu sương mù, ví dụ: "#3a2e2b"]',
    },
    towerRpg: {
      arenaModelUrl: '[ĐIỀN TẠI ĐÂY: Link URL file magic_arena.glb]',
      particleColor: '[ĐIỀN TẠI ĐÂY: Mã màu phép thuật, ví dụ: "#9d00ff"]',
    },
    cardBattler: {
      tableModelUrl: '[ĐIỀN TẠI ĐÂY: Link URL file cosmic_table.glb]',
      cardBackTextureUrl: '[ĐIỀN TẠI ĐÂY: Link URL mặt sau thẻ bài]',
      laserBeamShader: '[ĐIỀN TẠI ĐÂY: Tên Custom Shader Laze]',
    },
    labyrinth: {
      wallTextureUrl: '[ĐIỀN TẠI ĐÂY: Link URL texture tường đá]',
      chestGachaModelUrl: '[ĐIỀN TẠI ĐÂY: Link URL file gacha_chest.glb]',
      chestOpenAnimation: '[ĐIỀN TẠI ĐÂY: Tên animation mở rương]',
    },
  },
  graphicsSettings: {
    defaultCameraFov: null, // [ĐIỀN TẠI ĐÂY: ví dụ 50] — hiện RaceScene3D dùng 42, PortalIntro dùng 60
    bloomIntensity: null, // [ĐIỀN TẠI ĐÂY: ví dụ 0.5] — hiện chưa có hậu kỳ Bloom
    shadowMapSize: null, // [ĐIỀN TẠI ĐÂY: ví dụ 1024]
  },
};

/** Giá trị dùng khi ô số còn trống (an toàn cho máy yếu / điện thoại học sinh). */
export const THREE_DEFAULTS = {
  dracoCompression: false,
  bossScale: [1, 1, 1] as [number, number, number],
  defaultCameraFov: 50,
  bloomIntensity: 0,
  shadowMapSize: 1024,
};

/** true nếu ô này chưa được Founder điền. */
export function isUnfilled(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim().startsWith('[ĐIỀN TẠI ĐÂY'));
}

/** Trả về giá trị đã điền, hoặc `fallback` nếu ô còn trống — renderer dùng hàm này thay vì đọc trực tiếp. */
export function assetOr<T>(value: T | string | null, fallback: T): T {
  return isUnfilled(value) ? fallback : (value as T);
}

/** Danh sách đường dẫn các ô còn trống, ví dụ ["characters.heroModelUrl", "graphicsSettings.bloomIntensity"]. */
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
