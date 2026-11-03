import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import type { SurvivalPublicPlayer } from '../src/engine';
import { placePlayers } from '../src/components/modes/three/RiverSurvival/livePlayers';
import { dinoStageOf, dinoStageQuestions, STAGES } from '../src/components/modes/dinoStages';
import { RIVER_SURVIVAL_ZONES } from '../src/components/modes/three/RiverSurvival/zones';
import { GET as layoutGet } from '../app/api/scenarios/layout/route';

// 03/11 live match: River Survival players drawn from the server's survival state, Dino Journey
// checkpoints per question, and the layout API (asset ids only).

const p = (x: Partial<SurvivalPublicPlayer>): SurvivalPublicPlayer =>
  ({ team: 'escapers', free: true, immuneUntil: 0, frozenUntil: 0, netLostUntil: 0, revealedUntil: 0, stolenNet: null, ...x }) as SurvivalPublicPlayer;

describe('River Survival: the server state decides where everyone stands', () => {
  const slots: [number, number, number][] = [[1, 0, 1], [2, 0, 2], [3, 0, 3]];
  const env = { mainWoodenPen: { slotPositions: slots } } as never;

  it('caught escapers stand in the Wooden Pen, free ones in the clearings, pursuers at the net stations', () => {
    const players = {
      a: p({ free: false }),
      b: p({ free: false }),
      c: p({}),
      h: p({ team: 'pursuers' }),
    };
    const { out, caught } = placePlayers(['a', 'b', 'c', 'h'], players, env, 1000);
    assert.strictEqual(caught, 2);
    const at = (id: string) => out.find((o) => o.id === id)!;
    assert.deepStrictEqual(at('a').pos, [1, 0, 1]);
    assert.deepStrictEqual(at('b').pos, [2, 0, 2]);
    const st = RIVER_SURVIVAL_ZONES[0].netStationPosition;
    assert.ok(Math.hypot(at('h').pos[0] - st[0], at('h').pos[2] - st[2]) < 2, 'pursuer at its net station');
    const z = RIVER_SURVIVAL_ZONES[0].center;
    assert.ok(Math.hypot(at('c').pos[0] - z[0], at('c').pos[2] - z[2]) < 12, 'free escaper in a clearing');
  });

  it('colours: frozen pursuer blue, net holder gold, caught grey', () => {
    const { out } = placePlayers(['f', 'n', 'x'], { f: p({ team: 'pursuers', frozenUntil: 5000 }), n: p({ stolenNet: { owner: 'f', uses: 3, until: 9e9 } as never }), x: p({ free: false }) }, env, 1000);
    assert.deepStrictEqual(out.map((o) => o.color), [0x93c5fd, 0xfacc15, 0x94a3b8]);
  });
});

describe('Dino Journey checkpoints', () => {
  it('6 stages share the questions; every question has exactly one checkpoint stage', () => {
    for (const total of [12, 20, 45]) {
      const seen: number[] = [];
      for (let s = 1; s <= STAGES; s++) {
        const [from, to] = dinoStageQuestions(s, total);
        for (let q = from; q < to; q++) {
          seen.push(q);
          assert.strictEqual(dinoStageOf(q, total), s, `q${q} of ${total} → stage ${s}`);
        }
      }
      assert.deepStrictEqual(seen, Array.from({ length: total }, (_, i) => i));
    }
    assert.strictEqual(dinoStageOf(-1, 20), 1);
    assert.strictEqual(dinoStageOf(99, 20), 6);
  });
});

describe('GET /api/scenarios/layout', () => {
  it('gives the asset ids of a scenario, nothing else; 404 for an unknown one', async () => {
    const r = await layoutGet(new Request('http://x/api/scenarios/layout?id=dino-01', { headers: { 'x-forwarded-for': '10.0.0.1' } }));
    assert.strictEqual(r.status, 200);
    const d = await r.json();
    assert.deepStrictEqual(Object.keys(d).sort(), ['asset_ids', 'game', 'id', 'stages', 'tags']);
    assert.strictEqual(d.game, 'dino_journey');
    assert.ok(d.asset_ids.includes('dino_trex_brown'));
    assert.ok(d.stages.every((s: Record<string, unknown>) => Object.keys(s).sort().join() === 'assets,n'));
    const miss = await layoutGet(new Request('http://x/api/scenarios/layout?id=nope', { headers: { 'x-forwarded-for': '10.0.0.1' } }));
    assert.strictEqual(miss.status, 404);
  });
});
