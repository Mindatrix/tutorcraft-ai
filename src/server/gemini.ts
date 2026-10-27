import { GEMINI_RESPONSE_SCHEMA } from '../engine/schema';

// Fail-safe loop (27/10/2026):
//   Attempt 1: primary Flash-Lite model, 20 s.
//   Attempt 2 (once): a lighter model, 20 s, on timeout or error.
//   Then the caller uses the pre-written question bank ("Local Cached Template").
// Worst case ≈ 40 s of model time; the generate-battle route sets maxDuration = 60 s (Vercel with
// Fluid compute: default and Hobby maximum 300 s, Pro maximum 800 s; vercel.com/docs/functions/
// configuring-functions/duration, updated 24/08/2026).
// Measured 27/10 (one 10-question Beginner request each): flash-lite-latest 7.8 s, 3.1-flash-lite
// 8.1 s, 3.5-flash-lite 16.5 s; 2.5-flash-lite is gone (404). The 26/10 run took ~31 s for 10
// questions with a document, which a 20 s cut-off would send to the retry.
// The blueprint named Gemini 2.0 Flash / 1.5 Flash; Google has retired both (Oct 2026),
// so the defaults are current Flash-Lite models. Override via env if needed.
//
// Latency (measured Oct 2026, free tier, incl. boss design + teaching notes):
// ~4.5s fixed overhead + ~0.2s per question on the primary model (9 Q ≈ 5.9s,
// 15 Q ≈ 6.7s); the secondary is ~2-3x slower. A flat 2000ms cut-off would always
// fall through to the local template, so timeouts = base + per-question allowance.
// Oct 24 re-measure with mixed formats (essay / matching / cloze carry sample answers,
// pairs and insights): 4 questions took 4.2–9.2 s, so the allowance scales with the
// format weight ("units" = questions × average weight) and the base is wider.

export const PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || 'gemini-flash-lite-latest';
/** The one retry: the previous, lighter Flash-Lite generation. */
export const SECONDARY_MODEL = process.env.GEMINI_RETRY_MODEL || process.env.GEMINI_SECONDARY_MODEL || 'gemini-3.1-flash-lite';
/** Per attempt (ms). */
export const ATTEMPT_TIMEOUT_MS = 20_000;

function timeouts(): [number, number] {
  const primary = Number(process.env.GEMINI_PRIMARY_TIMEOUT_MS) || ATTEMPT_TIMEOUT_MS;
  const retry = Number(process.env.GEMINI_RETRY_TIMEOUT_MS) || Number(process.env.GEMINI_SECONDARY_TIMEOUT_MS) || ATTEMPT_TIMEOUT_MS;
  return [primary, retry];
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

/** A failed Gemini call; `status` is the HTTP status (429 = quota / rate limit). */
export class GeminiError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

/** One structured-JSON Gemini call with a hard timeout. Shared by generation and grading. */
export async function callGeminiJson(
  model: string,
  prompt: string,
  opts: { schema: unknown; timeoutMs: number; apiKey: string; doc?: InlineDocument | null; temperature?: number },
): Promise<unknown> {
  return callModel(model, prompt, opts.doc ?? null, opts.timeoutMs, opts.apiKey, opts.schema, opts.temperature ?? 0.7);
}

async function callModel(model: string, prompt: string, doc: InlineDocument | null, timeoutMs: number, apiKey: string, schema: unknown = GEMINI_RESPONSE_SCHEMA, temperature = 0.7): Promise<unknown> {
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
          responseSchema: schema,
          temperature,
        },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new GeminiError(body?.error?.message || `HTTP ${res.status}`, res.status);
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
): Promise<{ result: T | null; model: string | null; attempts: GeminiAttempt[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const attempts: GeminiAttempt[] = [];
  if (!apiKey) {
    attempts.push({ model: 'none', ok: false, ms: 0, error: 'GEMINI_API_KEY not set' });
    return { result: null, model: null, attempts };
  }

  const [primaryMs, secondaryMs] = timeouts();
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
