import { matchErrorResponse, matches } from '../../../../src/server/matches';
import { rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER } from '../../../../src/server/sessions';

/** C4.14 the helper answers the class-rescue question: { requestId, choice }. Graded on the server. */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`rescue:${token.slice(-24)}`, 10, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    return Response.json(await matches().answerRescue(token, body.requestId, body.choice), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return matchErrorResponse(e);
  }
}
