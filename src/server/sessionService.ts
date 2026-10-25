import { createHash, randomUUID } from 'node:crypto';
import {
  DEFAULT_EXPECTED_ACCURACY,
  appendEntry,
  assessTimings,
  buildVariant,
  computeScaling,
  raceOutcome,
  raceSeed,
  publicQuestion,
  questGems,
  rebuildSession,
  revealFor,
  scoreBattle,
  teamForIndex,
  chipPermutation,
  fromDisplayId,
  gradeCloze,
  gradeOpenFallback,
  gradeReorder,
  gradeTransform,
  hashInput,
  hashString,
  normalizeText,
  questionType,
  rightPermutation,
  type AnswerReveal,
  type Grade,
  type Question,
  type AnswerTiming,
  type BattleCtx,
  type BattleScore,
  type BattleState,
  type RaceOutcome,
  type PublicQuestion,
  type SessionLogEntry,
  type SkillId,
} from '../engine';
import { SKILL_IDS } from '../engine/skills';
import { open, seal } from './crypto';
import type { LoadedBattle } from './battles';
import type { SessionRecord, SessionStore } from './sessionStore';

export class SessionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

interface TokenPayload {
  sid: string;
  bid: string;
  exp: number;
}

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_LOG = 200;

export interface SessionView {
  battleId: string;
  status: SessionRecord['status'];
  totalQuestions: number;
  /** Weighted by format, so the client never has to know the questions to draw the HP bar. */
  bossMaxHp: number;
  state: BattleState;
  question: PublicQuestion | null;
  team?: SessionRecord['team'];
}

export interface FinalizeResult {
  flagged: boolean;
  reasons: string[];
  score: BattleScore | null;
  hpRemaining: number | null;
  saved: boolean;
  /** true = the result is kept on the server and will be written later (retry queue). */
  pending?: boolean;
  /** Boat Race only: server-decided result against the bot. */
  race?: RaceOutcome | null;
}

/** 'skipped' = intentionally not stored (demo battle / no database). */
export type PersistOutcome = boolean | 'skipped';

export interface SessionDeps {
  loadBattle: (id: string) => Promise<LoadedBattle | null>;
  storeFor: (battleId: string) => SessionStore;
  persistResult: (input: { battle: LoadedBattle; rec: SessionRecord; ctx: BattleCtx; state: BattleState; score: BattleScore; hpRemaining: number; timings: AnswerTiming[] }) => Promise<PersistOutcome>;
  /** Essay / reading grader (AI rubric). Defaults to the rule-based grader. */
  gradeOpen?: (q: Question, text: string) => Promise<Grade>;
  now?: () => number;
}

/** Salted hash shared with the browser (Web Crypto SHA-256, first 16 hex chars). */
export function phraseHash(salt: string, text: string): string {
  return createHash('sha256').update(hashInput(salt, text)).digest('hex').slice(0, 16);
}

/** Raw answer payload from the client, before validation. */
export type RawAction =
  | { kind: 'answer'; questionId: unknown; chosenIdx?: unknown; response?: unknown }
  | { kind: 'pair'; questionId: unknown; left: unknown; right: unknown }
  | { kind: 'cast'; skill: unknown };

/** `sessionId` seeds the per-student shuffle of matching cards and reorder chips. */
export function contextFor(battle: LoadedBattle, variant: number | null, sessionId = ''): BattleCtx {
  const questions = buildVariant(battle.questions, battle.id, variant);
  return {
    questions,
    config: battle.config,
    scaling: computeScaling(battle.config, questions.length, questions),
    boss: battle.boss,
    seed: hashString(sessionId),
  };
}

function clean(v: unknown, max: number, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;
}

