// ============================================================================
// GDS-TC-2026-EXP v2.6 — Multiverse Quest Node State Machine, Squad Quorum
// Engine, Audio Noise Gate Filter, and Non-Blocking 3-Attempt Fallback Engine
// (§4.2, §5.2, §6.1, §6.2)
// ============================================================================

export type MultiverseRouteId = 'mv-01' | 'mv-02' | 'mv-03' | 'mv-04' | 'mv-05';

/**
 * §6.1 8-Stage Quest Node State Machine:
 * UNINITIALIZED -> EXPLORATION -> INVESTIGATION -> PUZZLE_DEDUCTION ->
 * PHONETIC_CHALLENGE -> PORTAL_CHARGING -> PORTAL_STABILIZED -> WARP_TRANSITION
 */
export const QUEST_NODE_STAGES = [
  'UNINITIALIZED',
  'EXPLORATION',
  'INVESTIGATION',
  'PUZZLE_DEDUCTION',
  'PHONETIC_CHALLENGE',
  'PORTAL_CHARGING',
  'PORTAL_STABILIZED',
  'WARP_TRANSITION',
] as const;

export type QuestNodeStage = (typeof QUEST_NODE_STAGES)[number];

export type QuestAnchorKind = 'chest' | 'altar' | 'stone_pedestal' | 'portal_archway';

export interface StressSyllable {
  syllable: string;
  stress: 'primary' | 'secondary' | 'none';
}

export interface DictationFallbackSpec {
  answer: string;
  accept?: string[];
}

export interface TileSortFallbackSpec {
  tiles: string[];
  solution: string[];
}

export interface QuestStoneDefinition {
  targetId: string;
  text: string;
  kind: 'word' | 'sentence';
  ipa: string;
  stress: StressSyllable[];
  meaning_vi: string;
  mouthTipVi: string;
  fallback: {
    dictation: DictationFallbackSpec;
    tiles: TileSortFallbackSpec;
  };
}

export interface QuestObjectDefinition {
  objectId: string;
  kind: string;
  anchor: QuestAnchorKind;
  stage: QuestNodeStage;
  action: string;
  clue_en: string;
  clue_vi: string;
}

export interface QuestPuzzleDefinition {
  prompt: string;
  options: string[];
  correctIdx: number;
  explanation_vi: string;
}

export interface QuestGrammarMetadata {
  key: string;
  label: string;
  label_vi: string;
  pattern: string;
}

export interface MultiverseQuestRoute {
  id: MultiverseRouteId;
  theme: string;
  theme_vi: string;
  next: MultiverseRouteId | null;
  grammar: QuestGrammarMetadata;
  objects: QuestObjectDefinition[];
  puzzle: QuestPuzzleDefinition;
  stones: QuestStoneDefinition[];
}

export interface MultiverseQuestsCatalog {
  version: number;
  rules: {
    maxSpeechAttempts: number;
    fallbackXpRatio: number;
    quorumRatio: number;
    maxSquad: number;
  };
  routes: MultiverseQuestRoute[];
}

// ---------------------------------------------------------------------------
// §4.2 Squad Quorum Engine (1 to 50 players)
// RequiredConsensualVocalizations (Rv) = Math.ceil(Nsquad * 0.60)
// ---------------------------------------------------------------------------

export const SQUAD_QUORUM_RATIO = 0.60;
export const MIN_SQUAD_SIZE = 1;
export const MAX_SQUAD_SIZE = 50;

export interface SquadContributionEvent {
  type: 'PORTAL_RESONANCE_UPDATE';
  matchId: string;
  routeId: MultiverseRouteId;
  studentId: string;
  targetId: string;
  mode: 'shadow' | 'dictate' | 'tiles' | 'repeat';
  score: number;
  passed: boolean;
  timestampMs: number;
}

export interface SquadQuorumState {
  matchId: string;
  routeId: MultiverseRouteId;
  squadSize: number;
  requiredVocalizations: number;
  /** Map of studentId -> contribution record (deduplicated per student per portal). */
  contributions: Record<
    string,
    {
      studentId: string;
      targetId: string;
      mode: 'shadow' | 'dictate' | 'tiles' | 'repeat';
      score: number;
      timestampMs: number;
    }
  >;
  completedCount: number;
  resonanceProgress: number;
  stabilized: boolean;
  stabilizedAtMs: number | null;
}

