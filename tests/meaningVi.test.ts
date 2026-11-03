import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as E from '../src/engine';
import { buildBattlePrompt } from '../src/server/prompt';

// WP7: optional "meaning_vi" on questions (Vietnamese meaning, for the tier-1 hint). Questions
// are stored as jsonb, so no table changes; old questions without it keep using `hint`.

const base = { question: 'She _____ to London three times this year.', options: ['has been', 'went', 'has gone'], correct_idx: 0, difficulty: 'medium', topic: 'present perfect', skill_tag: 'grammar' };

describe('meaning_vi (Vietnamese meaning for the tier-1 hint)', () => {
  it('is kept by the sanitiser and is optional', () => {
    const q = E.sanitizeQuestion({ ...base, hint: 'Trải nghiệm tới bây giờ.', meaning_vi: 'Năm nay cô ấy … tới London ba lần.' }, 1)!;
    assert.strictEqual(q.meaning_vi, 'Năm nay cô ấy … tới London ba lần.');
    const old = E.sanitizeQuestion({ ...base, hint: 'Trải nghiệm tới bây giờ.' }, 2)!;
    assert.strictEqual(old.meaning_vi, undefined);
    assert.strictEqual(E.sanitizeQuestion({ ...base, meaning_vi: '' }, 3)!.meaning_vi, undefined);
  });

  it('tier-1 hint shows meaning_vi first, then the old hint, then the topic', () => {
    const q = E.sanitizeQuestion({ ...base, hint: 'Gợi ý cũ', meaning_vi: 'Nghĩa tiếng Việt' }, 1)!;
    assert.deepStrictEqual(E.hintFor(q, 1, 's'), { tier: 1, meaning: 'Nghĩa tiếng Việt' });
    assert.deepStrictEqual(E.hintFor({ ...q, meaning_vi: undefined }, 1, 's'), { tier: 1, meaning: 'Gợi ý cũ' });
    assert.deepStrictEqual(E.hintFor({ ...q, meaning_vi: undefined, hint: undefined }, 1, 's'), { tier: 1, meaning: 'Chủ đề: present perfect' });
  });

  it('never reaches the student with the question (server only until the hint is bought)', () => {
    const q = E.sanitizeQuestion({ ...base, meaning_vi: 'Nghĩa' }, 1)!;
    const ctx = { questions: [q], config: { ...E.DEMO_CONFIG, mode: 'standard' as const }, scaling: E.computeScaling({ ...E.DEMO_CONFIG }, 1, [q]) };
    const s = E.battleReducer(ctx)(E.initialBattleState(ctx), { type: 'START' });
    assert.ok(!JSON.stringify(E.publicQuestion(ctx, s)).includes('Nghĩa'));
  });

  it('Gemini is asked for it (schema field, required so it is not dropped) and told not to give the answer', () => {
    const item = E.GEMINI_RESPONSE_SCHEMA.properties.questions.items;
    assert.ok('meaning_vi' in item.properties);
    assert.ok((item.required as readonly string[]).includes('meaning_vi'));
    const p = buildBattlePrompt({ topic: 'Travel', config: E.normalizeConfig({ level: 2, questionTypes: ['mcq'] }), questionCount: 5, hasInlineDocument: false, reviewTopics: [], reviewCount: 0 });
    assert.match(p, /"meaning_vi"/);
    assert.match(p, /must NOT contain the correct English answer/);
  });

  it('every built-in fallback mcq has a Vietnamese meaning that does not quote its answer', () => {
    const qs = E.fallbackPayload(E.FALLBACK_BANK_SIZE, 'meaning').questions;
    assert.strictEqual(E.BANK_MEANING_COUNT, E.FALLBACK_BANK_SIZE);
    for (const q of qs) {
      assert.ok(q.meaning_vi && q.meaning_vi.length > 5, `meaning for "${q.question}"`);
      const answer = q.options[q.correct_idx].toLowerCase();
      assert.ok(!q.meaning_vi.toLowerCase().includes(answer), `"${q.meaning_vi}" quotes the answer "${answer}"`);
    }
  });
});
