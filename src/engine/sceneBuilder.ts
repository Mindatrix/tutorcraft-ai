// Scene layout from data (plan C1.4): where every model of a scenario stands, per stage, from
// the scenario's asset lists, the library catalog and the match's layout seed. Pure and
// deterministic, so every device of a class builds the same river; a new stage (or a new
// scenario) changes the layout without touching code.
//
// River worlds: the river runs toward -z, stage n covers z ∈ [-(n-1)·L, -n·L]. The stage's own
// models (its "assets" list) form a cluster on one bank (sides alternate); trees, bushes, rocks,
// reeds and lily pads from the scenario fill both banks; mini islands stand far away.
// Dino Journey uses a meadow: a dirt path instead of water, wider grass on both sides.

import { resolveAsset, type AliasMap, type CatalogAsset, type ScenarioAssets } from './assetLoader';
import { GameMode } from './types';
import { mulberry32 } from './variants';

export type SceneCategory = 'ground' | 'tree' | 'bush' | 'rock' | 'reed' | 'water' | 'structure' | 'backdrop' | 'prop' | 'creature' | 'character' | 'skip';

/** What kind of thing a library model is, from its folder and id. */
export function sceneCategory(c: { id: string; file: string }): SceneCategory {
  const { id, file: f } = c;
  if (f.startsWith('fx/') || f.startsWith('fishing/ca/')) return 'skip'; // effects; fish appear when caught
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

export interface WorldTemplate {
  kind: 'river' | 'meadow';
  /** Metres of river per stage. */
  stageLength: number;
  /** Half width of the water (river) or of the path (meadow). */
  waterHalf: number;
  /** Width of the bank band where nature is scattered. */
  bankWidth: number;
  /** Distance band of the far backdrop. */
  farBand: [number, number];
}

export const RIVER_WORLD: WorldTemplate = { kind: 'river', stageLength: 60, waterHalf: 6, bankWidth: 24, farBand: [55, 85] };
export const MEADOW_WORLD: WorldTemplate = { kind: 'meadow', stageLength: 70, waterHalf: 2.5, bankWidth: 32, farBand: [60, 95] };

export function worldTemplate(game: string | null | undefined): WorldTemplate {
  return game === GameMode.DINO_JOURNEY ? MEADOW_WORLD : RIVER_WORLD;
}

/** Fill per stage, [high, low] quality. */
const FILL: Partial<Record<SceneCategory, [number, number]>> = {
  tree: [16, 9],
  bush: [24, 12],
  rock: [9, 5],
  reed: [14, 7],
  water: [6, 3],
  ground: [4, 2],
  backdrop: [2, 1],
};

/**
 * Scattered fill is drawn with the LOW variant of a model (it is scenery, often far away), and a
 * model only enters the fill if one copy stays under this many triangles ([high, low] quality):
 * Meshy scans can be 30–120 thousand triangles even in the low variant (river_reed: 120 k).
 */
const PER_COPY: Partial<Record<SceneCategory, [number, number]>> = {
  tree: [32_000, 12_000],
  bush: [16_000, 9_500],
  rock: [16_000, 9_500],
  reed: [20_000, 9_500],
  water: [9_000, 8_000],
  ground: [70_000, 30_000],
  backdrop: [45_000, 30_000],
};
/** Triangles of fill per stage ([high, low]); the stage's own models come on top. */
export const FILL_BUDGET: [number, number] = [700_000, 220_000];

/** Minimum gap between two things of a kind (metres). */
const GAP: Partial<Record<SceneCategory, number>> = { tree: 4, bush: 1.6, rock: 2.2, reed: 0.9, water: 1.5, ground: 9, backdrop: 25 };

export type SizeFit = 'height' | 'width' | 'max';

/**
 * Target size in metres, what it measures, and random scale range. Library models come in any
 * unit (Meshy normalises most to ~1–2), so every model is scaled to a real-world size. Upright
 * things are sized by height; flat, long or odd-shaped ones by their longest side (a pebble patch
 * sized by height becomes metres wide: seen in the scene lab, 27/10).
 */
const SIZE: Record<SceneCategory, [size: number, fit: SizeFit, jitter: number]> = {
  tree: [7.5, 'height', 0.25],
  bush: [1.4, 'max', 0.25],
  rock: [1.3, 'max', 0.35],
  reed: [1.7, 'height', 0.15],
  water: [0.9, 'max', 0.2],
  ground: [10, 'width', 0.1],
  backdrop: [30, 'max', 0.2],
  structure: [4, 'max', 0],
  prop: [1.1, 'max', 0],
  creature: [2.2, 'height', 0],
  character: [1.7, 'height', 0],
  skip: [1, 'max', 0],
};

/** Real sizes of things the scenarios use often (first match wins). */
const SIZE_BY_ID: [RegExp, number, SizeFit][] = [
  [/^river_dock/, 8, 'max'],
  [/^river_bridge/, 10, 'max'],
  [/^river_(cabin|shed)|^village_/, 7, 'max'],
  [/^river_sign/, 1.6, 'height'],
  [/^river_fence/, 3, 'max'],
  [/^river_well/, 2, 'height'],
  [/^watchtower/, 7, 'height'],
  [/^tree_fort/, 6, 'height'],
  [/^river_waterfall/, 8, 'height'],
  [/^river_cave/, 8, 'max'],
  [/^river_stump/, 0.7, 'height'],
  [/^river_(log|driftwood)/, 3, 'max'],
  [/^river_woodpile/, 1.6, 'max'],
  [/^river_boat|_boat$|^kayak_boat|canoe/, 4, 'max'],
  [/paddle/, 2.2, 'max'],
  [/tent/, 3, 'max'],
  [/container/, 6, 'max'],
  [/table|bench/, 1.8, 'max'],
  [/firepit|campfire|grill/, 1.2, 'max'],
  [/barrel/, 1, 'height'],
  [/crate|chest|box/, 0.9, 'max'],
  [/lantern|lamp|flashlight|bottle|cup|mug|bucket/, 0.4, 'max'],
  [/rod/, 2.4, 'max'],
  [/^dino_trex/, 4, 'height'],
  [/^dino_raptor/, 2, 'height'],
  [/^dino_triceratops/, 2.6, 'height'],
  [/^dino_stegosaurus/, 3, 'height'],
  [/^dino_(diplodocus|sauropod)/, 6, 'height'],
  [/^dino_rabbit/, 0.4, 'height'],
  [/^dino_rat/, 0.2, 'height'],
  [/^dino_wolf/, 0.9, 'height'],
  [/^dino_antelope/, 1.4, 'height'],
];

function sizeFor(id: string, cat: SceneCategory): [number, SizeFit, number] {
  const hit = SIZE_BY_ID.find(([re]) => re.test(id));
  return hit ? [hit[1], hit[2], 0] : SIZE[cat];
}

export interface Placement {
  /** Unique within the layout (stable across builds). */
  key: string;
  /** Id the scenario asked for. */
  id: string;
  libraryId: string;
  file: string;
  category: SceneCategory;
  stage: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Target size in metres of what `fit` measures (height, ground width, or longest side). */
  size: number;
  fit: SizeFit;
  /** Part of the stage's own cluster (not fill). */
  focal: boolean;
  /** Which file variant to draw: fill always uses the low one. */
  variant: 'high' | 'low';
  /** Triangles of that variant (0 when unknown). */
  tris: number;
}

export interface StageArea {
  n: number;
  z0: number;
  z1: number;
  focal: { x: number; z: number; side: 1 | -1 };
}

export interface SceneLayout {
  world: WorldTemplate;
  stages: StageArea[];
  placements: Placement[];
  /** Stage asset ids with no library file (the scene keeps a code-built stand-in). */
  missing: string[];
}

export interface LayoutInput {
  scenario: ScenarioAssets & { game: string };
  catalog: CatalogAsset[];
  aliases?: AliasMap;
  /** RunPlan.layoutSeed of the match (same on every device). */
  layoutSeed: number;
  quality?: 'high' | 'low';
  /** Stages to build (default: all of the scenario). */
  stages?: number[];
  /** Nature models used when the scenario lists none of a kind (the shared river pack). */
  fallbackNature?: string[];
}

const NATURE: SceneCategory[] = ['tree', 'bush', 'rock', 'reed', 'water', 'ground', 'backdrop'];

export function stageArea(world: WorldTemplate, n: number): StageArea {
  const z0 = -(n - 1) * world.stageLength;
  const z1 = -n * world.stageLength;
  const side: 1 | -1 = n % 2 === 1 ? 1 : -1;
  return { n, z0, z1, focal: { x: side * (world.waterHalf + 7), z: (z0 + z1) / 2, side } };
}

export function buildSceneLayout(input: LayoutInput): SceneLayout {
  const world = worldTemplate(input.scenario.game);
  const q = input.quality === 'low' ? 1 : 0;
  const index = new Map(input.catalog.map((c) => [c.id, c]));
  const resolve = (id: string) => resolveAsset(id, input.catalog, input.aliases ?? {}, index);
  const allStages = (input.scenario.stages ?? []).map((s) => s.n);
  const wanted = (input.stages ?? (allStages.length ? allStages : [1])).filter((n) => n >= 1).sort((a, b) => a - b);

  // Nature pool per kind: the scenario's own models first, the shared pack when it has none.
  const pool = new Map<SceneCategory, CatalogAsset[]>();
  const addPool = (ids: string[], onlyIfEmpty: boolean) => {
    const found = new Map<SceneCategory, CatalogAsset[]>();
    for (const id of ids) {
      const c = resolve(id);
      if (!c) continue;
      const cat = sceneCategory(c);
      if (!NATURE.includes(cat)) continue;
      const list = found.get(cat) ?? [];
      if (!list.some((x) => x.file === c.file)) list.push(c);
      found.set(cat, list);
    }
    for (const [cat, list] of found) if (!onlyIfEmpty || !pool.get(cat)?.length) pool.set(cat, list.sort((a, b) => a.id.localeCompare(b.id)));
  };
  addPool([...(input.scenario.asset_ids ?? []), ...(input.scenario.stages ?? []).flatMap((s) => s.assets ?? [])], false);
  addPool(input.fallbackNature ?? [], true);
  // The shared pack also backs up a kind whose scenario models are all too heavy to scatter.
  const fallbackPool = new Map<SceneCategory, CatalogAsset[]>();
  for (const id of input.fallbackNature ?? []) {
    const c = resolve(id);
    if (!c) continue;
    const cat = sceneCategory(c);
    const list = fallbackPool.get(cat) ?? [];
    if (!list.some((x) => x.file === c.file)) list.push(c);
    fallbackPool.set(cat, list);
  }
  if (world.kind === 'meadow') pool.delete('water');
  if (world.kind === 'meadow') pool.delete('reed');

  const placements: Placement[] = [];
  const missing = new Set<string>();
  const stages: StageArea[] = [];

  for (const n of wanted) {
    const area = stageArea(world, n);
    stages.push(area);
    const rand = mulberry32((input.layoutSeed ^ Math.imul(n, 0x9e3779b1)) >>> 0);
    const taken: { x: number; z: number; r: number }[] = [];
    const free = (x: number, z: number, r: number) => taken.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 >= (t.r + r) ** 2 * 0.25);
    const put = (c: CatalogAsset, id: string, cat: SceneCategory, x: number, z: number, focal: boolean, idx: number) => {
      const [size, fit, jitter] = sizeFor(c.id, cat);
      const y = cat === 'water' ? 0.03 : 0;
      const variant: 'high' | 'low' = !focal || q === 1 ? 'low' : 'high';
      placements.push({
        key: `${n}:${focal ? 'f' : 'n'}:${idx}:${c.id}`,
        id,
        libraryId: c.id,
        file: c.file,
        category: cat,
        stage: n,
        x: round(x),
        y,
        z: round(z),
        rotY: round(rand() * Math.PI * 2),
        size: round(size * (1 + (rand() * 2 - 1) * jitter)),
        fit,
        focal,
        variant,
        tris: trisOf(c, variant),
      });
      taken.push({ x, z, r: GAP[cat] ?? 2 });
    };

    // 1) The stage's own models: a cluster around the focal point, structures at the water edge.
    const own = (input.scenario.stages ?? []).filter((s) => s.n === n).flatMap((s) => s.assets ?? []);
    let k = 0;
    for (const id of own) {
      const c = resolve(id);
      if (!c) {
        missing.add(id);
        continue;
      }
      const cat = sceneCategory(c);
      if (cat === 'skip' || NATURE.includes(cat)) continue; // nature is spread below, not clustered
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 30; tries++) {
        if (cat === 'structure') {
          x = area.focal.side * (world.waterHalf + 1 + rand() * 3);
          z = area.focal.z + (rand() - 0.5) * world.stageLength * 0.5;
        } else {
          const a = rand() * Math.PI * 2;
          const r = 1.5 + rand() * 5;
          x = area.focal.x + Math.cos(a) * r;
          z = area.focal.z + Math.sin(a) * r;
        }
        if (Math.abs(x) > world.waterHalf + 0.5 && free(x, z, 1.4)) break;
      }
      put(c, id, cat, x, z, true, k++);
    }

    // 2) Nature on both banks (and lily pads on the water), kept off the cluster and the water,
    //    with light models only and within the stage's triangle budget.
    let budget = FILL_BUDGET[q];
    for (const cat of NATURE) {
      const list = lightPool(cat, pool.get(cat) ?? [], fallbackPool.get(cat) ?? [], q);
      const count = FILL[cat]?.[q] ?? 0;
      if (!list.length || !count) continue;
      for (let i = 0; i < count; i++) {
        const fits = list.filter((c) => trisOf(c, 'low') <= budget);
        if (!fits.length) break;
        const c = fits[Math.floor(rand() * fits.length)];
        let placed = false;
        for (let tries = 0; tries < 24 && !placed; tries++) {
          const side = rand() < 0.5 ? -1 : 1;
          const z = area.z0 - rand() * world.stageLength;
          let x: number;
          if (cat === 'water') x = (rand() * 2 - 1) * (world.waterHalf - 1);
          else if (cat === 'reed') x = side * (world.waterHalf - 0.6 + rand() * 1.6);
          else if (cat === 'backdrop') x = side * (world.farBand[0] + rand() * (world.farBand[1] - world.farBand[0]));
          else if (cat === 'ground') x = side * (world.waterHalf + 5 + rand() * (world.bankWidth - 5));
          else x = side * (world.waterHalf + 1.5 + rand() * world.bankWidth);
          const nearFocal = (x - area.focal.x) ** 2 + (z - area.focal.z) ** 2 < 8 ** 2;
          if (cat !== 'ground' && cat !== 'backdrop' && nearFocal) continue;
          if (!free(x, z, GAP[cat] ?? 2)) continue;
          put(c, c.id, cat, x, z, false, i);
          budget -= trisOf(c, 'low');
          placed = true;
        }
      }
    }
  }
  return { world, stages, placements, missing: [...missing].sort() };
}