/**
 * §4.2 Compute required consensual vocalizations:
 * `Rv = Math.ceil(Nsquad * 0.60)` for `1..50` active squad members.
 */
export function calculateRequiredVocalizations(
  squadSize: number,
  quorumRatio = SQUAD_QUORUM_RATIO,
): number {
  const clamped = Math.max(MIN_SQUAD_SIZE, Math.min(MAX_SQUAD_SIZE, Math.floor(squadSize || 1)));
  return Math.max(1, Math.ceil(clamped * quorumRatio));
}

export function createSquadQuorumState(
  matchId: string,
  routeId: MultiverseRouteId,
  squadSize: number,
): SquadQuorumState {
  const normalizedSize = Math.max(
    MIN_SQUAD_SIZE,
    Math.min(MAX_SQUAD_SIZE, Math.floor(squadSize || 1)),
  );
  const requiredVocalizations = calculateRequiredVocalizations(normalizedSize);
  return {
    matchId,
    routeId,
    squadSize: normalizedSize,
    requiredVocalizations,
    contributions: {},
    completedCount: 0,
    resonanceProgress: 0,
    stabilized: false,
    stabilizedAtMs: null,
  };
}

/**
 * Resize the active squad (e.g. when a player joins or leaves) and recompute quorum status.
 */
export function updateSquadQuorumSize(
  state: SquadQuorumState,
  nextSquadSize: number,
  nowMs = Date.now(),
): SquadQuorumState {
  const squadSize = Math.max(
    MIN_SQUAD_SIZE,
    Math.min(MAX_SQUAD_SIZE, Math.floor(nextSquadSize || 1)),
  );
  const requiredVocalizations = calculateRequiredVocalizations(squadSize);
  const completedCount = Object.keys(state.contributions).length;
  const resonanceProgress = Math.min(1, completedCount / requiredVocalizations);
  const stabilized = completedCount >= requiredVocalizations;
  return {
    ...state,
    squadSize,
    requiredVocalizations,
    completedCount,
    resonanceProgress,
    stabilized,
    stabilizedAtMs: stabilized ? (state.stabilizedAtMs ?? nowMs) : null,
  };
}

/**
 * Aggregate a real-time `PORTAL_RESONANCE_UPDATE` event from a student session.
 * Duplicate submissions from the same student update their best score without
 * double-counting toward the squad quorum.
 */
export function aggregatePortalResonanceUpdate(
  state: SquadQuorumState,
  event: SquadContributionEvent,
): SquadQuorumState {
  if (!event.passed || event.score <= 0) {
    return state;
  }
  if (event.routeId !== state.routeId) {
    return state;
  }

  const prev = state.contributions[event.studentId];
  const nextContribution = {
    studentId: event.studentId,
    targetId: event.targetId,
    mode: event.mode,
    score: prev ? Math.max(prev.score, event.score) : event.score,
    timestampMs: event.timestampMs,
  };

  const contributions = {
    ...state.contributions,
    [event.studentId]: nextContribution,
  };
  const completedCount = Object.keys(contributions).length;
  const resonanceProgress = Math.min(1, completedCount / state.requiredVocalizations);
  const stabilized = completedCount >= state.requiredVocalizations;

  return {
    ...state,
    contributions,
    completedCount,
    resonanceProgress,
    stabilized,
    stabilizedAtMs: stabilized ? (state.stabilizedAtMs ?? event.timestampMs) : null,
  };
}

// ---------------------------------------------------------------------------
// QA-P01: Background Noise / Audio Threshold Filter
// ---------------------------------------------------------------------------

export interface AudioSignalSample {
  /** Root-mean-square amplitude in [0, 1]. */
  rms: number;
  /** Optional estimated decibels relative to full scale (dBFS, e.g. -60 to 0). */
  dbFs?: number;
  /** Continuous voice activity duration in milliseconds. */
  durationMs: number;
  /** Dominant fundamental or formant frequency in Hz (human voice band: 85–3400 Hz). */
  dominantFreqHz?: number;
  /** Signal-to-noise ratio in dB. */
  snrDb?: number;
}

