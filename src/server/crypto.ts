import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

// AES-256-GCM sealed tokens: the payload is both hidden (encrypted) and
// tamper-proof (authenticated). Any edit to a token makes it fail to open.

const VERSION = 'v1';
const AAD = Buffer.from('tutorcraft-session-v1');

let cachedKey: Buffer | null = null;
let warned = false;

/**
 * 32-byte key from TUTORCRAFT_SESSION_SECRET, else derived (HKDF) from the
 * Supabase service-role key, else a random per-process key (tokens then stop
 * working after a server restart).
 */
export function sessionKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.TUTORCRAFT_SESSION_SECRET;
  if (secret && secret.length >= 32) {
    cachedKey = createHash('sha256').update(secret).digest();
  } else if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    cachedKey = Buffer.from(hkdfSync('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY, 'tutorcraft', 'session-token-v1', 32));
  } else {
    cachedKey = randomBytes(32);
    if (!warned) {
      warned = true;
      console.warn('[tutorcraft] No TUTORCRAFT_SESSION_SECRET or service-role key: using a random session key.');
    }
  }
  return cachedKey;
}

export function seal(payload: unknown, key: Buffer = sessionKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url')}`;
}

export function open<T>(token: unknown, key: Buffer = sessionKey()): T | null {
  if (typeof token !== 'string' || !token.startsWith(`${VERSION}.`) || token.length > 4096) return null;
  try {
    const raw = Buffer.from(token.slice(VERSION.length + 1), 'base64url');
    if (raw.length < 12 + 16 + 2) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAAD(AAD);
    decipher.setAuthTag(raw.subarray(12, 28));
    const pt = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(pt.toString('utf8')) as T;
  } catch {
    return null; // wrong key, edited token, or garbage
  }
}