const round = (v: number) => Math.round(v * 1000) / 1000;

function trisOf(c: CatalogAsset, variant: 'high' | 'low'): number {
  const v = variant === 'low' ? c.tris_low ?? c.tris_web : c.tris_web;
  return Number(v) || 0;
}

/** Models of a kind light enough to repeat: the scenario's own first, else the shared pack's. */
function lightPool(cat: SceneCategory, own: CatalogAsset[], shared: CatalogAsset[], q: number): CatalogAsset[] {
  const cap = PER_COPY[cat]?.[q] ?? Infinity;
  const light = (list: CatalogAsset[]) => list.filter((c) => trisOf(c, 'low') <= cap);
  const mine = light(own);
  if (mine.length) return mine;
  const theirs = light(shared);
  if (theirs.length) return theirs.sort((a, b) => a.id.localeCompare(b.id));
  return [];
}

/** Triangles per stage of a layout (what one stage costs to draw). */
export function stageTriangles(layout: SceneLayout): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of layout.placements) out.set(p.stage, (out.get(p.stage) ?? 0) + p.tris);
  return out;
}

/**
 * Draw calls of a layout when every model file is drawn as one instanced batch (per mesh in it),
 * plus the fixed parts (sky, water, banks, ground plane, footprints, sparks).
 */
export function estimateDrawCalls(layout: SceneLayout, meshesPerFile: (file: string) => number = () => 1, fixed = 8): number {
  const files = new Set(layout.placements.map((p) => p.file));
  let calls = fixed;
  for (const f of files) calls += meshesPerFile(f);
  return calls;
}
