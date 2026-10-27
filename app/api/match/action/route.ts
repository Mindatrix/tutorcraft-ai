import { matchErrorResponse, matches } from '../../../../src/server/matches';
import { rateLimit, rateLimitShared } from '../../../../src/server/rateLimit';
import { peekSession } from '../../../../src/server/sessionService';
import { SESSION_HEADER } from '../../../../src/server/sessions';

/**
 * Student, River Survival: { type: 'tag' | 'snatch' | 'freeze' | 'rescue' | 'retake', target(s), id }.
 * The server checks it against the rules; refused actions are counted for the tutor, never applied.
 */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`match-action:${token.slice(-24)}`, 120, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  const sid = peekSession(token)?.sid;
  if (sid) {
    const limit = await rateLimitShared(`match-action:${sid}`, 60, 60_000);
    if (!limit.ok) return Response.json({ error: `Thao tác quá nhanh. Thử lại sau ${limit.retryAfterSec}s.` }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    return Response.json(await matches().action(token, body), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return matchErrorResponse(e);
  }
}