export interface AudioNoiseGateConfig {
  minRmsThreshold: number;
  minDbFsThreshold: number;
  minSpeechDurationMs: number;
  minVoiceFreqHz: number;
  maxVoiceFreqHz: number;
  minSnrDb: number;
}

export const DEFAULT_AUDIO_NOISE_GATE: AudioNoiseGateConfig = {
  minRmsThreshold: 0.035,
  minDbFsThreshold: -42,
  minSpeechDurationMs: 280,
  minVoiceFreqHz: 80,
  maxVoiceFreqHz: 3600,
  minSnrDb: 6,
};

export interface AudioGateFilterResult {
  passedGate: boolean;
  reason?: 'rms_below_threshold' | 'dbfs_below_threshold' | 'duration_too_short' | 'out_of_voice_band' | 'low_snr';
  effectiveRms: number;
  estimatedDbFs: number;
}

/**
 * QA-P01: Evaluates whether an incoming microphone frame / segment represents genuine
 * vocalization or background noise that must be ignored without penalizing attempts.
 */
export function evaluateAudioThresholdFilter(
  sample: AudioSignalSample,
  config: AudioNoiseGateConfig = DEFAULT_AUDIO_NOISE_GATE,
): AudioGateFilterResult {
  const effectiveRms = Math.max(0, Math.min(1, Number.isFinite(sample.rms) ? sample.rms : 0));
  const estimatedDbFs =
    sample.dbFs !== undefined && Number.isFinite(sample.dbFs)
      ? sample.dbFs
      : effectiveRms > 1e-6
        ? 20 * Math.log10(effectiveRms)
        : -100;

  if (effectiveRms < config.minRmsThreshold) {
    return {
      passedGate: false,
      reason: 'rms_below_threshold',
      effectiveRms,
      estimatedDbFs,
    };
  }

  if (estimatedDbFs < config.minDbFsThreshold) {
    return {
      passedGate: false,
      reason: 'dbfs_below_threshold',
      effectiveRms,
      estimatedDbFs,
    };
  }

  if (sample.durationMs < config.minSpeechDurationMs) {
    return {
      passedGate: false,
      reason: 'duration_too_short',
      effectiveRms,
      estimatedDbFs,
    };
  }

  if (
    sample.dominantFreqHz !== undefined &&
    (sample.dominantFreqHz < config.minVoiceFreqHz || sample.dominantFreqHz > config.maxVoiceFreqHz)
  ) {
    return {
      passedGate: false,
      reason: 'out_of_voice_band',
      effectiveRms,
      estimatedDbFs,
    };
  }

  if (sample.snrDb !== undefined && sample.snrDb < config.minSnrDb) {
    return {
      passedGate: false,
      reason: 'low_snr',
      effectiveRms,
      estimatedDbFs,
    };
  }

  return {
    passedGate: true,
    effectiveRms,
    estimatedDbFs,
  };
}

// ---------------------------------------------------------------------------
// §5.2 Non-Blocking 3-Attempt Fallback Engine (Path A: Dictation, Path B: Tile Sort)
// ---------------------------------------------------------------------------

export const MAX_SPEECH_ATTEMPTS_BEFORE_FALLBACK = 3;
export const FALLBACK_XP_MULTIPLIER = 0.80;
export const BASE_STONE_XP = 100;

export type FallbackPathKind = 'PATH_A_DICTATION' | 'PATH_B_TILE_SORT';

export interface FallbackEngineState {
  targetId: string;
  failedSpeechAttempts: number;
  maxSpeechAttempts: number;
  micPermissionDenied: boolean;
  fallbackActive: boolean;
  activePath: FallbackPathKind | null;
  unlocked: boolean;
  awardedXp: number;
  baseXp: number;
}

export function createFallbackEngineState(
  targetId: string,
  baseXp = BASE_STONE_XP,
  preferredPath: FallbackPathKind = 'PATH_A_DICTATION',
): FallbackEngineState {
  void preferredPath;
  return {
    targetId,
    failedSpeechAttempts: 0,
    maxSpeechAttempts: MAX_SPEECH_ATTEMPTS_BEFORE_FALLBACK,
    micPermissionDenied: false,
    fallbackActive: false,
    activePath: null,
    unlocked: false,
    awardedXp: 0,
    baseXp,
  };
}

