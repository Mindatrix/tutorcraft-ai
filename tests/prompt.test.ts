import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/engine';
import { BEGINNER_RULES, buildBattlePrompt } from '../src/server/prompt';

const prompt = (level: E.DifficultyLevel) =>
  buildBattlePrompt({
    topic: 'Animals',
    config: E.normalizeConfig({ level, questionTypes: ['mcq', 'matching'] }),
    questionCount: 10,
    hasInlineDocument: false,
    reviewTopics: [],
    reviewCount: 0,
  });

test('A1.4: Beginner (level 0) prompt asks for Vietnamese stems and English only in answers', () => {
  const p0 = prompt(0);
  assert.ok(p0.includes(BEGINNER_RULES));
  assert.match(p0, /Pre-A1/);
  assert.match(p0, /difficulty level 0\/5 \(Beginner\)/);
  assert.match(p0, /about 100% easy/);
  for (const lv of [1, 2, 3, 4, 5] as const) assert.ok(!prompt(lv).includes('BEGINNER MODE'), `level ${lv} must not get beginner rules`);
});
