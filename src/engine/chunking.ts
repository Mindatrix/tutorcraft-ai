import { normalizeForCompare } from './normalize';

// Long lesson documents: split into sections, then pick what fits the AI prompt budget —
// the sections most relevant to the topic PLUS an even spread across the whole document,
// so a 60-page workbook is not quietly reduced to its first 10 pages.

export interface DocChunk {
  index: number;
  heading: string | null;
  text: string;
}

export interface ChunkSelection {
  chunks: DocChunk[];
  /** Total sections in the document. */
  total: number;
  /** Characters of the selected sections. */
  usedChars: number;
  /** True when some sections were left out. */
  truncated: boolean;
}

/** Text the prompt may carry (≈ 8–10k tokens; flash-lite answers in time with this). */
export const DOC_PROMPT_BUDGET = 32_000;
/** Largest document text accepted at all (≈ 150 pages). */
export const DOC_MAX_CHARS = 400_000;

const HEADING_WORDS = /^(?:#{1,6}\s+\S|(?:unit|lesson|chapter|part|section|module|topic|week|bài|phần|chương|chủ đề|mục|tuần)\s*[\dIVXLivxl]+\b|[IVXL]{1,5}\s*[.)]\s+\S)/i;

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (HEADING_WORDS.test(t)) return true;
  // SHORT ALL-CAPS LINES ("PASSIVE VOICE", "READING") — at least 4 letters, no lower case.
  const letters = t.replace(/[^\p{L}]/gu, '');
  return letters.length >= 4 && t.length <= 60 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

const cleanHeading = (line: string) => line.trim().replace(/^#{1,6}\s+/, '').slice(0, 90);

/** Split a long paragraph at sentence ends so no piece is longer than `max`. */
function splitLong(block: string, max: number): string[] {
  if (block.length <= max) return [block];
  const sentences = block.match(/[^.!?\n]+(?:[.!?]+|\n|$)/g) ?? [block];
  const out: string[] = [];
  let cur = '';
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = '';
  };
  for (const s of sentences) {
    if (s.length > max) {
      // A run-on "sentence" (no punctuation): hard cut.
      push();
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max).trim());
      continue;
    }
    if (cur.length + s.length > max) push();
    cur += s;
  }
  push();
  return out.filter(Boolean);
}

/** Sections of roughly `target` characters, cut at headings and paragraph breaks. */
export function chunkDocument(text: string, target = 1800, max = 2600): DocChunk[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: { heading: boolean; text: string }[] = [];
  let para: string[] = [];
  const endPara = () => {
    if (para.length) blocks.push({ heading: false, text: para.join('\n') });
    para = [];
  };
  for (const line of lines) {
    if (!line.trim()) endPara();
    else if (isHeading(line)) {
      endPara();
      blocks.push({ heading: true, text: line.trim() });
    } else para.push(line.trimEnd());
  }
  endPara();

  const chunks: DocChunk[] = [];
  let cur: string[] = [];
  let len = 0;
  let heading: string | null = null;
  const flush = () => {
    const t = cur.join('\n\n').trim();
    if (t) chunks.push({ index: chunks.length, heading, text: t });
    cur = [];
    len = 0;
  };
  for (const b of blocks) {
    if (b.heading) {
      // A new heading starts a new section once the current one has some substance.
      if (len >= target * 0.35) flush();
      if (!len) heading = cleanHeading(b.text);
      cur.push(b.text);
      len += b.text.length + 2;
      continue;
    }
    for (const piece of splitLong(b.text, max)) {
      if (len && len + piece.length > max) flush();
      cur.push(piece);
      len += piece.length + 2;
      if (len >= target) flush();
    }
  }
  flush();
  return chunks;
}

const STOP = new Set(
  'the and for with from this that these those about into your you are was were has have had not but all any can will lesson unit bài học của các những cho với một này trong và là được về theo'.split(' '),
);

function keywords(topic: string): string[] {
  return Array.from(new Set(normalizeForCompare(topic).split(' ').filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)))).slice(0, 12);
}

function relevance(c: DocChunk, terms: string[]): number {
  if (!terms.length) return 0;
  const body = ` ${normalizeForCompare(c.text)} `;
  const head = ` ${normalizeForCompare(c.heading ?? '')} `;
  let score = 0;
  for (const t of terms) {
    const re = new RegExp(`\\s${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    score += (body.match(re)?.length ?? 0) + 3 * (head.match(re)?.length ?? 0);
  }
  return score / Math.sqrt(1 + c.text.length / 1000);
}

/**
 * Choose sections for the prompt: everything if it fits, otherwise ~60% of the budget for the
 * most topic-relevant sections and the rest spread evenly over the document. Document order kept.
 */
export function selectChunks(chunks: DocChunk[], topic: string, budget = DOC_PROMPT_BUDGET): ChunkSelection {
  const size = (c: DocChunk) => c.text.length + 40;
  const totalChars = chunks.reduce((n, c) => n + size(c), 0);
  if (totalChars <= budget) return { chunks, total: chunks.length, usedChars: totalChars, truncated: false };

  const picked = new Set<number>();
  let used = 0;
  const take = (c: DocChunk) => {
    if (picked.has(c.index) || used + size(c) > budget) return false;
    picked.add(c.index);
    used += size(c);
    return true;
  };

  const terms = keywords(topic);
  const ranked = chunks.map((c) => ({ c, s: relevance(c, terms) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  for (const { c } of ranked) {
    if (used >= budget * 0.6) break;
    take(c);
  }

  // Even coverage: walk the document at a stride sized to what is left of the budget.
  const avg = totalChars / chunks.length;
  const slots = Math.max(1, Math.floor((budget - used) / avg));
  const stride = chunks.length / slots;
  for (let k = 0; k < slots; k++) take(chunks[Math.min(chunks.length - 1, Math.floor(k * stride + stride / 2))]);
  // Fill any remaining room in document order.
  for (const c of chunks) if (budget - used > 400) take(c);

  const selected = chunks.filter((c) => picked.has(c.index));
  return { chunks: selected, total: chunks.length, usedChars: used, truncated: selected.length < chunks.length };
}

/** Numbered sections for the prompt: "[Section 3/34 — Unit 2: Passive]". */
export function formatChunks(sel: ChunkSelection): string {
  if (sel.total <= 1) return sel.chunks[0]?.text ?? '';
  return sel.chunks.map((c) => `[Section ${c.index + 1}/${sel.total}${c.heading ? ` — ${c.heading}` : ''}]\n${c.text}`).join('\n\n');
}
