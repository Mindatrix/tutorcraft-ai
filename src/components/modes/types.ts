import type { BattleEvent, BossProfile, QuestionType, StoryBeat } from '../../engine';
import type { GfxTier } from './three/SceneRuntime';
import type { TentQuestView } from '../../engine/campQuest';
import type { PhoneticStoneTarget, SpeechAttemptRequest, SpeechAttemptResponse, VoiceConfig } from '../../client/phoneticStonesMock';

export type SceneEvent = { kind: BattleEvent; n: number; amount?: number; beats?: StoryBeat[] } | null;

/** What every boss-battle world receives. Pure display data — the answer key never reaches the client. */
export interface BossSceneProps {
  boss: BossProfile;
  heroName: string;
  topic: string;
  bossHp: number;
  bossMax: number;
  hp: number;
  hpMax: number;
  shield: boolean;
  event: SceneEvent;
  bossPhase: 1 | 2;
  enraged: boolean;
  /** Current question (0-based) and total. */
  qIndex: number;
  qTotal: number;
  /** One entry per answered question: true if it dealt damage. */
  results: boolean[];
  combo: number;
  /** Battle is over (result screen). */
  finished: boolean;
  outcome: 'victory' | 'defeat' | null;
  question: { type: QuestionType; topic: string; options?: string[]; hub?: string } | null;
  /** MCQ options hidden by Eye of Truth. */
  removed: number[];
  /** MCQ: answering from inside the scene uses the same server path as the answer buttons. */
  onPickOption?: (idx: number) => void;
  /** Bring the question panel into view (Agent World hotspot modal). */
  onFocusQuestion?: () => void;
  /** Quality tier to start on (C1.3); the runtime may step down to 'low' by itself. */
  tier?: GfxTier;
  /** The runtime stepped down to 'low' (the page remembers it for next time). */
  onLowQuality?: () => void;
  /** WebGL failed or the device is too slow → parent swaps to the 2D canvas. */
  onUnavailable: () => void;
  /**
   * Live pronunciation stones (03/11, summer_camp / river_fishing): targets and attempts go to the
   * server (/api/session/speech); scores, stars, coins and world effects come back from it.
   */
  speech?: LiveSpeech;
}

/** The arena's connection to the server's pronunciation layer, for a 3D world. */
export interface LiveSpeech {
  load(): Promise<{ voice: VoiceConfig; targets: PhoneticStoneTarget[] }>;
  attempt(req: SpeechAttemptRequest): Promise<SpeechAttemptResponse>;
  /** Class match: the student's tent Quest Board (server broadcast `camp_quest`); null solo / unknown. */
  tentQuest?: TentQuestView | null;
  /**
   * Class match: stones are locked while a scheduled question is open (voice never eats the class's
   * question time). Solo: the next question opens right after an answer, so stones stay usable.
   */
  lockDuringQuestion?: boolean;
}
