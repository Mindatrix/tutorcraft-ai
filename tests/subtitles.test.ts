import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from '../src/engine';

const EGG: E.SubtitleLine = {
  en: 'The egg is starting to crack.',
  vi: 'Có tiếng nứt! quả trứng đang nứt ra.',
  parts: ['Có tiếng nứt! ', ['egg', 'quả trứng', 0], ' đang ', ['crack', 'nứt ra', 1], '.'],
};
const textAt = (line: E.SubtitleLine, lv: number) => E.subtitleText(E.renderSubtitle(line, lv));
const langs = (line: E.SubtitleLine, lv: number) => new Set(E.renderSubtitle(line, lv).map((s) => s.lang));

test('A2.2: the six levels — Beginner all Vietnamese, A1..B2 swap keywords with band < level, C1 all English', () => {
  assert.equal(textAt(EGG, 0), 'Có tiếng nứt! quả trứng đang nứt ra.');
  assert.equal(textAt(EGG, 1), 'Có tiếng nứt! egg đang nứt ra.');
  assert.equal(textAt(EGG, 2), 'Có tiếng nứt! egg đang crack.');
  assert.equal(textAt(EGG, 3), 'Có tiếng nứt! egg đang crack.');
  assert.equal(textAt(EGG, 4), 'Có tiếng nứt! egg đang crack.');
  assert.equal(textAt(EGG, 5), 'The egg is starting to crack.');
  assert.deepEqual([...langs(EGG, 0)], ['vi'], 'level 0 has no English');
  assert.deepEqual([...langs(EGG, 5)], ['en'], 'level 5 has no Vietnamese');
});

test('A2.2: keywords stay tappable at every level, with meaning and band', () => {
  const b = E.renderSubtitle(EGG, 0).filter((s) => s.term);
  assert.deepEqual(b.map((s) => [s.text, s.term!.en, s.term!.band]), [['quả trứng', 'egg', 0], ['nứt ra', 'crack', 1]]);
  const c1 = E.renderSubtitle(EGG, 5).filter((s) => s.term);
  assert.deepEqual(c1.map((s) => [s.text, s.term!.vi]), [['egg', 'quả trứng'], ['crack', 'nứt ra']], 'C1 keywords show their Vietnamese meaning on tap');
});

test('A2.2: English share grows level by level on the Studio sample line', () => {
  const shares = E.LEVEL_IDS.map((lv) => E.englishShare(E.SAMPLE_SUBTITLE, lv));
  assert.equal(shares[0], 0);
  assert.equal(shares[5], 1);
  for (let i = 1; i < shares.length; i++) assert.ok(shares[i] >= shares[i - 1], `level ${i} ≥ level ${i - 1}: ${shares}`);
  assert.equal(textAt(E.SAMPLE_SUBTITLE, 1), 'Khủng long con ơi, đi theo your father tới hồ nước và drink một ít water nhé.');
  assert.equal(textAt(E.SAMPLE_SUBTITLE, 2), 'Little dinosaur ơi, đi theo your father tới hồ nước và drink một ít water nhé.', 'sentence case kept for a keyword that opens the line');
});

test('A2.3: missing band → 3, missing English → Vietnamese line, proper nouns untouched', () => {
  assert.equal(E.termBand(undefined), 3);
  assert.equal(E.termBand(7), 3);
  assert.equal(E.termBand('2'), 2);
  const noBand: E.SubtitleLine = { vi: 'Con thấy dấu chân không?', terms: [{ en: 'footprint', vi: 'dấu chân' }] };
  assert.equal(textAt(noBand, 3), 'Con thấy dấu chân không?', 'band 3 is not < 3');
  assert.equal(textAt(noBand, 4), 'Con thấy footprint không?');
  assert.equal(textAt(noBand, 5), 'Con thấy footprint không?', 'no English sentence: C1 falls back to the Vietnamese line with every keyword in English');
  const named: E.SubtitleLine = {
    en: 'Gruk leads the herd.',
    vi: 'Gruk dẫn đầu cả bầy.',
    parts: [['Gruk', 'Gruk', 0], ' ', ['leads', 'dẫn đầu', 4], ' cả ', ['herd', 'bầy', 2], '.'],
  };
  for (const lv of E.LEVEL_IDS) assert.ok(textAt(named, lv).startsWith('Gruk '), `name kept at level ${lv}`);
  assert.equal(E.renderSubtitle(named, 1)[0].term?.proper, true);
});

test('A2.3: `terms` lines are matched in the Vietnamese text (longest first, case-insensitive)', () => {
  const line: E.SubtitleLine = {
    vi: 'Bố dạy con săn mồi ở hồ nước lớn.',
    en: 'Father teaches you to hunt at the big lake.',
    terms: [{ en: 'lake', vi: 'hồ nước', band: 1 }, { en: 'big lake', vi: 'hồ nước lớn', band: 2 }, { en: 'hunt', vi: 'SĂN MỒI', band: 0 }],
  };
  assert.equal(textAt(line, 1), 'Bố dạy con hunt ở hồ nước lớn.');
  assert.equal(textAt(line, 3), 'Bố dạy con hunt ở big lake.');
});

test('sanitize + stage map: junk dropped, bands clamped, stages keyed by number', () => {
  const lines = E.sanitizeSubtitleLines([EGG, { vi: '' }, 42, { vi: 'Xin chào', parts: ['Xin ', ['hello', 'chào', 9]] }]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1].parts?.[1], ['hello', 'chào', 3]);
  const map = E.subtitlesByStage([{ n: 1, subtitles: [EGG] }, { n: 2 }, { n: 99, subtitles: [EGG] }]);
  assert.deepEqual(Object.keys(map), ['1']);
  assert.deepEqual([E.stageForProgress(0, 12), E.stageForProgress(5, 12), E.stageForProgress(11, 12), E.stageForProgress(0, 0)], [1, 3, 6, 1]);
});

test('G1.3 (content): every authored subtitle line renders Vietnamese-only at 0 and English-only at 5', () => {
  const scenarios = JSON.parse(readFileSync('content/scenarios_v2.json', 'utf8')) as { id: string; stages: { n: number; subtitles?: unknown }[] }[];
  let lines = 0;
  for (const s of scenarios) {
    for (const st of s.stages) {
      const authored = Array.isArray(st.subtitles) ? st.subtitles.length : 0;
      const clean = E.sanitizeSubtitleLines(st.subtitles);
      assert.equal(clean.length, authored, `${s.id} stage ${st.n}: every line is well-formed`);
      for (const line of clean) {
        lines++;
        assert.deepEqual([...langs(line, 0)], ['vi'], `${s.id}/${st.n}: "${line.vi}" has English at Beginner`);
        if (line.en) assert.deepEqual([...langs(line, 5)], ['en'], `${s.id}/${st.n}: "${line.en}" has Vietnamese at C1`);
        if (line.parts) assert.equal(E.subtitleText(E.renderSubtitle(line, 0)).normalize('NFC'), line.vi.normalize('NFC'), `${s.id}/${st.n}: parts rebuild the Vietnamese line`);
      }
    }
  }
  assert.ok(lines > 0, 'some subtitle lines exist');
});
