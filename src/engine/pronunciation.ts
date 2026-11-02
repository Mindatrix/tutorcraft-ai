import { normalizeForCompare } from './normalize';
import { questionType } from './questionTypes';
import type { Question } from './types';

// Pronunciation layer (blueprint §3.4, docs/pronunciation_logic_handoff.md §2). Pure functions, no I/O:
// the server uses them to judge rewards; the browser may use them for an instant, provisional score.
//
// What the Web Speech API gives us is text + a confidence, never phonemes. The phoneme part below is
// an APPROXIMATION: words are turned into ARPAbet-like sounds by spelling rules, unless the rules'
// `lexicon` has the word (exact sounds, e.g. from CMUdict). It is called "Pronunciation score", never
// "IPA accuracy".

export type SpeechMode = 'shadow' | 'dictate' | 'repeat';
export const SPEECH_MODES: readonly SpeechMode[] = ['shadow', 'dictate', 'repeat'];
export type SpeechKind = 'word' | 'sentence';

interface Weights {
  word: number;
  phoneme: number;
  conf: number;
}

/** Every tunable number. content/speech_rules.json may override any of them (see resolveSpeechRules). */
export interface SpeechRules {
  weights: { sentence: Weights; word: Weights };
  /** Pass threshold on `score` by teaching level 0 (Beginner) … 5 (C1). */
  passByLevel: [number, number, number, number, number, number];
  /** score ≥ two → 2 ★, score ≥ three → 3 ★ (a pass alone is 1 ★). */
  stars: { two: number; three: number };
  maxAttempts: number;
  /** Words of a sentence whose phoneme match is below this are reported as weak. */
  weakPhonemeBelow: number;
  listenMs: { default: number; beginner: number };
  silenceStopMs: number;
  /** Speech shorter than this is rejected as "too short" (the attempt does not count). */
  minSpeechMs: number;
  ttsRate: { default: number; beginner: number };
  /** Voice submissions per student per minute (server). */
  submissionsPerMinute: number;
  /** Listen-and-repeat fallback: participation stars only, never pass/fail. */
  repeatStars: number;
  /** Dictation: one wrong letter is "almost right" in words at least this long. */
  dictationAlmostMinLetters: number;
  /** Coins for the best star level reached on a target, index = stars (0..3). */
  coinsByStars: [number, number, number, number];
  maxTargets: number;
  maxTargetWords: number;
  /** Exact sounds per word, ARPAbet separated by spaces ("three": "TH R IY"), plus optional IPA for display. */
  lexicon: Record<string, string>;
  ipa: Record<string, string>;
}

export const DEFAULT_SPEECH_RULES: SpeechRules = {
  weights: { sentence: { word: 0.55, phoneme: 0.3, conf: 0.15 }, word: { word: 0.45, phoneme: 0.4, conf: 0.15 } },
  passByLevel: [50, 60, 65, 70, 75, 80],
  stars: { two: 85, three: 95 },
  maxAttempts: 3,
  weakPhonemeBelow: 50,
  listenMs: { default: 8000, beginner: 12000 },
  silenceStopMs: 1800,
  minSpeechMs: 400,
  ttsRate: { default: 0.85, beginner: 0.7 },
  submissionsPerMinute: 6,
  repeatStars: 1,
  dictationAlmostMinLetters: 5,
  // Coins are a coin-table decision (owner approval): voice pays nothing until the owner sets them.
  coinsByStars: [0, 0, 0, 0],
  maxTargets: 30,
  maxTargetWords: 12,
  lexicon: {},
  ipa: {},
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback;

function weights(v: unknown, d: Weights): Weights {
  if (!isObj(v)) return d;
  const w = { word: num(v.word, d.word, 0, 1), phoneme: num(v.phoneme, d.phoneme, 0, 1), conf: num(v.conf ?? v.confidence, d.conf, 0, 1) };
  return Math.abs(w.word + w.phoneme + w.conf - 1) < 0.001 ? w : d;
}

function tuple<T extends number[]>(v: unknown, d: T, min: number, max: number): T {
  return Array.isArray(v) && v.length === d.length && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max) ? (v.slice() as T) : d;
}

