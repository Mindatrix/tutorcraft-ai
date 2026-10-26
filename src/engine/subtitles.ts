import type { DifficultyLevel } from './types';
import { normalizeLevel } from './levels';

// Level-aware subtitles ("tăng dần", plan 2026-10-26, A2).
// Every keyword of a line has a band 0..5. At level L:
//   L = 0 (Beginner)  → the whole line in Vietnamese;
//   L = 1..4 (A1..B2) → Vietnamese line, but every keyword with band < L shows in English;
//   L = 5 (C1)        → the whole line in English.
// So the share of English grows with the level. Keywords stay tappable at every level
// (meaning + pronunciation) so students can always check a word.
//
// Content format (scripts/scenarios-v2/dino.py → stages[].subtitles):
//   { en: "The egg is starting to crack.", vi: "Có tiếng nứt! quả trứng đang nứt ra.",
//     parts: ["Có tiếng nứt! ", ["egg", "quả trứng", 0], " đang ", ["crack", "nứt ra", 1], "."] }
// A line may instead list `terms` ({ en, vi, band }) and they are found in `vi` by text.

export type SubtitleBand = 0 | 1 | 2 | 3 | 4 | 5;

/** Inline keyword inside `parts`: [english, vietnamese, band]. */
export type SubtitleTermTuple = [string, string, number];

export interface SubtitleTerm {
  /** The English word or short phrase. */
  en: string;
  /** Its Vietnamese meaning, exactly as written in the Vietnamese line. */
  vi: string;
  /** 0 = easiest (shown in English from A1) … 5 = hardest. Missing → 3. */
  band?: number;
  /** Names (people, places, pets) are never translated. */
  proper?: boolean;
}

export interface SubtitleLine {
  /** Full Vietnamese sentence. */
  vi: string;
  /** Full English sentence (C1). Missing → the Vietnamese line is used. */
  en?: string;
  /** The Vietnamese line split into text and keywords (preferred). */
  parts?: (string | SubtitleTermTuple)[];
  /** Alternative to `parts`: keywords located in `vi` by text. */
  terms?: SubtitleTerm[];
  /** Who says it (character name), shown before the line. */
  speaker?: string;
}

export interface SubtitleSegment {
  text: string;
  lang: 'vi' | 'en';
  /** Set on keywords: tap to see the meaning and hear the English word. */
  term?: { en: string; vi: string; band: SubtitleBand; proper: boolean };
}

export const DEFAULT_TERM_BAND: SubtitleBand = 3;

/** Bands outside 0..5 (or missing) count as 3 — the middle of the scale. */
export function termBand(raw: unknown): SubtitleBand {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 5 ? (n as SubtitleBand) : DEFAULT_TERM_BAND;
}

const fold = (s: string) => s.normalize('NFC').toLocaleLowerCase('vi').trim();

/** A name written the same in both languages ("Gruk", "Scarlet") is a proper noun. */
function isProper(en: string, vi: string, flagged?: boolean): boolean {
  if (flagged) return true;
  return fold(en) === fold(vi) && /^\p{Lu}/u.test(en.trim());
}

type Part = string | { en: string; vi: string; band: SubtitleBand; proper: boolean };

/** Build `parts` from a line that only lists `terms`: longest first, no overlaps, case-insensitive. */
function partsFromTerms(raw: string, terms: SubtitleTerm[]): Part[] {
  const vi = raw.normalize('NFC');
  const lower = vi.toLocaleLowerCase('vi');
  const taken: { start: number; end: number; term: SubtitleTerm }[] = [];
  const sorted = [...terms].filter((t) => t && typeof t.vi === 'string' && t.vi.trim()).sort((a, b) => b.vi.length - a.vi.length);
  for (const t of sorted) {
    const needle = t.vi.normalize('NFC').toLocaleLowerCase('vi').trim();
    let from = 0;
    for (;;) {
      const at = lower.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      if (!taken.some((x) => at < x.end && end > x.start)) {
        taken.push({ start: at, end, term: t });
        break;
      }
      from = at + 1;
    }
  }
  taken.sort((a, b) => a.start - b.start);
  const out: Part[] = [];
  let pos = 0;
  for (const x of taken) {
    if (x.start > pos) out.push(vi.slice(pos, x.start));
    out.push({ en: x.term.en, vi: vi.slice(x.start, x.end), band: termBand(x.term.band), proper: isProper(x.term.en, x.term.vi, x.term.proper) });
    pos = x.end;
  }
  if (pos < vi.length) out.push(vi.slice(pos));
  return out;
}

