import { GameMode, type BattleConfig, type MapSetting, type ScenarioId } from './types';

// The 5 official game worlds (plan 2026-10). A world is a VISUAL skin only: answers,
// AI rubric grading, Boss HP and anti-cheat stay 100% on the server, so the same
// battle state drives every world. Renderer ladder: Unity WebGL (Kayak only) →
// Three.js → 2D canvas (weak device or no WebGL).

export type GameModeStatus = 'upgraded' | 'replaced';

export interface GameModeDefinition {
  id: GameMode;
  /** Enum key, e.g. "KAYAK_RUSH_3D". */
  key: keyof typeof GameMode;
  name: string;
  nameVi: string;
  genre: string;
  blurb: string;
  icon: string;
  /** Kept from an old mode (upgraded) or a brand-new mode (replaced). */
  status: GameModeStatus;
  /** The old mode it upgrades or replaces. */
  replaces: string;
  /** Scenarios that can run in this world. */
  scenarios: ScenarioId[];
  camera: 'chase' | 'third_person' | 'table' | 'side_2_5d' | 'isometric';
  /** Map the 2D canvas fallback draws for this world. */
  fallbackMap: MapSetting;
  /** HUD labels (Vietnamese). */
  hud: { boss: string; hero: string };
  /** One line for the AI prompt so boss names / dialogue fit the world. */
  promptHint: string;
}

const BOSS_SCENARIOS: ScenarioId[] = ['homework', 'in_class', 'coop_raid'];

export const GAME_MODES: Record<GameMode, GameModeDefinition> = {
  [GameMode.KAYAK_RUSH_3D]: {
    id: GameMode.KAYAK_RUSH_3D,
    key: 'KAYAK_RUSH_3D',
    name: 'Kayak Rush 3D',
    nameVi: 'Đua thuyền Kayak',
    genre: 'Đua thuyền Low-Poly 1v1 & Đội',
    blurb: 'Sông xanh ngọc, mũ ngộ nghĩnh, gỗ xoay và quái cây. Trả lời đúng để tăng tốc Nitro.',
    icon: '🛶',
    status: 'upgraded',
    replaces: 'Boat Race',
    scenarios: ['boat_race'],
    camera: 'chase',
    fallbackMap: 'sky_arena',
    hud: { boss: 'Đối thủ', hero: 'Thuyền của bạn' },
    promptHint: 'a friendly kayak race down a turquoise river',
  },
  [GameMode.MULTIVERSE_PORTAL_RPG]: {
    id: GameMode.MULTIVERSE_PORTAL_RPG,
    key: 'MULTIVERSE_PORTAL_RPG',
    name: 'Multiverse Portal RPG',
    nameVi: 'Phiêu lưu cổng không gian',
    genre: 'Action RPG 3D & cổng dịch chuyển',
    blurb: 'Nữ chiến binh Scarlet chém Boss. Mỗi lần Boss yếu đi, một vết nứt không gian mở sang thế giới mới.',
    icon: '🌀',
    status: 'replaced',
    replaces: 'Magic Tower RPG',
    scenarios: BOSS_SCENARIOS,
    camera: 'third_person',
    fallbackMap: 'castle',
    hud: { boss: 'Boss', hero: 'Scarlet' },
    promptHint: 'a dark-fantasy boss that flees through spatial portals: foggy castle → neon cyberpunk city → desert ruins',
  },
  [GameMode.COSMIC_CARD_BATTLER]: {
    id: GameMode.COSMIC_CARD_BATTLER,
    key: 'COSMIC_CARD_BATTLER',
    name: 'Cosmic Card Battler',
    nameVi: 'Thẻ bài vũ trụ',
    genre: 'Thẻ bài 3D & tia laser',
    blurb: 'Bàn đấu ngân hà, Hub trung tâm. Kéo thẻ đáp án vào Hub để bắn tia laser vào Boss.',
    icon: '🃏',
    status: 'upgraded',
    replaces: 'Eye of Truth Card',
    scenarios: BOSS_SCENARIOS,
    camera: 'table',
    fallbackMap: 'sky_arena',
    hud: { boss: 'Lõi Boss', hero: 'Năng lượng' },
    promptHint: 'a cosmic crystal entity guarding a galaxy card table; students attack it with magic cards',
  },
  [GameMode.DINO_ISLAND_RUN_2D]: {
    id: GameMode.DINO_ISLAND_RUN_2D,
    key: 'DINO_ISLAND_RUN_2D',
    name: 'Dino Island Run 2.5D',
    nameVi: 'Khủng long phiêu lưu',
    genre: 'Platformer 2.5D giải cứu bạn bè',
    blurb: 'Chú khủng long xanh nhảy qua bẫy đá, ném xương. Mỗi câu đúng phá một lồng sắt cứu bạn.',
    icon: '🦖',
    status: 'replaced',
    replaces: 'Wasteland Survival',
    scenarios: BOSS_SCENARIOS,
    camera: 'side_2_5d',
    fallbackMap: 'volcano',
    hud: { boss: 'Vua T-Rex', hero: 'Dino' },
    promptHint: 'a tyrant T-Rex king on a volcano island who locked baby dinosaurs in iron cages; each correct answer frees one (cute, age-appropriate)',
  },
  [GameMode.AI_AGENT_WORLD_3D]: {
    id: GameMode.AI_AGENT_WORLD_3D,
    key: 'AI_AGENT_WORLD_3D',
    name: 'AI Agent World 3D',
    nameVi: 'Thế giới AI Agent',
    genre: 'Đảo học tập ảo Isometric',
    blurb: 'Văn phòng học tập nhìn nghiêng 45°. Đi tới Orion, Kai, Quinn để nhận và làm BTVN.',
    icon: '🤖',
    status: 'replaced',
    replaces: 'Dungeon Labyrinth',
    scenarios: BOSS_SCENARIOS,
    camera: 'isometric',
    fallbackMap: 'sky_arena',
    hud: { boss: 'BTVN còn lại', hero: 'Năng lượng' },
    promptHint: 'a playful "Homework Glitch" bug-monster hiding in a virtual learning office run by AI agents Orion, Kai and Quinn (friendly, never scary)',
  },
};

export const GAME_MODE_IDS = Object.values(GameMode) as GameMode[];

/** Studio default for boss battles. Battles saved before game worlds keep the classic 2D canvas. */
export const DEFAULT_BOSS_MODE: GameMode = GameMode.MULTIVERSE_PORTAL_RPG;

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && value in GAME_MODES;
}

export function modesForScenario(scenario: ScenarioId): GameMode[] {
  return GAME_MODE_IDS.filter((m) => GAME_MODES[m].scenarios.includes(scenario));
}

/** Boat Race always plays as Kayak Rush; other scenarios accept any compatible world, else none (classic 2D). */
export function normalizeGameMode(raw: unknown, scenario: ScenarioId): GameMode | undefined {
  if (scenario === 'boat_race') return GameMode.KAYAK_RUSH_3D;
  return isGameMode(raw) && GAME_MODES[raw].scenarios.includes(scenario) ? raw : undefined;
}

export function resolveGameMode(config: Pick<BattleConfig, 'scenario' | 'gameMode'>): GameMode | null {
  return normalizeGameMode(config.gameMode, config.scenario) ?? null;
}
