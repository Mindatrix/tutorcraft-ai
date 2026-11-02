import {
  DEFAULT_SPEECH_RULES,
  scoreDictation,
  scoreSpeech,
  speechAttemptOutcome,
  type SpeechAlternative,
  type SpeechHistory,
  type SpeechMode,
  type SpeechRules,
  type SpeechTarget,
} from '../engine/pronunciation';

export interface VoiceConfig {
  enabled: boolean;
  lang: 'en-US' | 'en-GB';
}

export interface PhoneticStoneTarget extends SpeechTarget {
  stationId?: string;
  /** Vietnamese hint shown in HUD card for learners. */
  viMeaning?: string;
  /** Tier-1 mouth-shape coaching cue shown by the Pet after 2 misses or during modeling. */
  mouthTipVi?: string;
}

export interface SpeechAttemptRequest {
  targetId: string;
  mode: SpeechMode;
  transcript?: string;
  alternatives?: SpeechAlternative[];
  confidence?: number;
  durationMs?: number;
  typed?: string;
}

export type SpeechRejectReason =
  | 'too_short'
  | 'rate_limited'
  | 'no_attempts_left'
  | 'voice_disabled'
  | 'unknown_target';

export interface SpeechAttemptResponse {
  targetId: string;
  accepted: boolean;
  reason?: SpeechRejectReason;
  score: number;
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  almost?: boolean;
  attemptNo: number;
  attemptsLeft: number;
  bestScore: number;
  weakWords?: string[];
  hint?: 'mouth_shape';
  coins?: number;
  detail?: {
    wordScore: number;
    phonemeScore: number;
    confScore: number | null;
  };
}

export const MOCK_VOICE_CONFIG: VoiceConfig = {
  enabled: true,
  lang: 'en-US',
};

export const MOCK_SPEECH_RULES: SpeechRules = {
  ...DEFAULT_SPEECH_RULES,
  lexicon: {
    three: 'TH R IY1',
    tent: 'T EH1 N T',
    campfire: 'K AE1 M P F AY2 ER0',
    compass: 'K AH1 M P AH0 S',
    lantern: 'L AE1 N T ER0 N',
    salmon: 'S AE1 M AH0 N',
    paddle: 'P AE1 D AH0 L',
    rescue: 'R EH1 S K Y UW0',
    shelter: 'SH EH1 L T ER0',
    bridge: 'B R IH1 JH',
    sleep: 'S L IY1 P',
    water: 'W AO1 T ER0',
  },
  ipa: {
    three: '/θriː/',
    tent: '/tent/',
    campfire: '/ˈkæmpfaɪər/',
    compass: '/ˈkʌmpəs/',
    lantern: '/ˈlæntərn/',
    salmon: '/ˈsæmən/',
    paddle: '/ˈpædəl/',
    rescue: '/ˈreskjuː/',
    shelter: '/ˈʃeltər/',
    bridge: '/brɪdʒ/',
  },
};

/**
 * Mock SpeechTarget objects (AI Studio / Google Flow handoff contract §3.1)
 * covering Summer Camp, River Fishing, and River Survival stations.
 */
export const MOCK_SPEECH_TARGETS: PhoneticStoneTarget[] = [
  {
    targetId: 'q1w',
    text: 'three',
    kind: 'word',
    ipa: '/θriː/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'camp_fire_circle',
    viMeaning: 'số ba',
    mouthTipVi: 'Đặt nhẹ đầu lưỡi giữa hai hàm răng khi bật âm /θ/, rồi kéo miệng cười nhẹ âm /iː/.',
  },
  {
    targetId: 'q2w',
    text: 'tent',
    kind: 'word',
    ipa: '/tent/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'camp_tent_station',
    viMeaning: 'lều trại',
    mouthTipVi: 'Bật rõ âm /t/ ở cả đầu và cuối từ: /t/ - /e/ - /n/ - /t/.',
  },
  {
    targetId: 'q3w',
    text: 'campfire',
    kind: 'word',
    ipa: '/ˈkæmpfaɪər/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'camp_firewood_station',
    viMeaning: 'lửa trại',
    mouthTipVi: 'Mở rộng miệng ở âm /æ/ (camp), khép môi chạm răng trên ở âm /f/ (fire).',
  },
  {
    targetId: 'q4s',
    text: 'We sleep in a tent at the summer camp',
    kind: 'sentence',
    ipa: '/wiː sliːp ɪn ə tent æt ðə ˈsʌmər kæmp/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'camp_quest_board',
    viMeaning: 'Chúng em ngủ trong lều ở trại hè.',
    mouthTipVi: 'Nhấn giọng ở các từ chính: "sleep", "tent", "summer camp" và nối nhẹ "in a".',
  },
  {
    targetId: 'q5w',
    text: 'salmon',
    kind: 'word',
    ipa: '/ˈsæmən/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'fishing_dock',
    viMeaning: 'cá hồi',
    mouthTipVi: 'Chữ "l" trong "salmon" là âm câm — đọc liền /ˈsæm-ən/.',
  },
  {
    targetId: 'q6w',
    text: 'shelter',
    kind: 'word',
    ipa: '/ˈʃeltər/',
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: 'survival_clearing',
    viMeaning: 'nơi trú ẩn',
    mouthTipVi: 'Tròn môi nhẹ đẩy hơi ra cho âm /ʃ/ (sh) ở đầu từ.',
  },
];

