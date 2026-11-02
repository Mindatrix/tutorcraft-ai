import { isDemoBattleId } from '../engine';
import { loadBattle } from './battles';
import { realtimeBroadcaster } from './matchBroadcast';
import { createMatchService, MatchError, type MatchService } from './matchService';
import { rewards } from './rewards';
import { SupabaseMatchStore } from './matchStore';
import { rateLimitShared } from './rateLimit';
import { scenarioMeta } from './scenarios';
import { SessionError, peekSession, type ActGuard } from './sessionService';
import { sessions } from './sessions';
import { serverSupabase } from './supabase-server';

// Wiring for class matches (phase B): Supabase tables, Realtime broadcasts, student sessions.

let service: MatchService | null = null;

export function matches(): MatchService {
  if (service) return service;
  const db = serverSupabase();
  if (!db) throw new MatchError(503, 'Chưa cấu hình Supabase.');
  service = createMatchService({
    store: new SupabaseMatchStore(db),
    broadcaster: realtimeBroadcaster(),
    loadBattle, // not cached: ownership is checked against the current row
    session: (token) => sessions.student(token),
    scenario: scenarioMeta,
    rewards: rewards() ?? undefined,
  });
  return service;
}

/**
 * B2.8 / B2.9 durable limits for answers, shared by every server instance (rate_limits table):
 * per student session and per class. The in-memory limits in the route stay as a first, free line.
 * Started before the session is loaded and awaited before anything is written.
 */
export function answerGuard(token: string): ActGuard | undefined {
  const p = peekSession(token);
  if (!p) return undefined;
  const checks = [rateLimitShared(`answer:${p.sid}`, 60, 60_000)];
  if (!isDemoBattleId(p.bid)) checks.push(rateLimitShared(`answer-class:${p.bid}`, 3000, 60_000));
  return Promise.all(checks).then((r) => r.find((x) => !x.ok) ?? r[0]);
}

/** After a graded answer: feed the class match (scores, stage, Survival rules) without delaying the reply. */
export function matchAnswerTask(res: { matchId?: string | null; sessionId?: string; scored?: { correct: boolean; stars: number } | null; streak?: { wrongAt: number[] } | null }) {
  if (!res.matchId || !res.sessionId || !res.scored) return null;
  const { sessionId, scored } = res;
  const wrongAt = res.streak?.wrongAt ?? [];
  return () =>
    matches()
      .onAnswer(sessionId, { ...scored, wrongAt })
      .then(
        () => undefined,
        (e: unknown) => console.error('match onAnswer failed:', (e as Error).message),
      );
}

export function matchErrorResponse(e: unknown): Response {
  if (e instanceof MatchError) return Response.json({ error: e.message, ...(e.extra ?? {}) }, { status: e.status });
  if (e instanceof SessionError) return Response.json({ error: e.message }, { status: e.status });
  console.error('match error:', e instanceof Error ? e.message : String(e));
  return Response.json({ error: 'Lỗi máy chủ.' }, { status: 500 });
}
