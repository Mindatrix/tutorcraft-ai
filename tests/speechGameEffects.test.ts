import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { DEFAULT_SPEECH_RULES, SPEECH_GAME_HOOKS, petStateFor, rageAddCharge, rageInit, rageStart, rageTick, speechGameEffect, type Question } from '../src/engine';
import { MemorySpeechStore, createSpeechService, type SpeechContext } from '../src/server/speech';

// WP8: the in-world effect of a successful pronunciation attempt is decided on the server.

const base = { success: true, prevBestStars: 0, bestStars: 1, alreadyDone: false, doneBefore: 0, flagged: false };

describe('speechGameEffect (pure)', () => {
  it('kayak_rush: Nitro charge for the step up to a better star level only', () => {
    assert.deepStrictEqual(speechGameEffect({ ...base, game: 'kayak_rush', bestStars: 1 }), { kind: 'kayak_nitro', chargeSec: 4, pet: 'celebrate' });
    assert.deepStrictEqual(speechGameEffect({ ...base, game: 'kayak_rush', prevBestStars: 1, bestStars: 3 }), { kind: 'kayak_nitro', chargeSec: 4, pet: 'celebrate' }); // 8 − 4
    assert.strictEqual(speechGameEffect({ ...base, game: 'kayak_rush', prevBestStars: 3, bestStars: 3 }), null); // no farming
  });

  it('river_survival: distinct stones unlock the Wooden Pen clue, then the Tag Net clue', () => {
    const e1 = speechGameEffect({ ...base, game: 'river_survival', doneBefore: 0 });
    assert.deepStrictEqual(e1 && e1.kind === 'decoder_clue' && [e1.solved, e1.newlyUnlocked, e1.nextAt, e1.unlocked], [1, null, 2, []]);
    const e2 = speechGameEffect({ ...base, game: 'river_survival', doneBefore: 1 });
    assert.deepStrictEqual(e2 && e2.kind === 'decoder_clue' && [e2.solved, e2.newlyUnlocked, e2.unlocked], [2, 'pen', ['pen']]);
    const e4 = speechGameEffect({ ...base, game: 'river_survival', doneBefore: 3 });
    assert.deepStrictEqual(e4 && e4.kind === 'decoder_clue' && [e4.newlyUnlocked, e4.unlocked, e4.nextAt], ['net', ['pen', 'net'], null]);
    // The same stone again never counts twice.
    assert.strictEqual(speechGameEffect({ ...base, game: 'river_survival', alreadyDone: true, doneBefore: 1 }), null);
  });

  it('multiverse_portal: the first pass on an altar stone opens the portal, Lumi celebrates', () => {
    assert.deepStrictEqual(speechGameEffect({ ...base, game: 'multiverse_portal' }), { kind: 'portal_open', pet: 'celebrate' });
    assert.strictEqual(speechGameEffect({ ...base, game: 'multiverse_portal', alreadyDone: true }), null);
  });

  it('a miss, a flagged attempt, or a world without a hook does nothing', () => {
    assert.strictEqual(speechGameEffect({ ...base, game: 'kayak_rush', success: false, bestStars: 0 }), null);
    assert.strictEqual(speechGameEffect({ ...base, game: 'multiverse_portal', flagged: true }), null);
    assert.strictEqual(speechGameEffect({ ...base, game: 'summer_camp' }), null);
    assert.strictEqual(speechGameEffect({ ...base, game: null }), null);
  });

  it('rageAddCharge fills the bar, caps at full, and waits while boosting', () => {
    const s = rageAddCharge(rageInit(), 6);
    assert.strictEqual(Number(s.meter.toFixed(3)), 0.2); // 6 / 30 s
    assert.strictEqual(rageAddCharge({ ...s, meter: 0.95 }, 8).meter, 1);
    const boosting = rageStart(rageTick(rageInit(), 30), false);
    assert.strictEqual(boosting.boosting, true);
    assert.strictEqual(rageAddCharge(boosting, 8), boosting);
    assert.strictEqual(rageAddCharge(s, -5), s);
  });

  it('pet poses follow the stone state machine and are never sad', () => {
    assert.strictEqual(petStateFor('modeling'), 'coach');
    assert.strictEqual(petStateFor('listening'), 'listening');
    assert.strictEqual(petStateFor('passed'), 'celebrate');
    assert.strictEqual(petStateFor('retry', 'mouth_shape'), 'coach');
    assert.strictEqual(petStateFor('retry'), 'idle');
    assert.ok(SPEECH_GAME_HOOKS.maxStonesPerScene <= 12);
  });
});

