import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { normalizeSpeech } from '../src/engine/pronunciation';
import { BASE_STONE_XP, createFallbackEngineState, evaluateFallbackSubmission, recordSpeechEvaluationAttempt, type QuestStoneDefinition } from '../src/engine/questStateMachine';

// PR #6 integration (03/11): the Multiverse quest routes mv-01..mv-05 in content/multiverse_quests.json
// and the quest fields merged into content/scenarios_v2.json (and its generator copy).

type Json = Record<string, unknown>;
const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const quests = read('content/multiverse_quests.json');
const scenarios = read('content/scenarios_v2.json') as Json[];
const generator = read('scripts/scenarios-v2/scenarios_v2.json') as Json[];
const ROUTES = ['mv-01', 'mv-02', 'mv-03', 'mv-04', 'mv-05'];
const STAGES = ['EXPLORATION', 'INVESTIGATION', 'PUZZLE_DEDUCTION', 'PHONETIC_CHALLENGE', 'PORTAL_CHARGING', 'PORTAL_STABILIZED', 'WARP_TRANSITION'];
const tidy = (s: string) => normalizeSpeech(s);

describe('Multiverse quest routes mv-01..mv-05', () => {
  const routes = quests.routes as Json[];

  it('five routes, chained mv-01 → … → mv-05 → end, rules as the design says', () => {
    assert.deepStrictEqual(routes.map((r) => r.id), ROUTES);
    assert.deepStrictEqual(routes.map((r) => r.next), ['mv-02', 'mv-03', 'mv-04', 'mv-05', null]);
    assert.deepStrictEqual(quests.rules, { maxSpeechAttempts: 3, fallbackXpRatio: 0.8, quorumRatio: 0.6, maxSquad: 50 });
  });

  it('every stone: IPA, stress per syllable, Vietnamese meaning and mouth tip, both fallbacks consistent', () => {
    const ids = new Set<string>();
    for (const r of routes) {
      for (const s of r.stones as Json[]) {
        const id = String(s.targetId);
        assert.ok(!ids.has(id), `duplicate stone ${id}`);
        ids.add(id);
        assert.match(String(s.ipa), /^\/.+\/$/, `${id} IPA between slashes`);
        const stress = s.stress as { syllable: string; stress: string }[];
        assert.ok(stress.length > 0 && stress.every((x) => ['primary', 'secondary', 'none'].includes(x.stress)), `${id} stress`);
        assert.ok(stress.some((x) => x.stress === 'primary'), `${id} has a primary stress`);
        assert.ok(String(s.meaning_vi).length > 3 && String(s.mouthTipVi).length > 3, `${id} Vietnamese help`);
        const fb = s.fallback as { dictation: { answer: string; accept?: string[] }; tiles: { tiles: string[]; solution: string[] } };
        // Path A (typed dictation): the answer is the spoken text; every listed variant is accepted by the engine.
        assert.strictEqual(tidy(fb.dictation.answer), tidy(String(s.text)), `${id} dictation answer = stone text`);
        const stone = s as unknown as QuestStoneDefinition;
        for (const typedText of [fb.dictation.answer, ...(fb.dictation.accept ?? [])]) {
          assert.ok(evaluateFallbackSubmission(createFallbackEngineState(id), stone, { path: 'PATH_A_DICTATION', typedText }).passed, `${id} accepts "${typedText}"`);
        }
        // Path B (tile sort): the solution uses exactly the tiles shown and reads as the text.
        assert.deepStrictEqual([...fb.tiles.tiles].sort(), [...fb.tiles.solution].sort(), `${id} tiles = solution set`);
        assert.notDeepStrictEqual(fb.tiles.tiles, fb.tiles.solution, `${id} tiles start shuffled`);
        assert.strictEqual(tidy(fb.tiles.solution.join(' ')), tidy(String(s.text)), `${id} solution reads as the text`);
      }
    }
    assert.strictEqual(ids.size, 10);
  });

  it('3 failed speech attempts open the fallback; solving it (typed or tiles) unlocks the stone at 80% XP — every stone', () => {
    for (const r of routes) {
      for (const raw of r.stones as Json[]) {
        const stone = raw as unknown as QuestStoneDefinition;
        for (const path of ['PATH_A_DICTATION', 'PATH_B_TILE_SORT'] as const) {
          let st = createFallbackEngineState(stone.targetId);
          for (let i = 1; i <= 3; i++) {
            assert.strictEqual(st.fallbackActive, false, `${stone.targetId}: no fallback before attempt ${i}`);
            st = recordSpeechEvaluationAttempt(st, false, path);
          }
          assert.strictEqual(st.fallbackActive, true, `${stone.targetId}: fallback after 3 misses`);
          assert.strictEqual(st.activePath, path);
          assert.strictEqual(st.unlocked, false);
          const wrong = path === 'PATH_A_DICTATION'
            ? evaluateFallbackSubmission(st, stone, { path, typedText: 'banana' })
            : evaluateFallbackSubmission(st, stone, { path, orderedTiles: stone.fallback.tiles.tiles });
          assert.strictEqual(wrong.passed, false, `${stone.targetId} ${path}: wrong answer does not unlock`);
          const right = path === 'PATH_A_DICTATION'
            ? evaluateFallbackSubmission(wrong.state, stone, { path, typedText: stone.fallback.dictation.answer })
            : evaluateFallbackSubmission(wrong.state, stone, { path, orderedTiles: stone.fallback.tiles.solution });
          assert.strictEqual(right.passed, true);
          assert.strictEqual(right.state.unlocked, true);
          assert.strictEqual(right.awardedXp, Math.round(BASE_STONE_XP * 0.8));
        }
      }
    }
  });

  it('objects follow the quest stages; each route has a portal archway to traverse', () => {
    for (const r of routes) {
      const objects = r.objects as Json[];
      for (const o of objects) assert.ok(STAGES.includes(String(o.stage)), `${r.id} ${o.objectId} stage ${o.stage}`);
      assert.ok(objects.some((o) => o.anchor === 'portal_archway' && o.action === 'traverse'), `${r.id} portal`);
      assert.ok(objects.some((o) => o.action === 'speak'), `${r.id} stone pedestal`);
      const p = r.puzzle as { options: string[]; correctIdx: number };
      assert.ok(Number.isInteger(p.correctIdx) && p.correctIdx >= 0 && p.correctIdx < p.options.length, `${r.id} puzzle answer index`);
    }
  });
});

