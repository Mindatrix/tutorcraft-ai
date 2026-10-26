import { GameMode, type BattleConfig, type MapSetting, type ScenarioId } from './types';

// The 6 official game worlds (plan 2026-10-26: river camping & survival theme + Dino Journey).
// A world is a VISUAL skin only: answers, AI rubric grading, Boss HP and anti-cheat
// stay 100% on the server, so the same battle state drives every world.
// Renderer ladder: Three.js → 2D canvas (weak device or no WebGL).

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
  /** In-game screenshot for Landing / Studio (public path), or null while the 3D world is being built. */
  preview: string | null;
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
    preview: '/modes/kayak_rush.webp',
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
    preview: '/modes/multiverse_portal.webp',
  },
  [GameMode.SUMMER_CAMP_QUESTS]: {
    id: GameMode.SUMMER_CAMP_QUESTS,
    key: 'SUMMER_CAMP_QUESTS',
    name: 'Summer Camp Quests',
    nameVi: 'Nhiệm vụ Trại Hè',
    genre: 'Nhiệm vụ dã ngoại 3D theo nhóm',
    blurb: 'Picnic bên sông: dựng lều, nhóm lửa, nướng xiên, lọc nước. Mỗi câu đúng mở khóa một công cụ dã ngoại.',
    icon: '⛺',
    status: 'replaced',
    replaces: 'Cosmic Card Battler',
    scenarios: BOSS_SCENARIOS,
    camera: 'third_person',
    fallbackMap: 'forest',
    hud: { boss: 'Nhiệm vụ trại', hero: 'Năng lượng' },
    promptHint:
      'a sunny riverside summer camp. The "boss" is the day\'s camp challenge list (e.g. "The Great Camp Checklist") voiced by a cheerful camp ranger; tasks are pitching the tent, lighting the campfire, grilling skewers, filtering water. Warm and encouraging, never scary',
    preview: null,
  },
  [GameMode.RIVER_FISHING]: {
    id: GameMode.RIVER_FISHING,
    key: 'RIVER_FISHING',
    name: 'River Fishing Challenge',
    nameVi: 'Câu Cá Trại Hè',
    genre: 'Câu cá 3D trên thuyền',
    blurb: 'Đứng trên thuyền nhỏ giữa sông xanh ngọc. Quăng cần, giữ thanh căng dây; trả lời đúng để nâng cần, đổi mồi và bắt cá hiếm.',
    icon: '🎣',
    status: 'replaced',
    replaces: 'Dino Island Run 2.5D',
    scenarios: BOSS_SCENARIOS,
    camera: 'third_person',
    fallbackMap: 'forest',
    hud: { boss: 'Cá khủng', hero: 'Độ bền dây' },
    promptHint:
      'a clear turquoise mountain river; students fish from a small aluminium boat. The "boss" is a legendary giant fish (e.g. "Old King Salmon") that only bites for anglers who answer well. Calm, nature-loving, fish are released unharmed',
    preview: null,
  },
  [GameMode.RIVER_SURVIVAL]: {
    id: GameMode.RIVER_SURVIVAL,
    key: 'RIVER_SURVIVAL',
    name: 'River Survival: Escape & Pursuit',
    nameVi: 'Sinh Tồn Sông Nước',
    genre: 'Sinh tồn 2 đội: Đào tẩu & Truy đuổi',
    blurb: 'Thoát khỏi trại, làm nhiệm vụ mật mã, lẩn trốn trong bụi cây. Cướp công cụ của đội Săn Tìm để đuổi ngược và giải cứu đồng đội. 30 phút liền mạch.',
    icon: '🧭',
    status: 'replaced',
    replaces: 'AI Agent World 3D',
    // Interim: plays as a team boss battle until the dedicated 2-team scenario ships (plan tasks 45–47).
    scenarios: ['coop_raid', 'in_class'],
    camera: 'third_person',
    fallbackMap: 'forest',
    hud: { boss: 'Đội Săn Tìm', hero: 'Sức bền' },
    promptHint:
      'a remote riverside forest at dusk. Young campers got stuck in a rival camp, cut their ropes on a sharp rock and escaped; the "boss" is the Pursuer squad tracking their footprints. Exciting hide-and-seek, kid-safe: nobody is hurt, caught players are simply "tagged" and can be rescued',
    preview: null,
  },
  [GameMode.DINO_JOURNEY]: {
    id: GameMode.DINO_JOURNEY,
    key: 'DINO_JOURNEY',
    name: 'Dino Journey',
    nameVi: 'Hành trình khủng long',
    genre: 'Phiêu lưu sinh tồn 3D theo bầy',
    blurb: 'Khủng long con chào đời giữa đồng cỏ, theo bố đi săn, tìm nước, qua đêm bão. Cuối hành trình, con đứng lên bảo vệ người cha già. Chơi một mình hoặc cả lớp là một bầy.',
    icon: '🦖',
    status: 'replaced',
    replaces: 'Dino Island Run 2.5D',
    scenarios: BOSS_SCENARIOS,
    camera: 'third_person',
    fallbackMap: 'forest',
    hud: { boss: 'Thử thách', hero: 'Sức khỏe của bầy' },
    promptHint:
      'a prehistoric grassland. A baby dinosaur hatches and follows his father across plains, plateau and lake: hunting lessons, finding water, a stormy night, and finally standing up for his elderly father against bullies. The "boss" is each chapter\'s challenge. Warm, brave, kid-safe: nobody is hurt, bullies are scared away, never gory',
    preview: null,
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
