import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as E from '../src/engine';

test('U6 demo: 20 questions from content/demo_questions.json, all valid multiple choice', () => {
  const qs = E.demoQuestions();
  assert.equal(qs.length, 20);
  assert.deepEqual(qs.map((q) => q.id), Array.from({ length: 20 }, (_, i) => i + 1));
  for (const q of qs) {
    assert.ok(!q.type || q.type === 'mcq', `#${q.id} is mcq`);
    assert.ok(q.options.length >= 2 && q.correct_idx >= 0 && q.correct_idx < q.options.length, `#${q.id} answer index`);
    assert.ok(q.explanation && q.explanation.length > 5, `#${q.id} explains the answer (Vietnamese meaning)`);
  }
});

test('U6 demo: one battle id per game, each plays its own world', () => {
  for (const g of E.GAME_MODE_IDS) {
    const id = E.demoBattleId(g);
    assert.ok(E.isDemoBattleId(id));
    assert.equal(E.demoGameOf(id), g);
    const b = E.demoBattle(g);
    assert.equal(E.resolveGameMode(b.config), g, `${g} config resolves to its world`);
    assert.equal(b.payload.questions.length, 20);
  }
  assert.equal(E.demoBattle(E.GameMode.KAYAK_RUSH_3D).config.scenario, 'boat_race');
  assert.ok(E.isDemoBattleId('demo'), 'old links still work');
  assert.equal(E.demoGameOf('demo'), E.DEMO_DEFAULT_GAME);
  for (const bad of ['demo-', 'demo-chess', 'demox', '', null, 7]) assert.equal(E.isDemoBattleId(bad), false, String(bad));
});

test('U6 demo characters: every casting entry except the hidden ones, each with a card image', () => {
  const all = E.demoCharacters();
  assert.ok(all.length >= 55, `${all.length} characters`);
  assert.equal(new Set(all.map((c) => c.id)).size, all.length, 'unique ids');
  assert.equal(new Set(all.map((c) => c.model)).size, all.length, 'no two cards share a model');
  for (const id of Object.keys(E.DEMO_HIDDEN_CHARACTERS)) assert.ok(!all.some((c) => c.id === id), `${id} hidden`);
  for (const c of all) {
    assert.ok(c.name.length > 1 && c.emoji.length <= 8);
    assert.ok(existsSync(`public${c.thumb}`), `thumbnail for ${c.id}`);
  }
});