function stringMap(v: unknown): Record<string, string> {
  if (!isObj(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && x.trim()) out[k.toLowerCase()] = x.trim();
  return out;
}

/**
 * Rules from content/speech_rules.json merged over the defaults. Unknown keys are ignored and any value
 * of the wrong type or range keeps its default, so a partial or older file can never break scoring.
 */
export function resolveSpeechRules(raw: unknown): SpeechRules {
  const d = DEFAULT_SPEECH_RULES;
  if (!isObj(raw)) return { ...d, lexicon: { ...d.lexicon }, ipa: { ...d.ipa } };
  const w = isObj(raw.weights) ? raw.weights : {};
  const st = isObj(raw.stars) ? raw.stars : {};
  const listen = isObj(raw.listenMs) ? raw.listenMs : {};
  const tts = isObj(raw.ttsRate) ? raw.ttsRate : {};
  return {
    weights: { sentence: weights(w.sentence, d.weights.sentence), word: weights(w.word, d.weights.word) },
    passByLevel: tuple(raw.passByLevel, d.passByLevel, 0, 100),
    stars: { two: num(st.two, d.stars.two, 0, 100), three: num(st.three, d.stars.three, 0, 100) },
    maxAttempts: Math.round(num(raw.maxAttempts, d.maxAttempts, 1, 3)),
    weakPhonemeBelow: num(raw.weakPhonemeBelow, d.weakPhonemeBelow, 0, 100),
    listenMs: { default: num(listen.default, d.listenMs.default, 1000, 60_000), beginner: num(listen.beginner, d.listenMs.beginner, 1000, 60_000) },
    silenceStopMs: num(raw.silenceStopMs, d.silenceStopMs, 200, 10_000),
    minSpeechMs: num(raw.minSpeechMs, d.minSpeechMs, 0, 5000),
    ttsRate: { default: num(tts.default, d.ttsRate.default, 0.3, 2), beginner: num(tts.beginner, d.ttsRate.beginner, 0.3, 2) },
    submissionsPerMinute: Math.round(num(raw.submissionsPerMinute, d.submissionsPerMinute, 1, 60)),
    repeatStars: Math.round(num(raw.repeatStars, d.repeatStars, 0, 1)),
    dictationAlmostMinLetters: Math.round(num(raw.dictationAlmostMinLetters, d.dictationAlmostMinLetters, 1, 20)),
    coinsByStars: tuple(raw.coinsByStars, d.coinsByStars, 0, 100),
    maxTargets: Math.round(num(raw.maxTargets, d.maxTargets, 1, 100)),
    maxTargetWords: Math.round(num(raw.maxTargetWords, d.maxTargetWords, 1, 30)),
    lexicon: stringMap(raw.lexicon),
    ipa: stringMap(raw.ipa),
  };
}

// ---------------------------------------------------------------------------------------------
// Normalisation

const SMALL_NUMBERS = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(' ');
const TENS: Record<number, string> = { 30: 'thirty', 40: 'forty', 50: 'fifty', 60: 'sixty', 70: 'seventy', 80: 'eighty', 90: 'ninety', 100: 'one hundred' };

/** Recognisers often write numbers as digits ("3"); targets are words ("three"). */
function numberWords(token: string): string {
  if (!/^\d+$/.test(token)) return token;
  const n = Number(token);
  if (n <= 20) return SMALL_NUMBERS[n];
  if (TENS[n]) return TENS[n];
  if (n < 100) return `${TENS[Math.floor(n / 10) * 10]} ${SMALL_NUMBERS[n % 10]}`;
  return token;
}

/** Lower-case, contractions expanded, punctuation and apostrophes dropped, numbers as words, single spaces. */
export function normalizeSpeech(input: unknown): string {
  return normalizeForCompare(input)
    .replace(/['’]/g, '')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(numberWords)
    .join(' ');
}

export function speechTokens(input: unknown): string[] {
  const s = normalizeSpeech(input);
  return s ? s.split(' ') : [];
}

/** Levenshtein distance over any sequence (words, letters or phonemes). */
export function editDistance<T>(a: readonly T[], b: readonly T[]): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

const errorRate = <T>(target: readonly T[], heard: readonly T[]) => (target.length ? Math.min(1, editDistance(target, heard) / target.length) : heard.length ? 1 : 0);

/** Word error rate 0..1 (capped at 1: saying many extra words cannot go below zero). */
export function wordErrorRate(target: string, heard: string): number {
  return errorRate(speechTokens(target), speechTokens(heard));
}

// ---------------------------------------------------------------------------------------------
// Approximate sounds (spelling rules → ARPAbet-like symbols)

const VOWEL = /[aeiou]/;
// Longest first. Each entry: letters → sounds.
const GRAPHEMES: [string, string[]][] = [
  ['eigh', ['EY']], ['tch', ['CH']], ['igh', ['AY']], ['dge', ['JH']], ['ough', ['AO']],
  ['th', ['TH']], ['sh', ['SH']], ['ch', ['CH']], ['ph', ['F']], ['wh', ['W']], ['ck', ['K']], ['ng', ['NG']], ['qu', ['K', 'W']], ['gh', []],
  ['ee', ['IY']], ['ea', ['IY']], ['oo', ['UW']], ['ai', ['EY']], ['ay', ['EY']], ['oa', ['OW']], ['ow', ['AW']], ['ou', ['AW']],
  ['oi', ['OY']], ['oy', ['OY']], ['ie', ['IY']], ['ei', ['IY']], ['au', ['AO']], ['aw', ['AO']], ['ew', ['UW']],
  ['ar', ['AA', 'R']], ['er', ['ER']], ['ir', ['ER']], ['ur', ['ER']], ['or', ['AO', 'R']],
];
const SINGLE: Record<string, string[]> = {
  a: ['AE'], e: ['EH'], i: ['IH'], o: ['AA'], u: ['AH'], b: ['B'], c: ['K'], d: ['D'], f: ['F'], g: ['G'], h: ['HH'], j: ['JH'], k: ['K'],
  l: ['L'], m: ['M'], n: ['N'], p: ['P'], r: ['R'], s: ['S'], t: ['T'], v: ['V'], w: ['W'], x: ['K', 'S'], z: ['Z'],
};
const LONG: Record<string, string> = { a: 'EY', e: 'IY', i: 'AY', o: 'OW', u: 'UW' };

function spellToSounds(word: string): string[] {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return [];
  w = w.replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/(.)\1/g, '$1'); // silent letters, doubled consonants
  // Silent final "e" that makes the vowel before it long: "make", "time", "home", "cute".
  let longAt = -1;
  if (w.length > 3 && w.endsWith('e') && !VOWEL.test(w[w.length - 2]) && VOWEL.test(w[w.length - 3]) && !VOWEL.test(w[w.length - 4] ?? '')) {
    longAt = w.length - 3;
    w = w.slice(0, -1);
  }
  const out: string[] = [];
  for (let i = 0; i < w.length; ) {
    if (i === longAt) {
      out.push(LONG[w[i]]);
      i += 1;
      continue;
    }
    const g = GRAPHEMES.find(([letters]) => w.startsWith(letters, i));
    if (g) {
      out.push(...g[1]);
      i += g[0].length;
      continue;
    }
    const ch = w[i];
    const next = w[i + 1] ?? '';
    if (ch === 'c' && /[eiy]/.test(next)) out.push('S');
    else if (ch === 'y') out.push(i === 0 ? 'Y' : i === w.length - 1 && w.length <= 3 ? 'AY' : 'IY');
    else if (ch === 'e' && i === w.length - 1 && w.length > 2) {
      /* silent final e */
    } else out.push(...(SINGLE[ch] ?? []));
    i += 1;
  }
  return out;
}

/** Sounds of one word: the lexicon's exact sounds when it has the word, else the spelling approximation. */
export function wordPhonemes(word: string, lexicon: Record<string, string> = {}): string[] {
  const exact = lexicon[word.toLowerCase()];
  if (exact) return exact.toUpperCase().replace(/[0-9]/g, '').split(/\s+/).filter(Boolean); // CMUdict stress digits dropped
  return spellToSounds(word);
}

export function phonemes(text: string, lexicon: Record<string, string> = {}): string[] {
  return speechTokens(text).flatMap((w) => wordPhonemes(w, lexicon));
}

/** Phoneme error rate 0..1 (approximate unless the lexicon has every word). */
export function phonemeErrorRate(target: string, heard: string, lexicon: Record<string, string> = {}): number {
  return errorRate(phonemes(target, lexicon), phonemes(heard, lexicon));
}

// ---------------------------------------------------------------------------------------------
// Scoring

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(Number.isFinite(n) ? n : 0)));
const clampLevel = (level: unknown) => (Number.isInteger(level) && (level as number) >= 0 && (level as number) <= 5 ? (level as number) : 3);

