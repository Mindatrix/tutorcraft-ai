import { rewardErrorResponse, rewards } from '../../../../src/server/rewards';
import { matchErrorResponse, matches } from '../../../../src/server/matches';
import { rateLimit } from '../../../../src/server/rateLimit';
import { SESSION_HEADER, sessions } from '../../../../src/server/sessions';

/**
 * C4.9 the student takes the golden challenge for the current question. Only at a golden point of
 * the class schedule (checked here with the match clock); the answer then pays double, a wrong one
 * only ends the streak.
 */
export async function POST(req: Request) {
  const token = req.headers.get(SESSION_HEADER) ?? '';
  if (!rateLimit(`golden:${token.slice(-24)}`, 10, 60_000).ok) return Response.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 });
  const svc = rewards();
  if (!svc) return Response.json({ error: 'Chưa bật xu.' }, { status: 503 });
  try {
    const ctx = await sessions.questionContext(token);
    if (!ctx.question) return Response.json({ error: 'Không có câu hỏi đang mở.' }, { status: 409 });
    if (!ctx.matchId || !(await matches().goldenNow(ctx.matchId))) return Response.json({ error: 'Chưa có vật phát sáng lúc này.' }, { status: 409 });
    const ok = await svc.acceptGolden({ studentKey: ctx.studentKey, sessionId: ctx.sessionId, matchId: ctx.matchId, qid: ctx.question.id });
    return Response.json({ ok }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return rewardErrorResponse(e) ?? matchErrorResponse(e);
  }
}
