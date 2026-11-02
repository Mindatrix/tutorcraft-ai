import {
  scoreDictation,
  scoreSpeech,
  type SpeechAlternative,
  type SpeechHistory,
  type SpeechMode,
} from '../engine/pronunciation';
import {
  evaluateMockSpeechAttempt,
  MOCK_SPEECH_RULES,
  MOCK_SPEECH_TARGETS,
  MOCK_VOICE_CONFIG,
  type PhoneticStoneTarget,
  type SpeechAttemptRequest,
  type SpeechAttemptResponse,
  type VoiceConfig,
} from './phoneticStonesMock';

export type {
  PhoneticStoneTarget,
  SpeechAttemptRequest,
  SpeechAttemptResponse,
  SpeechRejectReason,
  VoiceConfig,
} from './phoneticStonesMock';
export {
  evaluateMockSpeechAttempt,
  MOCK_SPEECH_RESPONSES,
  MOCK_SPEECH_RULES,
  MOCK_SPEECH_TARGETS,
  MOCK_VOICE_CONFIG,
} from './phoneticStonesMock';

/**
 * Client state machine states from `docs/pronunciation_logic_handoff.md` §3.4 & `docs/TECHNICAL_BLUEPRINT.md` §3.5:
 * idle ──tap──▶ selected ──auto──▶ modeling (TTS) ──end──▶ ready
 * ready ──tap 🎤──▶ listening
 * listening ──final──▶ scoring
 * listening ──timeout/no-speech/error──▶ fallback (dictate or repeat; never a dead end)
 * scoring ──reply──▶ passed | retry(attempt n/3)
 * passed/retry ──tap elsewhere / Esc──▶ idle
 */
export type PhoneticStoneState =
  | 'idle'
  | 'selected'
  | 'modeling'
  | 'ready'
  | 'listening'
  | 'scoring'
  | 'fallback'
  | 'passed'
  | 'retry';

/** Pet states from `docs/TECHNICAL_BLUEPRINT.md` §3.5 (never sad/punishing). */
export type PetState = 'idle' | 'listening' | 'celebrate' | 'coach';

export interface StoneProgress {
  targetId: string;
  attempts: number;
  misses: number;
  attemptsLeft: number;
  bestScore: number;
  bestStars: 0 | 1 | 2 | 3;
  passed: boolean;
  lastResponse: SpeechAttemptResponse | null;
}

export interface PhoneticStoneMachineSnapshot {
  state: PhoneticStoneState;
  petState: PetState;
  petHint?: 'mouth_shape';
  hoveredTargetId: string | null;
  selectedTargetId: string | null;
  selectedTarget: PhoneticStoneTarget | null;
  activeMode: SpeechMode;
  interimTranscript: string;
  finalTranscript: string;
  provisionalScore: number | null;
  lastResult: SpeechAttemptResponse | null;
  lastError: { code: string; message: string } | null;
  targets: PhoneticStoneTarget[];
  progressByTarget: Record<string, StoneProgress>;
  voiceConfig: VoiceConfig;
  level: number;
}

export interface PhoneticStoneEventMap {
  'stone:hover': { targetId: string | null; target: PhoneticStoneTarget | null };
  'stone:select': { targetId: string; target: PhoneticStoneTarget };
  'stone:model': { targetId: string; target: PhoneticStoneTarget; rate: number };
  'speech:start': { targetId: string; mode: SpeechMode; lang: 'en-US' | 'en-GB' };
  'speech:interim': { targetId: string; transcript: string };
  'speech:final': {
    targetId: string;
    transcript: string;
    alternatives: SpeechAlternative[];
    confidence: number;
    durationMs: number;
  };
  'speech:error': { targetId: string; code: string; message: string };
  'stone:result': {
    targetId: string;
    passed: boolean;
    score: number;
    stars: 0 | 1 | 2 | 3;
    attempt: number;
    response: SpeechAttemptResponse;
  };
  'pet:state': { state: PetState; hint?: 'mouth_shape'; targetId?: string | null };
  'state:change': {
    prev: PhoneticStoneState;
    next: PhoneticStoneState;
    snapshot: PhoneticStoneMachineSnapshot;
  };
}

export type PhoneticStoneEventName = keyof PhoneticStoneEventMap;
export type PhoneticStoneListener<K extends PhoneticStoneEventName> = (
  payload: PhoneticStoneEventMap[K],
) => void;

