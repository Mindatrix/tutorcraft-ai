import type { BossProfile, DifficultyLevel, ExamMode, Question, QuestionType, ScenarioId, ThemeId } from '../../engine';

export interface StudioSettings {
  topic: string;
  tutorName: string;
  classCode: string;
  cefrLevel: string;
  level: DifficultyLevel;
  scenario: ScenarioId;
  mode: ExamMode;
  themes: ThemeId[];
  durationMinutes: number;
  studentCount: number;
  teamSize: number;
  /** Lesson formats the AI should write. */
  questionTypes: QuestionType[];
  /** Exact number of questions; 0 / missing = automatic from the duration. */
  questionCount?: number;
}

export interface StudioDraft {
  settings: StudioSettings;
  lessonTitle: string;
  boss: BossProfile;
  teaching_notes: string[];
  knowledge_matrix?: { topic: string; skill_tag: string; summary: string }[];
  questions: Question[];
  provider: string;
  execution_time: string;
  attempts: { model: string; ok: boolean; ms: number; error?: string }[];
  review_topics: string[];
}

export interface PublishedBattle {
  battle_id: string;
  code: string | null;
  variants: number[];
  warning?: string;
  lessonTitle: string;
}

export const field =
  'w-full bg-transparent border-0 border-b-2 border-slate-600 px-1 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-300 focus:bg-white/5';
export const label = 'block text-sm font-semibold text-slate-300 mb-2';
