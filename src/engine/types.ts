// Core types for the TutorCraft 3D Lego Engine.
// Dimension 1 = Scenario, Dimension 2 = Theme, Dimension 3 = Duration.

export type ScenarioId = 'homework' | 'in_class' | 'coop_raid' | 'boat_race';

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

/** 5 teaching levels the tutor picks: 1 = Dễ … 5 = Rất khó. Default 3 (Trung bình). */
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

/** Standard = clean academic quiz, Gamified = full RPG battle. */
export type ExamMode = 'standard' | 'gamified';

export type ExamType = 'individual' | 'group';

export type SkillTag = 'grammar' | 'vocabulary' | 'reading' | 'listening' | 'pronunciation' | 'other';

/**
 * Lesson formats. 'mcq' is the original 4-option quiz; the rest are open or
 * interactive and are graded on the server (exact rules, or AI rubric for writing).
 */
export type QuestionType = 'mcq' | 'essay' | 'matching' | 'transform' | 'reorder' | 'reading' | 'cloze';

/** How the two sides of a matching pair relate to the hub concept. */
export type PairRelation = 'term_definition' | 'formula_example' | 'situation_response' | 'cause_effect';

export interface MatchPair {
  left: string;
  right: string;
  relation?: PairRelation;
}

export interface ClozeGap {
  /** Accepted answers for this gap (compared case-insensitively, normalized). */
  answers: string[];
}

export interface Question {
  id: number;
  /** Missing = 'mcq' (every battle saved before question types existed). */
  type?: QuestionType;
  /** Prompt / instruction shown to the student. */
  question: string;
  /** mcq only; empty for other types. */
  options: string[];
  /** mcq only; -1 for other types. */
  correct_idx: number;
  difficulty: Difficulty;
  /** Fine-grained topic, e.g. "present perfect" — used for diagnostics and SM-2. */
  topic: string;
  skill_tag: SkillTag;
  hint?: string;
  explanation?: string;
  /** True when injected from the spaced-repetition review pool. */
  is_review?: boolean;

  // --- essay & reading (AI rubric grading) ---
  /** Tutor's grading guidelines for the AI. Never shown to students. */
  rubric?: string;
  min_words?: number;
  max_words?: number;
  sample_answer?: string;
  /** Ideas a good answer should contain — drives the "Ý chính" criterion. */
  key_points?: string[];
  /** reading: the passage shown on the left. */
  passage?: string;

  // --- matching ---
  /** Core concept shown as the hub header, e.g. "Past Simple". */
  hub?: string;
  pairs?: MatchPair[];
  /** Deeper explanation unlocked after every pair is matched. */
  deep_insight?: string;

  // --- transform (rewrite keeping the meaning) ---
  /** Original sentence. */
  source?: string;
  /** Word in brackets the rewrite must use. */
  cue?: string;
  /** transform: accepted rewrites. reorder: accepted alternative sentences. */
  answers?: string[];
  /** transform: phrases that "charge the magic" as the student types them. */
  key_phrases?: string[];

  // --- reorder ---
  /** Words / chunks in the CORRECT order. Students get them shuffled. */
  tokens?: string[];

  // --- cloze ---
  /** Text with gaps written as {{1}}, {{2}}, … */
  text?: string;
  gaps?: ClozeGap[];
  /** Optional word bank; with one, gaps become drop-downs. */
  word_bank?: string[];
}

/** Result of grading a non-mcq answer on the server. Stored in the session log. */
export interface Grade {
  /** 0..1. ≥ 0.6 counts as correct, ≥ 0.9 is a critical hit. */
  score: number;
  by: 'exact' | 'rules' | 'ai' | 'fallback';
  /** 0..100 each — essay / reading only. */
  criteria?: { grammar: number; vocabulary: number; ideas: number };
  /** Short Vietnamese feedback for the student. */
  feedback?: string;
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
  /** Overall difficulty level 1–5 (see levels.ts). Missing = 3. */
  level?: DifficultyLevel;
  /** Question formats the tutor asked the AI for. Missing = ['mcq']. */
  questionTypes?: QuestionType[];
  /** Exact number of questions the tutor asked for (2–45). Missing = derived from duration. */
  questionCount?: number;
  /** Exact per-format counts the tutor asked for, e.g. {mcq:5, cloze:3}. */
  typeCounts?: Partial<Record<QuestionType, number>>;
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
  chosenIdx: number; // -1 = timed out; 0 for non-mcq answers
  timeMs: number;
  shielded?: boolean;
  /** 0..1 for graded (non-mcq) answers. */
  score?: number;
  /** Boss damage this question dealt (all hits, incl. matching pair hits). */
  damage?: number;
  /** Student's own words (essay / reading / transform), kept for tutor review. */
  response?: string;
}

/** A skill cast, recorded so the server can re-check the MP budget. */
export interface SkillCast {
  skill: SkillId;
  questionId: number;
}
