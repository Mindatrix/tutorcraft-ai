// Core types for the TutorCraft 3D Lego Engine.
// Dimension 1 = Scenario, Dimension 2 = Theme, Dimension 3 = Duration.

export type ScenarioId = 'homework' | 'in_class' | 'coop_raid';

export type ThemeId =
  | 'minecraft'
  | 'chess'
  | 'genshin'
  | 'moba_lol'
  | 'nintendo_ps5'
  | 'tower_defense'
  | 'card_tcg'
  | 'arcade_racing'
  | 'sports_blitz'
  | 'trivia_arena'
  | 'rpg_classic';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Standard = clean academic quiz, Gamified = full RPG battle. */
export type ExamMode = 'standard' | 'gamified';

export type ExamType = 'individual' | 'group';

export type SkillTag = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'pronunciation' | 'other';

export interface Question {
  id: number;
  question: string;
  options: string[];
  correct_idx: number;
  difficulty: Difficulty;
  /** Fine-grained topic, e.g. "present perfect" — used for diagnostics and SM-2. */
  topic: string;
  skill_tag: SkillTag;
  hint?: string;
  explanation?: string;
  /** True when injected from the spaced-repetition review pool. */
  is_review?: boolean;
}

export interface BattleConfig {
  scenario: ScenarioId;
  /** One or more themes; several = blended theme. */
  themes: ThemeId[];
  durationMinutes: number;
  mode: ExamMode;
  examType: ExamType;
  studentCount: number;
  /** Players sharing one boss in a Co-op Raid. */
  teamSize: number;
  cefrLevel?: string;
}

export interface BattleScaling {
  totalQuestions: number;
  bossHp: number;
  playerHp: number;
  wrongPenalty: number;
}

export type BossAvatar = 'dragon' | 'golem' | 'wizard' | 'shadow_king';

export type MapSetting = 'forest' | 'castle' | 'volcano' | 'ice_cave' | 'dungeon' | 'sky_arena';

/** The boss and arena the AI designs from the lesson content. */
export interface BossProfile {
  boss_name: string;
  boss_avatar: BossAvatar;
  boss_dialogue_on_attack: string;
  boss_skills: string[];
  map_setting: MapSetting;
  map_name: string;
  /** Phase 2 form, entered at 50% boss HP. */
  phase2_name: string;
  phase2_dialogue: string;
  /** Said when the student misses 3 in a row — a taunt plus a deeper hint. */
  enrage_dialogue: string;
}

export interface BattlePayload {
  teaching_notes: string[];
  questions: Question[];
  knowledge_matrix?: { topic: string; skill_tag: SkillTag; summary: string }[];
  boss?: BossProfile;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  genre: string;
  emoji: string;
  bossName: string;
  /** Tailwind gradient classes for the boss HP bar. */
  accent: string;
  correct: string[];
  wrong: string[];
  critical: string[];
  /** Name of the resource earned, e.g. "Diamonds", "Mana". */
  lootName: string;
}

export type SkillId = 'shield' | 'freeze' | 'eye_of_truth';

export interface SkillDefinition {
  id: SkillId;
  name: string;
  nameVi: string;
  cost: number;
  description: string;
}

/** One student answer as recorded by the client and re-checked by the server. */
export interface AnswerRecord {
  questionId: number;
  chosenIdx: number; // -1 = timed out
  timeMs: number;
  shielded?: boolean;
}

/** A skill cast, recorded so the server can re-check the MP budget. */
export interface SkillCast {
  skill: SkillId;
  questionId: number;
}
