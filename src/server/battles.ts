import {
  DEMO_BATTLE_ID,
  demoBattle,
  normalizeConfig,
  validateBattlePayload,
  type BattleConfig,
  type Question,
} from '../engine';
import { serverSupabase } from './supabase-server';

export interface LoadedBattle {
  id: string;
  topic: string;
  config: BattleConfig & { classCode: string };
  questions: Question[];
}

/** Load a battle with server credentials and re-validate its questions. */
export async function loadBattle(id: string): Promise<LoadedBattle | null> {
  if (id === DEMO_BATTLE_ID) {
    const d = demoBattle();
    return { id, topic: d.topic, config: { ...d.config, classCode: 'demo' }, questions: d.payload.questions };
  }
  const db = serverSupabase();
  if (!db) return null;
  const { data, error } = await db.from('battles').select('*').eq('id', id).single();
  if (error || !data) return null;
  const cfg = (data.config ?? {}) as Record<string, unknown>;
  const config = normalizeConfig({ theme: data.theme, durationMinutes: legacyDuration(data, cfg), ...cfg });
  const questions = validateBattlePayload({ questions: data.questions }).questions;
  return {
    id,
    topic: data.raw_input ?? '',
    config: { ...config, classCode: typeof cfg.classCode === 'string' ? cfg.classCode : 'default' },
    questions,
  };
}

/** Battles saved before the config column existed: derive a duration from their question count. */
function legacyDuration(row: { questions?: unknown[] }, cfg: Record<string, unknown>): number {
  if (cfg.durationMinutes) return Number(cfg.durationMinutes);
  const n = Array.isArray(row.questions) ? row.questions.length : 2;
  return Math.max(1, Math.round(n / 1.5));
}
