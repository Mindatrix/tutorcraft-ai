import type { PhoneticStoneTarget, SpeechAttemptResponse } from './phoneticStonesMock';
import type { SpeechMode } from '../engine/pronunciation';

export type PhoneticWorldId = 'summer_camp' | 'river_fishing';

export type CampStationId =
  | 'camp_tent_station'
  | 'camp_kitchen_station'
  | 'camp_water_station'
  | 'camp_firewood_station';

export interface CampStationTask {
  stationId: CampStationId;
  stationNameVi: string;
  roleVi: string;
  targetId: string;
  word: string;
  ipa?: string;
  /** 3D offset relative to the stage focal point [dx, dy, dz]. */
  offset: [number, number, number];
  completed: boolean;
  stars: 0 | 1 | 2 | 3;
  bestScore: number;
  lastMode?: SpeechMode;
}

export interface CampQuestBoardState {
  tasks: CampStationTask[];
  tentStars: number;
  maxStars: number;
  completedCount: number;
  totalCount: number;
  progressPct: number;
  flagUnlocked: boolean;
}

export const SUMMER_CAMP_TARGETS: PhoneticStoneTarget[] = [
  {
    targetId: 'camp_tent_w1',
    text: 'tent',
    kind: 'word',
    ipa: '/tent/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'camp_tent_station',
    viMeaning: 'lều trại (Trạm Lều)',
    mouthTipVi: 'Bật rõ âm /t/ ở cả đầu và cuối từ: /t/ - /e/ - /n/ - /t/.',
  },
  {
    targetId: 'camp_kitchen_w1',
    text: 'bread',
    kind: 'word',
    ipa: '/bred/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'camp_kitchen_station',
    viMeaning: 'bánh mì nướng (Trạm Bếp)',
    mouthTipVi: 'Mím hai môi bật âm /b/ nối nhanh sang /r/, kết thúc gọn bằng âm /d/.',
  },
  {
    targetId: 'camp_water_w1',
    text: 'lantern',
    kind: 'word',
    ipa: '/ˈlæntərn/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'camp_water_station',
    viMeaning: 'đèn lồng (Trạm Nước & Kho)',
    mouthTipVi: 'Nhấn âm đầu /ˈlæn/, cong nhẹ đầu lưỡi ở âm /tərn/.',
  },
  {
    targetId: 'camp_firewood_w1',
    text: 'campfire',
    kind: 'word',
    ipa: '/ˈkæmpfaɪər/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'camp_firewood_station',
    viMeaning: 'lửa trại (Trạm Củi & Bảng Nhiệm Vụ)',
    mouthTipVi: 'Mở rộng miệng ở âm /æ/ (camp), răng trên chạm môi dưới ở âm /f/ (fire).',
  },
  {
    targetId: 'camp_firewood_s1',
    text: 'We sleep in a tent at the summer camp',
    kind: 'sentence',
    ipa: '/wiː sliːp ɪn ə tent æt ðə ˈsʌmər kæmp/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'camp_firewood_station',
    viMeaning: 'Chúng em ngủ trong lều ở trại hè (Câu chốt Bảng Nhiệm Vụ)',
    mouthTipVi: 'Nhấn giọng đều ở "sleep", "tent", "summer camp" và nối nhẹ "in a".',
  },
];

export const CAMP_STATION_LAYOUT: Array<{
  stationId: CampStationId;
  stationNameVi: string;
  roleVi: string;
  targetId: string;
  offset: [number, number, number];
}> = [
  {
    stationId: 'camp_tent_station',
    stationNameVi: 'Trạm Lều',
    roleVi: 'Thợ dựng lều',
    targetId: 'camp_tent_w1',
    offset: [-4.2, 0, -2.4],
  },
  {
    stationId: 'camp_kitchen_station',
    stationNameVi: 'Trạm Bếp & Nướng',
    roleVi: 'Đầu bếp',
    targetId: 'camp_kitchen_w1',
    offset: [4.2, 0, -2.2],
  },
  {
    stationId: 'camp_water_station',
    stationNameVi: 'Trạm Nước & Kho',
    roleVi: 'Thủ kho',
    targetId: 'camp_water_w1',
    offset: [-2.8, 0, 2.2],
  },
  {
    stationId: 'camp_firewood_station',
    stationNameVi: 'Trạm Lửa & Bảng Nhiệm Vụ',
    roleVi: 'Đội trưởng Lều · Giữ lửa',
    targetId: 'camp_firewood_w1',
    offset: [2.8, 0, 2.0],
  },
];

export function createInitialCampQuestBoard(
  targets: PhoneticStoneTarget[] = SUMMER_CAMP_TARGETS,
): CampQuestBoardState {
  const tasks: CampStationTask[] = CAMP_STATION_LAYOUT.map((st) => {
    const t = targets.find((x) => x.targetId === st.targetId) ?? targets[0];
    return {
      stationId: st.stationId,
      stationNameVi: st.stationNameVi,
      roleVi: st.roleVi,
      targetId: t?.targetId ?? st.targetId,
      word: t?.text ?? st.targetId,
      ipa: t?.ipa,
      offset: st.offset,
      completed: false,
      stars: 0,
      bestScore: 0,
    };
  });
  return {
    tasks,
    tentStars: 0,
    maxStars: tasks.length * 3,
    completedCount: 0,
    totalCount: tasks.length,
    progressPct: 0,
    flagUnlocked: false,
  };
}

