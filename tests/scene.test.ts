import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/engine';
import { THREE_ASSET_MANIFEST } from '../src/config/threeAssets';

const catalog = JSON.parse(readFileSync('content/asset_catalog.json', 'utf8')) as E.CatalogAsset[];
const aliases = Object.fromEntries(Object.entries(JSON.parse(readFileSync('content/asset_aliases.json', 'utf8')) as Record<string, unknown>).filter(([k]) => !k.startsWith('_'))) as E.AliasMap;
type Scenario = E.ScenarioAssets & { game: string; characters: E.StoryCharacter[] };
const scenarios = JSON.parse(readFileSync('content/scenarios_v2.json', 'utf8')) as Scenario[];
const fallbackNature = THREE_ASSET_MANIFEST.riverWorld.natureIds;
const byId = new Map(catalog.map((c) => [c.id, c]));

const layout = (s: Scenario, seed = 42, extra: Partial<E.LayoutInput> = {}) => E.buildSceneLayout({ scenario: s, catalog, aliases, layoutSeed: seed, fallbackNature, ...extra });

test('C1.4 categories from folder and id', () => {
  const cat = (id: string) => E.sceneCategory(byId.get(id)!);
  assert.equal(cat('river_tree_pine'), 'tree');
  assert.equal(cat('camp_firepit'), 'prop');
  assert.equal(cat('river_dock'), 'structure');
  assert.equal(cat('dino_trex_brown'), 'creature');
  assert.equal(cat('char_sunny_boy'), 'character');
  const groundIds = catalog.filter((c) => c.file.startsWith('river_world/ground/')).map((c) => c.id);
  assert.ok(groundIds.length > 0 && groundIds.every((id) => cat(id) === 'ground'));
});

test('C1.4 same seed → same layout on every device; another match → another layout', () => {
  const s = scenarios.find((x) => x.id === 'camp-01')!;
  assert.deepEqual(layout(s, 7), layout(s, 7));
  assert.notDeepEqual(layout(s, 7).placements, layout(s, 8).placements);
});

test('C1.4 a stage is built from its own asset list: changing stage changes the layout, no code', () => {
  const s = scenarios.find((x) => x.id === 'camp-01')!;
  for (const st of s.stages ?? []) {
    const l = layout(s, 3, { stages: [st.n] });
    const placedIds = new Set(l.placements.filter((p) => p.focal).map((p) => p.id));
    for (const id of st.assets ?? []) {
      const c = E.resolveAsset(id, catalog, aliases);
      if (!c) assert.ok(l.missing.includes(id), `${id} listed as missing`);
      else if (!['tree', 'bush', 'rock', 'reed', 'water', 'ground', 'backdrop', 'skip'].includes(E.sceneCategory(c))) assert.ok(placedIds.has(id), `stage ${st.n}: ${id} placed`);
    }
    assert.ok(l.placements.every((p) => p.stage === st.n && p.z <= l.stages[0].z0 + 8 && p.z >= l.stages[0].z1 - 8), 'inside its stage');
  }
  const two = layout(s, 3, { stages: [2] }).placements.filter((p) => p.focal).map((p) => p.id);
  const three = layout(s, 3, { stages: [3] }).placements.filter((p) => p.focal).map((p) => p.id);
  assert.notDeepEqual(two, three);
});

test('C1.4 land stays on land, water things on the water; focal clusters alternate banks', () => {
  for (const s of scenarios.filter((x) => x.game !== 'multiverse_portal')) {
    const l = layout(s);
    const half = l.world.waterHalf;
    for (const p of l.placements) {
      if (p.category === 'water') assert.ok(Math.abs(p.x) < half, `${s.id} ${p.key} in the water`);
      else if (p.category === 'reed') assert.ok(Math.abs(p.x) > half - 1, `${s.id} ${p.key} at the edge`);
      else assert.ok(Math.abs(p.x) > half, `${s.id} ${p.key} x=${p.x} not in the water`);
    }
    assert.ok(l.stages.every((a, i) => i === 0 || a.focal.side !== l.stages[i - 1].focal.side));
  }
});

