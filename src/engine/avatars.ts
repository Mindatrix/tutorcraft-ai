// Student avatars and story characters (plan C2). Pure data and rules, shared by the server
// (which checks a student's look is free in the match) and the browser (picker, 3D scene).
//
//  - A student picks a template (a journey character, or a baby dinosaur in Dino Journey) and one
//    of 12 colours; template + colour is unique in a match (DB index), so 50 students always look
//    different. Colour is applied by material (src/components/modes/three/avatar.ts).
//  - The 12 story characters of every scenario get a library model: the one written in their
//    clothing_text ("[asset_id] …", content side), else one chosen by age group and gender,
//    tinted with their outfit colour so two characters on the same model still look different.

import { GameMode } from './types';
import { hashString } from './variants';

export interface AvatarColor {
  id: string;
  hex: string;
  nameVi: string;
}

/** 12 colours that stay distinct on phones, for colour-blind students too (paired with names). */
export const AVATAR_COLORS: AvatarColor[] = [
  { id: 'red', hex: '#e53935', nameVi: 'Đỏ' },
  { id: 'orange', hex: '#fb8c00', nameVi: 'Cam' },
  { id: 'yellow', hex: '#fdd835', nameVi: 'Vàng' },
  { id: 'lime', hex: '#7cb342', nameVi: 'Xanh cốm' },
  { id: 'green', hex: '#2e7d32', nameVi: 'Xanh lá' },
  { id: 'teal', hex: '#00897b', nameVi: 'Xanh ngọc' },
  { id: 'sky', hex: '#29b6f6', nameVi: 'Xanh trời' },
  { id: 'blue', hex: '#1e5bd8', nameVi: 'Xanh dương' },
  { id: 'purple', hex: '#7e57c2', nameVi: 'Tím' },
  { id: 'pink', hex: '#ec407a', nameVi: 'Hồng' },
  { id: 'brown', hex: '#8d6e63', nameVi: 'Nâu' },
  { id: 'white', hex: '#eceff1', nameVi: 'Trắng' },
];
const COLOR_BY_HEX = new Map(AVATAR_COLORS.map((c) => [c.hex, c]));

export function avatarColor(hex: unknown): AvatarColor | null {
  return typeof hex === 'string' ? COLOR_BY_HEX.get(hex.toLowerCase()) ?? null : null;
}

export interface AvatarTemplate {
  /** Stored in match_players.species. */
  id: string;
  nameVi: string;
  /** Library model id (content/asset_catalog.json). */
  model: string;
  kind: 'human' | 'dino';
}

/** Dino Journey herd (game_worlds.class_plan.species): same species allowed, never same species + colour. */
export const DINO_TEMPLATES: AvatarTemplate[] = [
  { id: 'trex', nameVi: 'T-rex', model: 'dino_trex_brown', kind: 'dino' },
  { id: 'raptor', nameVi: 'Raptor', model: 'dino_raptor_rider', kind: 'dino' },
  { id: 'triceratops', nameVi: 'Triceratops', model: 'dino_triceratops', kind: 'dino' },
  { id: 'stegosaurus', nameVi: 'Stegosaurus', model: 'dino_stegosaurus', kind: 'dino' },
  { id: 'diplodocus', nameVi: 'Diplodocus', model: 'dino_diplodocus', kind: 'dino' },
  { id: 'sauropod', nameVi: 'Sauropod', model: 'dino_sauropod_grey', kind: 'dino' },
];

/** Journey characters for the river worlds and Multiverse: child-sized, five of six rigged. */
export const HUMAN_TEMPLATES: AvatarTemplate[] = [
  { id: 'sunny', nameVi: 'Cậu bé nắng', model: 'char_sunny_boy', kind: 'human' },
  { id: 'orange_tee', nameVi: 'Cậu bé áo cam', model: 'char_tpose_boy', kind: 'human' },
  { id: 'gamer', nameVi: 'Game thủ nhí', model: 'char_gamer_boy', kind: 'human' },
  { id: 'leaf_hood', nameVi: 'Bé mũ lá', model: 'char_grass_kid', kind: 'human' },
  { id: 'dancer', nameVi: 'Cô bé vũ công', model: 'char_kid_dancer', kind: 'human' },
  { id: 'hiker', nameVi: 'Cô bé leo núi', model: 'char_hiker_girl', kind: 'human' },
];

export function avatarTemplates(game: GameMode | string | null | undefined): AvatarTemplate[] {
  return game === GameMode.DINO_JOURNEY ? DINO_TEMPLATES : HUMAN_TEMPLATES;
}

export function avatarTemplate(game: GameMode | string | null | undefined, id: unknown): AvatarTemplate | null {
  return avatarTemplates(game).find((t) => t.id === id) ?? null;
}

export interface Look {
  template: string;
  color: string;
}

export const lookKey = (l: Look) => `${l.template}|${l.color}`;

/**
 * A free look close to what the student wanted: the same template in another colour (from the
 * wanted colour onwards, so suggestions spread over the palette), else the next template.
 * null only when the whole palette of every template is taken.
 */
export function suggestLook(game: GameMode | string | null | undefined, wanted: Partial<Look>, taken: Iterable<Look>): Look | null {
  const used = new Set([...taken].map(lookKey));
  const templates = avatarTemplates(game);
  const ti = Math.max(0, templates.findIndex((t) => t.id === wanted.template));
  const ci = Math.max(0, AVATAR_COLORS.findIndex((c) => c.hex === wanted.color));
  for (let dt = 0; dt < templates.length; dt++) {
    const template = templates[(ti + dt) % templates.length].id;
    for (let dc = 0; dc < AVATAR_COLORS.length; dc++) {
      const color = AVATAR_COLORS[(ci + dc) % AVATAR_COLORS.length].hex;
      if (!used.has(lookKey({ template, color }))) return { template, color };
    }
  }
  return null;
}

