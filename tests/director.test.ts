import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOARD_LOD, STUDENT_LOD, WEAK_STUDENT_LOD, cameraMove, effectKnown, effectRecipe, lodLevels } from '../src/engine';

const consequences = readFileSync('content/consequences_v2.json', 'utf8');
const names = (field: string) => Array.from(new Set([...consequences.matchAll(new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`, 'g'))].map((m) => m[1])));

test('C4 groundwork: every effect named in consequences_v2.json has a recipe (none falls to the default)', () => {
  const effects = names('effect');
  assert.ok(effects.length >= 50, `${effects.length} effects`);
  const unknown = effects.filter((e) => !effectKnown(e));
  assert.deepEqual(unknown, [], `no rule for: ${unknown.join(', ')}`);
  assert.equal(effectRecipe('food_burnt_smoke').kind, 'smoke');
  assert.equal(effectRecipe('boat_flip_drift_back').kind, 'splash');
  assert.equal(effectRecipe('glitch_flickers').kind, 'glitch');
  assert.equal(effectRecipe('food_cooked_perfect').kind, 'burst');
  assert.equal(effectRecipe('meat_drops_ground').kind, 'puff');
});

test('C4 groundwork: every camera move named in consequences_v2.json is understood', () => {
  const moves = names('camera');
  assert.ok(moves.length >= 10);
  for (const m of moves) assert.ok(cameraMove(m), m);
  assert.deepEqual(cameraMove('zoom_grill'), { kind: 'dolly', anchor: 'grill', strength: 1, hold: 1 });
  assert.equal(cameraMove('shake_big')?.kind, 'shake');
  assert.equal(cameraMove('nonsense'), null);
});

test('C2 avatar LOD: full models for the nearest few, light models next, name + colour beyond', () => {
  const d = Array.from({ length: 50 }, (_, i) => i * 2 + 1); // 1 m … 99 m
  const s = lodLevels(d, STUDENT_LOD);
  assert.equal(s.filter((x) => x === 'near').length, STUDENT_LOD.near);
  assert.equal(s.filter((x) => x === 'mid').length, STUDENT_LOD.mid);
  assert.deepEqual(s.slice(0, STUDENT_LOD.near), Array(STUDENT_LOD.near).fill('near'), 'closest are full models');
  assert.equal(s[49], 'far');
  // Beyond the distance cap even the closest are name + colour.
  assert.deepEqual(lodLevels([100, 120], STUDENT_LOD), ['far', 'far']);
  assert.ok(WEAK_STUDENT_LOD.near < STUDENT_LOD.near && WEAK_STUDENT_LOD.mid < STUDENT_LOD.mid);
  const b = lodLevels(d, BOARD_LOD);
  assert.deepEqual([b.filter((x) => x === 'near').length, b.filter((x) => x === 'mid').length, b.filter((x) => x === 'far').length], [14, 24, 12]);
  // Order of the input is kept (levels follow the avatar, not the sorted list).
  assert.deepEqual(lodLevels([50, 1, 30], { near: 1, mid: 1 }), ['far', 'near', 'mid']);
});
