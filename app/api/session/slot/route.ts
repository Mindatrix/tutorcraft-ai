import { rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../../src/server/sessions';

/**
 * WP7 class match: the schedule point of the student's current question, for the countdown and
 * the golden glow. { slot, serverNow } — slot is null for solo / demo sessions or after the last
 * point. Times are server epoch ms (compare with serverNow, not the device clock).
 */
export async function GET(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`slot:${token.slice(-24)}`, 60, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  try {
    const view = await sessions.current(token);
    return Response.json({ slot: view.slot ?? null, serverNow: Date.now() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return sessionErrorResponse(e);
  }
}
