import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequestedCounts, planFromCounts, clampQuestionCount } from '../src/engine';

test('reads a total', () => {
  assert.equal(parseRequestedCounts('Thì quá khứ, 20 câu').total, 20);
  assert.equal(parseRequestedCounts('past simple 12 questions').total, 12);
});
test('clamps to 2–45', () => {
  assert.equal(parseRequestedCounts('100 câu').total, 45);
  assert.equal(clampQuestionCount(1), 2);
});
test('reads per-format counts and sums them', () => {
  const r = parseRequestedCounts('5 trắc nghiệm, 3 điền từ');
  assert.deepEqual(r.perType, { mcq: 5, cloze: 3 });
  assert.equal(r.total, 8);
});
test('reads "format: n"', () => {
  assert.deepEqual(parseRequestedCounts('đọc hiểu: 2, tự luận 1').perType, { reading: 2, essay: 1 });
});
test('ignores durations and plain text', () => {
  assert.equal(parseRequestedCounts('bài 10 phút').total, undefined);
  assert.equal(parseRequestedCounts('Present perfect').total, undefined);
});
test('planFromCounts honors exact counts', () => {
  const plan = planFromCounts({ mcq: 5, cloze: 3 }, 8);
  assert.equal(plan.filter((t) => t === 'mcq').length, 5);
  assert.equal(plan.filter((t) => t === 'cloze').length, 3);
});
