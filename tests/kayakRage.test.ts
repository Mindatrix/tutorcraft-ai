import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine';

const cfg = E.KAYAK_RAGE;
const tick = (s: E.RageState, sec: number) => {
  for (let i = 0; i < Math.round(sec * 10); i++) s = E.rageTick(s, 0.1);
  return s;
};

test('U5 rage: config stays under the PDF upper bound (charge 30 s / boost 30 s)', () => {
  assert.ok(cfg.chargeSec > 0 && cfg.chargeSec <= 30);
  assert.ok(cfg.maxBoostSec > cfg.longUseSec && cfg.maxBoostSec <= 30, 'a full bar can go past the long-use mark');
  assert.ok(cfg.longRefillSec >= cfg.shortRefillMaxSec && cfg.minRefillSec <= cfg.shortRefillMaxSec);
});

test('U5 rage: fills in chargeSec, never starts while a question is open', () => {
  let s = E.rageInit();
  s = tick(s, cfg.chargeSec - 1);
  assert.ok(s.meter < 1);
  assert.equal(E.rageStart(s, false).boosting, false, 'not full yet');
  s = tick(s, 1.1);
  assert.equal(s.meter, 1);
  assert.equal(E.rageStart(s, true).boosting, false, 'question frame open');
  assert.equal(E.rageStart(s, false).boosting, true);
});

test('U5 rage: a full boost drains in maxBoostSec, then the long refill applies (over 10 s)', () => {
  let s = E.rageStart(tick(E.rageInit(), cfg.chargeSec + 0.2), false);
  s = tick(s, cfg.maxBoostSec + 0.2);
  assert.equal(s.boosting, false, 'stops by itself when empty');
  assert.ok(s.meter < 0.01, 'empty (just started refilling)');
  assert.equal(s.lastRefillSec, cfg.longRefillSec);
  s = tick(s, cfg.longRefillSec - 1);
  assert.ok(s.meter < 1);
  s = tick(s, 1.1);
  assert.equal(s.meter, 1);
});

test('U5 rage: stopping early refills in proportion (≤ shortRefillMaxSec), with a floor', () => {
  assert.equal(E.rageRefillSec(cfg.longUseSec), cfg.shortRefillMaxSec);
  assert.equal(E.rageRefillSec(cfg.longUseSec + 0.04), cfg.shortRefillMaxSec, 'a frame over 10 s still counts as 10 s');
  assert.equal(E.rageRefillSec(cfg.longUseSec + 0.5), cfg.longRefillSec);
  assert.equal(E.rageRefillSec(0.2), cfg.minRefillSec);
  const half = E.rageRefillSec(cfg.longUseSec / 2);
  assert.ok(half < cfg.shortRefillMaxSec && half >= cfg.minRefillSec);
  let s = E.rageStart(tick(E.rageInit(), cfg.chargeSec + 0.2), false);
  s = E.rageStop(tick(s, 5));
  assert.equal(s.boosting, false);
  s = tick(s, s.lastRefillSec + 0.2);
  assert.equal(s.meter, 1, 'full again after its refill time');
});

test('U5 rage: simulated race — boosts happen, but not most of the time', () => {
  // 12 questions answered in 6–20 s by a child, 1.4 s between questions.
  const answers = [12, 8, 15, 20, 9, 6, 14, 18, 10, 11, 16, 7];
  for (const use of [5, 10, cfg.maxBoostSec]) {
    const r = E.simulateRage(answers, use);
    assert.ok(r.boosts >= 2, `use ${use}s: ${r.boosts} boosts`);
    assert.ok(r.boostShare < 0.45, `use ${use}s: boosting ${Math.round(r.boostShare * 100)}% of the race`);
  }
  const short = E.simulateRage(answers, 10);
  const long = E.simulateRage(answers, cfg.maxBoostSec);
  assert.ok(short.boosts > long.boosts, 'shorter boosts come back more often (the tactical choice)');
});
