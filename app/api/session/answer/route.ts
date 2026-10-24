import { clientKey, rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../../src/server/sessions';

/**
 * Lock in an answer. The server checks it, times it with its own clock, and only
 * then reveals the correct option and explanation.
 * Body: { questionId, chosenIdx } for multiple choice (-1 = timeout), or
 *       { questionId, response } for written / cloze (string[]) / reorder (chip ids).
 * Any score the client sends is ignored — open answers are graded here.
 */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  const byToken = rateLimit(`answer-token:${token.slice(-24)}`, 120, 60_000);
  const byIp = rateLimit(`answer-ip:${clientKey(req)}`, 300, 60_000);
  if (!byToken.ok || !byIp.ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    const res = await sessions.act(token, { kind: 'answer', questionId: body.questionId, chosenIdx: body.chosenIdx, response: body.response });
    return Response.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return sessionErrorResponse(e);
  }
}
