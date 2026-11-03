import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { DEMO_BATTLE_ID } from '../src/engine';
import { answerCoins, demoRewards, rewards, rewardsFor } from '../src/server/rewards';

// Demo sessions (`demo-*`) must never write coins into the real database (coin_wallets / coin_ledger).
// They get an in-memory wallet instead, so the demo still shows coins and can buy hints.

const graded = (battleId: string, studentKey: string, qid: number) => ({
  battleId,
  sessionId: `s-${studentKey}`,
  studentKey,
  matchId: null,
  scored: { correct: true },
  streak: { qid, timeMs: 4000, rightInRow: 1 },
});

describe('demo coins stay in memory', () => {
  it('a demo battle uses the in-memory wallet, never the database service', () => {
    for (const id of [DEMO_BATTLE_ID, 'demo-kayak_rush', 'demo-river_survival']) {
      assert.strictEqual(rewardsFor(id), demoRewards());
      assert.notStrictEqual(rewardsFor(id), rewards());
    }
    // A real class battle goes to the database service (null here: no Supabase in tests).
    assert.strictEqual(rewardsFor('7f1c0000-0000-4000-8000-000000000001'), rewards());
  });

  it('a correct demo answer pays into the memory wallet and the balance reads back', async () => {
    const key = `demo-student-${Date.now()}`;
    const c = await answerCoins(graded('demo-kayak_rush', key, 1));
    assert.ok(c && c.awarded > 0, 'demo still earns coins');
    assert.strictEqual(await demoRewards().balance(key), c!.balance);
    // The same answer is never paid twice.
    const again = await answerCoins(graded('demo-kayak_rush', key, 1));
    assert.strictEqual(again?.awarded ?? 0, 0);
  });

  it('a real battle without a database pays nothing and never touches the demo wallet', async () => {
    const key = `real-student-${Date.now()}`;
    assert.strictEqual(await answerCoins(graded('7f1c0000-0000-4000-8000-000000000001', key, 1)), null);
    assert.strictEqual(await demoRewards().balance(key), 0);
  });
});
