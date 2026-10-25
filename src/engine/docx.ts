// Word (.docx) text extractor — no dependencies. A .docx is a ZIP of XML files; the lesson text
// lives in word/document.xml. Decompression is injected so the same code runs in the browser
// (DecompressionStream) and on the server (node:zlib). Images and styles are never read.

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
/** Hard cap on the decompressed XML (zip-bomb guard). */
export const DOCX_MAX_XML_BYTES = 40 * 1024 * 1024;

/** Raw DEFLATE inflater; must throw (or return more than `maxOut`) when the output is too big. */
export type InflateRaw = (data: Uint8Array, maxOut: number) => Promise<Uint8Array> | Uint8Array;

export class DocxError extends Error {}

export function isDocx(name: string | undefined, mimeType: string | undefined): boolean {
  return mimeType === DOCX_MIME || /\.docx$/i.test(name ?? '');
}

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  offset: number;
}

function zipEntries(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocxError('Tệp không phải .docx hợp lệ (không đọc được cấu trúc ZIP).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const nameLen = dv.getUint16(p + 28, true);
    out.push({
      method: dv.getUint16(p + 10, true),
      compSize: dv.getUint32(p + 20, true),
      offset: dv.getUint32(p + 42, true),
      name: dec.decode(buf.subarray(p + 46, p + 46 + nameLen)),
    });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return out;
}

async function readEntry(buf: Uint8Array, e: ZipEntry, inflate: InflateRaw): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (e.offset + 30 > buf.length || dv.getUint32(e.offset, true) !== 0x04034b50) throw new DocxError('Tệp .docx bị hỏng.');
  const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
  const data = buf.subarray(start, start + e.compSize);
  let raw: Uint8Array;
  if (e.method === 0) raw = data;
  else if (e.method === 8) raw = await inflate(data, DOCX_MAX_XML_BYTES);
  else throw new DocxError('Tệp .docx dùng kiểu nén chưa hỗ trợ.');
  if (raw.length > DOCX_MAX_XML_BYTES) throw new DocxError('Nội dung .docx quá lớn.');
  return new TextDecoder().decode(raw);
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const HEADING_STYLE = /^(heading|title|subtitle|tieude|tiêuđề|chuong|chương)/i;

/**
 * word/document.xml → plain text. Paragraphs become lines, table cells are tab-separated,
 * heading styles become "## " lines and list items "• " (the chunker splits on headings).
 */
export function docxXmlToText(xml: string): string {
  // Text boxes are stored twice (modern + fallback drawing): keep one copy.
  const body = xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');
  const TOKEN = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:(p|tc|tr)>|<w:pStyle\s+w:val="([^"]*)"|<w:numPr>|<w:tc(?:\s[^>]*)?>/g;
  let out = '';
  let prefix = '';
  let lineStart = true;
  let cell = 0; // inside a table cell: paragraphs join with spaces, cells with tabs
  for (let m = TOKEN.exec(body); m; m = TOKEN.exec(body)) {
    const tag = m[0];
    if (m[1] !== undefined) {
      if (!m[1]) continue;
      if (lineStart) out += prefix;
      out += decodeXml(m[1]);
      lineStart = false;
      prefix = '';
    } else if (m[3] !== undefined) {
      if (!cell && HEADING_STYLE.test(m[3].replace(/\s/g, ''))) prefix = '## ';
    } else if (tag === '<w:numPr>') {
      if (!prefix && !cell) prefix = '• ';
    } else if (m[2] === 'tc') {
      cell = Math.max(0, cell - 1);
      out += '\t';
    } else if (tag.startsWith('<w:tc')) {
      cell += 1;
    } else if (m[2] === 'p' && cell) {
      out += ' ';
    } else if (m[2] === 'p' || m[2] === 'tr' || tag.startsWith('<w:br') || tag.startsWith('<w:cr')) {
      out += '\n';
      lineStart = true;
      if (m[2]) prefix = '';
    } else if (tag.startsWith('<w:tab')) {
      out += '\t';
    }
  }
  return out
    .split('\n')
    .map((l) => l.replace(/ *\t */g, '\t').replace(/ {2,}/g, ' ').replace(/[\t ]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extract the text of a .docx file. Throws DocxError with a Vietnamese message. */
export async function extractDocxText(bytes: Uint8Array, inflate: InflateRaw): Promise<string> {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new DocxError('Tệp không phải .docx (có thể là .doc đời cũ). Hãy mở bằng Word và “Lưu thành” .docx hoặc PDF.');
  }
  const entries = zipEntries(bytes);
  let main = entries.find((e) => e.name === 'word/document.xml');
  if (!main) {
    // Non-standard part name: follow the package relationship to the main document.
    const rels = entries.find((e) => e.name === '_rels/.rels');
    const target = rels ? /Type="[^"]*\/officeDocument"[^>]*Target="\/?([^"]+)"|Target="\/?([^"]+)"[^>]*Type="[^"]*\/officeDocument"/.exec(await readEntry(bytes, rels, inflate)) : null;
    const path = target?.[1] ?? target?.[2];
    main = path ? entries.find((e) => e.name === path) : undefined;
  }
  if (!main) throw new DocxError('Không tìm thấy nội dung văn bản trong tệp .docx.');
  const text = docxXmlToText(await readEntry(bytes, main, inflate));
  if (!text) throw new DocxError('Tệp .docx không có chữ (chỉ có ảnh?). Hãy xuất ra PDF để AI đọc được ảnh.');
  return text;
}