/**
 * QA-P02: Instant transition to non-blocking fallback when microphone permission
 * is denied (`NotAllowedError` / `PermissionDeniedError`) or unavailable.
 */
export function triggerMicDeniedFallback(
  state: FallbackEngineState,
  path: FallbackPathKind = 'PATH_A_DICTATION',
): FallbackEngineState {
  return {
    ...state,
    micPermissionDenied: true,
    fallbackActive: true,
    activePath: path,
  };
}

/**
 * Record a speech evaluation attempt:
 * - If `passed === true`, unlocks the stone at 100% `baseXp`.
 * - If `passed === false`, increments `failedSpeechAttempts`. After 3 failed attempts,
 *   automatically activates the non-blocking fallback (`PATH_A_DICTATION` or `PATH_B_TILE_SORT`).
 */
export function recordSpeechEvaluationAttempt(
  state: FallbackEngineState,
  passed: boolean,
  preferredFallbackPath: FallbackPathKind = 'PATH_A_DICTATION',
): FallbackEngineState {
  if (state.unlocked) return state;

  if (passed) {
    return {
      ...state,
      unlocked: true,
      awardedXp: state.baseXp,
    };
  }

  const failedSpeechAttempts = state.failedSpeechAttempts + 1;
  const shouldActivateFallback = failedSpeechAttempts >= state.maxSpeechAttempts;

  return {
    ...state,
    failedSpeechAttempts,
    fallbackActive: state.fallbackActive || shouldActivateFallback,
    activePath:
      state.activePath ?? (shouldActivateFallback ? preferredFallbackPath : null),
  };
}

function normalizeFallbackText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.,!?;:'"()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evaluate Path A (Typed Dictation) or Path B (Syntactic Tile Sort).
 * When solved via fallback, unlocks the stone at 80% of `baseXp` (`Math.round(baseXp * 0.80)`).
 */
export function evaluateFallbackSubmission(
  state: FallbackEngineState,
  stone: QuestStoneDefinition,
  submission:
    | { path: 'PATH_A_DICTATION'; typedText: string }
    | { path: 'PATH_B_TILE_SORT'; orderedTiles: string[] },
): { state: FallbackEngineState; passed: boolean; awardedXp: number } {
  let passed = false;

  if (submission.path === 'PATH_A_DICTATION') {
    const normalizedInput = normalizeFallbackText(submission.typedText);
    const candidates = [
      stone.fallback.dictation.answer,
      ...(stone.fallback.dictation.accept ?? []),
      stone.text,
    ].map(normalizeFallbackText);
    passed = normalizedInput.length > 0 && candidates.includes(normalizedInput);
  } else {
    const sol = stone.fallback.tiles.solution;
    const given = submission.orderedTiles;
    passed =
      given.length === sol.length &&
      given.every((tile, idx) => normalizeFallbackText(tile) === normalizeFallbackText(sol[idx]));
  }

  if (!passed) {
    return {
      state: {
        ...state,
        fallbackActive: true,
        activePath: submission.path,
      },
      passed: false,
      awardedXp: 0,
    };
  }

  const awardedXp = Math.round(state.baseXp * FALLBACK_XP_MULTIPLIER);
  const nextState: FallbackEngineState = {
    ...state,
    fallbackActive: true,
    activePath: submission.path,
    unlocked: true,
    awardedXp,
  };

  return {
    state: nextState,
    passed: true,
    awardedXp,
  };
}

// ---------------------------------------------------------------------------
// §6.1 & §6.2 8-Stage Quest Node State Machine
// ---------------------------------------------------------------------------

export interface QuestNodeMachineState {
  stage: QuestNodeStage;
  routeId: MultiverseRouteId;
  nextRouteId: MultiverseRouteId | null;
  /** WebGL context identity token: preserved across WARP_TRANSITION so the canvas is never recreated. */
  webglContextId: string;
  webglContextResetCount: number;
  exploredObjectIds: string[];
  investigatedObjectIds: string[];
  puzzleSolved: boolean;
  activeStoneId: string | null;
  fallbackByStone: Record<string, FallbackEngineState>;
  quorum: SquadQuorumState;
  totalAwardedXp: number;
  warpCount: number;
  history: QuestNodeStage[];
}