export function passThreshold(level: unknown, rules: SpeechRules = DEFAULT_SPEECH_RULES): number {
  return rules.passByLevel[clampLevel(level)];
}

/** 0 when not passed; a pass is 1 ★, then 2 ★ and 3 ★ by score. */
export function speechStars(score: number, passed: boolean, rules: SpeechRules = DEFAULT_SPEECH_RULES): 0 | 1 | 2 | 3 {
  if (!passed) return 0;
  return score >= rules.stars.three ? 3 : score >= rules.stars.two ? 2 : 1;
}

export function speechKind(target: string): SpeechKind {
  return speechTokens(target).length > 1 ? 'sentence' : 'word';
}

export interface SpeechAlternative {
  transcript: string;
  /** 0..1; missing or 0 = the browser gave none (its weight moves to the word score). */
  confidence?: number;
}

export interface SpeechScore {
  score: number;
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  kind: SpeechKind;
  /** The alternative that scored best (normalised). */
  heard: string;
  wordScore: number;
  phonemeScore: number;
  /** null when the browser gave no confidence. */
  confScore: number | null;
  /** Sentence words whose sounds matched below `weakPhonemeBelow`. */
  weakWords: string[];
}

function scoreOne(target: string, alt: SpeechAlternative, kind: SpeechKind, rules: SpeechRules) {
  const heard = normalizeSpeech(alt.transcript);
  const wordScore = clampScore(100 * (1 - wordErrorRate(target, heard)));
  const phonemeScore = clampScore(100 * (1 - phonemeErrorRate(target, heard, rules.lexicon)));
  const c = typeof alt.confidence === 'number' && Number.isFinite(alt.confidence) && alt.confidence > 0 ? Math.min(1, alt.confidence) : null;
  const w = rules.weights[kind];
  const confScore = c === null ? null : clampScore(100 * c);
  const score = clampScore(confScore === null ? (w.word + w.conf) * wordScore + w.phoneme * phonemeScore : w.word * wordScore + w.phoneme * phonemeScore + w.conf * confScore);
  return { heard, wordScore, phonemeScore, confScore, score };
}

