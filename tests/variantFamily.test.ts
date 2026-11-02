import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/engine';
import { THREE_ASSET_MANIFEST } from '../src/config/threeAssets';

const catalog = JSON.parse(readFileSync('content/asset_catalog.json', 'utf8')) as E.CatalogAsset[];
const aliases = Object.fromEntries(Object.entries(JSON.parse(readFileSync('content/asset_aliases.json', 'utf8')) as Record<string, unknown>).filter(([k]) => !k.startsWith('_'))) as E.AliasMap;
const scenarios = JSON.parse(readFileSync('content/scenarios_v2.json', 'utf8')) as (E.ScenarioAssets & { game: string })[];
const byId = new Map(catalog.map((c) => [c.id, c]));
const hasFile = (c: E.CatalogAsset | null) => !!c && Number(c.mb_web) > 0;

test('WP3 pickVariant: same seed and slot → same member on every device; never a missing file', () => {
  const a = E.pickVariant('camp_bottle', 20261102, '2:f:3', catalog, aliases);
  for (let i = 0; i < 50; i++) assert.equal(E.pickVariant('camp_bottle', 20261102, '2:f:3', catalog, aliases)?.id, a?.id);
  assert.ok(hasFile(a));
  // A scenario that names one variant gets exactly that one.
  for (let i = 0; i < 20; i++) assert.equal(E.pickVariant('camp_bottle_4', i, `s${i}`, catalog, aliases)?.id, 'camp_bottle_4');
  // A family of one still works; a clip (no web file) is never placed.
  assert.equal(E.pickVariant('camp_axe', 7, 'x', catalog, aliases)?.id, 'camp_axe');
  assert.equal(E.pickVariant('anim_kneel_work', 7, 'x', catalog, aliases), null);
  assert.equal(E.pickVariant('does_not_exist', 7, 'x', catalog, aliases), null);
  // Alias → the target's family (castle = 4 modules).
  assert.deepEqual(E.variantFamily('mv_world_castle', catalog, aliases).map((c) => c.id), ['mv_castle_module', 'mv_castle_module_2', 'mv_castle_module_3', 'mv_castle_module_4']);
  // Nature is scattered from its own pool: no family expansion.
  assert.equal(E.variantFamily('river_bush', catalog, aliases).length, 1);
  for (const c of catalog) for (const q of ['high', 'low'] as const) for (const m of E.variantFamily(c.id, catalog, aliases, q)) assert.ok(hasFile(m), `${c.id} → ${m.id}`);
});

test('WP3 pickVariant: different slots spread over the whole family', () => {
  const fam = E.variantFamily('camp_bottle', catalog, aliases).map((c) => c.id);
  assert.ok(fam.length >= 4, fam.join());
  const count = new Map<string, number>();
  for (let i = 0; i < 400; i++) {
    const id = E.pickVariant('camp_bottle', 99, `${1 + (i % 8)}:f:${i}`, catalog, aliases)!.id;
    count.set(id, (count.get(id) ?? 0) + 1);
  }
  assert.equal(count.size, fam.length, 'every member appears');
  for (const [id, n] of count) assert.ok(n >= 400 / fam.length / 2, `${id} ${n}/400`);
  // Another match (seed) → another choice for the same slot, at least sometimes.
  const diff = Array.from({ length: 40 }, (_, s) => E.pickVariant('camp_bottle', s, '1:f:0', catalog, aliases)!.id);
  assert.ok(new Set(diff).size > 1);
});

test('WP3 low quality drops the much heavier members (MB or triangles), keeps at least one', () => {
  const low = E.variantFamily('river_sign', catalog, aliases, 'low');
  const high = E.variantFamily('river_sign', catalog, aliases, 'high');
  assert.ok(low.length >= 1 && low.length < high.length, `${low.length} of ${high.length}`);
  const minTris = Math.min(...high.map((c) => Number(c.tris_low ?? c.tris_web)));
  assert.ok(low.every((c) => Number(c.tris_low ?? c.tris_web) <= Math.max(minTris * E.HEAVY_VARIANT_FACTOR, minTris + 2000)));
  for (const c of catalog) if (E.variantFamily(c.id, catalog, aliases, 'high').length) assert.ok(E.variantFamily(c.id, catalog, aliases, 'low').length >= 1, c.id);
});

test('WP3 plan loads the whole family; every member a layout draws is in the plan for that quality', () => {
  const camp = scenarios.find((s) => s.id === 'camp-01')!;
  const plan = E.planScenarioAssets(camp, catalog, aliases);
  const ids = new Set(plan.items.map((p) => p.libraryId));
  for (const m of E.variantFamily('camp_tarp', catalog, aliases)) assert.ok(ids.has(m.id), m.id);
  const lowSum = +plan.items.filter((p) => p.inLow).reduce((n, p) => n + p.mb.low, 0).toFixed(2);
  assert.equal(plan.totalMb.low, lowSum, 'low budget counts only what low loads');
  assert.ok(E.splitByStage(plan, 1, 'low').ready.every((p) => p.inLow));

  for (const s of scenarios.filter((x) => x.game !== 'multiverse_portal')) {
    const p = E.planScenarioAssets(s, catalog, aliases);
    for (const quality of ['high', 'low'] as const) {
      const loaded = new Set(E.itemsFor(p, quality).map((x) => x.libraryId));
      const l = E.buildSceneLayout({ scenario: s, catalog, aliases, layoutSeed: 4242, quality, fallbackNature: THREE_ASSET_MANIFEST.riverWorld.natureIds });
      for (const pl of l.placements.filter((x) => x.focal)) assert.ok(loaded.has(pl.libraryId), `${s.id} ${quality}: ${pl.libraryId} drawn but not loaded`);
      // Budget on the heaviest member: the triangle count does not depend on the seed's pick.
      for (const pl of l.placements.filter((x) => x.focal)) {
        const fam = E.variantFamily(pl.id, catalog, aliases, quality);
        const t = (c: E.CatalogAsset) => Number(quality === 'low' ? c.tris_low ?? c.tris_web : c.tris_web) || 0;
        assert.equal(pl.tris, Math.max(...fam.map(t)), `${s.id} ${pl.libraryId}`);
      }
    }
  }
  assert.ok(byId.size > 0);
});
