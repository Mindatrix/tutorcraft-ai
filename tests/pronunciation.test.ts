import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  DEFAULT_SPEECH_RULES,
  combineSpeechScore,
  normalizeSpeech,
  passThreshold,
  resolveSpeechRules,
  scoreDictation,
  scoreRepeat,
  scoreSpeech,
  speechAttemptOutcome,
  speechStars,
  type SpeechHistory,
} from '../src/engine/pronunciation';

// TDD suite by Jules (PR #2), rewritten at integration (2026-11-03) to test the engine the server
// really uses (src/engine/pronunciation.ts) instead of a second, parallel implementation. Every case of
// the original suite is kept; two expectations follow the blueprint §3.4 where the original differed:
//  - an exact typed dictation earns the normal stars (100 → 3 ★); only the "almost" case is capped at 1 ★;
//  - the retry policy lets a student keep trying (up to 3) to improve; the best attempt counts.

const start: SpeechHistory = { attempts: 0, misses: 0, bestScore: 0, bestStars: 0 };
/** Plays attempts through the engine's retry policy, like the server does. */
function play(scores: { score: number; passed: boolean }[]) {
  let h = start;
  let last = null as ReturnType<typeof speechAttemptOutcome>;
  for (const s of scores) {
    last = speechAttemptOutcome(h, { ...s, stars: speechStars(s.score, s.passed) });
    if (!last) break;
    h = { attempts: last.attemptNo, misses: h.misses + (s.passed ? 0 : 1), bestScore: last.bestScore, bestStars: last.bestStars };
  }
  return { last, history: h };
}

