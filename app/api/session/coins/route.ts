import { rewardErrorResponse, rewardsFor } from '../../../../src/server/rewards';
import { rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../../src/server/sessions';

/** The student's coin balance (for the coin bar). Read only. */
export async function GET(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`coins:${token.slice(-24)}`, 30, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  try {
    const me = await sessions.student(token);
    const svc = rewardsFor(me.battleId);
    if (!svc) return Response.json({ balance: null }, { headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ balance: await svc.balance(me.studentKey) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return rewardErrorResponse(e) ?? sessionErrorResponse(e);
  }
}
