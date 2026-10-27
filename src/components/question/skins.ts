import { GameMode, gameConsequences } from '../../engine';

// The six "coats" of the shared QuestionFrame (C4.1): only the material OUTSIDE the rainbow edge,
// the sounds, the in-scene timer object and the answer sign change per game. The rainbow band is
// the same everywhere (RainbowEdge).

export type TimerKind = 'torch' | 'wave' | 'ring';

export interface FrameSkin {
  game: GameMode;
  label: string;
  /** CSS background of the outer coat (rope, wood, stone…). */
  coat: string;
  /** Extra coat decorations: buoys on a rope, nails on wood, rivets on metal, scanlines… */
  studs: { color: string; ring?: string; size: number } | null;
  coatWidth: number;
  /** Text and button colours inside the frame. */
  accent: string;
  /** Sign that shows the right answer after a wrong one (in the scene, or in the frame on 2D). */
  sign: { bg: string; ink: string; border: string };
  timer: TimerKind;
  /** Sound when the frame opens (synthesised, see src/client/questionSfx.ts). */
  openSfx: string;
  companion: { name: string; role: string; emoji: string };
}

const comp = (g: GameMode, emoji: string) => {
  const c = gameConsequences(g)?.companion;
  return { name: c?.name ?? '', role: c?.role ?? '', emoji };
};

const WOOD = 'repeating-linear-gradient(90deg, #8a5a2b 0 7px, #7a4c22 7px 9px, #9b6a36 9px 17px, #6f431d 17px 19px)';

export const FRAME_SKINS: Record<GameMode, FrameSkin> = {
  [GameMode.KAYAK_RUSH_3D]: {
    game: GameMode.KAYAK_RUSH_3D,
    label: 'Dây thừng và phao',
    coat: 'repeating-linear-gradient(135deg, #d9b37a 0 5px, #b98c4f 5px 8px, #e6c590 8px 12px, #a47a40 12px 14px)',
    studs: { color: '#ef4444', ring: '#ffffff', size: 18 },
    coatWidth: 9,
    accent: '#7dd3fc',
    sign: { bg: '#f4d39b', ink: '#3b2410', border: '#8a5a2b' },
    timer: 'wave',
    openSfx: 'open_rope',
    companion: comp(GameMode.KAYAK_RUSH_3D, '📣'),
  },
  [GameMode.RIVER_FISHING]: {
    game: GameMode.RIVER_FISHING,
    label: 'Gỗ cầu tàu',
    coat: WOOD,
    studs: { color: '#c9b79c', size: 6 },
    coatWidth: 10,
    accent: '#fde68a',
    sign: { bg: '#d8a86a', ink: '#2b1a0b', border: '#6f431d' },
    timer: 'ring',
    openSfx: 'open_wood',
    companion: comp(GameMode.RIVER_FISHING, '🎣'),
  },
  [GameMode.SUMMER_CAMP_QUESTS]: {
    game: GameMode.SUMMER_CAMP_QUESTS,
    label: 'Biển gỗ trại hè',
    coat: 'repeating-linear-gradient(0deg, #c8955a 0 9px, #b4813f 9px 11px, #d4a467 11px 20px)',
    studs: { color: '#5b5b5b', size: 6 },
    coatWidth: 10,
    accent: '#fcd34d',
    sign: { bg: '#e8b877', ink: '#3b2410', border: '#8a5a2b' },
    timer: 'torch',
    openSfx: 'open_wood',
    companion: comp(GameMode.SUMMER_CAMP_QUESTS, '🏕️'),
  },
  [GameMode.RIVER_SURVIVAL]: {
    game: GameMode.RIVER_SURVIVAL,
    label: 'Kim loại',
    coat: 'linear-gradient(180deg, #9aa4ae 0%, #d6dde3 22%, #7d8792 48%, #c3cad1 72%, #6b7580 100%)',
    studs: { color: '#4b5563', ring: '#e5e7eb', size: 7 },
    coatWidth: 9,
    accent: '#fca5a5',
    sign: { bg: '#d1d5db', ink: '#111827', border: '#4b5563' },
    timer: 'wave',
    openSfx: 'open_metal',
    companion: comp(GameMode.RIVER_SURVIVAL, '📻'),
  },
  [GameMode.DINO_JOURNEY]: {
    game: GameMode.DINO_JOURNEY,
    label: 'Bia đá',
    coat: 'radial-gradient(circle at 20% 30%, #8d8a83 0 2px, transparent 3px) 0 0 / 14px 14px, radial-gradient(circle at 70% 60%, #6b6862 0 2px, transparent 3px) 0 0 / 18px 18px, linear-gradient(160deg, #a19d94, #7c786f 60%, #918d84)',
    studs: null,
    coatWidth: 11,
    accent: '#bef264',
    sign: { bg: '#b8b3a8', ink: '#1f1d1a', border: '#5d5a54' },
    timer: 'torch',
    openSfx: 'open_stone',
    companion: comp(GameMode.DINO_JOURNEY, '🦖'),
  },
  [GameMode.MULTIVERSE_PORTAL_RPG]: {
    game: GameMode.MULTIVERSE_PORTAL_RPG,
    label: 'Hologram',
    coat: 'repeating-linear-gradient(0deg, rgb(56 189 248 / 0.55) 0 2px, rgb(99 102 241 / 0.25) 2px 4px)',
    studs: { color: '#a5f3fc', size: 4 },
    coatWidth: 7,
    accent: '#a5f3fc',
    sign: { bg: 'rgb(14 165 233 / 0.25)', ink: '#e0f2fe', border: '#38bdf8' },
    timer: 'ring',
    openSfx: 'open_holo',
    companion: comp(GameMode.MULTIVERSE_PORTAL_RPG, '✨'),
  },
};

export function skinFor(game: GameMode | string | null | undefined): FrameSkin {
  return FRAME_SKINS[(game as GameMode) ?? GameMode.SUMMER_CAMP_QUESTS] ?? FRAME_SKINS[GameMode.SUMMER_CAMP_QUESTS];
}

export type AnswerLayout = 'column' | 'row' | 'pairs';

/**
 * C4.2 where the answers go: matching → two columns; short answers → a row (wraps to two on a
 * narrow phone); long ones → stacked. `width` = the frame's inner width in px.
 */
export function answerLayout(q: { type?: string; options?: string[] }, width: number): AnswerLayout {
  if (q.type === 'matching') return 'pairs';
  const opts = q.options ?? [];
  const longest = Math.max(0, ...opts.map((o) => o.length));
  // ~9 px per character at 16 px, plus padding; a row of 2 per line at least.
  const perRow = Math.max(2, Math.floor(width / Math.max(72, longest * 9 + 28)));
  return longest <= 14 && perRow >= Math.min(opts.length, 2) && opts.length <= 4 ? 'row' : 'column';
}
