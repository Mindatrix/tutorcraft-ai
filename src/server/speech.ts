import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SPEECH_MODES,
  isDemoBattleId,
  normalizeSpeech,
  resolveSpeechRules,
  scoreDictation,
  scoreSpeech,
  speechAttemptOutcome,
  speechTargetsFor,
  type Question,
  type SpeechAlternative,
  type SpeechMode,
  type SpeechRules,
  type SpeechTarget,
} from '../engine';
import type { RewardService } from './rewardService';
import { rewards } from './rewards';
import { serverSupabase } from './supabase-server';

// Pronunciation layer on the server (docs/pronunciation_logic_handoff.md). The browser sends what the
// recogniser heard; the server knows the target text, scores it, counts attempts and pays. Any score,
// star or pass the browser sends is ignored. Audio never reaches us.

// ---------------------------------------------------------------------------------------------
// Rules: content/speech_rules.json over the engine defaults (read once; missing file = defaults).

let rulesCache: SpeechRules | null = null;
export function speechRules(): SpeechRules {
  if (rulesCache) return rulesCache;
  let raw: unknown = null;
  try {
    raw = JSON.parse(readFileSync(join(process.cwd(), 'content/speech_rules.json'), 'utf8'));
  } catch {
    /* not written yet: defaults */
  }
  rulesCache = resolveSpeechRules(raw);
  return rulesCache;
}

// ---------------------------------------------------------------------------------------------
// Attempts store

export interface SpeechAttemptRow {
  matchId: string | null;
  sessionId: string;
  studentKey: string;
  targetId: string;
  mode: SpeechMode;
  transcript: string;
  score: number;
  passed: boolean;
  stars: number;
  attemptNo: number;
  level: number;
  engine: 'webspeech' | 'typed' | 'none';
  detail: Record<string, unknown>;
}

export interface SpeechStore {
  /** Every attempt of this session (at most targets × 3 rows). */
  forSession(sessionId: string): Promise<SpeechAttemptRow[]>;
  /** false = this attempt number is already stored (a retried or racing request). */
  insert(row: SpeechAttemptRow): Promise<boolean>;
}

export class MemorySpeechStore implements SpeechStore {
  private rows = new Map<string, SpeechAttemptRow[]>();

  async forSession(sessionId: string) {
    return [...(this.rows.get(sessionId) ?? [])];
  }

  async insert(row: SpeechAttemptRow) {
    const list = this.rows.get(row.sessionId) ?? [];
    if (list.some((r) => r.targetId === row.targetId && r.attemptNo === row.attemptNo)) return false;
    if (this.rows.size > 5000 && !this.rows.has(row.sessionId)) this.rows.delete(this.rows.keys().next().value as string);
    this.rows.set(row.sessionId, [...list, row]);
    return true;
  }
}

export class SupabaseSpeechStore implements SpeechStore {
  constructor(private db: SupabaseClient) {}

  async forSession(sessionId: string) {
    const { data, error } = await this.db
      .from('speech_attempts')
      .select('match_id, session_id, student_key, target_id, mode, transcript, score, passed, stars, attempt_no, level, engine, detail')
      .eq('session_id', sessionId)
      .limit(500);
    if (error) throw new Error(`speech_attempts: ${error.message}`);
    return (data ?? []).map((r) => ({
      matchId: r.match_id,
      sessionId: r.session_id,
      studentKey: r.student_key,
      targetId: r.target_id,
      mode: r.mode,
      transcript: r.transcript,
      score: r.score,
      passed: r.passed,
      stars: r.stars,
      attemptNo: r.attempt_no,
      level: r.level,
      engine: r.engine,
      detail: r.detail ?? {},
    }));
  }

