import type { BattleConfig, BattlePayload, BossProfile, Difficulty, Question, QuestionType, SkillTag } from './types';
import { BOSS_AVATAR_IDS, MAP_SETTING_IDS, sanitizeBoss } from './boss';
import { clampDuration } from './scaling';
import { normalizeLevel } from './levels';
import { isScenarioId } from './scenarios';
import { normalizeThemes } from './themes';
import { clampQuestionCount } from './questionCount';
import { QUESTION_TYPE_IDS, isQuestionType, normalizeQuestionTypes, questionType, sanitizeTypedFields } from './questionTypes';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const SKILL_TAGS: SkillTag[] = ['grammar', 'vocabulary', 'reading', 'listening', 'pronunciation', 'other'];

function str(v: unknown, max = 600): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/** Validate one AI / tutor question of any format; returns null if it can't be repaired. */
export function sanitizeQuestion(raw: unknown, id: number): Question | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const type = questionType(r as Pick<Question, 'type'>);
  if (type !== 'mcq') return sanitizeTypedQuestion(r, id);
  const question = str(r.question);
  const options = Array.isArray(r.options) ? r.options.map((o) => str(o, 200)).filter((o): o is string => !!o) : [];
  const correct = Number(r.correct_idx);
  if (!question || options.length < 2 || options.length > 6) return null;
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null;

  const difficulty = DIFFICULTIES.includes(r.difficulty as Difficulty) ? (r.difficulty as Difficulty) : 'medium';
  const skill_tag = SKILL_TAGS.includes(r.skill_tag as SkillTag) ? (r.skill_tag as SkillTag) : 'other';
  return {
    id,
    question,
    options,
    correct_idx: correct,
    difficulty,
    skill_tag,
    topic: str(r.topic, 80) ?? 'general',
    hint: str(r.hint, 300) ?? undefined,
    explanation: str(r.explanation, 400) ?? undefined,
  };
}

function sanitizeTypedQuestion(r: Record<string, unknown>, id: number): Question | null {
  const type = questionType(r as Pick<Question, 'type'>);
  const question = str(r.question);
  if (!question) return null;
  const { fields, problem } = sanitizeTypedFields(type, r);
  if (problem) return null;
  const difficulty = DIFFICULTIES.includes(r.difficulty as Difficulty) ? (r.difficulty as Difficulty) : 'medium';
  const skill_tag = SKILL_TAGS.includes(r.skill_tag as SkillTag) ? (r.skill_tag as SkillTag) : type === 'reading' ? 'reading' : 'other';
  return {
    id,
    type,
    question,
    options: [],
    correct_idx: -1,
    difficulty,
    skill_tag,
    topic: str(r.topic, 80) ?? 'general',
    hint: str(r.hint, 300) ?? undefined,
    explanation: str(r.explanation, 600) ?? undefined,
    ...(r.is_review === true ? { is_review: true } : {}),
    ...fields,
  };
}

/**
 * Validate a whole AI payload. Throws if fewer than `minQuestions` usable questions.
 * With `bossFallback`, the top-level boss fields are validated too.
 */
export function validateBattlePayload(raw: unknown, minQuestions = 1, bossFallback?: BossProfile): BattlePayload {
  if (!raw || typeof raw !== 'object') throw new Error('Payload is not an object');
  const r = raw as Record<string, unknown>;
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map((q, i) => sanitizeQuestion(q, i + 1))
    .filter((q): q is Question => !!q);
  if (questions.length < minQuestions) {
    throw new Error(`Only ${questions.length} valid questions (need ${minQuestions})`);
  }
  const notes = Array.isArray(r.teaching_notes)
    ? r.teaching_notes.map((n) => str(n, 500)).filter((n): n is string => !!n)
    : typeof r.teaching_notes === 'string'
      ? r.teaching_notes.split('\n').filter(Boolean)
      : [];
  const matrix = Array.isArray(r.knowledge_matrix)
    ? r.knowledge_matrix
        .map((k) => {
          const o = (k ?? {}) as Record<string, unknown>;
          const topic = str(o.topic, 80);
          if (!topic) return null;
          const skill_tag = SKILL_TAGS.includes(o.skill_tag as SkillTag) ? (o.skill_tag as SkillTag) : 'other';
          return { topic, skill_tag, summary: str(o.summary, 300) ?? '' };
        })
        .filter((k): k is NonNullable<typeof k> => !!k)
    : undefined;
  const boss = bossFallback ? sanitizeBoss(r.boss ?? r, bossFallback) : undefined;
  return { teaching_notes: notes, questions, knowledge_matrix: matrix, boss };
}

/** Build a safe BattleConfig from untrusted request JSON. */
function normalizeQuestionCount(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? clampQuestionCount(n) : undefined;
}