/** Room for this many students with all-different looks. */
export const lookCapacity = (game: GameMode | string | null | undefined) => avatarTemplates(game).length * AVATAR_COLORS.length;

// -------------------------------------------------------------------------------------------------
// Story characters → library models (C2.5)

export interface StoryCharacter {
  scenario_id: string;
  slot: number;
  age_group?: string | null;
  gender?: string | null;
  clothing_text?: string | null;
  outfit_color?: string | null;
}

/** Human models of the library by age group and gender (looked at 27/10; m / f / n = either). */
const HUMAN_POOLS: Record<string, Record<'m' | 'f', string[]>> = {
  child: { m: ['char_sunny_boy', 'char_tpose_boy', 'char_boy_1', 'char_grass_kid'], f: ['char_kid_dancer', 'char_hiker_girl'] },
  teen: { m: ['char_gamer_boy', 'char_nomad_boy', 'char_skater_boy', 'char_iridescent_voyager'], f: ['char_hiker_girl', 'char_kid_dancer'] },
  adult: { m: ['char_iridescent_voyager', 'char_wanderer', 'char_nomad_boy'], f: ['char_generic_female_2', 'char_female_a', 'char_female_b'] },
  elder: { m: ['char_wanderer'], f: ['char_female_b'] },
};
/** Multiverse also has fantasy characters. */
const FANTASY: Record<'m' | 'f', string[]> = { m: [], f: ['char_grovaen_female', 'char_crimson_kick'] };

/** "[asset_id] …" at the start of clothing_text (written by the content side). */
export function taggedModel(clothingText: unknown): string | null {
  const m = typeof clothingText === 'string' ? /^\[(\w+)\]/.exec(clothingText.trim()) : null;
  return m ? m[1] : null;
}

export interface CastModel {
  model: string;
  /** Outfit colour for the material tint (hex), when the character has one. */
  tint: string | null;
  source: 'tag' | 'pool';
}

const OUTFIT_HEX: Record<string, string> = {
  red: '#e53935', orange: '#fb8c00', yellow: '#fdd835', green: '#2e7d32', blue: '#1e5bd8', purple: '#7e57c2', pink: '#ec407a',
  brown: '#8d6e63', white: '#eceff1', black: '#37474f', grey: '#90a4ae', gray: '#90a4ae', teal: '#00897b', navy: '#283593', beige: '#d7ccc8',
  khaki: '#c3b091', olive: '#808000', silver: '#b0bec5', maroon: '#880e4f',
};

/** Grown-ups and teens may borrow a model from the next age group before a model is repeated. */
const NEIGHBOUR_AGES: Record<string, string[]> = { child: [], teen: ['adult'], adult: ['elder', 'teen'], elder: ['adult'] };

/**
 * Model for one story character: the tagged one, else a model from the age/gender pool picked
 * by a hash of scenario + slot, avoiding models already used in the same scenario. The most
 * constrained characters choose first (an elder has 1 model, a girl 2, a boy 4), then a grown-up
 * or teen with an exhausted pool borrows from the neighbouring age group, and only then is a
 * model repeated: the least used one of the pool. Pass the whole cast of a scenario through it.
 */
export function castModels(game: GameMode | string, cast: StoryCharacter[]): Map<number, CastModel> {
  const out = new Map<number, CastModel>();
  const uses = new Map<string, number>();
  const markUsed = (m: string) => uses.set(m, (uses.get(m) ?? 0) + 1);
  const bySlot = [...cast].sort((a, b) => a.slot - b.slot);
  const genders = (c: StoryCharacter): ('m' | 'f')[] => (c.gender === 'm' || c.gender === 'f' ? [c.gender] : ['m', 'f']);
  const ageOf = (c: StoryCharacter) => (HUMAN_POOLS[String(c.age_group)] ? String(c.age_group) : 'child');
  const poolOf = (c: StoryCharacter, age = ageOf(c)) => {
    let pool = genders(c).flatMap((x) => HUMAN_POOLS[age][x]);
    if (game === GameMode.MULTIVERSE_PORTAL_RPG) pool = [...pool, ...genders(c).flatMap((x) => FANTASY[x])];
    return Array.from(new Set(pool));
  };
  const pooled: StoryCharacter[] = [];
  for (const c of bySlot) {
    const tint = OUTFIT_HEX[String(c.outfit_color ?? '').toLowerCase()] ?? null;
    const tag = taggedModel(c.clothing_text);
    if (tag) {
      out.set(c.slot, { model: tag, tint, source: 'tag' });
      markUsed(tag);
    } else pooled.push(c);
  }
  pooled.sort((a, b) => poolOf(a).length - poolOf(b).length || a.slot - b.slot);
  for (const c of pooled) {
    const tint = OUTFIT_HEX[String(c.outfit_color ?? '').toLowerCase()] ?? null;
    const pool = poolOf(c);
    const h = hashString(`${c.scenario_id}#${c.slot}`);
    let from = pool.filter((m) => !uses.get(m));
    if (!from.length) from = Array.from(new Set(NEIGHBOUR_AGES[ageOf(c)].flatMap((age) => poolOf(c, age)))).filter((m) => !uses.get(m));
    if (!from.length) {
      const least = Math.min(...pool.map((m) => uses.get(m) ?? 0));
      from = pool.filter((m) => (uses.get(m) ?? 0) === least);
    }
    const model = from[h % from.length];
    markUsed(model);
    out.set(c.slot, { model, tint, source: 'pool' });
  }
  return out;
}
