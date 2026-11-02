import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/engine';
import { THREE_ASSET_MANIFEST } from '../src/config/threeAssets';

const catalog = JSON.parse(readFileSync('content/asset_catalog.json', 'utf8')) as E.CatalogAsset[];
const aliases = Object.fromEntries(Object.entries(JSON.parse(readFileSync('content/asset_aliases.json', 'utf8')) as Record<string, unknown>).filter(([k]) => !k.startsWith('_'))) as E.AliasMap;
const scenarios = JSON.parse(readFileSync('content/scenarios_v2.json', 'utf8')) as (E.ScenarioAssets & { game: string })[];
const kits = JSON.parse(readFileSync('content/scene_kits.json', 'utf8')) as E.SceneKits;
const byId = new Map(catalog.map((c) => [c.id, c]));
const fallbackNature = THREE_ASSET_MANIFEST.riverWorld.natureIds;
const camps = scenarios.filter((s) => s.game === 'summer_camp');
const layout = (s: (typeof scenarios)[number], level: number, extra: Partial<E.LayoutInput> = {}) =>
  E.buildSceneLayout({ scenario: s, catalog, aliases, layoutSeed: 20261102, fallbackNature, kits, level, ...extra });

test('WP4 kits data: every id exists with a web file, picks avoid the mis-named family members', () => {
  const missing: string[] = [];
  for (const [game, kit] of Object.entries(kits.games))
    for (const g of kit.groups) {
      assert.ok(g.members.some((m) => m.core), `${game}/${g.id} has a core member`);
      for (const m of g.members) for (const id of m.pick ?? [m.asset]) if (!(Number(byId.get(id)?.mb_web) > 0) && !E.variantFamily(id, catalog, aliases).length) missing.push(`${g.id}: ${id}`);
      for (const id of kit.ambient ?? []) assert.ok(kit.groups.some((x) => x.id === id), `ambient ${id}`);
    }
  assert.deepEqual(missing, []);
  const picks = Object.values(kits.games).flatMap((k) => k.groups.flatMap((g) => g.members.flatMap((m) => m.pick ?? [])));
  for (const bad of ['camp_lantern', 'camp_grill_2', 'camp_water_filter_2', 'camp_firepit__alt1', 'camp_tent_stage__alt2', 'camp_tent_stage__alt3']) assert.ok(!picks.includes(bad), bad);
  assert.equal(E.kitLevel(kits, 9).level, 6);
  assert.equal(E.kitLevel(kits, 0).ambient, 0);
});

test('WP4 groups: same seed → same layout; the stage\'s own things sit in their group; level 0 ≤ level 5', () => {
  for (const s of camps) {
    const a = layout(s, 3);
    assert.deepEqual(layout(s, 3).placements, a.placements, `${s.id}: same seed, same layout`);
    const grouped = a.placements.filter((p) => p.group);
    assert.ok(grouped.length > 0, `${s.id}: at least one group`);
    for (const p of grouped) {
      assert.ok(Math.abs(p.x) > a.world.waterHalf, `${s.id} ${p.libraryId}: on land (x ${p.x})`);
      assert.equal(p.tint, E.kitLevel(kits, 3).tint);
    }
    // A wrongly named member never shows through a group.
    for (const p of grouped) assert.ok(!['camp_lantern', 'camp_grill_2', 'camp_water_filter_2', 'camp_firepit__alt1'].includes(p.libraryId), p.libraryId);
    const n0 = layout(s, 0).placements.filter((p) => p.group).length;
    const n5 = layout(s, 5).placements.filter((p) => p.group).length;
    assert.ok(n0 <= n5, `${s.id}: level 0 ${n0} ≤ level 5 ${n5}`);
  }
  // camp-01 stage 2 lists camp_tarp and camp_sleeping_bag: they are drawn inside "khu_trai".
  const s2 = layout(camps.find((s) => s.id === 'camp-01')!, 0, { stages: [2] });
  const tarp = s2.placements.find((p) => p.id === 'camp_tarp');
  assert.equal(tarp?.group, 'khu_trai');
  // Another match → another place for the group.
  const other = layout(camps.find((s) => s.id === 'camp-01')!, 0, { stages: [2], layoutSeed: 7 });
  assert.notDeepEqual([tarp?.x, tarp?.z], [other.placements.find((p) => p.id === 'camp_tarp')?.x, other.placements.find((p) => p.id === 'camp_tarp')?.z]);
  // Higher level → more companions on a stage with room.
  const lo = layout(camps[0], 0, { stages: [2], current: 2 }).placements.filter((p) => p.group).length;
  const hi = layout(camps[0], 6, { stages: [2], current: 2 }).placements.filter((p) => p.group).length;
  assert.ok(hi > lo, `level 6 adds companions: ${lo} → ${hi}`);
});

test('WP4 budget: companions ≤ 60k / 20k a stage, scenes stay ≤ 1.3 M / 300 k, plans ≤ 40 / 15 MB', () => {
  let worst = { high: 0, low: 0 };
  for (const s of camps)
    for (const quality of ['high', 'low'] as const)
      for (let st = 1; st <= 8; st++) {
        const stages = [st - 1, st, st + 1].filter((n) => n >= 1 && n <= 8);
        const l = layout(s, 6, { quality, stages, current: st });
        const tris = l.placements.reduce((a, p) => a + p.tris, 0);
        worst = { ...worst, [quality]: Math.max(worst[quality], tris) };
        // Neighbour stages draw their groups' core only (no companion of another stage).
        const base = layout(s, 0, { quality, stages, current: st }).placements.filter((p) => p.group && p.stage !== st).length;
        assert.equal(l.placements.filter((p) => p.group && p.stage !== st).length, base, `${s.id} ${st}: neighbours unchanged by level`);
      }
  assert.ok(worst.high <= E.SCENE_TRIS_CAP.high, `high ${worst.high}`);
  assert.ok(worst.low <= E.SCENE_TRIS_CAP.low, `low ${worst.low}`);
  for (const s of scenarios) {
    const plan = E.planScenarioAssets(s, catalog, aliases, kits);
    const o = E.overBudget(plan);
    assert.ok(!o.high && !o.low, `${s.id}: ${plan.totalMb.high} / ${plan.totalMb.low} MB`);
    // Everything a kit layout draws is in the plan for that quality.
    if (s.game !== 'summer_camp') continue;
    for (const quality of ['high', 'low'] as const) {
      const loaded = new Set(E.itemsFor(plan, quality).map((p) => p.libraryId));
      for (const p of layout(s, 6, { quality }).placements.filter((x) => x.focal)) assert.ok(loaded.has(p.libraryId), `${s.id} ${quality}: ${p.libraryId}`);
    }
  }
});