function weakWords(target: string, heard: string, rules: SpeechRules): string[] {
  const heardSounds = speechTokens(heard).map((h) => wordPhonemes(h, rules.lexicon));
  return speechTokens(target).filter((t) => {
    const ts = wordPhonemes(t, rules.lexicon);
    if (!ts.length) return false;
    const best = Math.max(0, ...heardSounds.map((h) => 100 * (1 - Math.min(1, editDistance(ts, h) / ts.length))));
    return best < rules.weakPhonemeBelow;
  });
}

/** Spoken attempt (mode 'shadow'): the best of the recogniser's alternatives counts. */
export function scoreSpeech(target: string, alternatives: readonly SpeechAlternative[], level: unknown, rules: SpeechRules = DEFAULT_SPEECH_RULES): SpeechScore {
  const kind = speechKind(target);
  const alts = alternatives.length ? alternatives : [{ transcript: '' }];
  const best = alts.map((a) => scoreOne(target, a, kind, rules)).reduce((a, b) => (b.score > a.score ? b : a));
  const passed = best.score >= passThreshold(level, rules);
  return {
    ...best,
    passed,
    stars: speechStars(best.score, passed, rules),
    kind,
    weakWords: kind === 'sentence' ? weakWords(target, best.heard, rules) : [],
  };
}

export interface DictationScore {
  score: number;
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  /** One wrong letter in a long word: passes, but 1 ★ at most. */
  almost: boolean;
  typed: string;
}

/** Typed attempt (mode 'dictate'): exact → pass; one letter off in a word of 5+ letters → "almost"; else retry. */
export function scoreDictation(target: string, typed: string, level: unknown, rules: SpeechRules = DEFAULT_SPEECH_RULES): DictationScore {
  const t = speechTokens(target);
  const y = speechTokens(typed);
  const text = y.join(' ');
  const goal = t.join(' ');
  if (goal && text === goal) return { score: 100, passed: true, stars: speechStars(100, true, rules), almost: false, typed: text };
  const score = clampScore(100 * (1 - Math.min(1, editDistance([...goal], [...text]) / Math.max(1, goal.length))));
  const off = t.length === y.length ? t.map((w, i) => (w === y[i] ? 0 : editDistance([...w], [...y[i]]))) : null;
  const almost = !!off && off.filter((d) => d > 0).length === 1 && off.every((d, i) => d === 0 || (d === 1 && t[i].length >= rules.dictationAlmostMinLetters));
  if (almost) return { score: Math.max(score, passThreshold(level, rules)), passed: true, stars: 1, almost: true, typed: text };
  return { score, passed: false, stars: 0, almost: false, typed: text };
}