/**
 * Canned AI Studio Mock JSON responses for quick state-machine verification and UI cards (§3.3).
 */
export const MOCK_SPEECH_RESPONSES: Record<string, SpeechAttemptResponse> = {
  passThreeStars: {
    targetId: 'q1w',
    accepted: true,
    score: 96,
    passed: true,
    stars: 3,
    attemptNo: 1,
    attemptsLeft: 2,
    bestScore: 96,
    coins: 15,
    detail: { wordScore: 100, phonemeScore: 95, confScore: 92 },
  },
  passTwoStars: {
    targetId: 'q2w',
    accepted: true,
    score: 88,
    passed: true,
    stars: 2,
    attemptNo: 1,
    attemptsLeft: 2,
    bestScore: 88,
    coins: 10,
    detail: { wordScore: 100, phonemeScore: 80, confScore: 84 },
  },
  retryFirstMiss: {
    targetId: 'q1w',
    accepted: true,
    score: 48,
    passed: false,
    stars: 0,
    attemptNo: 1,
    attemptsLeft: 2,
    bestScore: 48,
    detail: { wordScore: 0, phonemeScore: 67, confScore: 78 },
  },
  retryMouthShapeHint: {
    targetId: 'q4s',
    accepted: true,
    score: 54,
    passed: false,
    stars: 0,
    attemptNo: 2,
    attemptsLeft: 1,
    bestScore: 54,
    weakWords: ['sleep', 'tent'],
    hint: 'mouth_shape',
    detail: { wordScore: 62, phonemeScore: 45, confScore: 52 },
  },
  rejectedTooShort: {
    targetId: 'q1w',
    accepted: false,
    reason: 'too_short',
    score: 0,
    passed: false,
    stars: 0,
    attemptNo: 0,
    attemptsLeft: 3,
    bestScore: 0,
  },
  dictateAlmost: {
    targetId: 'q5w',
    accepted: true,
    score: 83,
    passed: true,
    stars: 1,
    almost: true,
    attemptNo: 1,
    attemptsLeft: 2,
    bestScore: 83,
  },
  repeatParticipation: {
    targetId: 'q1w',
    accepted: true,
    score: 0,
    passed: false,
    stars: 1,
    attemptNo: 1,
    attemptsLeft: 2,
    bestScore: 0,
  },
};

/**
 * Pure mock evaluator that mirrors `src/server/speech.ts` using `src/engine/pronunciation.ts`.
 * Used when running Phonetic Stones UI with mocked targets or offline demo.
 */
