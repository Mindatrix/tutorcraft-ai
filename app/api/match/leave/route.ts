import { matchErrorResponse, matches } from '../../../../src/server/matches';
import { rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER } from '../../../../src/server/sessions';

/** Student leaves the class match (the score stays; joining again restores it). */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`match-leave:${token.slice(-24)}`, 10, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  try {
    return Response.json(await matches().leave(token), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return matchErrorResponse(e);
  }
}