// ---------------------------------------------------------------------------------------------
// Attempts on one target (server state: the attempts already stored for this session + target)

export interface SpeechHistory {
  attempts: number;
  misses: number;
  bestScore: number;
  bestStars: number;
}

export interface SpeechAttemptOutcome {
  attemptNo: number;
  attemptsLeft: number;
  bestScore: number;
  bestStars: number;
  /** After the 2nd miss the Pet shows the mouth shape (free tier-1 hint). */
  hint?: 'mouth_shape';
  /** Coins this attempt adds: only the step up to a better star level is paid. */
  coins: number;
}

/** null = no attempts left. A miss never costs anything; the best attempt counts. */
export function speechAttemptOutcome(prev: SpeechHistory, current: { score: number; stars: number; passed: boolean }, rules: SpeechRules = DEFAULT_SPEECH_RULES): SpeechAttemptOutcome | null {
  if (prev.attempts >= rules.maxAttempts) return null;
  const attemptNo = prev.attempts + 1;
  const misses = prev.misses + (current.passed ? 0 : 1);
  const bestStars = Math.max(prev.bestStars, current.stars);
  return {
    attemptNo,
    attemptsLeft: rules.maxAttempts - attemptNo,
    bestScore: Math.max(prev.bestScore, current.score),
    bestStars,
    ...(!current.passed && misses >= 2 ? { hint: 'mouth_shape' as const } : {}),
    coins: Math.max(0, rules.coinsByStars[bestStars] - rules.coinsByStars[prev.bestStars]),
  };
}

// ---------------------------------------------------------------------------------------------
// Targets: words and sentences of the battle's own lesson

export interface SpeechTarget {
  targetId: string;
  text: string;
  kind: SpeechKind;
  /** Display only; given only when the rules' `ipa` list has the word (never guessed). */
  ipa?: string;
  modes: SpeechMode[];
  ttsRate: number;
  listenMs: number;
  attemptsLeft: number;
}

const ENGLISH = /^[A-Za-z][A-Za-z0-9 ,.'’!?"-]*$/;

function plain(text: string, maxWords: number): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || !ENGLISH.test(t)) return null;
  const n = speechTokens(t).length;
  return n >= 1 && n <= maxWords ? t : null;
}

/**
 * Speech targets from the questions the student has ALREADY answered (their answers were revealed, so
 * showing the text leaks nothing). Per question: the right answer as a word/phrase ("q12w") and, for a
 * one-blank sentence, the sentence with the blank filled ("q12s"). Ids are stable for the session.
 */
export function speechTargetsFor(questions: readonly Question[], answeredIds: readonly number[], level: unknown, rules: SpeechRules = DEFAULT_SPEECH_RULES): Omit<SpeechTarget, 'attemptsLeft'>[] {
  const lv = clampLevel(level);
  const answered = new Set(answeredIds);
  const seen = new Set<string>();
  const out: Omit<SpeechTarget, 'attemptsLeft'>[] = [];
  const add = (targetId: string, raw: string | undefined) => {
    const text = raw ? plain(raw, rules.maxTargetWords) : null;
    const key = text ? normalizeSpeech(text) : '';
    if (!text || !key || seen.has(key) || out.length >= rules.maxTargets) return;
    seen.add(key);
    const kind = speechKind(text);
    const ipa = kind === 'word' ? rules.ipa[key] : undefined;
    out.push({
      targetId,
      text,
      kind,
      ...(ipa ? { ipa } : {}),
      modes: ['shadow', 'dictate', 'repeat'],
      ttsRate: lv === 0 ? rules.ttsRate.beginner : rules.ttsRate.default,
      listenMs: lv === 0 ? rules.listenMs.beginner : rules.listenMs.default,
    });
  };
  for (const q of questions) {
    if (!answered.has(q.id)) continue;
    const type = questionType(q);
    if (type === 'mcq') {
      const answer = q.options[q.correct_idx];
      add(`q${q.id}w`, answer);
      const blanks = q.question.match(/_{2,}/g);
      if (answer && blanks?.length === 1) add(`q${q.id}s`, q.question.replace(/_{2,}/, answer));
    } else if (type === 'reorder' && q.tokens?.length) add(`q${q.id}s`, q.tokens.join(' '));
    else if (type === 'transform') add(`q${q.id}s`, q.answers?.[0]);
  }
  return out;
}
