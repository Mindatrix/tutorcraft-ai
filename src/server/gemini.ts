import { GEMINI_RESPONSE_SCHEMA } from '../engine/schema';

// Fail-safe loop:
//   Attempt 1: fast primary Flash-Lite model, timeout >= 2000ms (scaled by question count).
//   Attempt 2: secondary Flash-Lite model on timeout or error.
//   Caller falls back to the local cached template if both fail.
// The blueprint named Gemini 2.0 Flash / 1.5 Flash; Google has retired both (Oct 2026),
// so the defaults are current Flash-Lite models. Override via env if needed.
//
// Latency (measured Oct 2026, free tier): ~7.3s for 15 questions (~2.6k output tokens)
// on the primary model, ~21s on the secondary. A flat 2000ms cut-off would always fall
// through to the local template, so the 2s floor is kept for short battles and longer
// battles get ~1s (primary) / ~1.5s (secondary) per question.

export const PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || 'gemini-flash-lite-latest';
export const SECONDARY_MODEL = process.env.GEMINI_SECONDARY_MODEL || 'gemini-3.1-flash-lite';

function timeouts(questionCount: number): [number, number] {
  const primary = Number(process.env.GEMINI_PRIMARY_TIMEOUT_MS) || Math.max(2000, questionCount * 1000);
  const secondary = Number(process.env.GEMINI_SECONDARY_TIMEOUT_MS) || Math.max(8000, questionCount * 1500);
  return [primary, secondary];
}

export interface InlineDocument {
  mimeType: string;
  /** base64, no data: prefix */
  data: string;
}

export interface GeminiAttempt {
  model: string;
  ok: boolean;
  ms: number;
  error?: string;
}

async function callModel(model: string, prompt: string, doc: InlineDocument | null, timeoutMs: number, apiKey: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const parts: Record<string, unknown>[] = [{ text: prompt }];
    if (doc) parts.push({ inline_data: { mime_type: doc.mimeType, data: doc.data } });

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RESPONSE_SCHEMA,
          temperature: 0.7,
        },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
    const text: string | undefined = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response');
    return JSON.parse(text);
  } catch (e) {
    if (controller.signal.aborted) throw new Error(`Timeout > ${timeoutMs}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs the 2-attempt loop. `validate` throws on bad output, which counts as a failed attempt.
 * Returns null when every attempt failed (caller uses the local template).
 */
export async function generateWithFailSafe<T>(
  prompt: string,
  doc: InlineDocument | null,
  validate: (raw: unknown) => T,
  questionCount: number,
): Promise<{ result: T | null; model: string | null; attempts: GeminiAttempt[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const attempts: GeminiAttempt[] = [];
  if (!apiKey) {
    attempts.push({ model: 'none', ok: false, ms: 0, error: 'GEMINI_API_KEY not set' });
    return { result: null, model: null, attempts };
  }

  const [primaryMs, secondaryMs] = timeouts(questionCount);
  const plan: [string, number][] = [
    [PRIMARY_MODEL, primaryMs],
    [SECONDARY_MODEL, secondaryMs],
  ];
  for (const [model, timeout] of plan) {
    const t0 = Date.now();
    try {
      const result = validate(await callModel(model, prompt, doc, timeout, apiKey));
      attempts.push({ model, ok: true, ms: Date.now() - t0 });
      return { result, model, attempts };
    } catch (e) {
      attempts.push({ model, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { result: null, model: null, attempts };
}
