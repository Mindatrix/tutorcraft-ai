// Raw DEFLATE in the browser (Web Streams DecompressionStream: Chrome 103+, Safari 16.4+,
// Firefox 113+). Used to unzip .docx files locally so only their text is uploaded.
// Stops — and throws — once the output passes `maxOut` bytes (zip-bomb guard).

export const canInflateInBrowser = () => typeof DecompressionStream !== 'undefined';

export async function inflateRawBrowser(data: Uint8Array, maxOut: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxOut) {
      await reader.cancel();
      throw new Error('Nội dung .docx quá lớn.');
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