describe('speech service returns the effect (server-decided)', () => {
  const questions: Question[] = ['fish', 'river', 'tent', 'light', 'bread'].map((w, i) => ({
    id: i + 1, question: `Which word is "${w}"?`, options: [w, 'x'], correct_idx: 0, difficulty: 'easy', topic: 'v', skill_tag: 'vocabulary',
  })) as Question[];
  const ctx = (game: string, sessionId: string): SpeechContext => ({
    sessionId, battleId: 'demo-' + game, studentKey: 'k-' + sessionId, matchId: null, status: 'active', level: 1, questions, answeredIds: [1, 2, 3, 4, 5], game,
  });
  const svc = () => {
    const store = new MemorySpeechStore();
    return createSpeechService({ storeFor: () => store, rewards: () => null, rules: () => DEFAULT_SPEECH_RULES, voiceEnabled: () => true });
  };

  it('kayak: a spoken pass carries a Nitro charge; the client cannot forge one', async () => {
    const s = svc();
    const r = await s.submit(ctx('kayak_rush', 's1'), { targetId: 'q1w', mode: 'shadow', transcript: 'fish', confidence: 0.99, durationMs: 800, effect: { kind: 'kayak_nitro', chargeSec: 999 } });
    assert.strictEqual(r.passed, true);
    assert.deepStrictEqual(r.effect, { kind: 'kayak_nitro', chargeSec: 8, pet: 'celebrate' });
    const miss = await s.submit(ctx('kayak_rush', 's1'), { targetId: 'q2w', mode: 'shadow', transcript: 'zebra', durationMs: 800 });
    assert.strictEqual(miss.effect, undefined);
  });

  it('river_survival: typed and tapped fallbacks earn the same clue progress as speaking', async () => {
    const s = svc();
    const c = ctx('river_survival', 's2');
    const a = await s.submit(c, { targetId: 'q1w', mode: 'dictate', typed: 'fish' });
    assert.strictEqual(a.effect?.kind === 'decoder_clue' && a.effect.solved, 1);
    const b = await s.submit(c, { targetId: 'q2w', mode: 'repeat' });
    assert.strictEqual(b.effect?.kind === 'decoder_clue' && b.effect.newlyUnlocked, 'pen');
    const again = await s.submit(c, { targetId: 'q2w', mode: 'dictate', typed: 'river' });
    assert.strictEqual(again.effect, undefined); // same stone, no second clue
  });

  it('pays coins for a real class session but never for the demo (nothing stored)', async () => {
    const paid: string[] = [];
    const fakeRewards = { speech: async (a: { sessionId: string; coins: number }) => (paid.push(a.sessionId), { ok: true, code: 'ok', applied: a.coins, balance: a.coins }) };
    const store = new MemorySpeechStore();
    const rules = { ...DEFAULT_SPEECH_RULES, coinsByStars: [0, 3, 5, 8] as [number, number, number, number] };
    const s = createSpeechService({ storeFor: () => store, rewards: () => fakeRewards as never, rules: () => rules, voiceEnabled: () => true });
    const demo = await s.submit(ctx('kayak_rush', 'demo-s'), { targetId: 'q1w', mode: 'dictate', typed: 'fish' });
    assert.strictEqual(demo.coins, undefined);
    const real = await s.submit({ ...ctx('kayak_rush', 'real-s'), battleId: '7f1c0000-0000-4000-8000-000000000001' }, { targetId: 'q1w', mode: 'dictate', typed: 'fish' });
    assert.strictEqual(real.coins, 8);
    assert.deepStrictEqual(paid, ['real-s']);
  });

  it('multiverse: first pass opens the portal once', async () => {
    const s = svc();
    const c = ctx('multiverse_portal', 's3');
    const first = await s.submit(c, { targetId: 'q3w', mode: 'shadow', transcript: 'tent', durationMs: 700 });
    assert.deepStrictEqual(first.effect, { kind: 'portal_open', pet: 'celebrate' });
    const second = await s.submit(c, { targetId: 'q3w', mode: 'shadow', transcript: 'tent', durationMs: 700 });
    assert.strictEqual(second.effect, undefined);
  });
});
