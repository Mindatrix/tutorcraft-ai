import { after } from 'next/server';
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
    // Owner, 03/11: at the end of a class match the server stores every student's result itself.
    onEnded: (info) => {
      const task = () =>
        sessions.finalizeMatch(info).then(
          (r) => {
            if (r.failed) console.error(`match ${info.matchId} ended: ${r.failed} result(s) not stored, retry queue will pick them up`);
          },
          (e: unknown) => console.error('finalize at match end failed:', e instanceof Error ? e.message : String(e)),
        );
      try {
        after(task); // keeps the work alive after the response on Vercel
      } catch {
        void task(); // outside a request (tests, scripts)
      }
    },
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

/**
 * PR #6 integration (03/11): a Multiverse class student's pronunciation attempt counts toward the
 * squad quorum (ceil(N × 0.6)) and is broadcast as PORTAL_RESONANCE_UPDATE. Score and pass come
 * from the SERVER's grading (the speech service reply), never from the request body.
 */
export function portalResonanceTask(
  ctx: { matchId: string | null; sessionId: string; game: string | null },
  reply: { accepted: boolean; targetId: string; score: number; passed: boolean },
  mode: unknown,
) {
  if (!ctx.matchId || ctx.game !== 'multiverse_portal' || !reply.accepted) return null;
  const matchId = ctx.matchId;
  const m = mode === 'dictate' || mode === 'repeat' ? mode : 'shadow';
  return () =>
    matches()
      .recordPortalResonance({ matchId, studentId: ctx.sessionId, targetId: reply.targetId, mode: m, score: reply.score, passed: reply.passed })
      .then(
        () => undefined,
        (e: unknown) => console.error('portal resonance failed:', (e as Error).message),
      );
}

export function matchErrorResponse(e: unknown): Response {
  if (e instanceof MatchError) return Response.json({ error: e.message, ...(e.extra ?? {}) }, { status: e.status });
  if (e instanceof SessionError) return Response.json({ error: e.message }, { status: e.status });
  console.error('match error:', e instanceof Error ? e.message : String(e));
  return Response.json({ error: 'Lỗi máy chủ.' }, { status: 500 });
}
