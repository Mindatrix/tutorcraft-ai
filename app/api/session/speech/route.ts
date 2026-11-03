import { rateLimit, rateLimitShared, clientKey } from '../../../../src/server/rateLimit';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../../src/server/sessions';
import { speechErrorResponse, speechRules, speechService } from '../../../../src/server/speech';
import { peekSession } from '../../../../src/server/sessionService';
import { after } from 'next/server';
import { campQuestTask, portalResonanceTask } from '../../../../src/server/matches';

/**
 * Pronunciation layer (docs/pronunciation_logic_handoff.md §3).
 *
 * GET  → { voice: { enabled, lang }, targets: SpeechTarget[] }: words and sentences of questions the
 *        student has already answered (their answers were revealed), with attempts left.
 * POST → score one attempt. Body: { targetId, mode: 'shadow' | 'dictate' | 'repeat',
 *        transcript?, alternatives?: [{ transcript, confidence? }] (≤ 5), confidence?, durationMs?, typed? }.
 *        The server scores it from the target text it holds; any score / stars / passed sent are ignored.
 *        No audio is ever accepted.
 */
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`speech-list:${token.slice(-24)}`, 60, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  try {
    const ctx = await sessions.speechContext(token);
    return Response.json(await speechService().targets(ctx), { headers: noStore });
  } catch (e) {
    return speechErrorResponse(e) ?? sessionErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  // ≤ 6 voice submissions per student per minute, counted across server instances (rate_limits),
  // plus a burst cut and a per-IP ceiling for a whole classroom behind one address.
  const sid = peekSession(token)?.sid ?? token.slice(-24);
  const burst = rateLimit(`speech-burst:${sid}`, 2, 1000);
  const byIp = rateLimit(`speech-ip:${clientKey(req)}`, 600, 60_000);
  if (!burst.ok || !byIp.ok) return Response.json({ error: 'Quá nhiều yêu cầu.', reason: 'rate_limited', retryAfterSec: Math.max(burst.retryAfterSec, byIp.retryAfterSec, 1) }, { status: 429 });
  // The shared counter (a database round trip) runs in parallel with reading the body and the session.
  const perMinP = rateLimitShared(`speech:${sid}`, speechRules().submissionsPerMinute, 60_000);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    const [perMin, ctx] = await Promise.all([perMinP, sessions.speechContext(token)]);
    if (!perMin.ok) return Response.json({ error: `Nói chậm lại một chút. Thử lại sau ${perMin.retryAfterSec}s.`, reason: 'rate_limited', retryAfterSec: perMin.retryAfterSec }, { status: 429 });
    const reply = await speechService().submit(ctx, body);
    // Multiverse class match: the server-graded attempt feeds the squad portal quorum.
    const task = portalResonanceTask(ctx, reply, body.mode);
    if (task) after(task);
    // Summer Camp class match: the passed stone counts for the student's tent Quest Board.
    const camp = campQuestTask(ctx, reply);
    if (camp) after(camp);
    return Response.json(reply, { headers: noStore });
  } catch (e) {
    return speechErrorResponse(e) ?? sessionErrorResponse(e);
  }
}