describe('Pronunciation Engine', () => {
  describe('Normalization', () => {
    it('lowercases text', () => {
      assert.strictEqual(normalizeSpeech('Hello'), 'hello');
    });

    it('removes punctuation', () => {
      assert.strictEqual(normalizeSpeech('Hello, world!'), 'hello world');
    });

    it('expands contractions', () => {
      assert.strictEqual(normalizeSpeech("I don't know"), 'i do not know');
      assert.strictEqual(normalizeSpeech("She can't go"), 'she cannot go');
      assert.strictEqual(normalizeSpeech("It's fine"), 'it is fine');
      assert.strictEqual(normalizeSpeech("I'm happy"), 'i am happy');
      assert.strictEqual(normalizeSpeech("We'll see"), 'we will see');
    });

    it('collapses whitespace', () => {
      assert.strictEqual(normalizeSpeech('hello   world'), 'hello world');
    });

    it('writes digits as words (recognisers often return "3" for "three")', () => {
      assert.strictEqual(normalizeSpeech('3 fish'), 'three fish');
      assert.strictEqual(normalizeSpeech('21'), 'twenty one');
    });
  });

  describe('Scoring Formula', () => {
    it('calculates word score correctly', () => {
      // 0.45 * wordScore + 0.40 * phonemeScore + 0.15 * confScore
      assert.strictEqual(combineSpeechScore({ wordScore: 100, phonemeScore: 100, confScore: 100, kind: 'word' }), 100);
      assert.strictEqual(combineSpeechScore({ wordScore: 50, phonemeScore: 50, confScore: 50, kind: 'word' }), 50);
      // 0.45 * 80 (36) + 0.40 * 90 (36) + 0.15 * 80 (12) = 84
      assert.strictEqual(combineSpeechScore({ wordScore: 80, phonemeScore: 90, confScore: 80, kind: 'word' }), 84);
    });

    it('calculates sentence score correctly', () => {
      // 0.55 * wordScore + 0.30 * phonemeScore + 0.15 * confScore
      assert.strictEqual(combineSpeechScore({ wordScore: 100, phonemeScore: 100, confScore: 100, kind: 'sentence' }), 100);
      // 0.55 * 80 (44) + 0.30 * 90 (27) + 0.15 * 80 (12) = 83
      assert.strictEqual(combineSpeechScore({ wordScore: 80, phonemeScore: 90, confScore: 80, kind: 'sentence' }), 83);
    });

    it('moves the confidence weight to the word score when the browser gives none', () => {
      // word: 0.60 * 80 + 0.40 * 90 = 84 · sentence: 0.70 * 80 + 0.30 * 90 = 83
      assert.strictEqual(combineSpeechScore({ wordScore: 80, phonemeScore: 90, confScore: null, kind: 'word' }), 84);
      assert.strictEqual(combineSpeechScore({ wordScore: 80, phonemeScore: 90, confScore: null, kind: 'sentence' }), 83);
    });

    it('scores real transcripts: the best alternative counts, client numbers never enter', () => {
      assert.strictEqual(scoreSpeech('three', [{ transcript: 'three', confidence: 1 }], 1).score, 100);
      const best = scoreSpeech('three', [{ transcript: 'tree', confidence: 0.9 }, { transcript: 'three', confidence: 0.8 }], 1);
      assert.strictEqual(best.heard, 'three');
      assert.strictEqual(best.passed, true);
      assert.strictEqual(scoreSpeech('three', [{ transcript: 'tree', confidence: 0.7 }], 1).passed, false);
      assert.strictEqual(scoreSpeech('tent', [], 0).score, 0);
    });
  });

  describe('Teaching Level Thresholds', () => {
    it('passes or fails based on level threshold', () => {
      const cases: [number, number][] = [[0, 50], [1, 60], [2, 65], [3, 70], [4, 75], [5, 80]];
      for (const [level, min] of cases) {
        assert.strictEqual(passThreshold(level), min, `level ${level}`);
        assert.ok(min >= passThreshold(level), `level ${level}: ${min} passes`);
        assert.ok(min - 1 < passThreshold(level), `level ${level}: ${min - 1} fails`);
      }
    });

    it('treats a missing or invalid level as B1 (3)', () => {
      assert.strictEqual(passThreshold(undefined), 70);
      assert.strictEqual(passThreshold(9), 70);
    });
  });

  describe('Stars & Retries', () => {
    it('assigns correct stars based on score', () => {
      assert.strictEqual(speechStars(84, true), 1);
      assert.strictEqual(speechStars(85, true), 2);
      assert.strictEqual(speechStars(94, true), 2);
      assert.strictEqual(speechStars(95, true), 3);
      assert.strictEqual(speechStars(100, true), 3);
      assert.strictEqual(speechStars(100, false), 0); // did not pass
    });

    it('evaluates attempts correctly (up to 3, best counts, hint on 2nd miss)', () => {
      let r = play([{ score: 60, passed: false }]);
      assert.strictEqual(r.last?.hint, undefined);
      assert.strictEqual(r.last?.attemptsLeft, 2);

      r = play([{ score: 60, passed: false }, { score: 65, passed: false }]);
      assert.strictEqual(r.last?.hint, 'mouth_shape'); // tier-1 hint on the 2nd miss
      assert.strictEqual(r.last?.attemptsLeft, 1);

      r = play([{ score: 60, passed: false }, { score: 65, passed: false }, { score: 70, passed: false }]);
      assert.strictEqual(r.last?.attemptsLeft, 0); // max 3 attempts
      assert.strictEqual(r.last?.bestScore, 70); // best score
      assert.strictEqual(speechAttemptOutcome(r.history, { score: 99, passed: true, stars: 3 }), null); // no 4th

      r = play([{ score: 60, passed: false }, { score: 95, passed: true }]);
      assert.strictEqual(r.last?.bestScore, 95);
      assert.strictEqual(r.last?.bestStars, 3);

      // A lower later attempt never lowers the best.
      r = play([{ score: 95, passed: true }, { score: 40, passed: false }]);
      assert.strictEqual(r.last?.bestScore, 95);
      assert.strictEqual(r.last?.bestStars, 3);
    });

    it('pays only the step up to a better star level, never for a miss', () => {
      const rules = { ...DEFAULT_SPEECH_RULES, coinsByStars: [0, 3, 5, 8] as [number, number, number, number] };
      const a = speechAttemptOutcome(start, { score: 80, passed: true, stars: 1 }, rules);
      assert.strictEqual(a?.coins, 3);
      const b = speechAttemptOutcome({ attempts: 1, misses: 0, bestScore: 80, bestStars: 1 }, { score: 97, passed: true, stars: 3 }, rules);
      assert.strictEqual(b?.coins, 5); // 8 − 3
      const c = speechAttemptOutcome({ attempts: 2, misses: 0, bestScore: 97, bestStars: 3 }, { score: 20, passed: false, stars: 0 }, rules);
      assert.strictEqual(c?.coins, 0);
    });
  });

  describe('Fallbacks', () => {
    describe('Dictation', () => {
      it('evaluates dictation with exact match', () => {
        const res = scoreDictation('cat', 'cat', 1);
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.stars, 3); // blueprint: exact match earns the normal stars

        const resFail = scoreDictation('cat', 'bat', 1);
        assert.strictEqual(resFail.passed, false);
        assert.strictEqual(resFail.stars, 0);
      });

      it('allows 1-edit distance for words >= 5 letters', () => {
        // "apple" is 5 letters, 1 edit distance → "almost", 1 star max
        const res = scoreDictation('apple', 'applz', 1);
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.stars, 1);
        assert.strictEqual(res.almost, true);

        // 2 edit distance
        const resFail = scoreDictation('apple', 'apzzs', 1);
        assert.strictEqual(resFail.passed, false);

        // "pear" is 4 letters, no edit distance allowed
        const resShort = scoreDictation('pear', 'bear', 1);
        assert.strictEqual(resShort.passed, false);
      });
    });

    describe('Repeat', () => {
      it('evaluates repeat mode (participation only)', () => {
        const res = scoreRepeat();
        // no pass/fail
        assert.strictEqual(res.stars, 1);
        assert.strictEqual(res.participation, true);
        assert.strictEqual(res.passed, false);
      });
    });
  });

  describe('Rules file', () => {
    it('reads content/speech_rules.json (array layout) and keeps defaults for anything missing', () => {
      const r = resolveSpeechRules([{ coinsByStars: [0, 3, 5, 8], passThresholdsByLevel: { 0: 45, 1: 60, 2: 65, 3: 70, 4: 75, 5: 80 }, bogus: true }]);
      assert.deepStrictEqual(r.coinsByStars, [0, 3, 5, 8]);
      assert.strictEqual(r.passByLevel[0], 45);
      assert.strictEqual(r.maxAttempts, 3);
      assert.deepStrictEqual(resolveSpeechRules(null), DEFAULT_SPEECH_RULES);
    });
  });
});
