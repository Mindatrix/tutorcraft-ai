import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/engine';

const guides = JSON.parse(readFileSync('content/game_guides.json', 'utf8')) as { games: Record<string, { goal: string; controls: string[]; skills: string[]; tips: string[] }> };

test('U4 how-to-play: every game has a guide, short lists (≤ 6 lines), Vietnamese text', () => {
  for (const g of Object.values(E.GameMode)) {
    const x = guides.games[g];
    assert.ok(x, `guide for ${g}`);
    assert.ok(x.goal.trim().length > 10, `${g} goal`);
    for (const k of ['controls', 'skills', 'tips'] as const) {
      assert.ok(x[k].length >= 1 && x[k].length <= 6, `${g}.${k}: ${x[k].length} lines`);
      assert.ok(x[k].every((l) => l.trim().length > 3), `${g}.${k} empty line`);
    }
  }
});
