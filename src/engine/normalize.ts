// Text normalization shared by the browser (before sending) and the server
// (before grading — the server never trusts the client to have done it).

const MAX_LEN = 5000;

/** Clean what the student typed for storage/display: NFC, straight quotes, single spaces. */
export function normalizeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN);
}

// Contractions expanded so "didn't go" and "did not go" grade the same.
const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon't\b/g, 'will not'],
  [/\bcan't\b/g, 'cannot'],
  [/\bshan't\b/g, 'shall not'],
  [/n't\b/g, ' not'],
  [/'m\b/g, ' am'],
  [/'re\b/g, ' are'],
  [/'ve\b/g, ' have'],
  [/'ll\b/g, ' will'],
  [/'d\b/g, ' would'],
];

/**
 * Canonical form for comparing answers: lower-case, contractions expanded,
 * punctuation dropped (apostrophes and in-word hyphens kept), single spaces.
 */
export function normalizeForCompare(input: unknown): string {
  let s = normalizeText(input).toLowerCase();
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  return s
    .replace(/(^|\s)-+|-+(\s|$)/g, ' ')
    .replace(/[^\p{L}\p{N}'\- ]+/gu, ' ')
    .replace(/(^|\s)'+|'+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(input: unknown): number {
  const s = normalizeText(input);
  return s ? s.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
}

const STOPWORDS = new Set(
  'a an the and or but of to in on at for with by from is are was were be been being am do does did have has had i you he she it we they me him her us them my your his its our their this that these those not no so as if then than too very can will would should could shall may might must'.split(' '),
);

/** Meaningful words, for key-point coverage checks. */
export function contentWords(input: unknown): string[] {
  return normalizeForCompare(input)
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}
