import type { SupabaseClient } from '@supabase/supabase-js';

// Coin wallet + ledger (phase C4.17, migration 20261027_coins_seasons.sql). One ledger row per
// event; the wallet balance moves only together with a ledger row, in one database function
// (coin_apply), which also enforces:
//  - once per (student, reason, ref): a retried or replayed request never pays twice;
//  - spending never goes below 0;
//  - a per-minute cap on one reason (answers) and a per-match cap on everything earned;
//  - a per-day cap on one reason (gift boxes).
// MemoryCoinStore mirrors those rules for tests.

export type CoinReason = 'answer' | 'chot' | 'stage' | 'golden_accept' | 'hint' | 'box' | 'rescue';
export const COIN_REASONS: CoinReason[] = ['answer', 'chot', 'stage', 'golden_accept', 'hint', 'box', 'rescue'];

export interface CoinEntry {
  studentKey: string;
  /** > 0 earn, < 0 spend, 0 = a marker (golden challenge accepted). */
  delta: number;
  reason: CoinReason;
  /** Unique per student and reason: `${sessionId}:${qid}`, `${matchId}`… */
  ref: string;
  matchId?: string | null;
  sessionId?: string | null;
  meta?: Record<string, unknown>;
}

export interface CoinLimits {
  /** At most this many rows of `entry.reason` per student in the last minute. */
  perMinute?: number;
  /** At most this many coins earned per student in this match (every reason). */
  matchCap?: number;
  /** At most this many rows of `entry.reason` per student since midnight UTC. */
  perDay?: number;
}

export type CoinCode = 'ok' | 'duplicate' | 'rate' | 'cap' | 'funds' | 'invalid';

export interface CoinResult {
  ok: boolean;
  code: CoinCode;
  /** Coins actually moved (a cap can trim an award; 0 when refused). */
  applied: number;
  balance: number;
}

export interface LedgerRow extends CoinEntry {
  id: number;
  at: number;
  balanceAfter: number;
}

export interface CoinStore {
  apply(e: CoinEntry, limits: CoinLimits, now: number): Promise<CoinResult>;
  has(studentKey: string, reason: CoinReason, ref: string): Promise<boolean>;
  balance(studentKey: string): Promise<number>;
  ledger(studentKey: string, limit?: number): Promise<LedgerRow[]>;
}

const MINUTE = 60_000;

export class MemoryCoinStore implements CoinStore {
  rows: LedgerRow[] = [];
  wallets = new Map<string, number>();
  private chain: Promise<unknown> = Promise.resolve();

  async apply(e: CoinEntry, limits: CoinLimits, now: number): Promise<CoinResult> {
    // One at a time, like the database row lock on the wallet.
    const run = this.chain.then(() => this.applyNow(e, limits, now));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private applyNow(e: CoinEntry, limits: CoinLimits, now: number): CoinResult {
    const bal = this.wallets.get(e.studentKey) ?? 0;
    const refuse = (code: CoinCode): CoinResult => ({ ok: false, code, applied: 0, balance: bal });
    if (!e.studentKey || !e.ref || !Number.isInteger(e.delta)) return refuse('invalid');
    const mine = this.rows.filter((r) => r.studentKey === e.studentKey);
    if (mine.some((r) => r.reason === e.reason && r.ref === e.ref)) return refuse('duplicate');
    if (limits.perMinute != null && mine.filter((r) => r.reason === e.reason && now - r.at < MINUTE).length >= limits.perMinute) return refuse('rate');
    if (limits.perDay != null) {
      const day = new Date(now);
      const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
      if (mine.filter((r) => r.reason === e.reason && r.at >= midnight).length >= limits.perDay) return refuse('cap');
    }
    let delta = e.delta;
    if (delta > 0 && limits.matchCap != null && e.matchId) {
      const earned = mine.filter((r) => r.matchId === e.matchId && r.delta > 0).reduce((s, r) => s + r.delta, 0);
      delta = Math.min(delta, limits.matchCap - earned);
      if (delta <= 0) return refuse('cap');
    }
    if (delta < 0 && bal + delta < 0) return refuse('funds');
    const balance = bal + delta;
    this.wallets.set(e.studentKey, balance);
    this.rows.push({ ...e, delta, id: this.rows.length + 1, at: now, balanceAfter: balance });
    return { ok: true, code: 'ok', applied: delta, balance };
  }

  async has(studentKey: string, reason: CoinReason, ref: string) {
    return this.rows.some((r) => r.studentKey === studentKey && r.reason === reason && r.ref === ref);
  }

  async balance(studentKey: string) {
    return this.wallets.get(studentKey) ?? 0;
  }

  async ledger(studentKey: string, limit = 50) {
    return this.rows.filter((r) => r.studentKey === studentKey).slice(-limit).reverse();
  }
}

export class SupabaseCoinStore implements CoinStore {
  constructor(private db: SupabaseClient) {}

  async apply(e: CoinEntry, limits: CoinLimits): Promise<CoinResult> {
    const { data, error } = await this.db.rpc('coin_apply', {
      p_key: e.studentKey,
      p_delta: e.delta,
      p_reason: e.reason,
      p_ref: e.ref,
      p_match: e.matchId ?? null,
      p_session: e.sessionId ?? null,
      p_meta: e.meta ?? {},
      p_per_minute: limits.perMinute ?? null,
      p_match_cap: limits.matchCap ?? null,
      p_per_day: limits.perDay ?? null,
    });
    if (error) throw new Error(`coin_apply: ${error.message}`);
    const r = data as { ok: boolean; code: CoinCode; applied: number; balance: number };
    return { ok: !!r.ok, code: r.code, applied: Number(r.applied) || 0, balance: Number(r.balance) || 0 };
  }

  async has(studentKey: string, reason: CoinReason, ref: string) {
    const { data, error } = await this.db.from('coin_ledger').select('id').eq('student_key', studentKey).eq('reason', reason).eq('ref', ref).limit(1);
    if (error) throw new Error(`coin_ledger: ${error.message}`);
    return (data ?? []).length > 0;
  }

  async balance(studentKey: string) {
    const { data, error } = await this.db.from('coin_wallets').select('balance').eq('student_key', studentKey).maybeSingle();
    if (error) throw new Error(`coin_wallets: ${error.message}`);
    return Number((data as { balance?: number } | null)?.balance ?? 0);
  }

  async ledger(studentKey: string, limit = 50) {
    const { data, error } = await this.db
      .from('coin_ledger')
      .select('id, student_key, delta, reason, ref, match_id, session_id, meta, balance_after, created_at')
      .eq('student_key', studentKey)
      .order('id', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`coin_ledger: ${error.message}`);
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: Number(r.id),
      studentKey: String(r.student_key),
      delta: Number(r.delta),
      reason: r.reason as CoinReason,
      ref: String(r.ref),
      matchId: (r.match_id as string | null) ?? null,
      sessionId: (r.session_id as string | null) ?? null,
      meta: (r.meta as Record<string, unknown>) ?? {},
      balanceAfter: Number(r.balance_after),
      at: Date.parse(String(r.created_at)),
    }));
  }
}
