import { clientKey, rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../../src/server/sessions';

/**
 * Matching: try one pair. Body: { questionId, left, right } where `right` is the
 * card's display id (shuffled per student). The server checks it, so the answer key
 * never reaches the browser; matching the last pair locks the question in (Ultimate).
 */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  const byToken = rateLimit(`pair-token:${token.slice(-24)}`, 150, 60_000);
  const byIp = rateLimit(`pair-ip:${clientKey(req)}`, 1500, 60_000);
  if (!byToken.ok || !byIp.ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    const res = await sessions.act(token, { kind: 'pair', questionId: body.questionId, left: body.left, right: body.right });
    return Response.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return sessionErrorResponse(e);
  }
}
