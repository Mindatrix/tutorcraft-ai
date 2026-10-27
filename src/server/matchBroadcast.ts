import { createECDH, createPrivateKey, createPublicKey, hkdfSync, sign, verify, type JsonWebKey, type KeyObject } from 'node:crypto';
import { MATCH_EVENT, matchTopic, type MatchMessage, type SignedMatchMessage } from '../engine';
import { sessionKey } from './crypto';

// Broadcasts for class matches (plan B2.4) over Supabase Realtime.
// The channel is public (students have no Supabase account), and a test on 27/10 showed any
// client can post on a public channel. So every message is signed here with ECDSA P-256 and the
// devices verify it with Web Crypto before using it (src/client/matchChannel.ts); the seq number
// inside the signed text stops replays. The key pair is derived from the server secret
// (sessionKey), so every server instance signs with the same key and no new setting is needed.

const P256_ORDER = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');

export interface MatchPublicKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

let keys: { priv: KeyObject; pub: KeyObject; jwk: MatchPublicKey } | null = null;

function keyPair() {
  if (keys) return keys;
  for (let i = 0; i < 16; i++) {
    const d = Buffer.from(hkdfSync('sha256', sessionKey(), 'tutorcraft', `match-broadcast-ecdsa-v1:${i}`, 32));
    const n = BigInt(`0x${d.toString('hex')}`);
    if (n === BigInt(0) || n >= P256_ORDER) continue;
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    const point = ecdh.getPublicKey(); // 0x04 ‖ x ‖ y
    const jwk: MatchPublicKey = { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33, 65).toString('base64url') };
    keys = {
      priv: createPrivateKey({ key: { ...jwk, d: d.toString('base64url') }, format: 'jwk' }),
      pub: createPublicKey({ key: { ...jwk } as JsonWebKey, format: 'jwk' }),
      jwk,
    };
    return keys;
  }
  throw new Error('could not derive a P-256 key');
}

/** Public key the devices verify with (sent with the match view). */
export function matchPublicKey(): MatchPublicKey {
  return keyPair().jwk;
}

export function signMatchMessage(msg: MatchMessage): SignedMatchMessage {
  const b = JSON.stringify(msg);
  // ieee-p1363 = raw r‖s, the format Web Crypto's ECDSA verify expects.
  const g = sign('sha256', Buffer.from(b), { key: keyPair().priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { b, g };
}

/** Server-side check (tests, load test). The browser does the same with Web Crypto. */
export function verifyMatchMessage(signed: SignedMatchMessage): MatchMessage | null {
  try {
    const ok = verify('sha256', Buffer.from(signed.b), { key: keyPair().pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(signed.g, 'base64url'));
    return ok ? (JSON.parse(signed.b) as MatchMessage) : null;
  } catch {
    return null;
  }
}

export interface Broadcaster {
  send(msg: MatchMessage): Promise<boolean>;
}

/** Supabase Realtime broadcast over REST (no websocket on the server; works on Vercel). */
export function realtimeBroadcaster(url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY): Broadcaster {
  return {
    async send(msg) {
      if (!url || !key) return false;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      try {
        const res = await fetch(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
          method: 'POST',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ topic: matchTopic(msg.m), event: MATCH_EVENT, payload: signMatchMessage(msg), private: false }] }),
          signal: ctrl.signal,
        });
        if (!res.ok) console.error(`match broadcast ${msg.t}#${msg.s} failed: ${res.status}`);
        return res.ok;
      } catch (e) {
        console.error(`match broadcast ${msg.t}#${msg.s} failed:`, (e as Error).message);
        return false;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Keeps what would have been sent (tests, demo battle). */
export class MemoryBroadcaster implements Broadcaster {
  sent: SignedMatchMessage[] = [];
  async send(msg: MatchMessage) {
    this.sent.push(signMatchMessage(msg));
    if (this.sent.length > 5000) this.sent.shift();
    return true;
  }
  messages(matchId?: string): MatchMessage[] {
    return this.sent.map((s) => JSON.parse(s.b) as MatchMessage).filter((m) => !matchId || m.m === matchId);
  }
}
