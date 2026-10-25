import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { DocxError, chunkDocument, docxXmlToText, extractDocxText, formatChunks, selectChunks } from '../src/engine';
import { DocumentError, parseDocument } from '../src/server/documents';
import { inflateRawBrowser } from '../src/client/inflate';

const inflate = (d: Uint8Array, max: number) => inflateRawSync(d, { maxOutputLength: max });

/** Minimal ZIP writer (deflate) — enough to build a .docx in memory. */
function zip(files: Record<string, string>): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, 'utf8');
    const comp = deflateRawSync(raw);
    const n = Buffer.from(name, 'utf8');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(n.length, 26);
    local.push(lh, n, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, n);
    offset += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, cd, end]));
}

const p = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const DOC_XML = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body>
${p('Unit 3: Passive Voice', 'Heading1')}
${p('The bridge was built in 1990 &amp; repainted later.')}
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Bài tập: chia động từ</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:tcPr/>${p('active')}</w:tc><w:tc>${p('passive')}</w:tc></w:tr></w:tbl>
<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>line two</w:t><w:tab/><w:t>tabbed</w:t></w:r><w:r><w:instrText> HYPERLINK "x" </w:instrText></w:r></w:p>
<mc:AlternateContent><mc:Choice>${p('Text box')}</mc:Choice><mc:Fallback>${p('Text box')}</mc:Fallback></mc:AlternateContent>
</w:body></w:document>`;

test('docx: paragraphs, headings, lists, tables, breaks, entities; no tab-stop or field-code noise', () => {
  const text = docxXmlToText(DOC_XML);
  assert.equal(
    text,
    ['## Unit 3: Passive Voice', 'The bridge was built in 1990 & repainted later.', '• Bài tập: chia động từ', 'active\tpassive', 'Line one', 'line two\ttabbed', 'Text box'].join('\n'),
  );
});

test('docx: real ZIP container round trip (Vietnamese text survives)', async () => {
  const file = zip({ '[Content_Types].xml': '<Types/>', 'word/document.xml': DOC_XML });
  const text = await extractDocxText(file, inflate);
  assert.match(text, /Bài tập: chia động từ/);
  assert.match(text, /^## Unit 3/);
});

test('docx: the browser path (DecompressionStream deflate-raw) reads the same text', async () => {
  const file = zip({ 'word/document.xml': DOC_XML });
  assert.equal(await extractDocxText(file, inflateRawBrowser), await extractDocxText(file, inflate));
  const bomb = zip({ 'word/document.xml': 'B'.repeat(2_000_000) });
  await assert.rejects(() => extractDocxText(bomb, (d) => inflateRawBrowser(d, 1_000_000)), /quá lớn/);
});

test('docx: clear errors for .doc, broken files and image-only documents', async () => {
  await assert.rejects(() => extractDocxText(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]), inflate), (e: Error) => e instanceof DocxError && /\.doc/.test(e.message));
  await assert.rejects(() => extractDocxText(new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9]), inflate), DocxError);
  const empty = zip({ 'word/document.xml': '<w:document><w:body><w:p/></w:body></w:document>' });
  await assert.rejects(() => extractDocxText(empty, inflate), /không có chữ/);
});

test('docx: zip bomb is refused (decompressed size cap)', async () => {
  const huge = 'A'.repeat(41 * 1024 * 1024);
  const file = zip({ 'word/document.xml': huge });
  await assert.rejects(() => parseDocument({ name: 'bomb.docx', data: Buffer.from(file).toString('base64') }, ''), DocumentError);
});

function longLesson(units: number, parasPerUnit: number): string {
  const out: string[] = [];
  for (let u = 1; u <= units; u++) {
    out.push(`Unit ${u}: ${u === 7 ? 'Reported Speech' : `Topic ${u}`}`);
    for (let k = 0; k < parasPerUnit; k++) {
      out.push(`${u === 7 ? 'He said that he was tired. Reported speech backshifts tenses.' : 'Some general practice about everyday English.'} Paragraph ${k} of unit ${u} has a few more words to make it longer and more realistic for a lesson.`.repeat(3));
    }
  }
  return out.join('\n\n');
}

test('chunking: splits at headings, keeps every word, no section over the max', () => {
  const text = longLesson(12, 6);
  const chunks = chunkDocument(text);
  assert.ok(chunks.length >= 12, `got ${chunks.length}`);
  assert.ok(chunks.every((c) => c.text.length <= 2600 + 100));
  assert.ok(chunks.some((c) => c.heading === 'Unit 7: Reported Speech'));
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
  assert.equal(chunks.reduce((n, c) => n + words(c.text), 0), words(text), 'nothing lost');
});

test('chunking: short documents are passed whole', () => {
  const sel = selectChunks(chunkDocument('Past simple: I went. She saw.'), 'past simple');
  assert.equal(sel.truncated, false);
  assert.equal(formatChunks(sel), 'Past simple: I went. She saw.');
});

test('chunk selection: fits the budget, favours the topic, still covers the whole document', () => {
  const chunks = chunkDocument(longLesson(30, 8));
  const sel = selectChunks(chunks, 'reported speech', 32_000);
  assert.equal(sel.truncated, true);
  assert.ok(sel.usedChars <= 32_000);
  const picked = new Set(sel.chunks.map((c) => c.index));
  const unit7 = chunks.filter((c) => /unit 7 /i.test(c.text));
  assert.ok(unit7.every((c) => picked.has(c.index)), 'all relevant sections included');
  const first = Math.min(...picked);
  const last = Math.max(...picked);
  assert.ok(first < chunks.length * 0.1 && last > chunks.length * 0.85, `spread ${first}…${last} of ${chunks.length}`);
  assert.deepEqual([...sel.chunks].sort((a, b) => a.index - b.index), sel.chunks, 'document order kept');
  assert.match(formatChunks(sel), /^\[Section \d+\/\d+/);
});

test('parseDocument: long text gets section info; pasted text and docx report their source', async () => {
  const res = await parseDocument({ name: 'Workbook', text: longLesson(30, 8) }, 'reported speech');
  assert.equal(res.info?.truncated, true);
  assert.ok(res.info!.chunks > res.info!.usedChunks);
  assert.ok((res.text ?? '').length <= 34_000);
  const docx = await parseDocument({ name: 'u3.docx', data: Buffer.from(zip({ 'word/document.xml': DOC_XML })).toString('base64') }, '');
  assert.equal(docx.info?.source, 'docx');
  assert.match(docx.text ?? '', /Passive Voice/);
  await assert.rejects(() => parseDocument({ name: 'x.xls', mimeType: 'application/vnd.ms-excel', data: 'AAAA' }, ''), DocumentError);
});
