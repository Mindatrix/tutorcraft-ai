
// Fixed-window rate limiters. Protects the Gemini free-tier quota.
// rateLimit(): in-memory, per server instance, zero latency - for hot paths (answers).
// rateLimitShared(): counted in Supabase (rate_limit_hit RPC) so every instance sees the same
// number - for costly/sensitive routes. If the database is unreachable it falls back to memory.
import { serverSupabase } from './supabase-server';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  if (b.count >= limit) return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  b.count += 1;
  return { ok: true, retryAfterSec: 0 };
}

export async function rateLimitShared(key: string, limit: number, windowMs: number): Promise<{ ok: boolean; retryAfterSec: number }> {
  const db = serverSupabase();
  if (db) {
    try {
      const { data, error } = await db.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_ms: windowMs });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row && typeof row.ok === 'boolean') return { ok: row.ok, retryAfterSec: Number(row.retry_after_sec) || 0 };
    } catch {
      /* fall through to the in-memory limiter */
    }
  }
  return rateLimit(key, limit, windowMs);
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd?.split(',')[0] || req.headers.get('x-real-ip') || 'local').trim();
}
