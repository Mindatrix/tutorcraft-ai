import { after } from 'next/server';
import { answerGuard, matchAnswerTask } from '../../../../src/server/matches';
import { answerCoins } from '../../../../src/server/rewards';
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
  const byIp = rateLimit(`answer-ip:${clientKey(req)}`, 1500, 60_000);
  // B2.8: a burst (e.g. 100 requests in one second from a script) is cut at 5 per second per student.
  const burst = rateLimit(`answer-burst:${token.slice(-24)}`, 5, 1000);
  if (!burst.ok || !byToken.ok || !byIp.ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    const res = await sessions.act(token, { kind: 'answer', questionId: body.questionId, chosenIdx: body.chosenIdx, response: body.response }, answerGuard(token));
    const task = matchAnswerTask(res);
    if (task) after(task);
    // C4.16 coins, from the server's own grading, timing and streak (wrong = 0, never negative).
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
