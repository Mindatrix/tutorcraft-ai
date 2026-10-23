import type { ThemeDefinition, ThemeId } from './types';

// Plug-and-play theme registry. To add a genre, add one entry here —
// the tutor picker, prompt builder and battle feedback all read from it.
export const THEMES: Record<ThemeId, ThemeDefinition> = {
  minecraft: {
    id: 'minecraft',
    name: 'Minecraft Survival',
    genre: 'Survival Crafting',
    emoji: '⛏️',
    bossName: 'Ender Dragon of Grammar',
    accent: 'from-green-600 to-lime-500',
    correct: ['Rare Diamond mined!', 'Defense block built!', 'Obsidian wall crafted!'],
    wrong: ['Creeper explosion! -1 heart', 'Lava pit! Inventory lost', 'Zombie ambush!'],
    critical: ['Netherite tool forged — Critical Strike!'],
    lootName: 'Diamonds',
  },
  chess: {
    id: 'chess',
    name: 'Grandmaster Tactics',
    genre: 'Strategy Chess',
    emoji: '♟️',
    bossName: 'The Black King',
    accent: 'from-slate-500 to-zinc-300',
    correct: ['Enemy piece captured!', 'Center board controlled!', 'Fork executed!'],
    wrong: ['Blunder! Piece hanging', 'Tactical position lost', 'Pinned!'],
    critical: ['Brilliant move!! Checkmate threat!'],
    lootName: 'Elo',
  },
  genshin: {
    id: 'genshin',
    name: 'Elemental Reaction',
    genre: 'Elemental RPG',
    emoji: '🔥',
    bossName: 'Abyss Herald of Syntax',
    accent: 'from-orange-500 to-sky-400',
    correct: ['Vaporize triggered!', 'Melt reaction — bonus damage!', 'Elemental Burst!'],
    wrong: ['Elemental Drain!', 'Skill on cooldown!', 'Shield broken!'],
    critical: ['Vaporize x2 Multiplier — Critical Strike!'],
    lootName: 'Primogems',
  },
  moba_lol: {
    id: 'moba_lol',
    name: 'Arena Teamfight',
    genre: 'MOBA',
    emoji: '⚔️',
    bossName: 'Baron Nashor of Tenses',
    accent: 'from-violet-600 to-fuchsia-500',
    correct: ['Last-hit Minion!', 'Tower Breached!', 'Baron Secured!'],
    wrong: ['Out of Position!', 'Enemy Double Kill!', 'Ganked in lane!'],
    critical: ['PENTAKILL! Critical Strike!'],
    lootName: 'Gold',
  },
  nintendo_ps5: {
    id: 'nintendo_ps5',
    name: 'Platformer Coin Rush',
    genre: 'Platformer',
    emoji: '⭐',
    bossName: 'King Koopa of Vocabulary',
    accent: 'from-red-500 to-yellow-400',
    correct: ['Star collected!', 'Obstacle cleared!', 'Secret Passageway unlocked!'],
    wrong: ['Fell into a pit!', 'Power-up lost!', 'Bonked by a Goomba!'],
    critical: ['1-UP! Super Star Critical Strike!'],
    lootName: 'Coins',
  },
  tower_defense: {
    id: 'tower_defense',
    name: 'Castle Siege',
    genre: 'Tower Defense',
    emoji: '🏰',
    bossName: 'Siege Golem',
    accent: 'from-amber-600 to-stone-400',
    correct: ['Turret upgraded!', 'Castle wall fortified!', 'Wave repelled!'],
    wrong: ['Wave breach!', 'Gate damaged!', 'Turret destroyed!'],
    critical: ['Mega Cannon online — Critical Strike!'],
    lootName: 'Stone',
  },
  card_tcg: {
    id: 'card_tcg',
    name: 'Spell Duel',
    genre: 'Card Game TCG',
    emoji: '🃏',
    bossName: 'The Lexicon Lich',
    accent: 'from-indigo-600 to-cyan-400',
    correct: ['Mana drawn!', 'Spell Combo cast!', 'Legendary Beast summoned!'],
    wrong: ['Card discarded!', 'Direct HP penalty!', 'Counter-spelled!'],
    critical: ['Mythic combo chain — Critical Strike!'],
    lootName: 'Mana Crystals',
  },
  arcade_racing: {
    id: 'arcade_racing',
    name: 'Nitro Grand Prix',
    genre: 'Arcade Racing',
    emoji: '🏎️',
    bossName: 'Rival Champion',
    accent: 'from-rose-600 to-orange-400',
    correct: ['Nitro Boost!', 'Drift Combo!', 'Rival passed!'],
    wrong: ['Engine crash!', 'Spin out!', 'Hit the wall!'],
    critical: ['Perfect Slipstream — Critical Strike!'],
    lootName: 'Trophies',
  },
  sports_blitz: {
    id: 'sports_blitz',
    name: 'Sports Blitz',
    genre: 'Sports Simulation',
    emoji: '⚽',
    bossName: 'All-Star Goalkeeper',
    accent: 'from-emerald-600 to-teal-400',
    correct: ['Perfect Pass!', 'Slam Dunk!', 'GOAL!'],
    wrong: ['Turnover!', 'Yellow card penalty!', 'Offside!'],
    critical: ['Hat-trick — Critical Strike!'],
    lootName: 'Points',
  },
  trivia_arena: {
    id: 'trivia_arena',
    name: 'Trivia Arena',
    genre: 'Trivia Arena',
    emoji: '🧠',
    bossName: 'Quizmaster Prime',
    accent: 'from-blue-600 to-purple-500',
    correct: ['Correct! Points locked in!', 'Brain Blast!', 'Streak extended!'],
    wrong: ['Buzzer miss!', 'Points lost!', 'Wrong lifeline!'],
    critical: ['Jackpot Round — Critical Strike!'],
    lootName: 'Stars',
  },
  rpg_classic: {
    id: 'rpg_classic',
    name: 'Dungeon Quest',
    genre: 'RPG',
    emoji: '🐉',
    bossName: 'Grammar Dragon',
    accent: 'from-red-600 to-rose-500',
    correct: ['Sword strike lands!', 'Fireball hits!', 'Loot Dropped!'],
    wrong: ['Boss counter-attack!', 'Trap triggered!', 'Potion shattered!'],
    critical: ['Legendary Blade — Critical Strike!'],
    lootName: 'Gems',
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && value in THEMES;
}

/** Map old theme ids saved before the theme library existed. */
const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  survival: 'minecraft',
  moba: 'moba_lol',
  sports: 'sports_blitz',
};

export function normalizeThemes(input: unknown): ThemeId[] {
  const raw = Array.isArray(input) ? input : [input];
  const ids = raw
    .map((t) => (typeof t === 'string' ? LEGACY_THEME_MAP[t] ?? t : t))
    .filter(isThemeId);
  return ids.length ? Array.from(new Set(ids)) : ['rpg_classic'];
}

/** Theme for a given question: blended battles rotate themes question by question. */
export function themeForQuestion(themes: ThemeId[], questionIndex: number): ThemeDefinition {
  const list = themes.length ? themes : (['rpg_classic'] as ThemeId[]);
  return THEMES[list[questionIndex % list.length]];
}

export function pick<T>(items: T[], seed: number): T {
  return items[Math.abs(seed) % items.length];
}
