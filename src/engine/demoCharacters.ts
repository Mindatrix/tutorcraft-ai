import casting from '../../content/character_casting.json';

// Characters on the demo entry screen (WP10 U6, 02/11/2026): every character in
// content/character_casting.json (the demo shows them all; filtering by game is for real classes).
// Models: the demo-size copies made by optimize-glb.mjs --low --tris 10000 into
// <library>/_mid/nhan_vat_demo/ (served at mid/nhan_vat_demo/…). Card images: public/characters/thumbs/
// (scripts/render-character-thumbs.mjs).

export interface CastingEntry {
  file: string;
  proposed_id: string;
  kind: string;
  age_group: string;
  gender: string;
  suit: string[];
  note: string;
  rigged: boolean;
}

export interface DemoCharacter {
  id: string;
  /** Short Vietnamese name from the casting note ("phi hành gia mũ kín"). */
  name: string;
  kind: string;
  /** Asset path under the CDN / dev-assets root. */
  model: string;
  /** Public image for the card. */
  thumb: string;
  rigged: boolean;
  /** A session avatar (the server keeps an emoji of ≤ 8 characters). */
  emoji: string;
}

const SRC_PREFIX = '_ung_vien/nhan_vat/';

/**
 * Hidden from the demo, with the reason (report to the content side). 02/11/2026:
 * two pairs point at one file, and one model renders empty.
 */
export const DEMO_HIDDEN_CHARACTERS: Record<string, string> = {
  animal_puppy_b: 'file dựng ra hình trống (ghi chú cũ: "render trống: kiểm tra lại")',
  animal_dragon_green: 'trỏ cùng file với char_sweater_boy (Character_output-29 là bé trai, không phải rồng)',
  robot_guardian_blue: 'trỏ cùng file với robot_yellow (Robot_Guardian_All_Animations-2)',
};

function shortName(note: string, id: string): string {
  const head = note.split(/[:,(]/)[0].trim() || id;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

function emojiFor(c: CastingEntry): string {
  const id = c.proposed_id;
  if (c.kind === 'robot' || id.startsWith('robot_')) return '🤖';
  if (/dragon/.test(id)) return '🐲';
  if (/cat/.test(id)) return '🐱';
  if (/dog|puppy/.test(id)) return '🐶';
  if (/rabbit/.test(id)) return '🐰';
  if (/duck|mallard|goose/.test(id)) return '🦆';
  if (/owl/.test(id)) return '🦉';
  if (/frog/.test(id)) return '🐸';
  if (/dolphin/.test(id)) return '🐬';
  if (/otter/.test(id)) return '🦦';
  if (/dove/.test(id)) return '🕊️';
  if (c.kind === 'animal') return '🐾';
  if (c.age_group === 'child') return c.gender === 'f' ? '👧' : '👦';
  if (c.age_group === 'elder') return c.gender === 'f' ? '👵' : '👴';
  return c.gender === 'f' ? '👩' : c.gender === 'm' ? '👨' : '🧑';
}

export function demoCharacters(entries: CastingEntry[] = (casting as { characters: CastingEntry[] }).characters): DemoCharacter[] {
  return entries
    .filter((c) => c.file.startsWith(SRC_PREFIX) && !(c.proposed_id in DEMO_HIDDEN_CHARACTERS))
    .map((c) => ({
      id: c.proposed_id,
      name: shortName(c.note, c.proposed_id),
      kind: c.kind,
      model: `mid/nhan_vat_demo/${c.file.slice(SRC_PREFIX.length)}`,
      thumb: `/characters/thumbs/${c.proposed_id}.webp`,
      rigged: c.rigged,
      emoji: emojiFor(c),
    }));
}
