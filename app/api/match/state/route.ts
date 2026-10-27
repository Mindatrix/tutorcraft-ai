import { matchErrorResponse, matches } from '../../../../src/server/matches';
import { rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER } from '../../../../src/server/sessions';

/** Student: authoritative match state (poll every ~20 s, and after a reconnect). Also "I am here". */
export async function GET(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`match-state:${token.slice(-24)}`, 60, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  try {
    return Response.json(await matches().state(token), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return matchErrorResponse(e);
  }
}