/**
 * Updates the Summer Camp Quest Board when a student completes a Phonetic Stone
 * (via spoken shadow, typed dictation, or non-blocking listen-and-repeat fallback).
 */
export function applyCampStoneResult(
  board: CampQuestBoardState,
  response: SpeechAttemptResponse,
  mode?: SpeechMode,
  stationIdOverride?: string,
): CampQuestBoardState {
  if (!response.accepted) return board;
  const succeeded = response.passed || response.stars >= 1;
  if (!succeeded) return board;

  const earnedStars = Math.max(1, response.stars) as 1 | 2 | 3;

  const tasks = board.tasks.map((task) => {
    const matchesTarget =
      task.targetId === response.targetId ||
      (stationIdOverride && task.stationId === stationIdOverride);
    if (!matchesTarget) return task;
    const nextStars = Math.max(task.stars, earnedStars) as 0 | 1 | 2 | 3;
    return {
      ...task,
      completed: true,
      stars: nextStars,
      bestScore: Math.max(task.bestScore, response.bestScore, response.score),
      lastMode: mode ?? task.lastMode,
    };
  });

  const tentStars = tasks.reduce((sum, t) => sum + t.stars, 0);
  const completedCount = tasks.filter((t) => t.completed).length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    tasks,
    tentStars,
    maxStars: totalCount * 3,
    completedCount,
    totalCount,
    progressPct,
    flagUnlocked: completedCount === totalCount && totalCount > 0,
  };
}

// ---------------------------------------------------------------------------
// River Fishing Challenge (`river_fishing`)
// ---------------------------------------------------------------------------

export type FishRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export const FISH_RARITY_FACTOR: Record<FishRarity, number> = {
  common: 1.0,
  uncommon: 1.5,
  rare: 2.5,
  legendary: 5.0,
};

export const FISH_RARITY_LABEL_VI: Record<FishRarity, string> = {
  common: 'Thường (×1)',
  uncommon: 'Khá (×1.5)',
  rare: 'Hiếm (×2.5)',
  legendary: 'Cực hiếm (×5)',
};

export type FishingWeightMultiplier = 1.0 | 1.1 | 1.2;

/**
 * Exact multiplier rule from TECHNICAL_BLUEPRINT.md §3.5:
 * - Pass (1 ★, or repeat participation fallback): ×1.0
 * - 2 ★: ×1.1
 * - 3 ★: ×1.2
 */
export function fishingWeightMultiplier(stars: 0 | 1 | 2 | 3, passedOrCompleted = true): FishingWeightMultiplier {
  if (!passedOrCompleted || stars <= 0) return 1.0;
  if (stars >= 3) return 1.2;
  if (stars === 2) return 1.1;
  return 1.0;
}

export interface DockFishSpec {
  targetId: string;
  fishNameEn: string;
  fishNameVi: string;
  ipa: string;
  rarity: FishRarity;
  baseWeightKg: number;
  /** 3D position on the wooden fishing dock before the casting point. */
  dockOffset: [number, number, number];
}

export const FISHING_DOCK_SPECS: DockFishSpec[] = [
  {
    targetId: 'fish_salmon_w1',
    fishNameEn: 'salmon',
    fishNameVi: 'Cá hồi sông',
    ipa: '/ˈsæmən/',
    rarity: 'uncommon',
    baseWeightKg: 3.2,
    dockOffset: [-1.35, 0.35, 1.8],
  },
  {
    targetId: 'fish_catfish_w1',
    fishNameEn: 'catfish',
    fishNameVi: 'Cá trê bến gỗ',
    ipa: '/ˈkætfɪʃ/',
    rarity: 'common',
    baseWeightKg: 2.4,
    dockOffset: [1.35, 0.35, 1.8],
  },
  {
    targetId: 'fish_trout_w1',
    fishNameEn: 'trout',
    fishNameVi: 'Cá hồi suối',
    ipa: '/traʊt/',
    rarity: 'rare',
    baseWeightKg: 2.8,
    dockOffset: [-1.35, 0.35, -0.8],
  },
  {
    targetId: 'fish_carp_w1',
    fishNameEn: 'golden carp',
    fishNameVi: 'Cá chép vàng',
    ipa: '/ˈɡəʊldən kɑːp/',
    rarity: 'legendary',
    baseWeightKg: 4.5,
    dockOffset: [1.35, 0.35, -0.8],
  },
];

