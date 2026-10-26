import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_MODE_IDS, GameMode, RUN_EVENTS, planRun, runEventById, runEventsFor, runPlanEventIds } from '../src/engine';

const S = (game: GameMode, tags: string[] = [], seedKey = 'battle-1#1', extra = {}) =>
  planRun({ game, scenarioId: `${game}-x`, tags, seedKey, ...extra });

test('run events: unique ids, every world has events and finales', () => {
  assert.equal(new Set(RUN_EVENTS.map((e) => e.id)).size, RUN_EVENTS.length);
  for (const g of GAME_MODE_IDS) {
    const pool = runEventsFor(g);
    assert.ok(pool.filter((e) => e.kind === 'event').length >= 8, g);
    assert.ok(pool.filter((e) => e.kind === 'finale').length >= 2, g);
    assert.ok(pool.filter((e) => e.kind === 'weather').length >= 3, g);
  }
  // Multiverse keeps its fantasy weather, not the river pack.
  assert.ok(!runEventsFor(GameMode.MULTIVERSE_PORTAL_RPG).some((e) => e.game === 'river'));
  assert.ok(!runEventsFor(GameMode.DINO_JOURNEY).some((e) => e.game === 'river'), 'dino has its own prehistoric weather');
});

test('planRun is deterministic per match and differs between matches', () => {
  assert.deepEqual(S(GameMode.RIVER_SURVIVAL), S(GameMode.RIVER_SURVIVAL));
  const plans = Array.from({ length: 20 }, (_, i) => JSON.stringify(S(GameMode.RIVER_SURVIVAL, [], `battle-${i}#1`).stages));
  assert.ok(new Set(plans).size >= 15, 'twenty matches should give (almost) twenty different runs');
});

test('planRun shape: stage 1 calm, 2+ twists in stages 2-5, one finale, no repeats', () => {
  for (const g of GAME_MODE_IDS) {
    for (let i = 0; i < 40; i++) {
      const p = S(g, g === GameMode.MULTIVERSE_PORTAL_RPG ? ['castle'] : [], `m${i}`);
      assert.deepEqual(p.stages.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8]);
      assert.equal(p.stages[0].eventId, null);
      assert.ok(p.stages.slice(1, 5).filter((s) => s.eventId).length >= 2, `${g} ${i}`);
      assert.equal(runEventById(p.stages[5].eventId)?.kind, 'finale');
      const ids = runPlanEventIds(p);
      assert.equal(new Set(ids).size, ids.length);
      for (const id of ids) assert.ok(runEventsFor(g).some((e) => e.id === id), id);
      assert.ok(Number.isInteger(p.layoutSeed) && p.layoutSeed >= 0);
    }
  }
});

test('scenario tags: night, fixed weather and world tags are respected', () => {
  for (let i = 0; i < 40; i++) {
    const night = S(GameMode.SUMMER_CAMP_QUESTS, ['night'], `n${i}`);
    for (const id of [night.weather!.start, night.weather!.change?.to, ...runPlanEventIds(night)].filter(Boolean)) {
      const e = runEventById(id)!;
      assert.ok(!e.excludes?.includes('night'), id);
    }
    const day = S(GameMode.RIVER_FISHING, [], `d${i}`);
    for (const id of [day.weather!.start, ...runPlanEventIds(day)]) assert.ok(!runEventById(id)!.requires?.includes('night'), id);
    assert.equal(S(GameMode.RIVER_SURVIVAL, ['weather_locked'], `w${i}`).weather, null);
    const desert = S(GameMode.MULTIVERSE_PORTAL_RPG, ['desert'], `x${i}`);
    assert.ok(['m_sandstorm', 'm_calm'].includes(desert.weather!.start));
  }
});

test('recent events of the class are avoided while the pool allows it', () => {
  const first = S(GameMode.RIVER_FISHING, [], 'class-7#1');
  const recent = runPlanEventIds(first);
  for (let i = 2; i < 12; i++) {
    const next = S(GameMode.RIVER_FISHING, [], `class-7#${i}`, { recent });
    const core = next.stages.slice(1, 5).map((s) => s.eventId).filter(Boolean) as string[];
    assert.ok(core.every((id) => !recent.includes(id)), `run ${i} repeated a recent twist`);
  }
});

test('River Survival twists stay balanced between the two teams', () => {
  for (let i = 0; i < 200; i++) {
    const p = S(GameMode.RIVER_SURVIVAL, [], `bal${i}`);
    const core = p.stages.slice(1, 5).map((s) => runEventById(s.eventId)).filter(Boolean);
    const esc = core.filter((e) => e!.favors === 'escapers').length;
    const pur = core.filter((e) => e!.favors === 'pursuers').length;
    assert.ok(Math.abs(esc - pur) <= 1, `run ${i}: ${esc} vs ${pur}`);
  }
});

test('fishing: a fish of the day from the scenario, never the legendary king salmon', () => {
  const species = ['fish_tilapia', 'fish_basa', 'fish_king_salmon'];
  for (let i = 0; i < 30; i++) {
    const f = S(GameMode.RIVER_FISHING, [], `f${i}`, { species }).featuredSpecies;
    assert.ok(f === 'fish_tilapia' || f === 'fish_basa', String(f));
  }
  assert.equal(S(GameMode.SUMMER_CAMP_QUESTS, [], 'c', { species }).featuredSpecies, null);
});
