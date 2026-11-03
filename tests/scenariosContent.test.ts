import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_MODE_IDS, isGameMode, planRun, runPlanEventIds, type GameMode } from '../src/engine';

interface Stage { n: number; minutes: number; optional: boolean; question_hook: string; assets: string[] }
interface Scenario { id: string; game: string; seq: number; tags: string[]; stages: Stage[]; characters: unknown[]; asset_ids: string[] }

const scenarios: Scenario[] = JSON.parse(readFileSync(join(process.cwd(), 'content/scenarios_v2.json'), 'utf8'));

test('scenario set v2: 6 worlds × 5 scenarios, 12 characters, 6 × 5-minute stages + 2 optional', () => {
  assert.equal(scenarios.length, 30);
  for (const g of GAME_MODE_IDS) assert.deepEqual(scenarios.filter((s) => s.game === g).map((s) => s.seq).sort(), [1, 2, 3, 4, 5], g);
  for (const s of scenarios) {
    assert.ok(isGameMode(s.game), s.id);
    assert.equal(s.characters.length, 12, s.id);
    const core = s.stages.filter((x) => !x.optional);
    assert.equal(core.length, 6, s.id);
    assert.equal(core.reduce((m, x) => m + x.minutes, 0), 30, s.id);
    assert.equal(s.stages.filter((x) => x.optional).length, 2, s.id);
    for (const st of s.stages) assert.ok(st.question_hook.length > 10, `${s.id} stage ${st.n} needs a question hook`);
  }
});

test('every scenario gets a valid, varied random-event plan', () => {
  for (const s of scenarios) {
    const species = s.asset_ids.filter((a) => a.startsWith('fish_') && !['fish_rod', 'fish_reel', 'fish_hook', 'fish_bobber', 'fish_bait', 'fish_net', 'fish_tackle_box', 'fish_bucket', 'fish_record_board', 'fish_scale'].includes(a));
    const runs = Array.from({ length: 10 }, (_, i) => planRun({ game: s.game as GameMode, scenarioId: s.id, tags: s.tags, seedKey: `t#${i}`, species }));
    assert.ok(new Set(runs.map((r) => runPlanEventIds(r).join())).size >= 7, `${s.id}: 10 runs should rarely repeat`);
    if (s.tags.includes('weather_locked')) assert.ok(runs.every((r) => r.weather === null), s.id);
    if (s.game === 'river_fishing') assert.ok(runs.every((r) => r.featuredSpecies && species.includes(r.featuredSpecies)), s.id);
  }
});

// Re-enabled 03/11 evening: Claude chat gave every library model a scenario.
test('asset catalog: every model in the 3D folder is used by at least one scenario', () => {
  const catalog: { id: string; scope: string }[] = JSON.parse(readFileSync(join(process.cwd(), 'content/asset_catalog.json'), 'utf8'));
  const used = new Set(scenarios.flatMap((s) => s.asset_ids));
  assert.ok(catalog.length >= 200);
  // biến thể: hậu tố __altN hoặc _N cùng nhóm với id gốc
  const stem = (id: string) => id.replace(/__alt\d+$/, '').replace(/_\d+$/, '');
  const usedStems = new Set([...used].map(stem));
  // Multiverse rooms are used through content/multiverse_rooms.json, not scenario asset lists.
  const rooms: string[] = (JSON.parse(readFileSync(join(process.cwd(), 'content/multiverse_rooms.json'), 'utf8')).rooms ?? []).map((r: { id: string }) => r.id);
  const isRoom = (id: string) => rooms.some((r) => id === r || id.startsWith(`${r}_`));
  const orphans = catalog.filter((c) => !used.has(c.id) && !usedStems.has(stem(c.id)) && !isRoom(c.id)).map((c) => c.id);
  assert.deepEqual(orphans, []);
});

test('all 30 scenarios: every stage carries level-aware subtitle lines (1+ English term each, parts rebuild the Vietnamese line)', () => {
  type Line = { en: string; vi: string; parts: (string | [string, string, number])[] };
  for (const s of scenarios as unknown as { id: string; stages: { n: number; subtitles?: Line[] }[] }[]) {
    assert.equal(s.stages.length, 8, s.id);
    for (const st of s.stages) {
      assert.ok(st.subtitles && st.subtitles.length >= 1, `${s.id} stage ${st.n}`);
      for (const l of st.subtitles) {
        assert.ok(l.en.length > 0 && l.vi.length > 0, s.id);
        assert.ok(l.parts.some((p) => typeof p !== 'string'), `${s.id} stage ${st.n}: no keyword`);
        assert.equal(l.parts.map((p) => (typeof p === 'string' ? p : p[1])).join(''), l.vi, s.id);
        assert.ok(!/[{}|]/.test(l.vi + l.en), `${s.id}: leftover markup`);
      }
    }
  }
});

test('dino journey: every stage carries level-aware subtitle lines', () => {
  const dino = scenarios.filter((s) => s.game === 'dino_journey') as unknown as { id: string; stages: { subtitles?: { en: string; vi: string }[] }[] }[];
  assert.equal(dino.length, 5);
  for (const s of dino) for (const st of s.stages) {
    assert.ok(st.subtitles && st.subtitles.length >= 1, s.id);
    for (const l of st.subtitles) assert.ok(l.en.length > 0 && l.vi.length > 0, s.id);
  }
});
