'use client';

// Safe localStorage helpers + offline result queue (auto-sync on reconnect).

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

const QUEUE_KEY = 'tc:pending-results';

export interface PendingResult {
  id: string;
  body: Record<string, unknown>;
}

export async function submitResult<T>(body: Record<string, unknown>): Promise<{ data: T | null; queued: boolean }> {
  try {
    const res = await fetch('/api/battle-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { data: (await res.json()) as T, queued: false };
    if (res.status >= 400 && res.status < 500 && res.status !== 429) return { data: null, queued: false };
  } catch {
    /* offline — fall through to queue */
  }
  const queue = load<PendingResult[]>(QUEUE_KEY, []);
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, body });
  save(QUEUE_KEY, queue.slice(-20));
  return { data: null, queued: true };
}

/** Retry queued submissions. Call on mount and on the `online` event. */
export async function flushQueue(): Promise<number> {
  const queue = load<PendingResult[]>(QUEUE_KEY, []);
  if (!queue.length) return 0;
  const left: PendingResult[] = [];
  let sent = 0;
  for (const item of queue) {
    try {
      const res = await fetch('/api/battle-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) sent += 1;
      else left.push(item);
    } catch {
      left.push(item);
    }
  }
  save(QUEUE_KEY, left);
  return sent;
}

export function studentKey(): string {
  let key = load<string>('tc:student-key', '');
  if (!key) {
    key = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).slice(0, 36);
    save('tc:student-key', key);
  }
  return key;
}
