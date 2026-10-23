import type { SupabaseClient } from '@supabase/supabase-js';
import type { BattleScore, SessionLogEntry } from '../engine';

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
  result: (BattleScore & { hpRemaining: number }) | null;
  version: number;
}

export interface SessionStore {
  create(rec: SessionRecord): Promise<void>;
  get(id: string): Promise<SessionRecord | null>;
  /** Optimistic concurrency: false if someone else updated first (e.g. a double-click race). */
  update(rec: SessionRecord, expectedVersion: number): Promise<boolean>;
}

/** Used for the demo battle (no database) and in tests. */
export class MemorySessionStore implements SessionStore {
  private map = new Map<string, SessionRecord>();
  async create(rec: SessionRecord) {
    if (this.map.size > 2000) this.map.delete(this.map.keys().next().value!);
    this.map.set(rec.id, structuredClone(rec));
  }
  async get(id: string) {
    const r = this.map.get(id);
    return r ? structuredClone(r) : null;
  }
  async update(rec: SessionRecord, expectedVersion: number) {
    const cur = this.map.get(rec.id);
    if (!cur || cur.version !== expectedVersion) return false;
    this.map.set(rec.id, structuredClone({ ...rec, version: expectedVersion + 1 }));
    return true;
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
};

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
    };
  }

  async create(rec: SessionRecord) {
    const { error } = await this.db.from('battle_sessions').insert([{ ...this.toRow(rec), version: rec.version }]);
    if (error) throw new Error(error.message);
  }

  async get(id: string) {
    const { data, error } = await this.db.from('battle_sessions').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    const r = data as Row;
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
    };
  }

  async update(rec: SessionRecord, expectedVersion: number) {
    const { data, error } = await this.db
      .from('battle_sessions')
      .update({ ...this.toRow(rec), version: expectedVersion + 1, updated_at: new Date().toISOString() })
      .eq('id', rec.id)
      .eq('version', expectedVersion)
      .select('id');
    if (error) throw new Error(error.message);
    return (data?.length ?? 0) === 1;
  }
}
