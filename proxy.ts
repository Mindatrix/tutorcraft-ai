import { NextResponse, type NextRequest } from 'next/server';

// Front-line protection for every /api route (Next 16 "proxy", formerly middleware):
//  - sliding-window rate limits per IP (class-sized, see below) and per battle-session token
//  - stricter limits on the expensive / scoring routes
//  - request size cap and a cross-site POST block
// Route handlers keep their own limits too (defence in depth).
// Memory is per server instance: behind several instances or a CDN edge, move
// these counters to a shared store (e.g. Redis/Upstash) — see README note.

type Rule = { limit: number; windowMs: number };

// Per-IP limits are sized for a whole class behind ONE school / tutoring-centre Wi-Fi (NAT):
// ~60 students share an IP. Abuse is held back per battle-session token (one per student)
// and by the per-tutor limits in the route handlers.
const GLOBAL_IP: Rule = { limit: 1500, windowMs: 60_000 };
const PER_TOKEN: Rule = { limit: 150, windowMs: 60_000 };
const ROUTE_RULES: { path: string; exact?: boolean; method?: string; scope: 'ip' | 'token'; rule: Rule }[] = [
  { path: '/api/generate-battle', method: 'POST', scope: 'ip', rule: { limit: 12, windowMs: 60_000 } },
  { path: '/api/battles', method: 'POST', scope: 'ip', rule: { limit: 30, windowMs: 60_000 } },
  // Joining a battle (the start of a session), not the answers under /api/session/*.
  { path: '/api/session', exact: true, method: 'POST', scope: 'ip', rule: { limit: 150, windowMs: 60_000 } },
  { path: '/api/battle-result', method: 'POST', scope: 'ip', rule: { limit: 150, windowMs: 60_000 } },
  { path: '/api/battle-result', method: 'POST', scope: 'token', rule: { limit: 10, windowMs: 60_000 } },
];
const MAX_BODY_BYTES = 6 * 1024 * 1024;

const hits = new Map<string, number[]>();

/** Sliding window: keeps request timestamps per key. Returns seconds to wait, or 0. */
function check(key: string, rule: Rule, now: number): number {
  const since = now - rule.windowMs;
  const list = (hits.get(key) ?? []).filter((t) => t > since);
  if (list.length >= rule.limit) {
    hits.set(key, list);
    return Math.max(1, Math.ceil((list[0] + rule.windowMs - now) / 1000));
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 20_000) {
    for (const [k, v] of hits) if (!v.length || v[v.length - 1] < since) hits.delete(k);
  }
  return 0;
}

function ipOf(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'local').trim();
}

function tooMany(retryAfter: number, scope: string) {
  return NextResponse.json(
    { error: `Quá nhiều yêu cầu (${scope}). Thử lại sau ${retryAfter}s.` },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}

export function proxy(req: NextRequest) {
  const now = Date.now();
  const { pathname } = req.nextUrl;
  const ip = ipOf(req);

  if (req.method === 'POST') {
    const len = Number(req.headers.get('content-length') ?? 0);
    if (len > MAX_BODY_BYTES) return NextResponse.json({ error: 'Payload quá lớn.' }, { status: 413 });

    // Browsers always send Origin on cross-site POSTs: block other sites from driving our API.
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== req.headers.get('host')) {
      return NextResponse.json({ error: 'Cross-site request blocked.' }, { status: 403 });
    }
  }

  let wait = check(`ip:${ip}`, GLOBAL_IP, now);
  if (wait) return tooMany(wait, 'IP');

  const token = req.headers.get('x-battle-session');
  if (token) {
    wait = check(`tok:${token.slice(-32)}`, PER_TOKEN, now);
    if (wait) return tooMany(wait, 'phiên đấu');
  }

  for (const r of ROUTE_RULES) {
    const hit = r.exact ? pathname === r.path : pathname === r.path || pathname.startsWith(`${r.path}/`);
    if (!hit || (r.method && r.method !== req.method)) continue;
    if (r.scope === 'token' && !token) continue; // no token: the route answers 401 anyway
    const who = r.scope === 'token' ? `tok:${token!.slice(-32)}` : `ip:${ip}`;
    wait = check(`route:${r.path}:${r.scope}:${who}`, r.rule, now);
    if (wait) return tooMany(wait, r.path);
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
