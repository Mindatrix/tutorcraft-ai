import { matchErrorResponse, matches } from '../../../../src/server/matches';
import { RewardError } from '../../../../src/server/rewardService';
import { rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER } from '../../../../src/server/sessions';

/** C4.18 open the gift box after the match: coins only (20–100), once per match, a few per day. */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`box:${token.slice(-24)}`, 10, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  try {
    return Response.json(await matches().openBox(token), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof RewardError) return Response.json({ error: e.message }, { status: e.status });
    return matchErrorResponse(e);
  }
}