describe('scenarios_v2.json carries the quest route (ids only, no answers)', () => {
  it('each mv scenario maps to its route, grammar, objects, stones and next stage', () => {
    const routes = new Map((quests.routes as Json[]).map((r) => [r.id as string, r]));
    for (const id of ROUTES) {
      const sc = scenarios.find((s) => s.id === id)!;
      const q = sc.quest as { route: string; grammar: { key: string; label_vi: string }; objects: { objectId: string }[]; stones: { targetId: string }[]; next: string | null };
      const r = routes.get(id)!;
      assert.strictEqual(q.route, id);
      assert.deepStrictEqual(q.grammar, { key: (r.grammar as Json).key, label_vi: (r.grammar as Json).label_vi });
      assert.deepStrictEqual(q.objects.map((o) => o.objectId), (r.objects as Json[]).map((o) => o.objectId));
      assert.deepStrictEqual(q.stones.map((s) => s.targetId), (r.stones as Json[]).map((s) => s.targetId));
      assert.strictEqual(q.next, r.next);
      // Roles: every mv scenario still has its 12 story characters.
      assert.strictEqual((sc.characters as Json[]).length, 12, `${id} characters`);
    }
  });

  it('no answer key reaches the scenario file (it is served to browsers)', () => {
    const text = JSON.stringify(scenarios.filter((s) => String(s.id).startsWith('mv-')).map((s) => s.quest));
    assert.doesNotMatch(text, /correctIdx|solution|dictation|"answer"|accept/);
  });

  it('content/ and the generator copy in scripts/scenarios-v2 stay identical', () => {
    assert.deepStrictEqual(generator, scenarios);
  });
});
