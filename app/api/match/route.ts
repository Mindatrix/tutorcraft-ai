import { ensureTutorProfile, requireTutor, UNAUTHORIZED } from '../../../src/server/auth';
import { matchErrorResponse, matches } from '../../../src/server/matches';
import { rateLimit } from '../../../src/server/rateLimit';

/**
 * Tutor: open a live class match for one of your battles (B2.2). Idempotent: while a match of
 * this battle is not over, the same one comes back. Body: { battleId, stageSeconds? }
 * (stageSeconds 10–1800, default 300 = 6 stages × 5 minutes; shorter only for trial runs).
 */
export async function POST(req: Request) {
  const tutor = await requireTutor(req);
  if (!tutor) return Response.json(UNAUTHORIZED, { status: 401 });
  if (!rateLimit(`match-create:${tutor.id}`, 20, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  const battleId = typeof body.battleId === 'string' ? body.battleId.slice(0, 64) : '';
  if (!battleId) return Response.json({ error: 'Thiếu battleId.' }, { status: 400 });
  const stageSeconds = Number(body.stageSeconds);
  try {
    await ensureTutorProfile(tutor);
    const res = await matches().create(tutor.id, battleId, Number.isFinite(stageSeconds) ? { stageMs: stageSeconds * 1000 } : {});
    return Response.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return matchErrorResponse(e);
  }
}

/** Tutor: the live view of a match (?id=) or of the latest match of a battle (?battleId=). */
export async function GET(req: Request) {
  const tutor = await requireTutor(req);
  if (!tutor) return Response.json(UNAUTHORIZED, { status: 401 });
  if (!rateLimit(`match-view:${tutor.id}`, 240, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  const url = new URL(req.url);
  try {
    const res = await matches().tutorMatch(tutor.id, { matchId: url.searchParams.get('id') ?? undefined, battleId: url.searchParams.get('battleId') ?? undefined });
    return Response.json({ match: res }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return matchErrorResponse(e);
  }
}
