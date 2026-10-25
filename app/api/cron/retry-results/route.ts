import { sessions } from '../../../../src/server/sessions';

// Server-side retry queue for battle results (see sessions.retryPending).
// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET" (vercel.json → crons).
// Any other scheduler (GitHub Actions, cron-job.org…) can call it the same way.

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'CRON_SECRET chưa được cấu hình.' }, { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const out = await sessions.retryPending(50, 2 * 60_000);
    return Response.json({ ok: true, ...out });
  } catch (e) {
    console.error('retry-results failed:', e instanceof Error ? e.message : String(e));
    return Response.json({ ok: false, error: 'Không quét được hàng đợi.' }, { status: 500 });
  }
}