export function evaluateMockSpeechAttempt(
  req: SpeechAttemptRequest,
  target: SpeechTarget,
  history: SpeechHistory,
  level = 3,
  voiceConfig: VoiceConfig = MOCK_VOICE_CONFIG,
  rules: SpeechRules = MOCK_SPEECH_RULES,
): { response: SpeechAttemptResponse; nextHistory: SpeechHistory } {
  if (history.attempts >= rules.maxAttempts) {
    return {
      response: {
        targetId: target.targetId,
        accepted: false,
        reason: 'no_attempts_left',
        score: 0,
        passed: false,
        stars: 0,
        attemptNo: history.attempts,
        attemptsLeft: 0,
        bestScore: history.bestScore,
      },
      nextHistory: history,
    };
  }

  if (req.mode === 'shadow' && !voiceConfig.enabled) {
    return {
      response: {
        targetId: target.targetId,
        accepted: false,
        reason: 'voice_disabled',
        score: 0,
        passed: false,
        stars: 0,
        attemptNo: history.attempts,
        attemptsLeft: Math.max(0, rules.maxAttempts - history.attempts),
        bestScore: history.bestScore,
      },
      nextHistory: history,
    };
  }

  if (req.mode === 'shadow' && typeof req.durationMs === 'number' && req.durationMs < rules.minSpeechMs) {
    return {
      response: {
        targetId: target.targetId,
        accepted: false,
        reason: 'too_short',
        score: 0,
        passed: false,
        stars: 0,
        attemptNo: history.attempts,
        attemptsLeft: Math.max(0, rules.maxAttempts - history.attempts),
        bestScore: history.bestScore,
      },
      nextHistory: history,
    };
  }

  if (req.mode === 'repeat') {
    const attemptNo = history.attempts + 1;
    const attemptsLeft = Math.max(0, rules.maxAttempts - attemptNo);
    const stars = (rules.repeatStars >= 1 ? 1 : 0) as 0 | 1;
    const nextHistory: SpeechHistory = {
      attempts: attemptNo,
      misses: history.misses, // repeat never counts as a miss (§2.4)
      bestScore: history.bestScore,
      bestStars: Math.max(history.bestStars, stars),
    };
    return {
      response: {
        targetId: target.targetId,
        accepted: true,
        score: 0,
        passed: false,
        stars,
        attemptNo,
        attemptsLeft,
        bestScore: nextHistory.bestScore,
      },
      nextHistory,
    };
  }

  if (req.mode === 'dictate') {
    const dict = scoreDictation(target.text, req.typed ?? '', level, rules);
    const outcome = speechAttemptOutcome(
      history,
      { score: dict.score, stars: dict.stars, passed: dict.passed },
      rules,
    )!;
    const nextHistory: SpeechHistory = {
      attempts: outcome.attemptNo,
      misses: history.misses + (dict.passed ? 0 : 1),
      bestScore: outcome.bestScore,
      bestStars: outcome.bestStars,
    };
    return {
      response: {
        targetId: target.targetId,
        accepted: true,
        score: dict.score,
        passed: dict.passed,
        stars: dict.stars,
        ...(dict.almost ? { almost: true } : {}),
        attemptNo: outcome.attemptNo,
        attemptsLeft: outcome.attemptsLeft,
        bestScore: outcome.bestScore,
        ...(outcome.hint ? { hint: outcome.hint } : {}),
        ...(outcome.coins > 0 ? { coins: outcome.coins } : {}),
      },
      nextHistory,
    };
  }

  // mode === 'shadow'
  const alts: SpeechAlternative[] =
    req.alternatives && req.alternatives.length > 0
      ? req.alternatives.slice(0, 5)
      : [{ transcript: req.transcript ?? '', confidence: req.confidence }];

  const scored = scoreSpeech(target.text, alts, level, rules);
  const outcome = speechAttemptOutcome(
    history,
    { score: scored.score, stars: scored.stars, passed: scored.passed },
    rules,
  )!;
  const nextHistory: SpeechHistory = {
    attempts: outcome.attemptNo,
    misses: history.misses + (scored.passed ? 0 : 1),
    bestScore: outcome.bestScore,
    bestStars: outcome.bestStars,
  };

  return {
    response: {
      targetId: target.targetId,
      accepted: true,
      score: scored.score,
      passed: scored.passed,
      stars: scored.stars,
      attemptNo: outcome.attemptNo,
      attemptsLeft: outcome.attemptsLeft,
      bestScore: outcome.bestScore,
      ...(scored.weakWords.length > 0 ? { weakWords: scored.weakWords } : {}),
      ...(outcome.hint ? { hint: outcome.hint } : {}),
      ...(outcome.coins > 0 ? { coins: outcome.coins } : {}),
      detail: {
        wordScore: scored.wordScore,
        phonemeScore: scored.phonemeScore,
        confScore: scored.confScore,
      },
    },
    nextHistory,
  };
}
