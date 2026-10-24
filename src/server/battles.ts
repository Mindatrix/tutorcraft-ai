import {
  DEMO_BATTLE_ID,
  computeScaling,
  defaultBoss,
  demoBattle,
  generateBattleCode,
  normalizeConfig,
  sanitizeBoss,
  validateBattlePayload,
  type BattleConfig,
  type BattleScaling,
  type BossProfile,
  type Question,
} from '../engine';
import { serverSupabase } from './supabase-server';

export type StoredConfig = BattleConfig & { classCode: string; code?: string; boss?: BossProfile; scaling?: BattleScaling; tutorName?: string };

export interface LoadedBattle {
  id: string;
  code: string | null;
  topic: string;
  config: BattleConfig & { classCode: string };
  boss: BossProfile;
  questions: Question[];
  tutorName: string;
}

type Row = Record<string, unknown> & { id: string; questions?: unknown[]; config?: Record<string, unknown> | null };

function fromRow(row: Row): LoadedBattle {
  const cfg = (row.config ?? {}) as Record<string, unknown>;
  const config = normalizeConfig({ theme: row.theme, durationMinutes: legacyDuration(row, cfg), ...cfg });
  const topic = typeof row.raw_input === 'string' ? row.raw_input : '';
  const questions = validateBattlePayload({ questions: row.questions }).questions;
  return {
    id: row.id,
    code: (typeof row.code === 'string' ? row.code : typeof cfg.code === 'string' ? cfg.code : null) as string | null,
    topic,
    config: { ...config, classCode: typeof cfg.classCode === 'string' ? cfg.classCode : 'default' },
    boss: sanitizeBoss(cfg.boss, defaultBoss(topic, config.themes)),
    questions,
    tutorName: typeof cfg.tutorName === 'string' ? cfg.tutorName.slice(0, 60) : '',
  };
}

/** Battles saved before the config column existed: derive a duration from their question count. */
function legacyDuration(row: { questions?: unknown[] }, cfg: Record<string, unknown>): number {
  if (cfg.durationMinutes) return Number(cfg.durationMinutes);
  const n = Array.isArray(row.questions) ? row.questions.length : 2;
  return Math.max(1, Math.round(n / 1.5));
}

export function demoLoadedBattle(): LoadedBattle {
  const d = demoBattle();
  return {
    id: DEMO_BATTLE_ID,
    code: null,
    topic: d.topic,
    config: { ...d.config, classCode: 'demo' },
    boss: d.payload.boss ?? defaultBoss(d.topic, d.config.themes),
    questions: d.payload.questions,
    tutorName: 'TutorCraft Demo',
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; battle: LoadedBattle }>();

/** Same as loadBattle, but cached for 5 minutes — every answer check needs the battle. */
export async function loadBattleCached(id: string): Promise<LoadedBattle | null> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.battle;
  const battle = await loadBattle(id);
  if (battle) {
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(id, { at: Date.now(), battle });
  }
  return battle;
}

/** Load a battle with server credentials and re-validate its questions. */
export async function loadBattle(id: string): Promise<LoadedBattle | null> {
  if (id === DEMO_BATTLE_ID) return demoLoadedBattle();
  if (!UUID.test(id)) return null;
  const db = serverSupabase();
  if (!db) return null;
  const { data, error } = await db.from('battles').select('*').eq('id', id).single();
  if (error || !data) return null;
  return fromRow(data as Row);
}

/** Look up by short battle code (column if migrated, else inside config). */
export async function loadBattleByCode(code: string): Promise<LoadedBattle | null> {
  const db = serverSupabase();
  if (!db) return null;
  const byColumn = await db.from('battles').select('*').eq('code', code).limit(1);
  if (!byColumn.error && byColumn.data?.[0]) return fromRow(byColumn.data[0] as Row);
  const byConfig = await db.from('battles').select('*').eq('config->>code', code).limit(1);
  if (!byConfig.error && byConfig.data?.[0]) return fromRow(byConfig.data[0] as Row);
  return null;
}

export interface SaveResult {
  id: string | null;
  code: string | null;
  warning?: string;
}

/** Theme values accepted by the original battles.theme check constraint. */
const LEGACY_THEME: Record<string, string> = { minecraft: 'survival', moba_lol: 'moba', sports_blitz: 'sports' };

/**
 * Insert a battle, adapting to databases where supabase/schema.sql hasn't fully run:
 * unknown column → drop that field; old theme check constraint → legacy theme value;
 * code collision → new code. The real theme list and boss always live in `config`.
 */
export async function saveBattle(input: {
  topic: string;
  config: StoredConfig;
  teachingNotes: string[];
  questions: Question[];
  tutorId?: string;
}): Promise<SaveResult> {
  const db = serverSupabase();
  if (!db) return { id: null, code: null, warning: 'Chưa cấu hình Supabase.' };

  let code = generateBattleCode();
  const row: Record<string, unknown> = {
    theme: input.config.themes[0],
    raw_input: input.topic,
    teaching_notes: input.teachingNotes.join('\n'),
    questions: input.questions,
    config: { ...input.config, code },
    code,
    ...(input.tutorId ? { tutor_id: input.tutorId } : {}),
  };
  const warnings: string[] = [];
  let lastError = '';

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await db.from('battles').insert([row]).select('id').single();
    if (!res.error) {
      const hasConfig = 'config' in row;
      return {
        id: res.data.id,
        code: hasConfig || 'code' in row ? code : null,
        warning: warnings.length ? `${warnings.join(' ')} Chạy supabase/schema.sql để cập nhật CSDL.` : undefined,
      };
    }
    lastError = res.error.message;
    const missingColumn = /'(\w+)' column|column\s+"?(?:\w+\.)?(\w+)"?\s+(?:of relation "\w+"\s+)?does not exist/i.exec(res.error.message);

    if (res.error.code === '23505') {
      code = generateBattleCode(); // code collision
      if ('code' in row) row.code = code;
      if ('config' in row) row.config = { ...input.config, code };
    } else if (res.error.code === '23514' && LEGACY_THEME[String(row.theme)] !== row.theme) {
      row.theme = LEGACY_THEME[String(row.theme)] ?? 'survival';
    } else if ((res.error.code === 'PGRST204' || res.error.code === '42703') && missingColumn) {
      const col = missingColumn[1] ?? missingColumn[2];
      if (!(col in row) || col === 'questions') break;
      delete row[col];
      warnings.push(col === 'config' ? 'Thiếu cột "config" — Boss, mã đấu trường và cấu hình chưa được lưu.' : `Thiếu cột "${col}".`);
    } else {
      break;
    }
  }
  return { id: null, code: null, warning: `Không lưu được vào Supabase: ${lastError}` };
}

/** What a student's browser may know about a battle before playing: no questions, no answers. */
export function publicBattle(b: LoadedBattle) {
  return {
    id: b.id,
    code: b.code,
    topic: b.topic,
    config: b.config,
    boss: b.boss,
    tutorName: b.tutorName,
    totalQuestions: b.questions.length,
    /** Weighted by format (essay ×3 …) — the lobby shows it without seeing any question. */
    bossMaxHp: computeScaling(b.config, b.questions.length, b.questions).bossHp,
  };
}