  async insert(row: SpeechAttemptRow) {
    const { error } = await this.db.from('speech_attempts').insert([
      {
        match_id: row.matchId,
        session_id: row.sessionId,
        student_key: row.studentKey,
        target_id: row.targetId,
        mode: row.mode,
        transcript: row.transcript,
        score: row.score,
        passed: row.passed,
        stars: row.stars,
        attempt_no: row.attemptNo,
        level: row.level,
        engine: row.engine,
        detail: row.detail,
      },
    ]);
    if (!error) return true;
    if (error.code === '23505') return false; // speech_attempts_once
    throw new Error(`speech_attempts: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Service

export class SpeechError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** What the session tells us (sessions.speechContext). `questions` carries answer keys: never sent. */
export interface SpeechContext {
  sessionId: string;
  battleId: string;
  studentKey: string;
  matchId: string | null;
  status: string;
  level: number;
  questions: Question[];
  answeredIds: number[];
}

export type SpeechRefusal = 'too_short' | 'no_attempts_left' | 'voice_disabled' | 'unknown_target';

export interface SpeechReply {
  targetId: string;
  accepted: boolean;
  reason?: SpeechRefusal;
  score: number;
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  almost?: boolean;
  attemptNo: number;
  attemptsLeft: number;
  bestScore: number;
  weakWords?: string[];
  hint?: 'mouth_shape';
  coins?: number;
  detail?: { wordScore: number; phonemeScore: number; confScore: number | null };
}

export interface VoiceConfig {
  enabled: boolean;
  lang: 'en-US' | 'en-GB';
}

const MAX_TEXT = 300;
const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, MAX_TEXT) : '');

function alternativesOf(body: Record<string, unknown>): SpeechAlternative[] {
  const conf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : undefined);
  const alts: SpeechAlternative[] = [];
  for (const a of (Array.isArray(body.alternatives) ? body.alternatives : []).slice(0, 5)) {
    if (!a || typeof a !== 'object') continue;
    const o = a as Record<string, unknown>;
    const t = text(o.transcript);
    if (t.trim()) alts.push({ transcript: t, confidence: conf(o.confidence) });
  }
  const main = text(body.transcript);
  if (main.trim() && !alts.some((a) => a.transcript === main)) alts.unshift({ transcript: main, confidence: conf(body.confidence) });
  return alts;
}

export function createSpeechService(deps: {
  storeFor: (ctx: SpeechContext) => SpeechStore;
  rewards: () => RewardService | null;
  rules?: () => SpeechRules;
  /**
   * Voice (microphone) mode is OFF by default (children, vendor speech cloud). Only the demo turns it on
   * until classes get a teacher toggle. Typed dictation and listen-and-repeat are always allowed.
   */
  voiceEnabled?: (ctx: SpeechContext) => boolean;
}) {
  const rules = deps.rules ?? speechRules;
  const voiceEnabled = deps.voiceEnabled ?? ((ctx: SpeechContext) => isDemoBattleId(ctx.battleId));

  /** The store, falling back to memory when the database table is missing (migration not applied). */
  const fallback = new MemorySpeechStore();
  async function safe<T>(ctx: SpeechContext, fn: (s: SpeechStore) => Promise<T>): Promise<T> {
    const store = deps.storeFor(ctx);
    try {
      return await fn(store);
    } catch (e) {
      if (store === fallback) throw e;
      console.warn('speech store unavailable, using memory:', (e as Error).message);
      return fn(fallback);
    }
  }

  function targets(ctx: SpeechContext) {
    return speechTargetsFor(ctx.questions, ctx.answeredIds, ctx.level, rules());
  }

  return {
    async targets(ctx: SpeechContext): Promise<{ voice: VoiceConfig; targets: SpeechTarget[] }> {
      const r = rules();
      const rows = await safe(ctx, (s) => s.forSession(ctx.sessionId));
      const enabled = voiceEnabled(ctx);
      return {
        voice: { enabled, lang: r.lang },
        targets: targets(ctx).map((t) => ({
          ...t,
          modes: enabled ? t.modes : t.modes.filter((m) => m !== 'shadow'),
          attemptsLeft: Math.max(0, r.maxAttempts - rows.filter((x) => x.targetId === t.targetId).length),
        })),
      };
    },

    async submit(ctx: SpeechContext, body: Record<string, unknown>): Promise<SpeechReply> {
      if (ctx.status === 'flagged') throw new SpeechError(409, 'Phiên đấu đã bị khoá.');
      const r = rules();
      const targetId = text(body.targetId).slice(0, 120);
      const mode = body.mode as SpeechMode;
      if (!SPEECH_MODES.includes(mode)) throw new SpeechError(400, 'Chế độ không hợp lệ.');

      const target = targets(ctx).find((t) => t.targetId === targetId);
      const rows = target ? await safe(ctx, (s) => s.forSession(ctx.sessionId)) : [];
      const mine = rows.filter((x) => x.targetId === targetId);
      const best = { attempts: mine.length, misses: mine.filter((x) => !x.passed).length, bestScore: Math.max(0, ...mine.map((x) => x.score)), bestStars: Math.max(0, ...mine.map((x) => x.stars)) };
      const refuse = (reason: SpeechRefusal): SpeechReply => ({ targetId, accepted: false, reason, score: 0, passed: false, stars: 0, attemptNo: best.attempts, attemptsLeft: Math.max(0, r.maxAttempts - best.attempts), bestScore: best.bestScore });

      if (!target) return refuse('unknown_target');
      if (mode === 'shadow' && !voiceEnabled(ctx)) return refuse('voice_disabled');
      if (best.attempts >= r.maxAttempts) return refuse('no_attempts_left');
      const durationMs = Number(body.durationMs);
      if (mode === 'shadow' && Number.isFinite(durationMs) && durationMs < r.minSpeechMs) return refuse('too_short');

      // Score on the server from the target text the server holds.
      let scored: { score: number; passed: boolean; stars: 0 | 1 | 2 | 3; heard: string; almost?: boolean; weakWords?: string[]; detail?: SpeechReply['detail'] };
      if (mode === 'shadow') {
        const s = scoreSpeech(target.text, alternativesOf(body), ctx.level, r);
        scored = { ...s, detail: { wordScore: s.wordScore, phonemeScore: s.phonemeScore, confScore: s.confScore } };
      } else if (mode === 'dictate') {
        const d = scoreDictation(target.text, text(body.typed), ctx.level, r);
        scored = { ...d, heard: d.typed };
      } else {
        // Listen-and-repeat: participation only, never pass / fail.
        scored = { score: 0, passed: false, stars: r.repeatStars ? 1 : 0, heard: '' };
      }

      // Listen-and-repeat is participation, not a miss: it never counts toward the mouth-shape hint.
      const graded = mode === 'repeat' ? { ...scored, passed: true } : scored;
      const prev = { ...best, misses: mine.filter((x) => !x.passed && x.mode !== 'repeat').length };
      const outcome = speechAttemptOutcome(prev, graded, r);
      if (!outcome) return refuse('no_attempts_left');

      // Abuse check: the same spoken words passing on different targets (a recording, a script).
      const flags: string[] = [];
      if (mode === 'shadow' && scored.heard && rows.some((x) => x.targetId !== targetId && x.mode === 'shadow' && x.passed && normalizeSpeech(x.transcript) === scored.heard)) flags.push('same_transcript');

      const stored = await safe(ctx, (s) =>
        s.insert({
          matchId: ctx.matchId,
          sessionId: ctx.sessionId,
          studentKey: ctx.studentKey,
          targetId,
          mode,
          transcript: scored.heard.slice(0, MAX_TEXT),
          score: scored.score,
          passed: scored.passed,
          stars: scored.stars,
          attemptNo: outcome.attemptNo,
          level: ctx.level,
          engine: mode === 'shadow' ? 'webspeech' : mode === 'dictate' ? 'typed' : 'none',
          detail: { ...(scored.detail ?? {}), ...(scored.weakWords?.length ? { weakWords: scored.weakWords } : {}), ...(flags.length ? { flags } : {}) },
        }),
      );
      if (!stored) throw new SpeechError(409, 'Lượt này đã được chấm — hãy thử lại.');

      // Coins: only the step up to a better star level, never for a flagged attempt, never negative.
      let coins: number | undefined;
      const svc = deps.rewards();
      if (svc && outcome.coins > 0 && !flags.length) {
        try {
          const paid = await svc.speech({ studentKey: ctx.studentKey, sessionId: ctx.sessionId, matchId: ctx.matchId, targetId, stars: outcome.bestStars, coins: outcome.coins });
          coins = paid?.applied ?? 0;
        } catch (e) {
          console.warn('speech coins skipped:', (e as Error).message);
        }
      }

      return {
        targetId,
        accepted: true,
        score: scored.score,
        passed: scored.passed,
        stars: scored.stars,
        ...(scored.almost ? { almost: true } : {}),
        attemptNo: outcome.attemptNo,
        attemptsLeft: outcome.attemptsLeft,
        bestScore: outcome.bestScore,
        ...(scored.weakWords?.length ? { weakWords: scored.weakWords } : {}),
        ...(outcome.hint ? { hint: outcome.hint } : {}),
        ...(coins !== undefined ? { coins } : {}),
        ...(scored.detail ? { detail: scored.detail } : {}),
      };
    },
  };
}

export type SpeechService = ReturnType<typeof createSpeechService>;

// ---------------------------------------------------------------------------------------------
// Wiring: the demo keeps attempts in memory (no database); real sessions use speech_attempts.

const demoStore = new MemorySpeechStore();
let dbStore: SupabaseSpeechStore | null = null;
let service: SpeechService | null = null;

export function speechService(): SpeechService {
  service ??= createSpeechService({
    storeFor: (ctx) => {
      if (isDemoBattleId(ctx.battleId)) return demoStore;
      const db = serverSupabase();
      if (!db) return demoStore;
      dbStore ??= new SupabaseSpeechStore(db);
      return dbStore;
    },
    rewards,
  });
  return service;
}

export function speechErrorResponse(e: unknown): Response | null {
  if (e instanceof SpeechError) return Response.json({ error: e.message }, { status: e.status });
  return null;
}