function partsOf(line: SubtitleLine): Part[] {
  if (Array.isArray(line.parts) && line.parts.length) {
    return line.parts.flatMap((p): Part[] => {
      if (typeof p === 'string') return [p];
      if (Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string') {
        return [{ en: p[0], vi: p[1], band: termBand(p[2]), proper: isProper(p[0], p[1]) }];
      }
      return [];
    });
  }
  return partsFromTerms(line.vi ?? '', Array.isArray(line.terms) ? line.terms : []);
}

/** Merge neighbouring plain segments of the same language. */
function merge(segs: SubtitleSegment[]): SubtitleSegment[] {
  const out: SubtitleSegment[] = [];
  for (const s of segs) {
    if (!s.text) continue;
    const prev = out[out.length - 1];
    if (prev && !prev.term && !s.term && prev.lang === s.lang) prev.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

/** Keywords inside the English sentence (C1), so they stay tappable. */
function markEnglish(en: string, parts: Part[]): SubtitleSegment[] {
  const terms = parts.filter((p): p is Exclude<Part, string> => typeof p !== 'string').sort((a, b) => b.en.length - a.en.length);
  const lower = en.toLowerCase();
  const hits: { start: number; end: number; t: Exclude<Part, string> }[] = [];
  for (const t of terms) {
    const needle = t.en.toLowerCase();
    if (!needle) continue;
    const re = new RegExp(`(^|[^\\p{L}])(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^\\p{L}])`, 'gu');
    for (let m = re.exec(lower); m; m = re.exec(lower)) {
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      if (!hits.some((h) => start < h.end && end > h.start)) {
        hits.push({ start, end, t });
        break;
      }
    }
  }
  hits.sort((a, b) => a.start - b.start);
  const segs: SubtitleSegment[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) segs.push({ text: en.slice(pos, h.start), lang: 'en' });
    segs.push({ text: en.slice(h.start, h.end), lang: 'en', term: { en: h.t.en, vi: h.t.vi, band: h.t.band, proper: h.t.proper } });
    pos = h.end;
  }
  if (pos < en.length) segs.push({ text: en.slice(pos), lang: 'en' });
  return segs;
}

/**
 * The segments to show for `line` at difficulty `level` (0 = Beginner … 5 = C1).
 * Guarantees: level 0 has no English text, level 5 has no Vietnamese text (when `en` exists).
 */
export function renderSubtitle(line: SubtitleLine, level: DifficultyLevel | number | undefined | null): SubtitleSegment[] {
  const L = normalizeLevel(level);
  const parts = partsOf(line);
  const en = typeof line.en === 'string' ? line.en.trim() : '';

  if (L === 5 && en) return merge(markEnglish(en, parts));

  // Missing English (A2.3): the Vietnamese line is used, with the level's keywords swapped in.
  const segs: SubtitleSegment[] = parts.map((p, i) => {
    if (typeof p === 'string') return { text: p, lang: 'vi' as const };
    const term = { en: p.en, vi: p.vi, band: p.band, proper: p.proper };
    if (p.proper) return { text: p.vi, lang: 'vi' as const, term };
    if (L > 0 && p.band < L) {
      // Keep sentence case when the keyword opens the line.
      const atStart = i === 0 || parts.slice(0, i).every((q) => typeof q === 'string' && !q.trim());
      const text = atStart && /^\p{Lu}/u.test(p.vi) ? p.en.charAt(0).toUpperCase() + p.en.slice(1) : p.en;
      return { text, lang: 'en' as const, term };
    }
    return { text: p.vi, lang: 'vi' as const, term };
  });
  return merge(segs);
}

/** Plain text of a rendered line (screen readers, tests, logs). */
export function subtitleText(segs: SubtitleSegment[]): string {
  return segs.map((s) => s.text).join('');
}

/** Share of keyword segments shown in English (0..1) — the Studio preview uses it. */
export function englishShare(line: SubtitleLine, level: DifficultyLevel | number): number {
  const segs = renderSubtitle(line, level).filter((s) => s.term && !s.term.proper);
  return segs.length ? segs.filter((s) => s.lang === 'en').length / segs.length : normalizeLevel(level) === 5 ? 1 : 0;
}

/** Keep only well-formed lines from untrusted JSON (database, seed files). */
export function sanitizeSubtitleLines(raw: unknown): SubtitleLine[] {
  if (!Array.isArray(raw)) return [];
  const out: SubtitleLine[] = [];
  for (const r of raw.slice(0, 40)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const vi = typeof o.vi === 'string' ? o.vi.slice(0, 400) : '';
    if (!vi.trim()) continue;
    const line: SubtitleLine = { vi };
    if (typeof o.en === 'string' && o.en.trim()) line.en = o.en.slice(0, 400);
    if (typeof o.speaker === 'string' && o.speaker.trim()) line.speaker = o.speaker.slice(0, 40);
    if (Array.isArray(o.parts)) {
      line.parts = o.parts
        .slice(0, 60)
        .filter((p): p is string | SubtitleTermTuple => typeof p === 'string' || (Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string'))
        .map((p) => (typeof p === 'string' ? p.slice(0, 400) : [p[0].slice(0, 80), p[1].slice(0, 80), termBand(p[2])] as SubtitleTermTuple));
    }
    if (Array.isArray(o.terms)) {
      line.terms = o.terms
        .slice(0, 30)
        .filter((t): t is SubtitleTerm => !!t && typeof t === 'object' && typeof (t as SubtitleTerm).en === 'string' && typeof (t as SubtitleTerm).vi === 'string')
        .map((t) => ({ en: t.en.slice(0, 80), vi: t.vi.slice(0, 80), band: termBand(t.band), ...(t.proper ? { proper: true } : {}) }));
    }
    out.push(line);
  }
  return out;
}

/** Stage subtitles keyed by stage number (1..8), from a scenario's `stages` JSON. */
export function subtitlesByStage(stages: unknown): Record<number, SubtitleLine[]> {
  const out: Record<number, SubtitleLine[]> = {};
  if (!Array.isArray(stages)) return out;
  for (const st of stages) {
    const s = (st ?? {}) as Record<string, unknown>;
    const n = Number(s.n);
    const lines = sanitizeSubtitleLines(s.subtitles);
    if (Number.isInteger(n) && n >= 1 && n <= 12 && lines.length) out[n] = lines;
  }
  return out;
}

/** {"1": [lines], "2": [...]} from JSON (API, game_scenarios.subtitles) → clean stage map. */
export function sanitizeSubtitleMap(raw: unknown): Record<number, SubtitleLine[]> {
  const out: Record<number, SubtitleLine[]> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 12)) {
    const n = Number(k);
    const lines = sanitizeSubtitleLines(v);
    if (Number.isInteger(n) && n >= 1 && n <= 12 && lines.length) out[n] = lines;
  }
  return out;
}

/** The core stage (1..6) a battle is in, from question progress (until the match clock drives it). */
export function stageForProgress(qIndex: number, qTotal: number, coreStages = 6): number {
  if (!(qTotal > 0)) return 1;
  const i = Math.max(0, Math.min(qTotal - 1, Math.floor(qIndex)));
  return Math.min(coreStages, 1 + Math.floor((i * coreStages) / qTotal));
}

/** A sample line the Studio preview slides through the levels (no server call). */
export const SAMPLE_SUBTITLE: SubtitleLine = {
  en: 'Little dinosaur, follow your father to the lake and drink some water.',
  vi: 'Khủng long con ơi, đi theo bố tới hồ nước và uống một ít nước nhé.',
  parts: [
    ['Little dinosaur', 'Khủng long con', 1],
    ' ơi, ',
    ['follow', 'đi theo', 3],
    ' ',
    ['your father', 'bố', 0],
    ' tới ',
    ['lake', 'hồ nước', 2],
    ' và ',
    ['drink', 'uống', 0],
    ' một ít ',
    ['water', 'nước', 0],
    ' nhé.',
  ],
};
