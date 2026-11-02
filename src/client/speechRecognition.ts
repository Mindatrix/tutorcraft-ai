'use client';

import type { SpeechAlternative } from '../engine/pronunciation';

interface WebSpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface WebSpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: WebSpeechRecognitionAlternative;
}

interface WebSpeechRecognitionResultList {
  readonly length: number;
  [index: number]: WebSpeechRecognitionResult;
}

interface WebSpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: WebSpeechRecognitionResultList;
}

interface WebSpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message?: string;
}

interface WebSpeechRecognitionInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: ((this: WebSpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: WebSpeechRecognitionInstance, ev: WebSpeechRecognitionEvent) => void) | null;
  onerror: ((this: WebSpeechRecognitionInstance, ev: WebSpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: WebSpeechRecognitionInstance, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type WebSpeechRecognitionCtor = new () => WebSpeechRecognitionInstance;

export function getSpeechRecognitionCtor(): WebSpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: WebSpeechRecognitionCtor;
    webkitSpeechRecognition?: WebSpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export interface SpeechRecognizerCallbacks {
  onStart?: () => void;
  onInterim?: (transcript: string) => void;
  onFinal?: (result: {
    transcript: string;
    alternatives: SpeechAlternative[];
    confidence: number;
    durationMs: number;
  }) => void;
  onError?: (code: string, message?: string) => void;
}

export interface StartRecognitionOptions {
  lang?: 'en-US' | 'en-GB';
  listenMs?: number;
  silenceStopMs?: number;
}

/**
 * Lazy Web Speech API controller (Blueprint §3.3 & §3.5):
 * - Created lazily only when `start()` is invoked.
 * - `recognition.start()` runs synchronously inside the user gesture (critical for iOS Safari).
 * - Automatically stops on `listenMs` (default 8000ms) or `silenceStopMs` (default 1800ms) after speech.
 * - Aborts cleanly on `visibilitychange` or `dispose()`.
 */
export class LazySpeechRecognizer {
  private instance: WebSpeechRecognitionInstance | null = null;
  private active = false;
  private startedAt = 0;
  private firstSpeechAt = 0;
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private finalDelivered = false;
  private latestInterim = '';
  private callbacks: SpeechRecognizerCallbacks;
  private onVisibilityChange: () => void;

  constructor(callbacks: SpeechRecognizerCallbacks) {
    this.callbacks = callbacks;
    this.onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden && this.active) {
        this.abort();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  private clearTimers() {
    if (this.windowTimer) {
      clearTimeout(this.windowTimer);
      this.windowTimer = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  /**
   * Synchronously starts recognition inside a pointerup/click handler.
   */
  start(opts: StartRecognitionOptions = {}): boolean {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.callbacks.onError?.('unsupported', 'Trình duyệt không hỗ trợ nhận diện giọng nói.');
      return false;
    }

    this.abort();
    const rec = new Ctor();
    this.instance = rec;
    rec.lang = opts.lang ?? 'en-US';
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;

    const listenMs = opts.listenMs ?? 8000;
    const silenceStopMs = opts.silenceStopMs ?? 1800;

    this.active = true;
    this.finalDelivered = false;
    this.latestInterim = '';
    this.startedAt = performance.now();
    this.firstSpeechAt = 0;

    rec.onstart = () => {
      this.startedAt = performance.now();
      this.callbacks.onStart?.();
    };

    rec.onresult = (ev: WebSpeechRecognitionEvent) => {
      if (!this.firstSpeechAt) this.firstSpeechAt = performance.now();
      if (this.silenceTimer) clearTimeout(this.silenceTimer);

      let interim = '';
      const finalAlts: SpeechAlternative[] = [];

      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (!res || res.length === 0) continue;
        if (res.isFinal) {
          for (let j = 0; j < Math.min(5, res.length); j++) {
            const alt = res[j];
            if (alt && typeof alt.transcript === 'string') {
              finalAlts.push({
                transcript: alt.transcript.slice(0, 300),
                confidence: typeof alt.confidence === 'number' ? alt.confidence : 0,
              });
            }
          }
        } else {
          interim += res[0]?.transcript ?? '';
        }
      }

      if (interim) {
        this.latestInterim = interim.slice(0, 300);
        this.callbacks.onInterim?.(this.latestInterim);
        this.silenceTimer = setTimeout(() => {
          this.stop();
        }, silenceStopMs);
      }

      if (finalAlts.length > 0 && !this.finalDelivered) {
        this.finalDelivered = true;
        this.active = false;
        this.clearTimers();
        const durationMs = Math.max(
          100,
          Math.round(performance.now() - (this.firstSpeechAt || this.startedAt)),
        );
        const primary = finalAlts[0];
        this.callbacks.onFinal?.({
          transcript: primary.transcript,
          alternatives: finalAlts,
          confidence: primary.confidence ?? 0,
          durationMs,
        });
      }
    };

    rec.onerror = (ev: WebSpeechRecognitionErrorEvent) => {
      if (!this.active && this.finalDelivered) return;
      this.active = false;
      this.clearTimers();
      this.callbacks.onError?.(ev.error || 'unknown', ev.message);
    };

    rec.onend = () => {
      const wasActive = this.active;
      this.active = false;
      this.clearTimers();
      if (wasActive && !this.finalDelivered) {
        if (this.latestInterim.trim()) {
          this.finalDelivered = true;
          const durationMs = Math.max(
            100,
            Math.round(performance.now() - (this.firstSpeechAt || this.startedAt)),
          );
          this.callbacks.onFinal?.({
            transcript: this.latestInterim,
            alternatives: [{ transcript: this.latestInterim, confidence: 0 }],
            confidence: 0,
            durationMs,
          });
        } else {
          this.callbacks.onError?.('no-speech');
        }
      }
    };

    try {
      // Must execute synchronously in gesture handler (no await before this line).
      rec.start();
      this.windowTimer = setTimeout(() => {
        if (this.active) this.stop();
      }, listenMs);
      return true;
    } catch (err) {
      this.active = false;
      this.clearTimers();
      this.callbacks.onError?.('start-failed', (err as Error)?.message);
      return false;
    }
  }

  stop(): void {
    this.clearTimers();
    if (!this.instance) return;
    try {
      this.instance.stop();
    } catch {
      /* ignore */
    }
  }

  abort(): void {
    this.active = false;
    this.clearTimers();
    if (!this.instance) return;
    try {
      this.instance.abort();
    } catch {
      /* ignore */
    }
    this.instance = null;
  }

  dispose(): void {
    this.abort();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }
}