test('C1.5 every river / dino scenario fits under 150 draw calls (one instanced batch per model)', () => {
  for (const s of scenarios.filter((x) => x.game !== 'multiverse_portal')) {
    const l = layout(s);
    const calls = E.estimateDrawCalls(l);
    assert.ok(calls < 150, `${s.id}: ${calls} draw calls`);
    assert.ok(l.placements.length > 100, `${s.id}: a lived-in river (${l.placements.length} things)`);
    const low = layout(s, 42, { quality: 'low' });
    assert.ok(low.placements.length < l.placements.length * 0.7, `${s.id}: low quality draws less`);
  }
});

test('C2.1 looks: 12 colours, templates in the library, room for 60, free look suggested', () => {
  assert.equal(E.AVATAR_COLORS.length, 12);
  assert.equal(new Set(E.AVATAR_COLORS.map((c) => c.hex)).size, 12);
  assert.ok(E.AVATAR_COLORS.every((c) => /^#[0-9a-f]{6}$/.test(c.hex)));
  for (const game of E.GAME_MODE_IDS) {
    for (const t of E.avatarTemplates(game)) assert.ok(byId.has(t.model), `${t.model} in the library`);
    assert.ok(E.lookCapacity(game) >= E.MAX_MATCH_PLAYERS, game);
  }
  // 60 students who all want the same look end up with 60 different looks.
  const taken: E.Look[] = [];
  for (let i = 0; i < 60; i++) {
    const look = E.suggestLook('dino_journey', { template: 'trex', color: '#e53935' }, taken)!;
    taken.push(look);
  }
  assert.equal(new Set(taken.map(E.lookKey)).size, 60);
  assert.deepEqual(taken[0], { template: 'trex', color: '#e53935' }, 'free → as wanted');
  assert.deepEqual(taken[1], { template: 'trex', color: '#fb8c00' }, 'taken → same species, next colour');
  assert.equal(taken[12].template, 'raptor', 'all 12 colours of the species taken → next species');
});

test('C2.5 all 360 story characters have a library model; a scenario reuses a model only when it must', () => {
  let n = 0;
  for (const s of scenarios) {
    const cast = E.castModels(s.game, s.characters);
    assert.equal(cast.size, s.characters.length, s.id);
    for (const [slot, m] of cast) {
      n++;
      assert.ok(E.resolveAsset(m.model, catalog, aliases), `${s.id}#${slot}: ${m.model}`);
    }
    const pooled = [...cast.values()].filter((m) => m.source === 'pool').map((m) => m.model);
    const distinct = new Set([...cast.values()].map((m) => m.model)).size;
    assert.ok(distinct >= Math.min(8, cast.size), `${s.id}: ${distinct} different models`);
    void pooled;
  }
  assert.equal(n, 360);
  // Repeats (27/10): the most constrained characters choose first, grown-ups borrow from the next
  // age group, and a repeat takes the least used model. 59 → 33 repeats over 360 characters, none
  // more than twice; what is left is girls (2 girl models in the library: a content gap).
  let repeats = 0;
  for (const s of scenarios) {
    const counts = new Map<string, number>();
    for (const m of E.castModels(s.game, s.characters).values()) counts.set(m.model, (counts.get(m.model) ?? 0) + 1);
    for (const [model, k] of counts) assert.ok(k <= 2, `${s.id}: ${model} ×${k}`);
    repeats += [...counts.values()].reduce((a, k) => a + k - 1, 0);
  }
  assert.ok(repeats <= 33, `${repeats} repeated models`);
  // Tagged characters keep the model the content side chose.
  const dino = scenarios.find((x) => x.id === 'dino-01')!;
  const moc = dino.characters.find((c) => c.slot === 1)!;
  assert.equal(E.castModels(dino.game, dino.characters).get(1)?.model, E.taggedModel(moc.clothing_text));
});

test('C1.5 scene triangles (27/10): fill copies ≤ ~8 k / 3 k, neighbours only near the boundary, same layout on every device', () => {
  const worst = { high: 0, low: 0 };
  for (const s of scenarios.filter((x) => x.game !== 'multiverse_portal')) {
    for (const quality of ['high', 'low'] as const) {
      for (let stage = 1; stage <= 8; stage++) {
        const stages = [stage - 1, stage, stage + 1].filter((n) => n >= 1 && n <= 8);
        const all = layout(s, 99, { quality, stages });
        const near = layout(s, 99, { quality, stages, current: stage });
        // Same placements, minus far-side neighbour fill: nothing moves.
        const keys = new Set(all.placements.map((p) => `${p.key}@${p.x},${p.z}`));
        assert.ok(near.placements.every((p) => keys.has(`${p.key}@${p.x},${p.z}`)), `${s.id} ${stage}: layout changed`);
        const reach = E.NEIGHBOUR_REACH * near.world.stageLength;
        for (const p of near.placements) {
          if (p.focal || p.stage === stage) continue;
          const area = near.stages.find((a) => a.n === p.stage)!;
          const boundary = p.stage < stage ? area.z1 : area.z0;
          assert.ok(Math.abs(p.z - boundary) <= reach + 1e-6, `${s.id} ${stage}: neighbour fill far from the boundary`);
        }
        for (const p of near.placements.filter((x) => !x.focal && x.variant.startsWith('fill'))) assert.ok(p.tris <= (quality === 'low' ? 4_000 : 10_500), `${p.libraryId} ${p.variant}: ${p.tris}`);
        const tris = near.placements.reduce((a, p) => a + p.tris, 0);
        worst[quality] = Math.max(worst[quality], tris);
      }
    }
  }
  // Worst scene (world only) before 27/10: 2.24 M (high) / 735 k (low); after: ~1.18 M / ~262 k.
  assert.ok(worst.high <= 1_300_000, `high ${worst.high}`);
  assert.ok(worst.low <= 300_000, `low ${worst.low}`);
});

test('C1.2 / C1.5 triangle budget: fill uses light models only; three stages fit a weak phone in low quality', () => {
  for (const s of scenarios.filter((x) => x.game !== 'multiverse_portal')) {
    for (const quality of ['high', 'low'] as const) {
      const l = layout(s, 99, { quality });
      const fill = l.placements.filter((p) => !p.focal);
      assert.ok(fill.every((p) => p.variant === (quality === 'low' ? 'fill_low' : 'fill') || p.variant === 'low'), 'fill draws a fill (or low) variant');
      const perStage = new Map<number, number>();
      for (const p of fill) perStage.set(p.stage, (perStage.get(p.stage) ?? 0) + p.tris);
      for (const [n, t] of perStage) assert.ok(t <= E.FILL_BUDGET[quality === 'low' ? 1 : 0], `${s.id} ${quality} stage ${n}: ${t} fill triangles`);
      // What a device draws at once: the current stage and its neighbours.
      const tri = [...E.stageTriangles(l).values()];
      const worst3 = Math.max(...tri.map((_, i) => (tri[i] ?? 0) + (tri[i + 1] ?? 0) + (tri[i + 2] ?? 0)));
      const limit = quality === 'low' ? 1_100_000 : 3_500_000;
      assert.ok(worst3 <= limit, `${s.id} ${quality}: ${worst3} triangles for 3 stages`);
    }
  }
});

test('C1.4 sizes: flat or long things by their longest side, upright ones by height, real sizes for known ones', () => {
  const s = scenarios.find((x) => x.id === 'camp-01')!;
  const l = layout(s);
  for (const p of l.placements) {
    if (['rock', 'water', 'bush', 'prop', 'structure', 'backdrop'].includes(p.category)) assert.equal(p.fit, p.libraryId === 'river_sign' || /barrel|stump|well|watchtower|fort|waterfall/.test(p.libraryId) ? 'height' : 'max', p.libraryId);
    if (['tree', 'character', 'creature', 'reed'].includes(p.category)) assert.equal(p.fit, 'height', p.libraryId);
    if (p.category === 'ground') assert.equal(p.fit, 'width');
    assert.ok(p.size > 0.1 && p.size < 40, `${p.libraryId}: ${p.size} m`);
  }
  const dino = layout(scenarios.find((x) => x.id === 'dino-02')!);
  const rex = dino.placements.find((p) => /^dino_trex/.test(p.libraryId));
  if (rex) assert.equal(rex.size, 4);
});

