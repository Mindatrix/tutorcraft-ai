import { after } from 'next/server';
import { answerGuard, matchAnswerTask } from '../../../../src/server/matches';
import { answerCoins } from '../../../../src/server/rewards';
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
  // B2.8: a burst (e.g. 100 requests in one second from a script) is cut at 5 per second per student.
  const burst = rateLimit(`pair-burst:${token.slice(-24)}`, 5, 1000);
  if (!burst.ok || !byToken.ok || !byIp.ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    const res = await sessions.act(token, { kind: 'pair', questionId: body.questionId, left: body.left, right: body.right }, answerGuard(token));
    const task = matchAnswerTask(res);
    if (task) after(task);
    // C4.16 coins when the last pair completes the question (server grading and timing only).
    const coins = await answerCoins(res);
    const { sessionId: _sid, matchId: _mid, studentKey: _key, streak: _streak, ...out } = res;
    void _sid;
    void _mid;
    void _key;
    void _streak;
    return Response.json({ ...out, coins }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return sessionErrorResponse(e);
  }
}
