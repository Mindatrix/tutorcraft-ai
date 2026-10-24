import type { BossProfile, DifficultyLevel, ExamMode, Question, ScenarioId, ThemeId } from '../../engine';

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
  'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500';
export const label = 'block text-sm font-semibold text-slate-300 mb-2';
