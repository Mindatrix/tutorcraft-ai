import { matchErrorResponse, matches } from '../../../../src/server/matches';
import { clientKey, rateLimit, rateLimitShared } from '../../../../src/server/rateLimit';
import { SESSION_HEADER } from '../../../../src/server/sessions';

/**
 * Student: join the class match of the battle this session plays (header x-battle-session).
 * Re-joining (new tab, new session of the same device) keeps team, group and score.
 * Body (Dino Journey only): { species, color }. Returns the match view, "me" and the signed channel.
 */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`match-join-token:${token.slice(-24)}`, 20, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  const limit = await rateLimitShared(`match-join:${clientKey(req)}`, 150, 60_000);
  if (!limit.ok) return Response.json({ error: `Quá nhiều yêu cầu. Thử lại sau ${limit.retryAfterSec}s.` }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } });
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    const res = await matches().join(token, { species: body.species, color: body.color });
    return Response.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return matchErrorResponse(e);
  }
}