export function createQuestNodeMachineState(opts: {
  matchId?: string;
  routeId?: MultiverseRouteId;
  nextRouteId?: MultiverseRouteId | null;
  squadSize?: number;
  webglContextId?: string;
  stones?: QuestStoneDefinition[];
}): QuestNodeMachineState {
  const matchId = opts.matchId ?? 'local-match';
  const routeId = opts.routeId ?? 'mv-01';
  const nextRouteId =
    opts.nextRouteId !== undefined ? opts.nextRouteId : defaultNextRouteId(routeId);
  const squadSize = opts.squadSize ?? 1;
  const webglContextId = opts.webglContextId ?? 'webgl-ctx-primary';

  const fallbackByStone: Record<string, FallbackEngineState> = {};
  for (const s of opts.stones ?? []) {
    fallbackByStone[s.targetId] = createFallbackEngineState(s.targetId, BASE_STONE_XP);
  }

  return {
    stage: 'UNINITIALIZED',
    routeId,
    nextRouteId,
    webglContextId,
    webglContextResetCount: 0,
    exploredObjectIds: [],
    investigatedObjectIds: [],
    puzzleSolved: false,
    activeStoneId: opts.stones?.[0]?.targetId ?? null,
    fallbackByStone,
    quorum: createSquadQuorumState(matchId, routeId, squadSize),
    totalAwardedXp: 0,
    warpCount: 0,
    history: ['UNINITIALIZED'],
  };
}

export function defaultNextRouteId(routeId: MultiverseRouteId): MultiverseRouteId | null {
  switch (routeId) {
    case 'mv-01':
      return 'mv-02';
    case 'mv-02':
      return 'mv-03';
    case 'mv-03':
      return 'mv-04';
    case 'mv-04':
      return 'mv-05';
    case 'mv-05':
      return null;
  }
}

function pushStage(state: QuestNodeMachineState, nextStage: QuestNodeStage): QuestNodeMachineState {
  if (state.stage === nextStage) return state;
  return {
    ...state,
    stage: nextStage,
    history: [...state.history, nextStage],
  };
}

/**
 * 1. `UNINITIALIZED -> EXPLORATION`: Initialize the Multiverse room without recreating WebGL.
 */
export function initializeQuestExploration(
  state: QuestNodeMachineState,
  route?: MultiverseQuestRoute,
): QuestNodeMachineState {
  const fallbackByStone = { ...state.fallbackByStone };
  if (route) {
    for (const s of route.stones) {
      fallbackByStone[s.targetId] ??= createFallbackEngineState(s.targetId, BASE_STONE_XP);
    }
  }
  const next: QuestNodeMachineState = {
    ...state,
    routeId: route?.id ?? state.routeId,
    nextRouteId: route ? route.next : state.nextRouteId,
    activeStoneId: route?.stones[0]?.targetId ?? state.activeStoneId,
    fallbackByStone,
  };
  return pushStage(next, 'EXPLORATION');
}

/**
 * 2. `EXPLORATION -> INVESTIGATION` and `INVESTIGATION -> PUZZLE_DEDUCTION`
 * via the Object Interaction Matrix (§6.2).
 */
export function recordQuestObjectInteraction(
  state: QuestNodeMachineState,
  objectId: string,
  anchor: QuestAnchorKind,
): QuestNodeMachineState {
  if (state.stage === 'UNINITIALIZED') return state;

  if (anchor === 'chest' || state.stage === 'EXPLORATION') {
    const exploredObjectIds = state.exploredObjectIds.includes(objectId)
      ? state.exploredObjectIds
      : [...state.exploredObjectIds, objectId];
    return pushStage({ ...state, exploredObjectIds }, 'INVESTIGATION');
  }

  if (anchor === 'altar' || state.stage === 'INVESTIGATION') {
    const investigatedObjectIds = state.investigatedObjectIds.includes(objectId)
      ? state.investigatedObjectIds
      : [...state.investigatedObjectIds, objectId];
    return pushStage({ ...state, investigatedObjectIds }, 'PUZZLE_DEDUCTION');
  }

  return state;
}

/**
 * 3. `PUZZLE_DEDUCTION -> PHONETIC_CHALLENGE`: Submit grammar deduction puzzle choice.
 */
