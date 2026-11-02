// What kind of thing a library model is (scene layout, variant families). Own module so both
// sceneBuilder.ts and assetLoader.ts use it without importing each other.

export type SceneCategory = 'ground' | 'tree' | 'bush' | 'rock' | 'reed' | 'water' | 'structure' | 'backdrop' | 'prop' | 'creature' | 'character' | 'skip';

/** What kind of thing a library model is, from its folder and id. */
export function sceneCategory(c: { id: string; file: string }): SceneCategory {
  const { id, file: f } = c;
  if (f.startsWith('fx/') || f.startsWith('fishing/ca/')) return 'skip'; // effects; fish appear when caught
  // Mixamo clips (anim/*.glb, no mesh, not optimised): played on characters, never placed in the scene.
  if (f.startsWith('anim/') || /^anim_/.test(id)) return 'skip';
  if (f.startsWith('characters/')) return 'character';
  if (f.startsWith('dino/khung_long/') || f.startsWith('dino/thu_nho/')) return 'creature';
  if (f.startsWith('river_world/ground/') || /^ground_/.test(id)) return 'ground';
  if (f.startsWith('river_world/mini/') || f.startsWith('dino/the_gioi/')) return 'backdrop';
  if (/^river_reed/.test(id)) return 'reed';
  if (/^river_(lilypad|buoy)/.test(id)) return 'water';
  if (/^river_(rock|pebbles|stone)/.test(id)) return 'rock';
  if (/^(river_(bush|fern|grass|flower|moss)|mushrooms)/.test(id)) return 'bush';
  if (f.startsWith('river_world/cay_phu/') || /^(river_tree|tree_|palm_)/.test(id)) return 'tree';
  if (f.startsWith('river_world/lang/') || /^(river_(dock|bridge|cabin|shed|fence|well|sign|waterfall|cave|stump|log|driftwood|woodpile)|watchtower|tree_fort|village_)/.test(id)) return 'structure';
  return 'prop';
}

/** Kinds whose placements pick a family member by seed (WP3); nature is scattered from its own pool. */
export const VARIANT_CATEGORIES: SceneCategory[] = ['prop', 'structure'];
