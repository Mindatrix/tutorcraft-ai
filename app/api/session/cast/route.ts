import { clientKey, rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../../src/server/sessions';

/** Cast a skill. MP is checked against the server's own replay, never the client's number. */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  const byToken = rateLimit(`cast-token:${token.slice(-24)}`, 60, 60_000);
  const byIp = rateLimit(`cast-ip:${clientKey(req)}`, 1000, 60_000);
  if (!byToken.ok || !byIp.ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    const res = await sessions.act(token, { kind: 'cast', skill: body.skill });
    return Response.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return sessionErrorResponse(e);
  }
}