export function submitQuestPuzzleDeduction(
  state: QuestNodeMachineState,
  puzzle: QuestPuzzleDefinition,
  choiceIdx: number,
): { state: QuestNodeMachineState; correct: boolean } {
  const correct = choiceIdx === puzzle.correctIdx;
  if (!correct) {
    return { state, correct: false };
  }
  const next = pushStage(
    {
      ...state,
      puzzleSolved: true,
    },
    'PHONETIC_CHALLENGE',
  );
  return { state: next, correct: true };
}

/**
 * 4. `PHONETIC_CHALLENGE -> PORTAL_CHARGING (-> PORTAL_STABILIZED when quorum met)`:
 * Process a student's phonetic stone attempt (or fallback completion).
 */
export function submitQuestPhoneticAttempt(
  state: QuestNodeMachineState,
  params: {
    studentId: string;
    stone: QuestStoneDefinition;
    passed: boolean;
    score: number;
    mode?: 'shadow' | 'dictate' | 'tiles' | 'repeat';
    audioSample?: AudioSignalSample;
    micDenied?: boolean;
    fallbackSubmission?:
      | { path: 'PATH_A_DICTATION'; typedText: string }
      | { path: 'PATH_B_TILE_SORT'; orderedTiles: string[] };
    timestampMs?: number;
  },
): {
  state: QuestNodeMachineState;
  accepted: boolean;
  noiseFiltered: boolean;
  fallbackActivated: boolean;
  stoneUnlocked: boolean;
  awardedXp: number;
} {
  const nowMs = params.timestampMs ?? Date.now();
  const targetId = params.stone.targetId;
  const currentFallback =
    state.fallbackByStone[targetId] ?? createFallbackEngineState(targetId, BASE_STONE_XP);

  // QA-P02: Instant fallback on mic permission denied
  if (params.micDenied) {
    const updatedFallback = triggerMicDeniedFallback(currentFallback, 'PATH_A_DICTATION');
    return {
      state: {
        ...state,
        activeStoneId: targetId,
        fallbackByStone: {
          ...state.fallbackByStone,
          [targetId]: updatedFallback,
        },
      },
      accepted: false,
      noiseFiltered: false,
      fallbackActivated: true,
      stoneUnlocked: false,
      awardedXp: 0,
    };
  }

  // QA-P01: Ignore background noise below threshold without burning an attempt
  if (params.audioSample) {
    const gate = evaluateAudioThresholdFilter(params.audioSample);
    if (!gate.passedGate) {
      return {
        state,
        accepted: false,
        noiseFiltered: true,
        fallbackActivated: currentFallback.fallbackActive,
        stoneUnlocked: currentFallback.unlocked,
        awardedXp: 0,
      };
    }
  }

  // Non-blocking fallback submission (Path A Typed Dictation or Path B Syntactic Tile Sort)
  if (params.fallbackSubmission) {
    const fbRes = evaluateFallbackSubmission(
      currentFallback,
      params.stone,
      params.fallbackSubmission,
    );
    const fallbackByStone = {
      ...state.fallbackByStone,
      [targetId]: fbRes.state,
    };
    if (!fbRes.passed) {
      return {
        state: { ...state, activeStoneId: targetId, fallbackByStone },
        accepted: true,
        noiseFiltered: false,
        fallbackActivated: true,
        stoneUnlocked: false,
        awardedXp: 0,
      };
    }

    const quorum = aggregatePortalResonanceUpdate(state.quorum, {
      type: 'PORTAL_RESONANCE_UPDATE',
      matchId: state.quorum.matchId,
      routeId: state.routeId,
      studentId: params.studentId,
      targetId,
      mode: params.fallbackSubmission.path === 'PATH_A_DICTATION' ? 'dictate' : 'tiles',
      score: Math.max(80, params.score),
      passed: true,
      timestampMs: nowMs,
    });

    let nextState: QuestNodeMachineState = {
      ...state,
      activeStoneId: targetId,
      fallbackByStone,
      quorum,
      totalAwardedXp: state.totalAwardedXp + fbRes.awardedXp,
    };
    nextState = pushStage(nextState, 'PORTAL_CHARGING');
    if (quorum.stabilized) {
      nextState = pushStage(nextState, 'PORTAL_STABILIZED');
    }

    return {
      state: nextState,
      accepted: true,
      noiseFiltered: false,
      fallbackActivated: true,
      stoneUnlocked: true,
      awardedXp: fbRes.awardedXp,
    };
  }

  // Standard voice evaluation attempt
  const nextFallback = recordSpeechEvaluationAttempt(currentFallback, params.passed);
  const fallbackByStone = {
    ...state.fallbackByStone,
    [targetId]: nextFallback,
  };

  if (!params.passed) {
    return {
      state: {
        ...state,
        activeStoneId: targetId,
        fallbackByStone,
      },
      accepted: true,
      noiseFiltered: false,
      fallbackActivated: nextFallback.fallbackActive,
      stoneUnlocked: false,
      awardedXp: 0,
    };
  }

  const quorum = aggregatePortalResonanceUpdate(state.quorum, {
    type: 'PORTAL_RESONANCE_UPDATE',
    matchId: state.quorum.matchId,
    routeId: state.routeId,
    studentId: params.studentId,
    targetId,
    mode: params.mode ?? 'shadow',
    score: Math.max(70, params.score),
    passed: true,
    timestampMs: nowMs,
  });

  let nextState: QuestNodeMachineState = {
    ...state,
    activeStoneId: targetId,
    fallbackByStone,
    quorum,
    totalAwardedXp: state.totalAwardedXp + nextFallback.awardedXp,
  };
  nextState = pushStage(nextState, 'PORTAL_CHARGING');
  if (quorum.stabilized) {
    nextState = pushStage(nextState, 'PORTAL_STABILIZED');
  }

  return {
    state: nextState,
    accepted: true,
    noiseFiltered: false,
    fallbackActivated: nextFallback.fallbackActive,
    stoneUnlocked: true,
    awardedXp: nextFallback.awardedXp,
  };
}

