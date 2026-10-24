'use client';

import { hashInput, normalizeForCompare } from '../engine';

// Browser side of the salted key-phrase / prefix hashes (server: phraseHash in sessionService).
// Lets the UI light up correct chunks without the answer ever being sent.

async function sha16(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export function phraseHashBrowser(salt: string, text: string): Promise<string> {
  return sha16(hashInput(salt, text));
}

/** How many of `keyHashes` appear as word sequences (1–6 words) in `text`. */
export async function countKeyPhrases(salt: string, keyHashes: string[], text: string): Promise<number> {
  if (!keyHashes.length || !globalThis.crypto?.subtle) return 0;
  const words = normalizeForCompare(text).split(' ').filter(Boolean).slice(0, 60);
  const wanted = new Set(keyHashes);
  const found = new Set<string>();
  for (let n = 1; n <= 6; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const h = await phraseHashBrowser(salt, words.slice(i, i + n).join(' '));
      if (wanted.has(h)) found.add(h);
    }
  }
  return found.size;
}

/** Length of the longest correct prefix of `placed` (texts in the student's order). */
export async function correctPrefix(salt: string, prefixHashes: string[], placed: string[]): Promise<number> {
  if (!globalThis.crypto?.subtle) return 0;
  let best = 0;
  for (let k = 1; k <= Math.min(placed.length, prefixHashes.length); k++) {
    if ((await phraseHashBrowser(salt, placed.slice(0, k).join(' '))) === prefixHashes[k - 1]) best = k;
    else break;
  }
  return best;
}
