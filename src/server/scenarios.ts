import { isGameMode, normalizeScenarioKey, sanitizeSubtitleMap, type GameMode, type SubtitleLine } from '../engine';
import { serverSupabase } from './supabase-server';

// Story scenarios (game_scenarios: 6 games × 5) — read with the service role, cached in memory.
// Subtitles are not secret (they are the story text the students see), so they ride along with
// the public battle info; questions and answers never do.

export interface ScenarioSummary {
  id: string;
  game: GameMode;
  seq: number;
  title: string;
  story: string;
  stages: number;
  /** Stages that have level-aware subtitle lines. */
  subtitleStages: number;
}

const TTL_MS = 5 * 60_000;
const listCache = new Map<string, { at: number; rows: ScenarioSummary[] }>();
const subCache = new Map<string, { at: number; subs: Record<number, SubtitleLine[]> }>();

/** Active scenarios, optionally of one game, in story order. */
export async function listScenarios(game?: GameMode): Promise<ScenarioSummary[]> {
  const key = game ?? '*';
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
  const db = serverSupabase();
  if (!db) return [];
  let q = db.from('game_scenarios').select('id, game, seq, title, story, stages, subtitles').eq('active', true).order('game').order('seq');
  if (game) q = q.eq('game', game);
  const { data, error } = await q;
  if (error || !data) return hit?.rows ?? [];
  const rows = (data as Record<string, unknown>[])
    .filter((r) => isGameMode(r.game))
    .map((r) => ({
      id: String(r.id),
      game: r.game as GameMode,
      seq: Number(r.seq) || 0,
      title: String(r.title ?? ''),
      story: String(r.story ?? '').slice(0, 400),
      stages: Array.isArray(r.stages) ? r.stages.length : 0,
      subtitleStages: Object.keys(sanitizeSubtitleMap(r.subtitles)).length,
    }));
  listCache.set(key, { at: Date.now(), rows });
  return rows;
}

/** Stage → subtitle lines for one scenario ({} when unknown or none authored yet). */
export async function scenarioSubtitles(rawKey: unknown): Promise<Record<number, SubtitleLine[]>> {
  const id = normalizeScenarioKey(rawKey);
  if (!id) return {};
  const hit = subCache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.subs;
  const db = serverSupabase();
  if (!db) return {};
  const { data, error } = await db.from('game_scenarios').select('subtitles').eq('id', id).maybeSingle();
  if (error) return hit?.subs ?? {};
  const subs = sanitizeSubtitleMap(data?.subtitles);
  if (subCache.size > 200) subCache.delete(subCache.keys().next().value!);
  subCache.set(id, { at: Date.now(), subs });
  return subs;
}

const metaCache = new Map<string, { at: number; meta: { tags: string[]; species: string[] } | null }>();

/** Tags (night, storm…) and fish species of a scenario, for planRun() at the start of a match. */
export async function scenarioMeta(rawKey: unknown): Promise<{ tags: string[]; species: string[] } | null> {
  const id = normalizeScenarioKey(rawKey);
  if (!id) return null;
  const hit = metaCache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.meta;
  const db = serverSupabase();
  if (!db) return null;
  const { data, error } = await db.from('game_scenarios').select('tags, asset_ids').eq('id', id).maybeSingle();
  if (error) return hit?.meta ?? null;
  const meta = data
    ? {
        tags: (Array.isArray(data.tags) ? data.tags : []).filter((t: unknown): t is string => typeof t === 'string'),
        species: (Array.isArray(data.asset_ids) ? data.asset_ids : []).filter((a: unknown): a is string => typeof a === 'string' && /^fish_/.test(a) && !/_(rod|bait|bobber|scale|net|hook)/.test(a)),
      }
    : null;
  if (metaCache.size > 200) metaCache.delete(metaCache.keys().next().value!);
  metaCache.set(id, { at: Date.now(), meta });
  return meta;
}
