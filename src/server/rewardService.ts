import {
  COIN_LIMITS,
  HINT_AFTER_MS,
  answerCoins,
  boxCoins,
  chotCoins,
  companionLine,
  hintAvailable,
  hintCost,
  hintFor,
  type AnswerCoins,
  type HintPayload,
  type HintTier,
  type Question,
} from '../engine';
import type { CoinResult, CoinStore } from './coinStore';

// Coins on the server (phase C4.11–C4.18). Every amount is computed here from server facts (the
// session's own timing and streak, the match status); nothing the client sends is trusted. The
// coin store makes each award happen once and enforces the rate and match caps atomically.

export class RewardError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

/** What the server knows about a student's current question (from the session, never the client). */
export interface QuestionContext {
  sessionId: string;
  studentKey: string;
  matchId: string | null;
  game: string | null;
  /** The full question with its answer key: used here, never sent. */
  question: Question | null;
  /** Server time the question was served. */
  issuedAt: number;
  /** Wrong answers in a row before this question (C4.8: 2 → the tier-1 hint is free). */
  wrongInRow: number;
}

export interface HintReply {
  tier: HintTier;
  hint: HintPayload;
  /** The companion's whisper (Bo, Bác Tư, Cô Mai, the radio, Dad dino, Lumi). */
  line: string;
  cost: number;
  balance: number;
  free: boolean;
}

export interface AnswerReward extends AnswerCoins {
  awarded: number;
  balance: number | null;
  refused?: CoinResult['code'];
}

