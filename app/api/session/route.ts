import { normalizeBattleCode } from '../../../src/engine';
import { loadBattleByCode } from '../../../src/server/battles';
import { clientKey, rateLimit, rateLimitShared } from '../../../src/server/rateLimit';
import { SESSION_HEADER, sessionErrorResponse, sessions } from '../../../src/server/sessions';

/** Start a battle session. Returns an AES-256-GCM sealed token and the first question (no answer). */
export async function POST(req: Request) {
  // 150/min per IP: a whole class joins from one school Wi-Fi at once.
  const limit = await rateLimitShared(`session-start:${clientKey(req)}`, 150, 60_000);
  if (!limit.ok) return Response.json({ error: `Quá nhiều yêu cầu. Thử lại sau ${limit.retryAfterSec}s.` }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }
  try {
    let battleId = typeof body.battleId === 'string' ? body.battleId.slice(0, 64) : '';
    const code = normalizeBattleCode(body.code);
    if (!battleId && code) battleId = (await loadBattleByCode(code))?.id ?? '';
    if (!battleId) return Response.json({ error: 'Không tìm thấy đấu trường.' }, { status: 404 });
    const res = await sessions.start({ battleId, variant: body.variant, nickname: body.nickname, avatar: body.avatar, studentKey: body.studentKey });
    return Response.json(res, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return sessionErrorResponse(e);
  }
}

/** Resume: current state + current question for a session token. */
export async function GET(req: Request) {
  const token = req.headers.get(SESSION_HEADER);
  const limit = rateLimit(`session-get:${clientKey(req)}`, 300, 60_000);
  if (!limit.ok) return Response.json({ error: 'Too many requests' }, { status: 429 });
  try {
    return Response.json({ view: await sessions.current(token) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return sessionErrorResponse(e);
  }
}