/**
 * Typed Event Bus connecting the 3D scene (`phoneticStones.ts`) and DOM HUD (`PhoneticStonesHud.tsx`).
 */
export class PhoneticStoneEventBus {
  private listeners = new Map<PhoneticStoneEventName, Set<(payload: never) => void>>();

  on<K extends PhoneticStoneEventName>(event: K, fn: PhoneticStoneListener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as (payload: never) => void);
    return () => {
      set?.delete(fn as (payload: never) => void);
    };
  }

  emit<K extends PhoneticStoneEventName>(event: K, payload: PhoneticStoneEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      fn(payload as never);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export interface PhoneticStoneMachineOptions {
  bus?: PhoneticStoneEventBus;
  targets?: PhoneticStoneTarget[];
  voiceConfig?: VoiceConfig;
  level?: number;
  /** Delay (ms) before `selected` auto-advances to `modeling` (default 180ms; 0 = immediate). */
  autoModelDelayMs?: number;
  /** Default duration (ms) for TTS modeling when speechSynthesis onend does not fire (default 900ms). */
  modelDurationMs?: number;
  /** Custom TTS speaker (returns a Promise or cleanup function). */
  speak?: (text: string, rate: number, lang: 'en-US' | 'en-GB') => Promise<void>;
  /** Custom attempt submitter (defaults to `evaluateMockSpeechAttempt`). */
  submitAttempt?: (
    req: SpeechAttemptRequest,
    target: PhoneticStoneTarget,
    history: SpeechHistory,
  ) => Promise<SpeechAttemptResponse>;
}

/**
 * Browser TTS helper (`speechSynthesis`) following Blueprint §3.3:
 * picks an `en-*` voice, rate 0.85 (Beginner 0.7), cancels queue before speaking.
 */
export function speakTargetWithBrowserTts(
  text: string,
  rate = 0.85,
  lang: 'en-US' | 'en-GB' = 'en-US',
  fallbackMs = 900,
): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return new Promise((r) => setTimeout(r, fallbackMs));
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, Math.max(fallbackMs, Math.min(4500, text.length * 95)));
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate;
      const voices = synth.getVoices();
      const matched =
        voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ??
        voices.find((v) => /^en(-|_)(US|GB)/i.test(v.lang));
      if (matched) u.voice = matched;
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
    } catch {
      finish();
    }
  });
}

