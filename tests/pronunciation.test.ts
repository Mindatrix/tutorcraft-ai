import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  normalizePronunciationText,
  calculateScore,
  checkPassThreshold,
  calculateStars,
  evaluateAttempt,
  evaluateDictation,
  evaluateRepeat
} from '../src/engine/pronunciation';

describe('Pronunciation Engine', () => {
  describe('Normalization', () => {
    it('lowercases text', () => {
      assert.strictEqual(normalizePronunciationText('Hello'), 'hello');
    });

    it('removes punctuation', () => {
      assert.strictEqual(normalizePronunciationText('Hello, world!'), 'hello world');
    });

    it('expands contractions', () => {
      assert.strictEqual(normalizePronunciationText("I don't know"), 'i do not know');
      assert.strictEqual(normalizePronunciationText("She can't go"), 'she cannot go');
      assert.strictEqual(normalizePronunciationText("It's fine"), 'it is fine');
      assert.strictEqual(normalizePronunciationText("I'm happy"), 'i am happy');
      assert.strictEqual(normalizePronunciationText("We'll see"), 'we will see');
    });

    it('collapses whitespace', () => {
      assert.strictEqual(normalizePronunciationText('hello   world'), 'hello world');
    });
  });

  describe('Scoring Formula', () => {
    it('calculates word score correctly', () => {
      // 0.45 * wordScore + 0.40 * phonemeScore + 0.15 * confScore
      // (WER=0 -> 100, PER=0 -> 100, Conf=1 -> 100) = 100
      assert.strictEqual(calculateScore({ wer: 0, per: 0, confidence: 1, type: 'word' }), 100);

      // (WER=0.5 -> 50, PER=0.5 -> 50, Conf=0.5 -> 50) = 50
      assert.strictEqual(calculateScore({ wer: 0.5, per: 0.5, confidence: 0.5, type: 'word' }), 50);

      // (WER=0.2 -> 80, PER=0.1 -> 90, Conf=0.8 -> 80)
      // 0.45 * 80 (36) + 0.40 * 90 (36) + 0.15 * 80 (12) = 84
      assert.strictEqual(calculateScore({ wer: 0.2, per: 0.1, confidence: 0.8, type: 'word' }), 84);
    });

    it('calculates sentence score correctly', () => {
      // 0.55 * wordScore + 0.30 * phonemeScore + 0.15 * confScore
      assert.strictEqual(calculateScore({ wer: 0, per: 0, confidence: 1, type: 'sentence' }), 100);

      // (WER=0.2 -> 80, PER=0.1 -> 90, Conf=0.8 -> 80)
      // 0.55 * 80 (44) + 0.30 * 90 (27) + 0.15 * 80 (12) = 83
      assert.strictEqual(calculateScore({ wer: 0.2, per: 0.1, confidence: 0.8, type: 'sentence' }), 83);
    });
  });

  describe('Teaching Level Thresholds', () => {
    it('passes or fails based on level threshold', () => {
      // Level 0 (≥50)
      assert.strictEqual(checkPassThreshold(50, 0), true);
      assert.strictEqual(checkPassThreshold(49, 0), false);

      // Level 1 (≥60)
      assert.strictEqual(checkPassThreshold(60, 1), true);
      assert.strictEqual(checkPassThreshold(59, 1), false);

      // Level 2 (≥65)
      assert.strictEqual(checkPassThreshold(65, 2), true);
      assert.strictEqual(checkPassThreshold(64, 2), false);

      // Level 3 (≥70)
      assert.strictEqual(checkPassThreshold(70, 3), true);
      assert.strictEqual(checkPassThreshold(69, 3), false);

      // Level 4 (≥75)
      assert.strictEqual(checkPassThreshold(75, 4), true);
      assert.strictEqual(checkPassThreshold(74, 4), false);

      // Level 5 (≥80)
      assert.strictEqual(checkPassThreshold(80, 5), true);
      assert.strictEqual(checkPassThreshold(79, 5), false);
    });
  });

  describe('Stars & Retries', () => {
    it('assigns correct stars based on score', () => {
      assert.strictEqual(calculateStars(84, true), 1);
      assert.strictEqual(calculateStars(85, true), 2);
      assert.strictEqual(calculateStars(94, true), 2);
      assert.strictEqual(calculateStars(95, true), 3);
      assert.strictEqual(calculateStars(100, true), 3);
      assert.strictEqual(calculateStars(100, false), 0); // did not pass
    });

    it('evaluates attempts correctly (up to 3, best counts, hint on 2nd miss)', () => {
      const attempts1 = [{ score: 60, passed: false }];
      let result = evaluateAttempt(attempts1);
      assert.strictEqual(result.showHint, false);
      assert.strictEqual(result.isDone, false);

      const attempts2 = [{ score: 60, passed: false }, { score: 65, passed: false }];
      result = evaluateAttempt(attempts2);
      assert.strictEqual(result.showHint, true); // Tier-1 hint trigger on 2nd miss
      assert.strictEqual(result.isDone, false);

      const attempts3 = [{ score: 60, passed: false }, { score: 65, passed: false }, { score: 70, passed: false }];
      result = evaluateAttempt(attempts3);
      assert.strictEqual(result.isDone, true); // Max 3 attempts
      assert.strictEqual(result.finalScore, 70); // Best score

      const attempts4 = [{ score: 60, passed: false }, { score: 95, passed: true }];
      result = evaluateAttempt(attempts4);
      assert.strictEqual(result.isDone, true); // Passed
      assert.strictEqual(result.finalScore, 95); // Best score
      assert.strictEqual(result.stars, 3);
    });
  });

  describe('Fallbacks', () => {
    describe('Dictation', () => {
      it('evaluates dictation with exact match', () => {
        const res = evaluateDictation('cat', 'cat');
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.stars, 1);

        const resFail = evaluateDictation('cat', 'bat');
        assert.strictEqual(resFail.passed, false);
        assert.strictEqual(resFail.stars, 0);
      });

      it('allows 1-edit distance for words >= 5 letters', () => {
        // "apple" is 5 letters, 1 edit distance
        const res = evaluateDictation('apple', 'applz');
        assert.strictEqual(res.passed, true);
        assert.strictEqual(res.stars, 1);

        // 2 edit distance
        const resFail = evaluateDictation('apple', 'apzzs');
        assert.strictEqual(resFail.passed, false);

        // "pear" is 4 letters, no edit distance allowed
        const resShort = evaluateDictation('pear', 'bear');
        assert.strictEqual(resShort.passed, false);
      });
    });

    describe('Repeat', () => {
      it('evaluates repeat mode (participation only)', () => {
        const res = evaluateRepeat();
        // no pass/fail
        assert.strictEqual(res.stars, 1);
        assert.strictEqual(res.isParticipationOnly, true);
      });
    });
  });
});
