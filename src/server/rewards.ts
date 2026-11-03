import { isDemoBattleId } from '../engine';
import { MemoryCoinStore, SupabaseCoinStore } from './coinStore';
import { RewardError, createRewardService, type AnswerReward, type RewardService } from './rewardService';
import { SessionError } from './sessionService';
import { serverSupabase } from './supabase-server';

// Wiring for C4 coins: the Supabase ledger (coin_apply) and the student's session.

let service: RewardService | null | undefined;

/** null when Supabase is not configured (demo / local without a database): coins are off. */
export function rewards(): RewardService | null {
  if (service !== undefined) return service;
  const db = serverSupabase();
  service = db ? createRewardService({ coins: new SupabaseCoinStore(db) }) : null;
  return service;
}

// Demo sessions (`demo-*`) live in memory, so their coins do too: the demo still shows coins and can
// buy hints, but nothing reaches coin_wallets / coin_ledger in the real database.
const DEMO_MAX_ROWS = 20_000;
let demoStore: MemoryCoinStore | null = null;
let demoService: RewardService | null = null;

export function demoRewards(): RewardService {
  if (!demoService || !demoStore || demoStore.rows.length > DEMO_MAX_ROWS) {
    demoStore = new MemoryCoinStore();
    demoService = createRewardService({ coins: demoStore });
  }
  return demoService;
}

/** The coin service for a session's battle: in memory for the demo, the Supabase ledger otherwise. */
export function rewardsFor(battleId: string): RewardService | null {
  return isDemoBattleId(battleId) ? demoRewards() : rewards();
}

/** Coins for a graded answer; a coin failure never fails the answer (it is logged and skipped). */
export async function answerCoins(res: {
  battleId: string;
  sessionId: string;
  studentKey: string;
  matchId: string | null;
  scored: { correct: boolean } | null;
  streak: { qid: number; timeMs: number; rightInRow: number } | null;
}): Promise<Pick<AnswerReward, 'total' | 'fast' | 'multiplier' | 'golden' | 'awarded' | 'balance'> | null> {
  const svc = rewardsFor(res.battleId);
  if (!svc || !res.scored || !res.streak) return null;
  try {
    const r = await svc.answer({ studentKey: res.studentKey, sessionId: res.sessionId, matchId: res.matchId, qid: res.streak.qid, correct: res.scored.correct, timeMs: res.streak.timeMs, rightInRow: res.streak.rightInRow });
    return { total: r.total, fast: r.fast, multiplier: r.multiplier, golden: r.golden, awarded: r.awarded, balance: r.balance };
  } catch (e) {
    console.warn('coins skipped:', (e as Error).message);
    return null;
  }
}

export function rewardErrorResponse(e: unknown): Response | null {
  if (e instanceof RewardError) return Response.json({ error: e.message, ...(e.extra ?? {}) }, { status: e.status });
  if (e instanceof SessionError) return Response.json({ error: e.message }, { status: e.status });
  return null;
}