export function createSessionService(deps: SessionDeps) {
  const now = deps.now ?? Date.now;

  const gradeOpen = deps.gradeOpen ?? (async (q: Question, text: string) => gradeOpenFallback(q, text));

  /** Adds the salted hashes that let the UI light up key phrases / correct prefixes. */
  const decorate = (rec: SessionRecord, ctx: BattleCtx, state: BattleState): PublicQuestion | null => {
    const pq = publicQuestion(ctx, state);
    if (!pq) return pq;
    const q = ctx.questions[state.idx];
    const salt = `${rec.id.slice(0, 8)}:${q.id}`;
    if (pq.type === 'transform' && q.key_phrases?.length) return { ...pq, salt, keyHashes: q.key_phrases.map((k) => phraseHash(salt, k)) };
    if (pq.type === 'reorder' && q.tokens?.length) {
      const tokens = q.tokens;
      return { ...pq, salt, prefixHashes: tokens.map((_, k) => phraseHash(salt, tokens.slice(0, k + 1).join(' '))) };
    }
    return pq;
  };

  const view = (rec: SessionRecord, ctx: BattleCtx, state: BattleState): SessionView => ({
    battleId: rec.battleId,
    status: rec.status,
    totalQuestions: ctx.questions.length,
    bossMaxHp: ctx.scaling.bossHp,
    state,
    question: decorate(rec, ctx, state),
    team: rec.team ?? null,
  });

  /** Grade a non-mcq answer on the server. The client's own scoring is never read. */
  async function gradeAnswer(ctx: BattleCtx, q: Question, response: unknown): Promise<{ grade?: Grade; text?: string }> {
    switch (questionType(q)) {
      case 'essay':
      case 'reading': {
        const text = normalizeText(response).slice(0, 4000);
        return { grade: await gradeOpen(q, text), text };
      }
      case 'transform': {
        const text = normalizeText(response).slice(0, 600);
        return { grade: gradeTransform(q, text), text };
      }
      case 'cloze': {
        const list = (Array.isArray(response) ? response : []).slice(0, 12).map((x) => normalizeText(x).slice(0, 60));
        return { grade: gradeCloze(q, list), text: list.join(' | ') };
      }
      case 'reorder': {
        const perm = chipPermutation(ctx, q);
        const ids = (Array.isArray(response) ? response : []).slice(0, 20).map(Number);
        const order = ids.map((id) => fromDisplayId(perm, id));
        const valid = order.every((i): i is number => i !== null);
        const grade = gradeReorder(q, valid ? (order as number[]) : []);
        return { grade, text: valid ? (order as number[]).map((i) => q.tokens![i]).join(' ') : '' };
      }
      default:
        return {};
    }
  }

  async function resolve(token: unknown) {
    const p = open<TokenPayload>(token);
    if (!p || typeof p.sid !== 'string' || typeof p.bid !== 'string') throw new SessionError(401, 'Phiên đấu không hợp lệ.');
    if (p.exp < now()) throw new SessionError(401, 'Phiên đấu đã hết hạn — hãy vào lại trận.');
    const store = deps.storeFor(p.bid);
    const rec = await store.get(p.sid);
    if (!rec || rec.battleId !== p.bid) throw new SessionError(404, 'Không tìm thấy phiên đấu.');
    const battle = await deps.loadBattle(rec.battleId);
    if (!battle) throw new SessionError(404, 'Đấu trường không còn tồn tại.');
    return { store, rec, battle, ctx: contextFor(battle, rec.variant, rec.id) };
  }

  return {
    async start(input: { battleId: string; variant: unknown; nickname: unknown; avatar: unknown; studentKey: unknown }) {
      const battle = await deps.loadBattle(input.battleId);
      if (!battle) throw new SessionError(404, 'Không tìm thấy đấu trường.');
      const variant = Number.isInteger(input.variant) && (input.variant as number) > 0 ? (input.variant as number) : null;
      const rec: SessionRecord = {
        id: randomUUID(),
        battleId: battle.id,
        variant,
        studentKey: clean(input.studentKey, 64, 'anon'),
        nickname: clean(input.nickname, 24, 'Anonymous Hero'),
        avatar: clean(input.avatar, 8, '🐣'),
        startedAt: now(),
        log: [],
        status: 'active',
        flags: [],
        result: null,
        version: 0,
        team: battle.config.scenario === 'boat_race' ? teamForIndex(await deps.storeFor(battle.id).countForBattle(battle.id)) : null,
      };
      await deps.storeFor(battle.id).create(rec);
      const ctx = contextFor(battle, variant, rec.id);
      const token = seal({ sid: rec.id, bid: battle.id, exp: now() + SESSION_TTL_MS } satisfies TokenPayload);
      return { token, view: view(rec, ctx, rebuildSession(ctx, rec.startedAt, []).state) };
    },

    async current(token: unknown) {
      const { rec, ctx } = await resolve(token);
      return view(rec, ctx, rebuildSession(ctx, rec.startedAt, rec.log).state);
    },

    async act(token: unknown, raw: RawAction) {
      const at = now(); // stamped on arrival — AI grading time doesn't count against the student
      const { store, rec, ctx } = await resolve(token);
      if (rec.status !== 'active') throw new SessionError(409, 'Trận đấu đã kết thúc.');
      if (rec.log.length >= MAX_LOG) throw new SessionError(429, 'Quá nhiều thao tác trong một trận.');

      let entry: SessionLogEntry;
      let grade: Grade | undefined;
      if (raw.kind === 'answer' || raw.kind === 'pair') {
        const qid = Number(raw.questionId);
        if (!Number.isInteger(qid)) throw new SessionError(400, 'Câu trả lời không hợp lệ.');
        const current = rebuildSession(ctx, rec.startedAt, rec.log).state;
        const q = current.phase === 'playing' ? ctx.questions[current.idx] : undefined;
        if (!q || q.id !== qid) throw new SessionError(409, 'Câu hỏi này đã được trả lời hoặc không phải câu hiện tại.');

        if (raw.kind === 'pair') {
          const left = Number(raw.left);
          const right = fromDisplayId(rightPermutation(ctx, q), Number(raw.right));
          if (!Number.isInteger(left) || right === null) throw new SessionError(400, 'Cặp nối không hợp lệ.');
          entry = { t: 'pair', qid, l: left, r: right, at };
        } else if (questionType(q) === 'mcq' || Number(raw.chosenIdx) === -1) {
          const chosen = Number(raw.chosenIdx);
          if (!Number.isInteger(chosen)) throw new SessionError(400, 'Câu trả lời không hợp lệ.');
          entry = { t: 'answer', qid, chosen, at };
        } else {
          const graded = await gradeAnswer(ctx, q, raw.response);
          grade = graded.grade;
          entry = { t: 'answer', qid, chosen: 0, at, grade, ...(graded.text ? { response: graded.text } : {}) };
        }
      } else {
        if (!SKILL_IDS.includes(raw.skill as SkillId)) throw new SessionError(400, 'Kỹ năng không hợp lệ.');
        entry = { t: 'cast', skill: raw.skill as SkillId, at: now() };
      }

      const res = appendEntry(ctx, rec.startedAt, rec.log, entry);
      if (!res.ok) throw new SessionError(res.status, res.reason);
      // The last answer ends the match: from now on the result must reach battle_results even if
      // the student's browser never sends the final submit (picked up by retryPending).
      const over = res.rebuilt.state.phase === 'result';
      const updated: SessionRecord = { ...rec, log: [...rec.log, entry], ...(over ? { resultSaved: false } : {}) };
      if (!(await store.update(updated, rec.version))) throw new SessionError(409, 'Thao tác bị trùng — hãy thử lại.');

      const reveal: AnswerReveal | null = res.afterAnswer ? revealFor(ctx, res.afterAnswer, grade) : null;
      return {
        view: view(updated, ctx, res.rebuilt.state),
        afterAnswer: res.afterAnswer,
        reveal,
      };
    },

    async finalize(token: unknown): Promise<FinalizeResult> {
      const { store, rec, battle, ctx } = await resolve(token);
      return finalizeRecord(store, rec, battle, ctx);
    },

    /**
     * Retry queue on the server: writes results that are over but not in battle_results yet
     * (insert failed, or the final submit never arrived). Safe to run anywhere, any time:
     * every step is idempotent and goes through the same anti-cheat checks.
     */
    async retryPending(limit = 10, idleMs = 2 * 60_000): Promise<{ tried: number; saved: number; flagged: number }> {
      const out = { tried: 0, saved: 0, flagged: 0 };
      const store = deps.storeFor('');
      for (const rec of await store.listPending(limit, idleMs)) {
        out.tried += 1;
        try {
          const battle = await deps.loadBattle(rec.battleId);
          if (!battle) continue;
          const res = await finalizeRecord(store, rec, battle, contextFor(battle, rec.variant, rec.id));
          if (res.saved) out.saved += 1;
          if (res.flagged) out.flagged += 1;
        } catch {
          /* not finished yet / raced with the student's own submit: next sweep */
        }
      }
      return out;
    },
  };

  /** Score from the server's own log and write it (once). Re-entrant: retries a failed save. */
  async function finalizeRecord(store: SessionStore, rec: SessionRecord, battle: LoadedBattle, ctx: BattleCtx): Promise<FinalizeResult> {
    if (rec.status === 'flagged') return { flagged: true, reasons: rec.flags, score: null, hpRemaining: null, saved: false };

    const { state, timings } = rebuildSession(ctx, rec.startedAt, rec.log);
    if (rec.status === 'finished') {
      // Idempotent: a second submit returns the stored outcome instead of paying out twice —
      // but if the first write failed, this is the retry.
      const stored = { flagged: false, reasons: [], score: rec.result, hpRemaining: rec.result?.hpRemaining ?? null, race: rec.result?.race ?? null };
      // resultSaved: true = written · null = never stored (demo battle) · false = retry now.
      if (rec.resultSaved !== false || !rec.result) return { ...stored, saved: rec.resultSaved === true };
      const outcome = await deps.persistResult({ battle, rec, ctx, state, score: rec.result, hpRemaining: rec.result.hpRemaining, timings });
      if (outcome === true) await store.update({ ...rec, resultSaved: true }, rec.version).catch(() => false);
      return { ...stored, saved: outcome === true, pending: outcome === false };
    }

    if (state.phase !== 'result') throw new SessionError(409, 'Trận đấu chưa kết thúc.');

    const verdict = assessTimings(timings);
    if (verdict.flagged) {
      await store.update({ ...rec, status: 'flagged', flags: verdict.reasons, resultSaved: null }, rec.version);
      return { flagged: true, reasons: verdict.reasons, score: null, hpRemaining: null, saved: false };
    }

    // Everything below is computed from the server's own log — client numbers are never read.
    const score = scoreBattle(ctx.questions, state.answers, ctx.config, DEFAULT_EXPECTED_ACCURACY, questGems(state.quests));
    const hpRemaining = ctx.config.mode === 'gamified' ? state.hp : ctx.scaling.playerHp;
    const race = ctx.config.scenario === 'boat_race'
      ? raceOutcome(ctx.questions, state.answers, raceSeed(battle.id, rec.variant, ctx.config.level), ctx.config.level)
      : null;
    const outcome = await deps.persistResult({ battle, rec, ctx, state, score, hpRemaining, timings });
    const finished: SessionRecord = { ...rec, status: 'finished', result: { ...score, hpRemaining, race }, resultSaved: outcome === 'skipped' ? null : outcome };
    if (!(await store.update(finished, rec.version))) {
      // Raced with another submit (double tap, or the server's retry sweep): report what won.
      const now2 = await store.get(rec.id);
      if (now2?.status === 'finished') return finalizeRecord(store, now2, battle, ctx);
      throw new SessionError(409, 'Kết quả đã được nộp.');
    }
    if (outcome === false) console.error(`battle result for session ${rec.id} not saved yet — queued for retry`);
    return { flagged: false, reasons: [], score, hpRemaining, saved: outcome === true, pending: outcome === false, race };
  }
}

export type SessionService = ReturnType<typeof createSessionService>;
