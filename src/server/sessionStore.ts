import type { SupabaseClient } from '@supabase/supabase-js';
import type { BattleScore, RaceOutcome, SessionLogEntry, TeamId } from '../engine';

export interface SessionRecord {
  id: string;
  battleId: string;
  variant: number | null;
  studentKey: string;
  nickname: string;
  avatar: string;
  startedAt: number;
  log: SessionLogEntry[];
  status: 'active' | 'finished' | 'flagged';
  flags: string[];
  result: (BattleScore & { hpRemaining: number; race?: RaceOutcome | null }) | null;
  version: number;
  /** Boat Race team (A/B), assigned by join order. */
  team?: TeamId | null;
  /**
   * false = the match is over but its row is not in battle_results yet (final submit not
   * received, or the insert failed). true = written. null/undefined = still playing / n/a.
   */
  resultSaved?: boolean | null;
}

export interface SessionStore {
  create(rec: SessionRecord): Promise<void>;
  get(id: string): Promise<SessionRecord | null>;
  /** Sessions already started for this battle (decides the next player's team). */
  countForBattle(battleId: string): Promise<number>;
  /** Optimistic concurrency: false if someone else updated first (e.g. a double-click race). */
  update(rec: SessionRecord, expectedVersion: number): Promise<boolean>;
  /** Over-but-unsaved sessions (resultSaved === false) untouched for at least `idleMs`. */
  listPending(limit: number, idleMs: number): Promise<SessionRecord[]>;
}

/** Used for the demo battle (no database) and in tests. */
export class MemorySessionStore implements SessionStore {
  private map = new Map<string, SessionRecord>();
  async create(rec: SessionRecord) {
    if (this.map.size > 2000) this.map.delete(this.map.keys().next().value!);
    this.map.set(rec.id, structuredClone(rec));
  }
  async countForBattle(battleId: string) {
    let n = 0;
    for (const r of this.map.values()) if (r.battleId === battleId) n++;
    return n;
  }
  async get(id: string) {
    const r = this.map.get(id);
    return r ? structuredClone(r) : null;
  }
  async update(rec: SessionRecord, expectedVersion: number) {
    const cur = this.map.get(rec.id);
    if (!cur || cur.version !== expectedVersion) return false;
    this.map.set(rec.id, structuredClone({ ...rec, version: expectedVersion + 1, updatedAt: Date.now() }));
    return true;
  }
  async listPending(limit: number, idleMs: number) {
    const out: SessionRecord[] = [];
    const cutoff = Date.now() - idleMs;
    for (const r of this.map.values() as Iterable<SessionRecord & { updatedAt?: number }>) {
      if (r.resultSaved === false && r.status !== 'flagged' && (r.updatedAt ?? r.startedAt) <= cutoff) out.push(structuredClone(r));
      if (out.length >= limit) break;
    }
    return out;
  }
}

type Row = {
  id: string;
  battle_id: string;
  variant: number | null;
  student_key: string;
  nickname: string;
  avatar: string;
  started_at: string;
  log: SessionLogEntry[];
  status: SessionRecord['status'];
  flags: string[];
  result: SessionRecord['result'];
  version: number;
  team: TeamId | null;
  result_saved?: boolean | null;
};

/** Older databases may not have result_saved yet (schema.sql not re-run): keep working without it. */
const missingSavedColumn = (msg: string) => /result_saved/.test(msg);

export class SupabaseSessionStore implements SessionStore {
  constructor(private db: SupabaseClient) {}

  private toRow(rec: SessionRecord): Omit<Row, 'version'> {
    return {
      id: rec.id,
      battle_id: rec.battleId,
      variant: rec.variant,
      student_key: rec.studentKey,
      nickname: rec.nickname,
      avatar: rec.avatar,
      started_at: new Date(rec.startedAt).toISOString(),
      log: rec.log,
      status: rec.status,
      flags: rec.flags,
      result: rec.result,
      team: rec.team ?? null,
      ...(rec.resultSaved === undefined ? {} : { result_saved: rec.resultSaved }),
    };
  }

  private fromRow(r: Row): SessionRecord {
    return {
      id: r.id,
      battleId: r.battle_id,
      variant: r.variant,
      studentKey: r.student_key,
      nickname: r.nickname,
      avatar: r.avatar,
      startedAt: Date.parse(r.started_at),
      log: r.log ?? [],
      status: r.status,
      flags: r.flags ?? [],
      result: r.result,
      version: r.version,
      team: r.team ?? null,
      resultSaved: r.result_saved ?? null,
    };
  }

  async countForBattle(battleId: string) {
    const { count, error } = await this.db.from('battle_sessions').select('id', { count: 'exact', head: true }).eq('battle_id', battleId);
    if (error) return 0;
    return count ?? 0;
  }

  async create(rec: SessionRecord) {
    const { error } = await this.db.from('battle_sessions').insert([{ ...this.toRow(rec), version: rec.version }]);
    if (error) throw new Error(error.message);
  }

  async get(id: string) {
    const { data, error } = await this.db.from('battle_sessions').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return this.fromRow(data as Row);
  }

  async update(rec: SessionRecord, expectedVersion: number) {
    const run = (row: Record<string, unknown>) =>
      this.db
        .from('battle_sessions')
        .update({ ...row, version: expectedVersion + 1, updated_at: new Date().toISOString() })
        .eq('id', rec.id)
        .eq('version', expectedVersion)
        .select('id');
    let { data, error } = await run(this.toRow(rec));
    if (error && missingSavedColumn(error.message)) {
      const { result_saved: _drop, ...row } = this.toRow(rec);
      void _drop;
      ({ data, error } = await run(row));
    }
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) === 1;
  }

  async listPending(limit: number, idleMs: number) {
    const { data, error } = await this.db
      .from('battle_sessions')
      .select('*')
      .eq('result_saved', false)
      .in('status', ['active', 'finished'])
      .lte('updated_at', new Date(Date.now() - idleMs).toISOString())
      .order('updated_at', { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return (data as Row[]).map((r) => this.fromRow(r));
  }
}
