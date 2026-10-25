import { inflateRawSync } from 'node:zlib';
import {
  DOC_MAX_CHARS,
  DOC_PROMPT_BUDGET,
  DocxError,
  chunkDocument,
  extractDocxText,
  formatChunks,
  isDocx,
  normalizeText,
  selectChunks,
} from '../engine';
import type { InlineDocument } from './gemini';

// Lesson documents for the AI: PDF / images go to Gemini as-is (it reads them natively);
// text, Markdown and Word (.docx) become text that is split into sections and trimmed to the
// prompt budget (most relevant + evenly spread), never silently cut at the first N characters.

export const MAX_DOC_BYTES = 4 * 1024 * 1024;
const INLINE_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

export interface DocumentInput {
  name?: string;
  mimeType?: string;
  /** base64 for PDF / images, or a .docx the browser could not unzip itself. */
  data?: string;
  /** Text extracted in the browser (.txt / .md / .docx / pasted). */
  text?: string;
  /** 'docx' when `text` was extracted from a Word file in the browser. */
  source?: string;
}

export interface DocumentInfo {
  name: string;
  chars: number;
  chunks: number;
  usedChunks: number;
  usedChars: number;
  truncated: boolean;
  source: 'text' | 'docx' | 'inline';
}

export interface ParsedDocument {
  inline: InlineDocument | null;
  text?: string;
  info: DocumentInfo | null;
}

export class DocumentError extends Error {}

const nodeInflate = (data: Uint8Array, maxOut: number) => {
  try {
    return inflateRawSync(data, { maxOutputLength: maxOut });
  } catch {
    throw new DocxError('Nội dung .docx quá lớn hoặc bị hỏng.');
  }
};

function prepareText(raw: string, name: string, source: 'text' | 'docx', topic: string): ParsedDocument {
  // normalizeText caps at 5000 chars (answers) — documents only need line endings + NFC here.
  const full = raw.replace(/\r\n?/g, '\n').normalize('NFC').replace(/[ \t]+\n/g, '\n').trim().slice(0, DOC_MAX_CHARS);
  if (!full) throw new DocumentError('Tài liệu không có chữ.');
  const chunks = chunkDocument(full);
  const sel = selectChunks(chunks, topic, DOC_PROMPT_BUDGET);
  return {
    inline: null,
    text: formatChunks(sel),
    info: { name, chars: full.length, chunks: chunks.length, usedChunks: sel.chunks.length, usedChars: sel.usedChars, truncated: sel.truncated || raw.length > DOC_MAX_CHARS, source },
  };
}

export async function parseDocument(doc: DocumentInput | undefined, topic: string): Promise<ParsedDocument> {
  if (!doc) return { inline: null, info: null };
  const name = normalizeText(doc.name ?? 'Tài liệu').slice(0, 120) || 'Tài liệu';

  if (typeof doc.text === 'string' && doc.text.trim()) {
    return prepareText(doc.text, name, doc.source === 'docx' ? 'docx' : 'text', topic);
  }
  if (typeof doc.data !== 'string' || !doc.data) throw new DocumentError('Tài liệu trống.');
  if (doc.data.length * 0.75 > MAX_DOC_BYTES) throw new DocumentError('Tài liệu quá lớn (tối đa 4MB).');

  if (isDocx(doc.name, doc.mimeType)) {
    try {
      const text = await extractDocxText(new Uint8Array(Buffer.from(doc.data, 'base64')), nodeInflate);
      return prepareText(text, name, 'docx', topic);
    } catch (e) {
      throw new DocumentError(e instanceof DocxError ? e.message : 'Không đọc được tệp .docx.');
    }
  }
  if (doc.mimeType && INLINE_MIME.includes(doc.mimeType)) {
    return { inline: { mimeType: doc.mimeType, data: doc.data }, info: { name, chars: 0, chunks: 1, usedChunks: 1, usedChars: 0, truncated: false, source: 'inline' } };
  }
  throw new DocumentError('Định dạng tài liệu chưa hỗ trợ. Dùng PDF, Word (.docx), ảnh (PNG/JPG/WEBP) hoặc TXT/MD.');
}