export function cancelBrowserTts(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

export class PhoneticStoneStateMachine {
  readonly bus: PhoneticStoneEventBus;
  private state: PhoneticStoneState = 'idle';
  private petState: PetState = 'idle';
  private petHint: 'mouth_shape' | undefined = undefined;
  private hoveredTargetId: string | null = null;
  private selectedTargetId: string | null = null;
  private activeMode: SpeechMode = 'shadow';
  private interimTranscript = '';
  private finalTranscript = '';
  private provisionalScore: number | null = null;
  private lastResult: SpeechAttemptResponse | null = null;
  private lastError: { code: string; message: string } | null = null;
  private targets: PhoneticStoneTarget[];
  private progressByTarget: Record<string, StoneProgress> = {};
  private voiceConfig: VoiceConfig;
  private level: number;
  private autoModelDelayMs: number;
  private modelDurationMs: number;
  private speakFn: (text: string, rate: number, lang: 'en-US' | 'en-GB') => Promise<void>;
  private submitAttemptFn?: PhoneticStoneMachineOptions['submitAttempt'];
  private autoModelTimer: ReturnType<typeof setTimeout> | null = null;
  private modelToken = 0;

  constructor(opts: PhoneticStoneMachineOptions = {}) {
    this.bus = opts.bus ?? new PhoneticStoneEventBus();
    this.targets = (opts.targets ?? MOCK_SPEECH_TARGETS).map((t) => ({ ...t, modes: [...t.modes] }));
    this.voiceConfig = { ...(opts.voiceConfig ?? MOCK_VOICE_CONFIG) };
    this.level = opts.level ?? 3;
    this.autoModelDelayMs = opts.autoModelDelayMs ?? 160;
    this.modelDurationMs = opts.modelDurationMs ?? 850;
    this.speakFn =
      opts.speak ??
      ((text, rate, lang) => speakTargetWithBrowserTts(text, rate, lang, this.modelDurationMs));
    this.submitAttemptFn = opts.submitAttempt;
    this.initProgress();
  }

  private initProgress() {
    for (const t of this.targets) {
      if (!this.progressByTarget[t.targetId]) {
        this.progressByTarget[t.targetId] = {
          targetId: t.targetId,
          attempts: 0,
          misses: 0,
          attemptsLeft: t.attemptsLeft ?? 3,
          bestScore: 0,
          bestStars: 0,
          passed: false,
          lastResponse: null,
        };
      }
    }
  }

  getSnapshot(): PhoneticStoneMachineSnapshot {
    const selectedTarget =
      this.targets.find((t) => t.targetId === this.selectedTargetId) ?? null;
    return {
      state: this.state,
      petState: this.petState,
      petHint: this.petHint,
      hoveredTargetId: this.hoveredTargetId,
      selectedTargetId: this.selectedTargetId,
      selectedTarget,
      activeMode: this.activeMode,
      interimTranscript: this.interimTranscript,
      finalTranscript: this.finalTranscript,
      provisionalScore: this.provisionalScore,
      lastResult: this.lastResult,
      lastError: this.lastError,
      targets: this.targets.map((t) => ({
        ...t,
        attemptsLeft: this.progressByTarget[t.targetId]?.attemptsLeft ?? t.attemptsLeft,
      })),
      progressByTarget: { ...this.progressByTarget },
      voiceConfig: { ...this.voiceConfig },
      level: this.level,
    };
  }

  private setPetState(next: PetState, hint?: 'mouth_shape') {
    this.petState = next;
    this.petHint = hint;
    this.bus.emit('pet:state', {
      state: next,
      ...(hint ? { hint } : {}),
      targetId: this.selectedTargetId,
    });
  }

  private transition(next: PhoneticStoneState) {
    const prev = this.state;
    this.state = next;
    this.bus.emit('state:change', {
      prev,
      next,
      snapshot: this.getSnapshot(),
    });
  }

  private clearTimers() {
    if (this.autoModelTimer) {
      clearTimeout(this.autoModelTimer);
      this.autoModelTimer = null;
    }
    this.modelToken += 1;
  }

  setTargets(targets: PhoneticStoneTarget[], voiceConfig?: VoiceConfig) {
    this.targets = targets.map((t) => ({ ...t, modes: [...t.modes] }));
    if (voiceConfig) this.voiceConfig = { ...voiceConfig };
    this.initProgress();
    this.bus.emit('state:change', {
      prev: this.state,
      next: this.state,
      snapshot: this.getSnapshot(),
    });
  }

  setVoiceConfig(voiceConfig: Partial<VoiceConfig>) {
    this.voiceConfig = { ...this.voiceConfig, ...voiceConfig };
    if (!this.voiceConfig.enabled && this.activeMode === 'shadow') {
      this.activeMode = 'dictate';
    }
    this.bus.emit('state:change', {
      prev: this.state,
      next: this.state,
      snapshot: this.getSnapshot(),
    });
  }

  setLevel(level: number) {
    this.level = Math.max(0, Math.min(5, Math.round(level)));
    const isBeginner = this.level === 0;
    this.targets = this.targets.map((t) => ({
      ...t,
      ttsRate: isBeginner ? MOCK_SPEECH_RULES.ttsRate.beginner : MOCK_SPEECH_RULES.ttsRate.default,
      listenMs: isBeginner ? MOCK_SPEECH_RULES.listenMs.beginner : MOCK_SPEECH_RULES.listenMs.default,
    }));
    this.bus.emit('state:change', {
      prev: this.state,
      next: this.state,
      snapshot: this.getSnapshot(),
    });
  }

  setTtsRateForSelected(rate: number) {
    const clamped = Math.max(0.5, Math.min(1.2, Number(rate.toFixed(2))));
    this.targets = this.targets.map((t) =>
      t.targetId === this.selectedTargetId ? { ...t, ttsRate: clamped } : t,
    );
    this.bus.emit('state:change', {
      prev: this.state,
      next: this.state,
      snapshot: this.getSnapshot(),
    });
  }

  hoverStone(targetId: string | null) {
    if (this.hoveredTargetId === targetId) return;
    this.hoveredTargetId = targetId;
    const target = this.targets.find((t) => t.targetId === targetId) ?? null;
    this.bus.emit('stone:hover', { targetId, target });
  }

  /**
   * Step 1: `idle ──tap──▶ selected ──auto──▶ modeling (TTS) ──end──▶ ready`
   */
  selectStone(targetId: string, opts: { autoModel?: boolean } = {}): boolean {
    const target = this.targets.find((t) => t.targetId === targetId);
    if (!target) return false;
    this.clearTimers();
    this.selectedTargetId = targetId;
    this.interimTranscript = '';
    this.finalTranscript = '';
    this.provisionalScore = null;
    this.lastError = null;
    const prog = this.progressByTarget[targetId];
    this.lastResult = prog?.lastResponse ?? null;

    if (!this.voiceConfig.enabled || !target.modes.includes('shadow')) {
      this.activeMode = target.modes.includes('dictate') ? 'dictate' : 'repeat';
    } else {
      this.activeMode = 'shadow';
    }

    this.setPetState('idle');
    this.bus.emit('stone:select', { targetId, target });
    this.transition('selected');

    const shouldAutoModel = opts.autoModel ?? true;
    if (shouldAutoModel) {
      if (this.autoModelDelayMs <= 0) {
        void this.playModel();
      } else {
        this.autoModelTimer = setTimeout(() => {
          this.autoModelTimer = null;
          void this.playModel();
        }, this.autoModelDelayMs);
      }
    }
    return true;
  }

  /**
   * Step 2: `selected ──auto──▶ modeling (TTS) ──end──▶ ready`
   */
  async playModel(): Promise<void> {
    const target = this.targets.find((t) => t.targetId === this.selectedTargetId);
    if (!target) return;
    this.clearTimers();
    const token = ++this.modelToken;
    this.setPetState('coach', this.petHint);
    this.bus.emit('stone:model', {
      targetId: target.targetId,
      target,
      rate: target.ttsRate,
    });
    this.transition('modeling');

    await this.speakFn(target.text, target.ttsRate, this.voiceConfig.lang);
    if (this.modelToken !== token) return;

    this.setPetState('idle', this.petHint);
    if (!this.voiceConfig.enabled && this.activeMode !== 'shadow') {
      this.transition('ready');
    } else {
      this.transition('ready');
    }
  }

  /**
   * Switch between 'shadow' (voice), 'dictate' (typed), and 'repeat' (listen & repeat fallback).
   */
  setMode(mode: SpeechMode) {
    this.activeMode = mode;
    this.lastError = null;
    if (mode === 'dictate' || mode === 'repeat') {
      if (this.state === 'listening') {
        this.setPetState('idle', this.petHint);
        this.transition('fallback');
        return;
      }
    }
    this.bus.emit('state:change', {
      prev: this.state,
      next: this.state,
      snapshot: this.getSnapshot(),
    });
  }

  /**
   * Step 3: `ready ──tap 🎤──▶ listening`
   * Must be called synchronously inside the user-gesture handler on iOS Safari.
   */
  startListening(): boolean {
    const target = this.targets.find((t) => t.targetId === this.selectedTargetId);
    if (!target) return false;
    const prog = this.progressByTarget[target.targetId];
    if (prog && prog.attemptsLeft <= 0) {
      this.lastError = { code: 'no_attempts_left', message: 'Đã hết 3 lượt thử cho viên đá này.' };
      this.bus.emit('speech:error', {
        targetId: target.targetId,
        code: 'no_attempts_left',
        message: this.lastError.message,
      });
      return false;
    }

    if (!this.voiceConfig.enabled) {
      this.activeMode = 'dictate';
      this.lastError = {
        code: 'voice_disabled',
        message: 'Chế độ giọng nói đang tắt. Em có thể gõ từ hoặc đọc nhẩm theo nhé!',
      };
      this.transition('fallback');
      return false;
    }

    this.clearTimers();
    cancelBrowserTts();
    this.activeMode = 'shadow';
    this.interimTranscript = '';
    this.finalTranscript = '';
    this.provisionalScore = null;
    this.lastError = null;
    this.setPetState('listening', this.petHint);
    this.bus.emit('speech:start', {
      targetId: target.targetId,
      mode: 'shadow',
      lang: this.voiceConfig.lang,
    });
    this.transition('listening');
    return true;
  }

  /**
   * Updates live interim transcript while `listening`.
   */
  pushInterim(transcript: string) {
    const target = this.targets.find((t) => t.targetId === this.selectedTargetId);
    if (!target) return;
    this.interimTranscript = transcript;
    if (transcript.trim()) {
      const prov = scoreSpeech(
        target.text,
        [{ transcript }],
        this.level,
        MOCK_SPEECH_RULES,
      );
      this.provisionalScore = prov.score;
    }
    this.bus.emit('speech:interim', {
      targetId: target.targetId,
      transcript,
    });
    this.bus.emit('state:change', {
      prev: this.state,
      next: this.state,
      snapshot: this.getSnapshot(),
    });
  }

  /**
   * Step 4a: `listening ──timeout/no-speech/error──▶ fallback (dictate or repeat; never a dead end)`
   */
  handleSpeechError(code: string, message?: string) {
    const target = this.targets.find((t) => t.targetId === this.selectedTargetId);
    if (!target) return;
    const friendly =
      message ??
      (code === 'not-allowed' || code === 'service-not-allowed'
        ? 'Trình duyệt chưa cấp quyền micro. Em chuyển sang Gõ chữ hoặc Đọc theo nhé!'
        : code === 'no-speech' || code === 'timeout'
          ? 'Chưa nghe rõ tiếng. Em có thể thử nói lại, Gõ chữ hoặc bấm "Em đã đọc theo"!'
          : 'Không thu được giọng nói. Em dùng chế độ Gõ chữ hoặc Đọc theo nhé!');
    this.lastError = { code, message: friendly };
    if (code === 'not-allowed' || code === 'audio-capture' || code === 'unsupported') {
      this.activeMode = 'dictate';
    }
    this.setPetState('coach', this.petHint);
    this.bus.emit('speech:error', {
      targetId: target.targetId,
      code,
      message: friendly,
    });
    this.transition('fallback');
  }

  /**
   * Step 4b: `listening ──final──▶ scoring ──reply──▶ passed | retry(attempt n/3)`
   */
  async submitVoiceAttempt(input: {
    transcript: string;
    alternatives?: SpeechAlternative[];
    confidence?: number;
    durationMs?: number;
  }): Promise<SpeechAttemptResponse | null> {
    const target = this.targets.find((t) => t.targetId === this.selectedTargetId);
    if (!target) return null;

    const alts: SpeechAlternative[] =
      input.alternatives && input.alternatives.length > 0
        ? input.alternatives
        : [{ transcript: input.transcript, confidence: input.confidence }];
    const durationMs = input.durationMs ?? 1100;

    this.finalTranscript = input.transcript;
    this.interimTranscript = input.transcript;

    // Instant provisional score in browser using pure engine function (§0.2, §3.4)
    const provisional = scoreSpeech(target.text, alts, this.level, MOCK_SPEECH_RULES);
    this.provisionalScore = provisional.score;

    this.bus.emit('speech:final', {
      targetId: target.targetId,
      transcript: input.transcript,
      alternatives: alts,
      confidence: input.confidence ?? 0,
      durationMs,
    });

    return this.runScoring({
      targetId: target.targetId,
      mode: 'shadow',
      transcript: input.transcript,
      alternatives: alts,
      confidence: input.confidence,
      durationMs,
    });
  }

  /**
   * Submit typed dictation (`mode: 'dictate'`).
   */
  async submitDictationAttempt(typed: string): Promise<SpeechAttemptResponse | null> {
    const target = this.targets.find((t) => t.targetId === this.selectedTargetId);
    if (!target) return null;
    this.activeMode = 'dictate';
    this.finalTranscript = typed;
    const provisional = scoreDictation(target.text, typed, this.level, MOCK_SPEECH_RULES);
    this.provisionalScore = provisional.score;

    return this.runScoring({
      targetId: target.targetId,
      mode: 'dictate',
      typed,
    });
  }

  /**
   * Submit listen-and-repeat fallback (`mode: 'repeat'`, "I said it" button).
   */
  async submitRepeatAttempt(): Promise<SpeechAttemptResponse | null> {
    const target = this.targets.find((t) => t.targetId === this.selectedTargetId);
    if (!target) return null;
    this.activeMode = 'repeat';
    this.provisionalScore = 0;

    return this.runScoring({
      targetId: target.targetId,
      mode: 'repeat',
    });
  }

  /**
   * Apply a canned Mock JSON `SpeechAttemptResponse` directly (for testing / AI Studio presets).
   */
  applyMockResponse(response: SpeechAttemptResponse): SpeechAttemptResponse {
    const target =
      this.targets.find((t) => t.targetId === response.targetId) ??
      this.targets.find((t) => t.targetId === this.selectedTargetId) ??
      this.targets[0];
    if (target && !this.selectedTargetId) {
      this.selectedTargetId = target.targetId;
    }
    this.transition('scoring');
    return this.finalizeScoring(target.targetId, response);
  }

  private async runScoring(req: SpeechAttemptRequest): Promise<SpeechAttemptResponse | null> {
    const target = this.targets.find((t) => t.targetId === req.targetId);
    if (!target) return null;

    this.transition('scoring');
    const prog = this.progressByTarget[target.targetId] ?? {
      targetId: target.targetId,
      attempts: 0,
      misses: 0,
      attemptsLeft: target.attemptsLeft ?? 3,
      bestScore: 0,
      bestStars: 0,
      passed: false,
      lastResponse: null,
    };

    const history: SpeechHistory = {
      attempts: prog.attempts,
      misses: prog.misses,
      bestScore: prog.bestScore,
      bestStars: prog.bestStars,
    };

    let response: SpeechAttemptResponse;
    if (this.submitAttemptFn) {
      response = await this.submitAttemptFn(req, target, history);
    } else {
      const evaluated = evaluateMockSpeechAttempt(
        req,
        target,
        history,
        this.level,
        this.voiceConfig,
        MOCK_SPEECH_RULES,
      );
      response = evaluated.response;
    }

    return this.finalizeScoring(target.targetId, response);
  }

  private finalizeScoring(targetId: string, response: SpeechAttemptResponse): SpeechAttemptResponse {
    this.lastResult = response;
    this.provisionalScore = response.score;

    if (!response.accepted) {
      if (response.reason === 'too_short') {
        this.lastError = {
          code: 'too_short',
          message: 'Câu nói hơi ngắn (< 0.4 giây). Lượt này chưa tính — em thử nói rõ hơn nhé!',
        };
        this.setPetState('coach', this.petHint);
        this.transition('ready');
        return response;
      }
      this.lastError = {
        code: response.reason ?? 'rejected',
        message:
          response.reason === 'no_attempts_left'
            ? 'Đã hết 3 lượt thử cho từ này.'
            : 'Chưa ghi nhận được lượt thử, em thử lại nhé!',
      };
      this.transition('fallback');
      return response;
    }

    const prev = this.progressByTarget[targetId] ?? {
      targetId,
      attempts: 0,
      misses: 0,
      attemptsLeft: 3,
      bestScore: 0,
      bestStars: 0,
      passed: false,
      lastResponse: null,
    };

    const isRepeatCompleted = this.activeMode === 'repeat' && response.stars >= 1;
    const consideredPassed = response.passed || isRepeatCompleted;
    const misses = prev.misses + (response.passed || this.activeMode === 'repeat' ? 0 : 1);
    const bestStars = Math.max(prev.bestStars, response.stars) as 0 | 1 | 2 | 3;

    this.progressByTarget[targetId] = {
      targetId,
      attempts: response.attemptNo,
      misses,
      attemptsLeft: response.attemptsLeft,
      bestScore: Math.max(prev.bestScore, response.bestScore, response.score),
      bestStars,
      passed: prev.passed || consideredPassed,
      lastResponse: response,
    };

    if (response.hint === 'mouth_shape') {
      this.petHint = 'mouth_shape';
    }

    this.bus.emit('stone:result', {
      targetId,
      passed: response.passed,
      score: response.score,
      stars: response.stars,
      attempt: response.attemptNo,
      response,
    });

    if (consideredPassed) {
      this.setPetState('celebrate', this.petHint);
      this.transition('passed');
    } else {
      this.setPetState(response.hint === 'mouth_shape' ? 'coach' : 'idle', this.petHint);
      this.transition('retry');
    }

    return response;
  }

  /**
   * Retry from `retry` state: on the 3rd attempt (after 2 misses / mouth_shape hint),
   * replays the TTS model first as required by `docs/pronunciation_logic_handoff.md` §2.4.
   */
  async prepareRetry(): Promise<void> {
    const target = this.targets.find((t) => t.targetId === this.selectedTargetId);
    if (!target) return;
    const prog = this.progressByTarget[target.targetId];
    this.lastError = null;
    if (prog && prog.misses >= 2) {
      await this.playModel();
    } else {
      this.setPetState('idle', this.petHint);
      this.transition('ready');
    }
  }

  /**
   * Step 6: `passed/retry ──tap elsewhere / Esc──▶ idle`
   */
  dismissToIdle() {
    this.clearTimers();
    cancelBrowserTts();
    this.selectedTargetId = null;
    this.interimTranscript = '';
    this.finalTranscript = '';
    this.provisionalScore = null;
    this.lastError = null;
    this.petHint = undefined;
    this.setPetState('idle');
    this.transition('idle');
  }

  dispose() {
    this.clearTimers();
    cancelBrowserTts();
  }
}