/**
 * Apply an external `PORTAL_RESONANCE_UPDATE` broadcast event directly to the quest state machine.
 */
export function applySquadResonanceEvent(
  state: QuestNodeMachineState,
  event: SquadContributionEvent,
): QuestNodeMachineState {
  const quorum = aggregatePortalResonanceUpdate(state.quorum, event);
  let next: QuestNodeMachineState = {
    ...state,
    quorum,
  };
  if (
    quorum.completedCount > 0 &&
    (next.stage === 'PHONETIC_CHALLENGE' || next.stage === 'PUZZLE_DEDUCTION')
  ) {
    next = pushStage(next, 'PORTAL_CHARGING');
  }
  if (quorum.stabilized && next.stage === 'PORTAL_CHARGING') {
    next = pushStage(next, 'PORTAL_STABILIZED');
  }
  return next;
}

/**
 * 5. `PORTAL_STABILIZED -> WARP_TRANSITION` (and optional seamless advance to next route):
 * Triggered when the player steps through the stabilized portal plane.
 * Preserves `webglContextId` and `webglContextResetCount === 0` so the WebGL context is never reset!
 */
export function traverseStabilizedPortal(
  state: QuestNodeMachineState,
  nextRoute?: MultiverseQuestRoute,
): QuestNodeMachineState {
  if (state.stage !== 'PORTAL_STABILIZED' && !state.quorum.stabilized) {
    return state;
  }

  const warped = pushStage(
    {
      ...state,
      warpCount: state.warpCount + 1,
    },
    'WARP_TRANSITION',
  );

  if (!nextRoute) {
    return warped;
  }

  // Seamlessly load next route into the SAME WebGL context (`webglContextId` unchanged)
  const fallbackByStone: Record<string, FallbackEngineState> = {};
  for (const s of nextRoute.stones) {
    fallbackByStone[s.targetId] = createFallbackEngineState(s.targetId, BASE_STONE_XP);
  }

  return {
    ...warped,
    stage: 'EXPLORATION',
    routeId: nextRoute.id,
    nextRouteId: nextRoute.next,
    exploredObjectIds: [],
    investigatedObjectIds: [],
    puzzleSolved: false,
    activeStoneId: nextRoute.stones[0]?.targetId ?? null,
    fallbackByStone,
    quorum: createSquadQuorumState(
      state.quorum.matchId,
      nextRoute.id,
      state.quorum.squadSize,
    ),
    history: [...warped.history, 'EXPLORATION'],
  };
}
