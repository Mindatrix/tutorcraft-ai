// Per-game asset loading plan (A3.7) — pure logic, no three.js:
//  - which library files a scenario needs (aliases and "__altN" families resolved),
//  - in which order (stage 1 first so the match can start; the rest loads in the background),
//  - how big it is against the budget (40 MB high / 15 MB low per match, plan 2026-10-26),
//  - a load queue with a shared cache: a model already loaded for another game is not fetched again.
// The browser side (GLTFLoader + Meshopt) lives in src/components/modes/three/assetLoader.ts.
//  - variant families (WP3, 02/11/2026): <id>, <id>_2, <id>_3… are one family. A placement picks one
//    member from (layout seed, slot), the same on every device; the plan loads the whole family.

import { VARIANT_CATEGORIES, sceneCategory } from './assetCategory';
import { hashString, mulberry32 } from './variants';

export type AssetQualityLevel = 'high' | 'low';

export const ASSET_BUDGET_MB: Record<AssetQualityLevel, number> = { high: 40, low: 15 };

export interface CatalogAsset {
  id: string;
  file: string;
  scope: 'game' | 'shared' | string;
  game?: string | null;
  mb_web: number | null;
  mb_low?: number | null;
  mb_raw?: number | null;
  /** Triangles of the high / low variant (scene triangle budgets). */
  tris_web?: number | null;
  tris_low?: number | null;
  /** Fill variants (scattered scenery): ≤ 8 k triangles (high tier) / ≤ 3 k (low tier). */
  tris_fill?: number | null;
  tris_fill_low?: number | null;
}

export type AliasMap = Record<string, { to?: string; file?: string; note?: string }>;

export interface ScenarioAssets {
  id: string;
  game: string;
  asset_ids: string[];
  stages?: { n: number; assets?: string[] }[];
}

export interface PlannedAsset {
  /** Id the scenario asked for. */
  id: string;
  /** Library entry actually loaded (alias / family base). */
  libraryId: string;
  file: string;
  shared: boolean;
  /** First stage that shows it; 99 = only listed at scenario level (background). */
  stage: number;
  mb: Record<AssetQualityLevel, number>;
  /** Family base id (stem): the members a placement chooses from. */
  family: string;
  /** Loaded in low quality too (false: a variant too heavy for weak phones, its family keeps a lighter one). */
  inLow: boolean;
}

export interface AssetPlan {
  scenario: string;
  game: string;
  items: PlannedAsset[];
  /** Ids with no file yet: the scene keeps its code-built stand-in. */
  missing: string[];
  totalMb: Record<AssetQualityLevel, number>;
  sharedMb: Record<AssetQualityLevel, number>;
}

export const stemOf = (id: string) => id.replace(/(__alt\d+|_\d+)$/, '');

/** Exact id → alias → stem → first member of the family ("tree" → "tree_1"). */
export function resolveAsset(id: string, catalog: CatalogAsset[], aliases: AliasMap = {}, index?: Map<string, CatalogAsset>): CatalogAsset | null {
  const byId = index ?? new Map(catalog.map((c) => [c.id, c]));
  if (byId.has(id)) return byId.get(id)!;
  const to = aliases[id]?.to;
  if (to && byId.has(to)) return byId.get(to)!;
  if (byId.has(stemOf(id))) return byId.get(stemOf(id))!;
  const family = catalog.filter((c) => stemOf(c.id) === id).sort((a, b) => a.id.localeCompare(b.id));
  return family[0] ?? null;
}

/**
 * Size used for planning: the variant if it exists, else the next better one (worst case).
 * A low variant that came out bigger than the high one (texture-heavy files) is never used.
 */
function sizeOf(c: CatalogAsset): Record<AssetQualityLevel, number> {
  const high = c.mb_web ?? c.mb_raw ?? 0;
  return { high, low: Math.min(c.mb_low ?? high, high) };
}

