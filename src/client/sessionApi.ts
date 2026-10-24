'use client';

import type { AnswerReveal, BattleScore, BattleState, PublicQuestion, RaceOutcome, SkillId } from '../engine';

// Thin client for the server-authoritative battle session API.

export interface SessionView {
  battleId: string;
  status: 'active' | 'finished' | 'flagged';
  totalQuestions: number;
  /** Weighted by question format. */
  bossMaxHp?: number;
  state: BattleState;
  question: PublicQuestion | null;
  team?: 'A' | 'B' | null;
}

export interface ActResponse {
  view: SessionView;
  afterAnswer: BattleState | null;
  reveal: AnswerReveal | null;
}

export interface FinalizeResponse {
  flagged: boolean;
  reasons: string[];
  score: BattleScore | null;
  hpRemaining: number | null;
  saved: boolean;
  race?: RaceOutcome | null;
  error?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const HEADER = 'x-battle-session';

async function call<T>(path: string, init: RequestInit & { token?: string }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(init.token ? { [HEADER]: init.token } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'Mất kết nối máy chủ.');
  }
  const data = await res.json().catch(() => ({}));
  // 422 = flagged result: a normal (if unhappy) outcome, not a transport error.
  if (!res.ok && res.status !== 422) throw new ApiError(res.status, (data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const sessionApi = {
  start: (body: { battleId: string; variant: number | null; nickname: string; avatar: string; studentKey: string }) =>
    call<{ token: string; view: SessionView }>('/api/session', { method: 'POST', body: JSON.stringify(body) }),
  current: (token: string) => call<{ view: SessionView }>('/api/session', { method: 'GET', token }),
  /** mcq: { chosenIdx } (-1 = timeout). Other formats: { response } — graded on the server. */
  answer: (token: string, questionId: number, payload: { chosenIdx?: number; response?: unknown }) =>
    call<ActResponse>('/api/session/answer', { method: 'POST', token, body: JSON.stringify({ questionId, ...payload }) }),
  /** Matching: try one pair (right = the card's display id). */
  pair: (token: string, questionId: number, left: number, right: number) =>
    call<ActResponse>('/api/session/pair', { method: 'POST', token, body: JSON.stringify({ questionId, left, right }) }),
  cast: (token: string, skill: SkillId) => call<ActResponse>('/api/session/cast', { method: 'POST', token, body: JSON.stringify({ skill }) }),
  finalize: (token: string) => call<FinalizeResponse>('/api/battle-result', { method: 'POST', token, body: '{}' }),
};
