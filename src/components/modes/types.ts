import type { BattleEvent, BossProfile, QuestionType, StoryBeat } from '../../engine';
import type { GfxTier } from './three/SceneRuntime';

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
}