function normalizeTypeCounts(v: unknown): Partial<Record<QuestionType, number>> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out: Partial<Record<QuestionType, number>> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = Math.round(Number(val));
    if (isQuestionType(k) && Number.isFinite(n) && n > 0) out[k] = Math.min(45, n);
  }
  return Object.keys(out).length ? out : undefined;
}

export function normalizeConfig(raw: Record<string, unknown>): BattleConfig {
  const studentCount = Math.min(200, Math.max(1, Math.round(Number(raw.studentCount) || 1)));
  const scenario = isScenarioId(raw.scenario) ? raw.scenario : 'homework';
  return {
    scenario,
    themes: normalizeThemes(raw.themes ?? raw.theme),
    durationMinutes: clampDuration(Number(raw.durationMinutes ?? 10)),
    mode: raw.mode === 'standard' ? 'standard' : 'gamified',
    examType: raw.examType === 'group' || scenario === 'coop_raid' ? 'group' : 'individual',
    studentCount,
    teamSize: Math.min(10, Math.max(1, Math.round(Number(raw.teamSize) || (scenario === 'coop_raid' ? 4 : 1)))),
    cefrLevel: str(raw.cefrLevel, 4) ?? undefined,
    level: normalizeLevel(raw.level),
    questionTypes: normalizeQuestionTypes(raw.questionTypes),
    questionCount: normalizeQuestionCount(raw.questionCount),
    typeCounts: normalizeTypeCounts(raw.typeCounts),
  };
}

/** JSON schema sent to Gemini's structured output (OpenAPI subset). */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    boss_name: { type: 'STRING' },
    boss_avatar: { type: 'STRING', enum: BOSS_AVATAR_IDS },
    boss_dialogue_on_attack: { type: 'STRING' },
    boss_skills: { type: 'ARRAY', items: { type: 'STRING' } },
    map_setting: { type: 'STRING', enum: MAP_SETTING_IDS },
    map_name: { type: 'STRING' },
    phase2_name: { type: 'STRING' },
    phase2_dialogue: { type: 'STRING' },
    enrage_dialogue: { type: 'STRING' },
    teaching_notes: { type: 'ARRAY', items: { type: 'STRING' } },
    knowledge_matrix: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          topic: { type: 'STRING' },
          skill_tag: { type: 'STRING', enum: SKILL_TAGS },
          summary: { type: 'STRING' },
        },
        required: ['topic', 'skill_tag'],
      },
    },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: QUESTION_TYPE_IDS },
          question: { type: 'STRING' },
          // mcq
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correct_idx: { type: 'INTEGER' },
          difficulty: { type: 'STRING', enum: DIFFICULTIES },
          topic: { type: 'STRING' },
          skill_tag: { type: 'STRING', enum: SKILL_TAGS },
          hint: { type: 'STRING' },
          explanation: { type: 'STRING' },
          // essay / reading
          passage: { type: 'STRING' },
          rubric: { type: 'STRING' },
          min_words: { type: 'INTEGER' },
          max_words: { type: 'INTEGER' },
          sample_answer: { type: 'STRING' },
          key_points: { type: 'ARRAY', items: { type: 'STRING' } },
          // matching
          hub: { type: 'STRING' },
          pairs: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                left: { type: 'STRING' },
                right: { type: 'STRING' },
                relation: { type: 'STRING', enum: ['term_definition', 'formula_example', 'situation_response', 'cause_effect'] },
              },
              required: ['left', 'right'],
            },
          },
          deep_insight: { type: 'STRING' },
          // transform
          source: { type: 'STRING' },
          cue: { type: 'STRING' },
          answers: { type: 'ARRAY', items: { type: 'STRING' } },
          key_phrases: { type: 'ARRAY', items: { type: 'STRING' } },
          // reorder
          tokens: { type: 'ARRAY', items: { type: 'STRING' } },
          // cloze
          text: { type: 'STRING' },
          gaps: { type: 'ARRAY', items: { type: 'OBJECT', properties: { answers: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['answers'] } },
          word_bank: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        // Gemini can't express "required for this type only", and it drops optional keys it
        // considers unimportant (measured: mcq without correct_idx, cloze without gaps).
        // So the answer-key fields are required everywhere; unused formats send [] / -1.
        required: [
          'type', 'question', 'difficulty', 'topic', 'skill_tag', 'hint', 'explanation',
          'options', 'correct_idx', 'gaps', 'text', 'word_bank',
          'hub', 'pairs', 'deep_insight',
          'source', 'cue', 'answers', 'key_phrases', 'tokens',
          'passage', 'rubric', 'key_points', 'sample_answer', 'min_words', 'max_words',
        ],
      },
    },
  },
  required: ['boss_name', 'boss_avatar', 'boss_dialogue_on_attack', 'boss_skills', 'map_setting', 'teaching_notes', 'questions'],
} as const;
