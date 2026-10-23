import { randomUUID } from 'node:crypto';
import {
  DEFAULT_EXPECTED_ACCURACY,
  appendEntry,
  assessTimings,
  buildVariant,
  computeScaling,
  publicQuestion,
  questGems,
  rebuildSession,
  revealFor,
  scoreBattle,
  type AnswerReveal,
  type AnswerTiming,
  type BattleCtx,
  type BattleScore,
  type BattleState,
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
  state: BattleState;
  question: PublicQuestion | null;
}

export interface FinalizeResult {
  flagged: boolean;
  reasons: string[];
  score: BattleScore | null;
  hpRemaining: number | null;
  saved: boolean;
}

export interface SessionDeps {
  loadBattle: (id: string) => Promise<LoadedBattle | null>;
  storeFor: (battleId: string) => SessionStore;
  persistResult: (input: { battle: LoadedBattle; rec: SessionRecord; ctx: BattleCtx; state: BattleState; score: BattleScore; hpRemaining: number; timings: AnswerTiming[] }) => Promise<boolean>;
  now?: () => number;
}

export function contextFor(battle: LoadedBattle, variant: number | null): BattleCtx {
  const questions = buildVariant(battle.questions, battle.id, variant);
  return { questions, config: battle.config, scaling: computeScaling(battle.config, questions.length), boss: battle.boss };
}

function clean(v: unknown, max: number, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback;
}

export function createSessionService(deps: SessionDeps) {
  const now = deps.now ?? Date.now;

  const view = (rec: SessionRecord, ctx: BattleCtx, state: BattleState): SessionView => ({
    battleId: rec.battleId,
    status: rec.status,
    totalQuestions: ctx.questions.length,
    state,
    question: publicQuestion(ctx, state),
  });

  async function resolve(token: unknown) {
    const p = open<TokenPayload>(token);
    if (!p || typeof p.sid !== 'string' || typeof p.bid !== 'string') throw new SessionError(401, 'Phiên đấu không hợp lệ.');
    if (p.exp < now()) throw new SessionError(401, 'Phiên đấu đã hết hạn — hãy vào lại trận.');
    const store = deps.storeFor(p.bid);
    const rec = await store.get(p.sid);
    if (!rec || rec.battleId !== p.bid) throw new SessionError(404, 'Không tìm thấy phiên đấu.');
    const battle = await deps.loadBattle(rec.battleId);
    if (!battle) throw new SessionError(404, 'Đấu trường không còn tồn tại.');
    return { store, rec, battle, ctx: contextFor(battle, rec.variant) };
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
      };
      await deps.storeFor(battle.id).create(rec);
      const ctx = contextFor(battle, variant);
      const token = seal({ sid: rec.id, bid: battle.id, exp: now() + SESSION_TTL_MS } satisfies TokenPayload);
      return { token, view: view(rec, ctx, rebuildSession(ctx, rec.startedAt, []).state) };
    },

    async current(token: unknown) {
      const { rec, ctx } = await resolve(token);
      return view(rec, ctx, rebuildSession(ctx, rec.startedAt, rec.log).state);
    },

    async act(token: unknown, raw: { kind: 'answer'; questionId: unknown; chosenIdx: unknown } | { kind: 'cast'; skill: unknown }) {
      const { store, rec, ctx } = await resolve(token);
      if (rec.status !== 'active') throw new SessionError(409, 'Trận đấu đã kết thúc.');
      if (rec.log.length >= MAX_LOG) throw new SessionError(429, 'Quá nhiều thao tác trong một trận.');

      let entry: SessionLogEntry;
      if (raw.kind === 'answer') {
        const qid = Number(raw.questionId);
        const chosen = Number(raw.chosenIdx);
        if (!Number.isInteger(qid) || !Number.isInteger(chosen)) throw new SessionError(400, 'Câu trả lời không hợp lệ.');
        entry = { t: 'answer', qid, chosen, at: now() };
      } else {
        if (!SKILL_IDS.includes(raw.skill as SkillId)) throw new SessionError(400, 'Kỹ năng không hợp lệ.');
        entry = { t: 'cast', skill: raw.skill as SkillId, at: now() };
      }

      const res = appendEntry(ctx, rec.startedAt, rec.log, entry);
      if (!res.ok) throw new SessionError(res.status, res.reason);
      const updated: SessionRecord = { ...rec, log: [...rec.log, entry] };
      if (!(await store.update(updated, rec.version))) throw new SessionError(409, 'Thao tác bị trùng — hãy thử lại.');

      const reveal: AnswerReveal | null = res.afterAnswer ? revealFor(ctx, res.afterAnswer) : null;
      return {
        view: view(updated, ctx, res.rebuilt.state),
        afterAnswer: res.afterAnswer,
        reveal,
      };
    },

    async finalize(token: unknown): Promise<FinalizeResult> {
      const { store, rec, battle, ctx } = await resolve(token);
      // Idempotent: a second submit returns the stored outcome instead of paying out twice.
      if (rec.status === 'finished') return { flagged: false, reasons: [], score: rec.result, hpRemaining: rec.result?.hpRemaining ?? null, saved: true };
      if (rec.status === 'flagged') return { flagged: true, reasons: rec.flags, score: null, hpRemaining: null, saved: false };

      const { state, timings } = rebuildSession(ctx, rec.startedAt, rec.log);
      if (state.phase !== 'result') throw new SessionError(409, 'Trận đấu chưa kết thúc.');

      const verdict = assessTimings(timings);
      if (verdict.flagged) {
        await store.update({ ...rec, status: 'flagged', flags: verdict.reasons }, rec.version);
        return { flagged: true, reasons: verdict.reasons, score: null, hpRemaining: null, saved: false };
      }

      // Everything below is computed from the server's own log — client numbers are never read.
      const score = scoreBattle(ctx.questions, state.answers, ctx.config, DEFAULT_EXPECTED_ACCURACY, questGems(state.quests));
      const hpRemaining = ctx.config.mode === 'gamified' ? state.hp : ctx.scaling.playerHp;
      const saved = await deps.persistResult({ battle, rec, ctx, state, score, hpRemaining, timings });
      if (!(await store.update({ ...rec, status: 'finished', result: { ...score, hpRemaining } }, rec.version))) {
        throw new SessionError(409, 'Kết quả đã được nộp.');
      }
      return { flagged: false, reasons: [], score, hpRemaining, saved };
    },
  };
}

export type SessionService = ReturnType<typeof createSessionService>;