export function createRewardService(deps: { coins: CoinStore; now?: () => number }) {
  const { coins } = deps;
  const now = deps.now ?? Date.now;
  const answerRef = (sessionId: string, qid: number) => `${sessionId}:${qid}`;

  return {
    /** After the server graded an answer. Wrong answers give 0 and never take coins away. */
    async answer(a: { studentKey: string; sessionId: string; matchId: string | null; qid: number; correct: boolean; timeMs: number; rightInRow: number }): Promise<AnswerReward> {
      if (!a.correct) return { ...answerCoins({ ...a, golden: false }), awarded: 0, balance: null };
      const golden = await coins.has(a.studentKey, 'golden_accept', answerRef(a.sessionId, a.qid));
      const c = answerCoins({ correct: a.correct, timeMs: a.timeMs, rightInRow: a.rightInRow, golden });
      if (c.total <= 0) return { ...c, awarded: 0, balance: null };
      const r = await coins.apply(
        { studentKey: a.studentKey, delta: c.total, reason: 'answer', ref: answerRef(a.sessionId, a.qid), matchId: a.matchId, sessionId: a.sessionId, meta: { fast: c.fast, x: c.multiplier, golden } },
        { perMinute: COIN_LIMITS.answerAwardsPerMinute, matchCap: COIN_LIMITS.perMatch },
        now(),
      );
      return { ...c, awarded: r.applied, balance: r.balance, ...(r.ok ? {} : { refused: r.code }) };
    },

    /**
     * Buy a hint for the current question: shown 8 s after the question was served; tier 1 costs 3
     * coins (free after 2 wrong in a row), tier 2 costs 5 and fades two wrong options. Asking again
     * for the same tier of the same question returns it again without charging.
     */
    async hint(ctx: QuestionContext, tierRaw: unknown): Promise<HintReply> {
      const tier = Number(tierRaw);
      if (tier !== 1 && tier !== 2) throw new RewardError(400, 'Bậc gợi ý không hợp lệ.');
      const q = ctx.question;
      if (!q) throw new RewardError(409, 'Không có câu hỏi đang mở.');
      const wait = ctx.issuedAt + HINT_AFTER_MS - now();
      if (wait > 0) throw new RewardError(409, 'Chưa tới lúc dùng gợi ý.', { retryAfterMs: wait });
      if (!hintAvailable(q, tier)) throw new RewardError(400, 'Câu này không có gợi ý bậc 2.');
      const hint = hintFor(q, tier, ctx.sessionId)!;
      const line = companionLine(ctx.game ?? '', tier, `${ctx.sessionId}:${q.id}`, hint.tier === 1 ? { vi: hint.meaning } : {});
      const free = tier === 1 && ctx.wrongInRow >= 2;
      const cost = free ? 0 : hintCost(tier);
      const ref = `${ctx.sessionId}:${q.id}:t${tier}`;
      const r = await coins.apply({ studentKey: ctx.studentKey, delta: -cost, reason: 'hint', ref, matchId: ctx.matchId, sessionId: ctx.sessionId, meta: { tier, free } }, {}, now());
      if (!r.ok && r.code === 'funds') throw new RewardError(402, `Chưa đủ xu (cần ${cost} xu).`, { balance: r.balance, cost });
      if (!r.ok && r.code !== 'duplicate') throw new RewardError(429, 'Thử lại sau.');
      return { tier, hint, line, cost: r.ok ? cost : 0, balance: r.balance, free };
    },

    /** C4.9: the student took the golden challenge for this question (a marker: the answer pays ×2). */
    async acceptGolden(a: { studentKey: string; sessionId: string; matchId: string | null; qid: number }): Promise<boolean> {
      const r = await coins.apply({ studentKey: a.studentKey, delta: 0, reason: 'golden_accept', ref: answerRef(a.sessionId, a.qid), matchId: a.matchId, sessionId: a.sessionId }, { perMinute: 3 }, now());
      return r.ok || r.code === 'duplicate';
    },

    /** Chốt chặng: +20 when all three were right (ref = match + stage, once). */
    async chot(a: { studentKey: string; matchId: string; stage: number; right: number }) {
      const amount = chotCoins(a.right);
      if (!amount) return null;
      return coins.apply({ studentKey: a.studentKey, delta: amount, reason: 'chot', ref: `${a.matchId}:${a.stage}`, matchId: a.matchId }, { matchCap: COIN_LIMITS.perMatch }, now());
    },

    /** C4.18 gift box after a match: once per match, a few per day, coins only. */
    async openBox(a: { studentKey: string; matchId: string }): Promise<{ coins: number; balance: number; again: boolean }> {
      const amount = boxCoins(`${a.matchId}:${a.studentKey}`);
      const r = await coins.apply({ studentKey: a.studentKey, delta: amount, reason: 'box', ref: a.matchId, matchId: a.matchId }, { perDay: COIN_LIMITS.boxesPerDay }, now());
      if (r.ok) return { coins: amount, balance: r.balance, again: false };
      if (r.code === 'duplicate') return { coins: amount, balance: r.balance, again: true };
      throw new RewardError(429, 'Hôm nay em đã mở đủ hộp quà rồi.');
    },

    /** C4.14 a classmate rescue that worked: both students are paid (once per rescue). */
    async rescue(a: { requestId: string; matchId: string; pay: { studentKey: string; coins: number }[] }) {
      return Promise.all(a.pay.map((p) => coins.apply({ studentKey: p.studentKey, delta: p.coins, reason: 'rescue', ref: a.requestId, matchId: a.matchId }, { matchCap: COIN_LIMITS.perMatch }, now())));
    },

    /**
     * Pronunciation layer: pays the step up to a better star level on one target, once per level
     * (ref = session + target + stars). Misses never cost coins.
     */
    async speech(a: { studentKey: string; sessionId: string; matchId: string | null; targetId: string; stars: number; coins: number }) {
      if (a.coins <= 0) return null;
      return coins.apply(
        { studentKey: a.studentKey, delta: a.coins, reason: 'speech', ref: `${a.sessionId}:${a.targetId}:s${a.stars}`, matchId: a.matchId, sessionId: a.sessionId, meta: { stars: a.stars } },
        { perMinute: COIN_LIMITS.answerAwardsPerMinute, matchCap: COIN_LIMITS.perMatch },
        now(),
      );
    },

    balance: (studentKey: string) => coins.balance(studentKey),
  };
}

export type RewardService = ReturnType<typeof createRewardService>;