/** Which file variant to fetch: the low one only when it is actually smaller. */
export function variantFor(item: Pick<PlannedAsset, 'mb'>, quality: AssetQualityLevel): AssetQualityLevel {
  return quality === 'low' && item.mb.low < item.mb.high ? 'low' : 'high';
}

/** Low quality keeps a family member only if it is at most this many times the lightest one (MB +0.3, triangles +2 k). */
export const HEAVY_VARIANT_FACTOR = 2;
/** Has an optimized web file (catalog rows like Mixamo clips have none). */
const hasFile = (c: CatalogAsset) => Number(c.mb_web) > 0;

/**
 * The members a placement of `id` may draw, sorted by id. A scenario that names one variant
 * ("camp_bottle_4") gets exactly that one. Never a member without a file; in low quality the
 * members much heavier than the lightest are left out (at least one stays). [] = no model.
 */
export function variantFamily(id: string, catalog: CatalogAsset[], aliases: AliasMap = {}, quality: AssetQualityLevel = 'high', index?: Map<string, CatalogAsset>): CatalogAsset[] {
  const byId = index ?? new Map(catalog.map((c) => [c.id, c]));
  const base = resolveAsset(id, catalog, aliases, byId);
  if (!base) return [];
  if (!hasFile(base)) return [];
  if (byId.has(id) && stemOf(id) !== id) return [base];
  // Only props and structures pick a variant per placement; nature, characters and creatures use one model.
  if (!VARIANT_CATEGORIES.includes(sceneCategory(base))) return [base];
  const stem = stemOf(base.id);
  let fam = catalog.filter((c) => stemOf(c.id) === stem && hasFile(c)).sort((a, b) => a.id.localeCompare(b.id));
  if (quality === 'low' && fam.length > 1) {
    // Weak phones: drop members far heavier than the lightest, in download size or in triangles.
    const low = (c: CatalogAsset) => sizeOf(c).low;
    const tris = (c: CatalogAsset) => Number(c.tris_low ?? c.tris_web) || 0;
    const minMb = Math.min(...fam.map(low));
    const minTris = Math.min(...fam.map(tris));
    fam = fam.filter((c) => low(c) <= Math.max(minMb * HEAVY_VARIANT_FACTOR, minMb + 0.3) && tris(c) <= Math.max(minTris * HEAVY_VARIANT_FACTOR, minTris + 2000));
  }
  return fam;
}

/**
 * One member of the family for a placement: stable for (seed, slotKey), so every device in the class
 * draws the same model; two slots draw different members about as often as the family is large.
 */
export function pickVariant(id: string, seed: number, slotKey: string, catalog: CatalogAsset[], aliases: AliasMap = {}, quality: AssetQualityLevel = 'high', index?: Map<string, CatalogAsset>): CatalogAsset | null {
  const fam = variantFamily(id, catalog, aliases, quality, index);
  if (fam.length <= 1) return fam[0] ?? null;
  const r = mulberry32(hashString(`${seed >>> 0}|${slotKey}`))();
  return fam[Math.min(fam.length - 1, Math.floor(r * fam.length))];
}

