import { requireTutor, UNAUTHORIZED } from '../../../../src/server/auth';
import { matchErrorResponse, matches } from '../../../../src/server/matches';
import { rateLimit } from '../../../../src/server/rateLimit';

/** Tutor buttons: { action: 'start' | 'pause' | 'resume' | 'extend' | 'end' }, in that order only. */
export async function POST(req: Request, ctx: RouteContext<'/api/match/[id]'>) {
  const tutor = await requireTutor(req);
  if (!tutor) return Response.json(UNAUTHORIZED, { status: 401 });
  if (!rateLimit(`match-control:${tutor.id}`, 60, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    return Response.json(await matches().control(tutor.id, id, body.action), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return matchErrorResponse(e);
  }
}