export const RIVER_FISHING_TARGETS: PhoneticStoneTarget[] = FISHING_DOCK_SPECS.map((spec) => ({
  targetId: spec.targetId,
  text: spec.fishNameEn,
  kind: spec.fishNameEn.includes(' ') ? 'sentence' : 'word',
  ipa: spec.ipa,
  modes: ['shadow', 'dictate', 'repeat'],
  ttsRate: 0.85,
  listenMs: 8000,
  attemptsLeft: 3,
  stationId: 'fishing_dock',
  viMeaning: `${spec.fishNameVi} · ${FISH_RARITY_LABEL_VI[spec.rarity]} · chuẩn ${spec.baseWeightKg} kg`,
  mouthTipVi:
    spec.fishNameEn === 'salmon'
      ? 'Chữ "l" trong "salmon" là âm câm — đọc liền /ˈsæm-ən/ trước khi quăng cần!'
      : `Đọc rõ tên cá "${spec.fishNameEn}" (${spec.ipa}) trên Đá Bến Gỗ để tăng hệ số cân nặng (tới ×1.2)!`,
}));

export interface FishCatchRecord {
  targetId: string;
  fishNameEn: string;
  fishNameVi: string;
  rarity: FishRarity;
  baseWeightKg: number;
  multiplier: FishingWeightMultiplier;
  finalWeightKg: number;
  stars: 1 | 2 | 3;
  points: number;
}

export type RodTier = 'wood' | 'fiberglass' | 'carbon' | 'gold';

export interface FishingDockState {
  activeTargetId: string | null;
  readyToCast: boolean;
  activeMultiplier: FishingWeightMultiplier;
  activeStars: 0 | 1 | 2 | 3;
  unlockedByTarget: Record<
    string,
    { ready: boolean; stars: 1 | 2 | 3; multiplier: FishingWeightMultiplier; bestScore: number }
  >;
  catches: FishCatchRecord[];
  totalPoints: number;
  rodTier: RodTier;
}

export function createInitialFishingDockState(): FishingDockState {
  return {
    activeTargetId: FISHING_DOCK_SPECS[0].targetId,
    readyToCast: false,
    activeMultiplier: 1.0,
    activeStars: 0,
    unlockedByTarget: {},
    catches: [],
    totalPoints: 0,
    rodTier: 'wood',
  };
}

export function rodTierForCatches(catchCount: number): RodTier {
  if (catchCount >= 4) return 'gold';
  if (catchCount >= 3) return 'carbon';
  if (catchCount >= 1) return 'fiberglass';
  return 'wood';
}

/**
 * Updates the fishing dock state when a dock Phonetic Stone is completed.
 * Passing (via shadow, dictate, or repeat fallback) unlocks casting with the corresponding weight multiplier.
 */
export function applyFishingDockStoneResult(
  dock: FishingDockState,
  response: SpeechAttemptResponse,
): FishingDockState {
  if (!response.accepted) return dock;
  const succeeded = response.passed || response.stars >= 1;
  if (!succeeded) return dock;

  const stars = Math.max(1, response.stars) as 1 | 2 | 3;
  const prev = dock.unlockedByTarget[response.targetId];
  const bestStars = prev ? (Math.max(prev.stars, stars) as 1 | 2 | 3) : stars;
  const bestMultiplier = fishingWeightMultiplier(bestStars, true);

  return {
    ...dock,
    activeTargetId: response.targetId,
    readyToCast: true,
    activeStars: bestStars,
    activeMultiplier: bestMultiplier,
    unlockedByTarget: {
      ...dock.unlockedByTarget,
      [response.targetId]: {
        ready: true,
        stars: bestStars,
        multiplier: bestMultiplier,
        bestScore: Math.max(prev?.bestScore ?? 0, response.bestScore, response.score),
      },
    },
  };
}

/**
 * Casts the fishing rod for a target fish whose dock stone has been completed.
 * Computes `weight(kg) × multiplier × 100 × rarityFactor` (content/game_worlds_v2.json).
 */
export function castFishingRodWithMultiplier(
  dock: FishingDockState,
  targetId?: string,
): { nextDock: FishingDockState; catchRecord: FishCatchRecord | null } {
  const id = targetId ?? dock.activeTargetId ?? FISHING_DOCK_SPECS[0].targetId;
  const unlock = dock.unlockedByTarget[id];
  if (!unlock || !unlock.ready) {
    return { nextDock: dock, catchRecord: null };
  }
  const spec = FISHING_DOCK_SPECS.find((s) => s.targetId === id) ?? FISHING_DOCK_SPECS[0];
  const finalWeightKg = Math.round(spec.baseWeightKg * unlock.multiplier * 100) / 100;
  const rarityFactor = FISH_RARITY_FACTOR[spec.rarity];
  const points = Math.round(finalWeightKg * 100 * rarityFactor);

  const catchRecord: FishCatchRecord = {
    targetId: spec.targetId,
    fishNameEn: spec.fishNameEn,
    fishNameVi: spec.fishNameVi,
    rarity: spec.rarity,
    baseWeightKg: spec.baseWeightKg,
    multiplier: unlock.multiplier,
    finalWeightKg,
    stars: unlock.stars,
    points,
  };

  const catches = [catchRecord, ...dock.catches];
  const totalPoints = catches.reduce((sum, c) => sum + c.points, 0);

  return {
    nextDock: {
      ...dock,
      activeTargetId: id,
      catches,
      totalPoints,
      rodTier: rodTierForCatches(catches.length),
    },
    catchRecord,
  };
}