export function planScenarioAssets(s: ScenarioAssets, catalog: CatalogAsset[], aliases: AliasMap = {}): AssetPlan {
  const index = new Map(catalog.map((c) => [c.id, c]));
  const firstStage = new Map<string, number>();
  for (const st of s.stages ?? []) for (const a of st.assets ?? []) if (!firstStage.has(a) || firstStage.get(a)! > st.n) firstStage.set(a, st.n);
  const wanted = Array.from(new Set([...(s.asset_ids ?? []), ...firstStage.keys()]));
  const byFile = new Map<string, PlannedAsset>();
  const missing: string[] = [];
  for (const id of wanted) {
    // The whole family loads (a placement picks its member by seed); low quality skips heavy members.
    const fam = variantFamily(id, catalog, aliases, 'high', index);
    if (!fam.length) {
      missing.push(id);
      continue;
    }
    const inLow = new Set(variantFamily(id, catalog, aliases, 'low', index).map((c) => c.id));
    const stage = firstStage.get(id) ?? 99;
    for (const c of fam) {
      const prev = byFile.get(c.file);
      if (prev) {
        prev.stage = Math.min(prev.stage, stage);
        prev.inLow ||= inLow.has(c.id);
        continue;
      }
      byFile.set(c.file, { id, libraryId: c.id, file: c.file, shared: c.scope !== 'game', stage, mb: sizeOf(c), family: stemOf(c.id), inLow: inLow.has(c.id) });
    }
  }
  const items = [...byFile.values()].sort((a, b) => a.stage - b.stage || Number(b.shared) - Number(a.shared) || a.file.localeCompare(b.file));
  // Budget = what is actually downloaded: every member in high quality, the kept ones in low.
  const sum = (q: AssetQualityLevel, f: (p: PlannedAsset) => boolean = () => true) =>
    +items.filter((p) => f(p) && (q === 'high' || p.inLow)).reduce((n, p) => n + p.mb[q], 0).toFixed(2);
  return {
    scenario: s.id,
    game: s.game,
    items,
    missing: missing.sort(),
    totalMb: { high: sum('high'), low: sum('low') },
    sharedMb: { high: sum('high', (p) => p.shared), low: sum('low', (p) => p.shared) },
  };
}

/** Items to load in a quality (low skips the heavy members of a family). */
export const itemsFor = (plan: AssetPlan, quality: AssetQualityLevel = 'high') => (quality === 'low' ? plan.items.filter((p) => p.inLow) : plan.items);

/** Items needed before the match can start (stage ≤ readyStage), and the background rest. */
export function splitByStage(plan: AssetPlan, readyStage = 1, quality: AssetQualityLevel = 'high'): { ready: PlannedAsset[]; later: PlannedAsset[] } {
  const items = itemsFor(plan, quality);
  return { ready: items.filter((p) => p.stage <= readyStage), later: items.filter((p) => p.stage > readyStage) };
}

export function overBudget(plan: AssetPlan): Record<AssetQualityLevel, boolean> {
  return { high: plan.totalMb.high > ASSET_BUDGET_MB.high, low: plan.totalMb.low > ASSET_BUDGET_MB.low };
}

/**
 * Load queue with a shared cache and limited concurrency. `load(key)` is called once per key for
 * the lifetime of the queue, so switching games re-uses everything already loaded.
 */
export function createLoadQueue<T>(load: (key: string) => Promise<T>, concurrency = 3) {
  const cache = new Map<string, Promise<T>>();
  const waiting: (() => void)[] = [];
  let active = 0;
  const slot = () =>
    new Promise<void>((resolve) => {
      if (active < concurrency) {
        active++;
        resolve();
      } else waiting.push(() => {
        active++;
        resolve();
      });
    });
  const release = () => {
    active--;
    waiting.shift()?.();
  };
  function get(key: string): Promise<T> {
    let p = cache.get(key);
    if (!p) {
      p = slot().then(() => load(key).finally(release));
      cache.set(key, p);
      // A failed load may be retried later (e.g. offline for a moment).
      p.catch(() => cache.delete(key));
    }
    return p;
  }
  return {
    get,
    has: (key: string) => cache.has(key),
    size: () => cache.size,
    /** Load many; `onDone(doneCount, total)` after each settles. Never rejects (failed = missing). */
    async all(keys: string[], onDone?: (done: number, total: number) => void): Promise<Map<string, T>> {
      const out = new Map<string, T>();
      let done = 0;
      await Promise.all(
        keys.map((k) =>
          get(k)
            .then((v) => void out.set(k, v))
            .catch(() => undefined)
            .finally(() => onDone?.(++done, keys.length)),
        ),
      );
      return out;
    },
  };
}
