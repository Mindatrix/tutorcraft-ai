import { rewardErrorResponse, rewardsFor } from '../../../../src/server/rewards';
import { rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../../src/server/sessions';

/**
 * C4.9 the student takes the golden challenge for the current question. Only at a golden point of
 * the class schedule while it is open (checked on the server with the match clock). WP7: the
 * question is swapped for a harder one, then that question pays double; a wrong answer only ends
 * the streak. Reply: { ok, view } with the new question (answer key never included).
 */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`golden:${token.slice(-24)}`, 10, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  try {
    const g = await sessions.takeGolden(token);
    const svc = rewardsFor(g.battleId);
    // The coin marker is on the NEW question: its answer pays ×2.
    const ok = svc && g.qid != null ? await svc.acceptGolden({ studentKey: g.studentKey, sessionId: g.sessionId, matchId: g.matchId, qid: g.qid }) : false;
    return Response.json({ ok, view: g.view }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return rewardErrorResponse(e) ?? sessionErrorResponse(e);
  }
}
