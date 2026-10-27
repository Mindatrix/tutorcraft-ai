import { rewardErrorResponse, rewards } from '../../../../src/server/rewards';
import { rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../../src/server/sessions';

/**
 * C4.11–C4.12 buy a hint for the current question: { tier: 1 | 2 }.
 * The server checks the 8 s wait, takes the coins (3 / 5; tier 1 free after 2 wrong in a row) and
 * answers with the hint only: the Vietnamese meaning, or two WRONG options to fade. The answer key
 * never leaves the server (tests/coins.test.ts checks the reply).
 */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`hint:${token.slice(-24)}`, 20, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  const svc = rewards();
  if (!svc) return Response.json({ error: 'Chưa bật xu.' }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    const ctx = await sessions.questionContext(token);
    const reply = await svc.hint(ctx, body.tier);
    return Response.json(reply, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return rewardErrorResponse(e) ?? sessionErrorResponse(e);
  }
}
