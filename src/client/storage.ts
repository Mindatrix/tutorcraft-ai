'use client';

// Safe localStorage helpers + the battle-result outbox (auto re-send on reconnect).

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — progress just won't persist */
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Result outbox: finished battles whose result has not been confirmed as saved.
// Only the sealed session token is kept — the server rebuilds the score from its own log,
// so re-sending is safe (finalize is idempotent) and cannot be used to change the score.
const OUTBOX_KEY = 'tc:result-outbox';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // same as the server's SESSION_TTL_MS

export interface OutboxItem {
  token: string;
  battleId: string;
  queuedAt: number;
  tries: number;
  nextAt: number;
}

export function outboxItems(): OutboxItem[] {
  return load<OutboxItem[]>(OUTBOX_KEY, []).filter((i) => i && typeof i.token === 'string' && Date.now() - i.queuedAt < TOKEN_TTL_MS);
}

export function queueResult(token: string, battleId: string): void {
  const items = outboxItems().filter((i) => i.token !== token);
  items.push({ token, battleId, queuedAt: Date.now(), tries: 0, nextAt: Date.now() + 5_000 });
  save(OUTBOX_KEY, items.slice(-20));
  window.dispatchEvent(new Event('tc:outbox'));
}

export function dropResult(token: string): void {
  save(OUTBOX_KEY, outboxItems().filter((i) => i.token !== token));
}

/**
 * Re-send queued results. `send` returns 'done' (saved, flagged, or rejected for good)
 * or 'retry'. Backoff: 5s, 15s, 45s … capped at 10 min.
 */
export async function flushResults(send: (item: OutboxItem) => Promise<'done' | 'retry'>, force = false): Promise<{ sent: number; left: number }> {
  const items = outboxItems();
  const keep: OutboxItem[] = [];
  let sent = 0;
  for (const item of items) {
    if (!force && item.nextAt > Date.now()) {
      keep.push(item);
      continue;
    }
    const verdict = await send(item).catch(() => 'retry' as const);
    if (verdict === 'done') {
      sent += 1;
      continue;
    }
    const tries = item.tries + 1;
    keep.push({ ...item, tries, nextAt: Date.now() + Math.min(600_000, 5_000 * 3 ** Math.min(tries, 6)) });
  }
  // Another tab may have queued something meanwhile: merge by token.
  const latest = outboxItems().filter((i) => !items.some((o) => o.token === i.token));
  save(OUTBOX_KEY, [...keep, ...latest]);
  return { sent, left: keep.length + latest.length };
}

export function studentKey(): string {
  let key = load<string>('tc:student-key', '');
  if (!key) {
    key = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 36);
    save('tc:student-key', key);
  }
  return key;
}
