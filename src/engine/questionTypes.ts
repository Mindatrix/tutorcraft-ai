import type { AnswerRecord, BattleConfig, ClozeGap, Difficulty, DifficultyLevel, MatchPair, PairRelation, Question, QuestionType } from './types';
import { BASE_DAMAGE, MIN_QUESTIONS, timeLimitFor, totalQuestions } from './scaling';
import { hashString, mulberry32, seededShuffle } from './variants';
import { normalizeForCompare, normalizeText } from './normalize';

// The 7 lesson formats: definitions, Boss-HP weights, time limits, validation,
// type conversion (Studio dropdown) and the per-session shuffles of cards/chips.

export interface QuestionTypeDef {
  id: QuestionType;
  nameVi: string;
  icon: string;
  /** Boss HP / damage weight vs one multiple-choice question. */
  weight: number;
  /** Multiplies the per-question time limit. */
  timeMult: number;
  /** Graded by the AI rubric (with a rule-based fallback). */
  aiGraded: boolean;
  blurb: string;
}

export const QUESTION_TYPES: Record<QuestionType, QuestionTypeDef> = {
  mcq: { id: 'mcq', nameVi: 'Trắc nghiệm', icon: '🔘', weight: 1, timeMult: 1, aiGraded: false, blurb: '4 lựa chọn, 1 đáp án đúng' },
  cloze: { id: 'cloze', nameVi: 'Điền từ', icon: '🧩', weight: 1.25, timeMult: 1.5, aiGraded: false, blurb: 'Đoạn văn có ô trống, gõ hoặc chọn từ' },
  reorder: { id: 'reorder', nameVi: 'Sắp xếp câu', icon: '🔀', weight: 1.5, timeMult: 1.5, aiGraded: false, blurb: 'Xếp mảnh ghép thành câu, Hero tiến bước' },
  transform: { id: 'transform', nameVi: 'Viết lại câu', icon: '✍️', weight: 1.5, timeMult: 2, aiGraded: false, blurb: 'Giữ nguyên nghĩa với từ gợi ý, tụ lực phép' },
  matching: { id: 'matching', nameVi: 'Nối cặp', icon: '🔗', weight: 2, timeMult: 2.5, aiGraded: false, blurb: 'Khái niệm trung tâm + các cặp, tuyệt kỹ khi nối hết' },
  reading: { id: 'reading', nameVi: 'Đọc hiểu', icon: '📖', weight: 2.5, timeMult: 4, aiGraded: true, blurb: 'Đọc đoạn văn, nêu thông điệp chính — Thử Thách Mắt Thần' },
  essay: { id: 'essay', nameVi: 'Tự luận', icon: '📝', weight: 3, timeMult: 4, aiGraded: true, blurb: 'Viết đoạn văn, AI chấm theo Rubric' },
};

export const QUESTION_TYPE_IDS = Object.keys(QUESTION_TYPES) as QuestionType[];

export function isQuestionType(v: unknown): v is QuestionType {
  return typeof v === 'string' && v in QUESTION_TYPES;
}

export function questionType(q: Pick<Question, 'type'>): QuestionType {
  return isQuestionType(q.type) ? q.type : 'mcq';
}

/** ≥ this score counts as a correct answer. */
export const PASS_SCORE = 0.6;
/** ≥ this score is a critical hit ("90–100% = CRITICAL!"). */
export const CRIT_SCORE = 0.9;

const DIFF_MULT: Record<Difficulty, number> = { easy: 0.9, medium: 1, hard: 1.25 };

/**
 * Boss-HP weight of one question. Multiple choice is always 1, so an all-mcq battle
 * keeps the original Boss HP = Q × 100. Other formats scale by type and difficulty.
 */
export function questionWeight(q: Pick<Question, 'type' | 'difficulty'>): number {
  const t = questionType(q);
  if (t === 'mcq') return 1;
  return Math.round(QUESTION_TYPES[t].weight * (DIFF_MULT[q.difficulty] ?? 1) * 20) / 20;
}

/** Damage a perfect answer to this question deals (its share of Boss HP). */
export function questionShare(q: Pick<Question, 'type' | 'difficulty'>): number {
  return Math.round(BASE_DAMAGE * questionWeight(q));
}

/** 0..1 credit for an answer: graded score for open formats, right/wrong for mcq. */
export function answerScore(q: Pick<Question, 'correct_idx'>, a: Pick<AnswerRecord, 'chosenIdx' | 'score'>): number {
  if (typeof a.score === 'number' && Number.isFinite(a.score)) return Math.max(0, Math.min(1, a.score));
  return a.chosenIdx === q.correct_idx && a.chosenIdx >= 0 ? 1 : 0;
}

export function isAnswerCorrect(q: Pick<Question, 'correct_idx'>, a: Pick<AnswerRecord, 'chosenIdx' | 'score'>): boolean {
  return answerScore(q, a) >= PASS_SCORE;
}

export function bossHpForQuestions(questions: Pick<Question, 'type' | 'difficulty'>[], teamSize = 1): number {
  return questions.reduce((sum, q) => sum + questionShare(q), 0) * Math.max(1, teamSize);
}

export function questionTimeLimit(q: Pick<Question, 'type' | 'difficulty'>, level?: DifficultyLevel): number {
  return Math.round(timeLimitFor(q.difficulty, level) * QUESTION_TYPES[questionType(q)].timeMult);
}

/**
 * How many questions fit the tutor's duration. All multiple choice: the blueprint's
 * Q = minutes × 1.5. Mixed formats take longer each (an essay ≈ 4 mcq), so Q is
 * divided by the average time factor of the chosen formats.
 */
export function plannedQuestionCount(durationMinutes: number, types: QuestionType[] = ['mcq']): number {
  const base = totalQuestions(durationMinutes);
  const list = types.length ? types : (['mcq'] as QuestionType[]);
  const avg = list.reduce((s, t) => s + QUESTION_TYPES[t].timeMult, 0) / list.length;
  return Math.max(MIN_QUESTIONS, Math.round(base / avg));
}

/**
 * Exact format of every question slot: round-robin over the chosen formats, with
 * essay + reading capped at about a quarter of the battle (they take minutes each).
 * Given to the AI as a numbered plan — "spread evenly" alone was ignored (mostly mcq).
 */
export function planQuestionTypes(types: QuestionType[], count: number): QuestionType[] {
  const list = types.length ? types : (['mcq'] as QuestionType[]);
  const light = list.filter((t) => !QUESTION_TYPES[t].aiGraded);
  const heavy = list.filter((t) => QUESTION_TYPES[t].aiGraded);
  const heavyCap = light.length ? Math.max(1, Math.round(count / 4)) : count;
  const plan: QuestionType[] = [];
  let h = 0;
  let l = 0;
  for (let i = 0; i < count; i++) {
    // Interleave so writing tasks are spread out, not bunched at the end.
    const wantHeavy = heavy.length && h < heavyCap && (!light.length || (i + 1) % Math.max(2, Math.floor(count / Math.max(1, heavyCap))) === 0);
    if (wantHeavy) plan.push(heavy[h++ % heavy.length]);
    else plan.push(light[l++ % light.length]);
  }
  // Make sure every chosen format appears at least once when there is room.
  for (const t of list) {
    if (!plan.includes(t) && plan.length) {
      const counts = new Map<QuestionType, number>();
      plan.forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1));
      const donor = plan.findIndex((p) => (counts.get(p) ?? 0) > 1 && QUESTION_TYPES[p].aiGraded === QUESTION_TYPES[t].aiGraded) ;
      const idx = donor >= 0 ? donor : plan.findIndex((p) => (counts.get(p) ?? 0) > 1);
      if (idx >= 0) plan[idx] = t;
    }
  }
  return plan;
}

/** Mean Boss-HP weight of the chosen formats — a proxy for how much text the AI must write. */
export function averageWeight(types: QuestionType[]): number {
  const list = types.length ? types : (['mcq'] as QuestionType[]);
  return list.reduce((s, t) => s + QUESTION_TYPES[t].weight, 0) / list.length;
}

/** Types the tutor asked for, sanitized. */
export function normalizeQuestionTypes(raw: unknown): QuestionType[] {
  const list = (Array.isArray(raw) ? raw : []).filter(isQuestionType);
  return list.length ? Array.from(new Set(list)) : ['mcq'];
}

export function configTypes(config: Pick<BattleConfig, 'questionTypes'> & Partial<Pick<BattleConfig, 'typeCounts'>>): QuestionType[] {
  const counted = config.typeCounts ? (Object.keys(config.typeCounts) as QuestionType[]) : [];
  return normalizeQuestionTypes(counted.length ? counted : config.questionTypes);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const RELATIONS: PairRelation[] = ['term_definition', 'formula_example', 'situation_response', 'cause_effect'];
export const GAP_RE = /\{\{\s*(\d+)\s*\}\}/g;

function str(v: unknown, max: number): string | null {
  const s = normalizeText(v);
  return s ? s.slice(0, max) : null;
}
function strList(v: unknown, max: number, maxItems: number): string[] {
  return (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, maxItems);
}
function int(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
const uniqueCI = (xs: string[]) => new Set(xs.map((x) => x.toLowerCase())).size === xs.length;

/** Number of {{n}} gaps in a cloze text. */
export function clozeGapCount(text: string): number {
  return (text.match(GAP_RE) ?? []).length;
}

/**
 * Type-specific fields, validated. Returns null + reason when the question can't be used.
 * Shared by the AI payload validator and the Studio editor.
 */
export function sanitizeTypedFields(type: QuestionType, r: Record<string, unknown>): { fields: Partial<Question>; problem: string | null } {
  switch (type) {
    case 'mcq':
      return { fields: {}, problem: null }; // handled by the classic validator
    case 'essay':
    case 'reading': {
      const min = int(r.min_words, 1, 400, type === 'essay' ? 30 : 10);
      const max = int(r.max_words, min, 800, Math.max(min * 3, type === 'essay' ? 120 : 60));
      const passage = str(r.passage, 4000) ?? undefined;
      if (type === 'reading' && (!passage || passage.length < 30)) return { fields: {}, problem: 'Đọc hiểu cần đoạn văn (ít nhất 30 ký tự)' };
      return {
        fields: {
          passage,
          rubric: str(r.rubric, 800) ?? undefined,
          min_words: min,
          max_words: max,
          sample_answer: str(r.sample_answer, 1500) ?? undefined,
          key_points: strList(r.key_points, 200, 8),
        },
        problem: null,
      };
    }
    case 'matching': {
      const pairs: MatchPair[] = (Array.isArray(r.pairs) ? r.pairs : [])
        .map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          const left = str(o.left, 200);
          const right = str(o.right, 300);
          if (!left || !right) return null;
          const relation = RELATIONS.includes(o.relation as PairRelation) ? (o.relation as PairRelation) : undefined;
          return { left, right, ...(relation ? { relation } : {}) };
        })
        .filter((p): p is MatchPair => !!p)
        .slice(0, 8);
      if (pairs.length < 2) return { fields: {}, problem: 'Nối cặp cần ít nhất 2 cặp đầy đủ' };
      if (!uniqueCI(pairs.map((p) => p.left)) || !uniqueCI(pairs.map((p) => p.right))) return { fields: {}, problem: 'Các vế nối cặp không được trùng nhau' };
      return { fields: { hub: str(r.hub, 120) ?? undefined, pairs, deep_insight: str(r.deep_insight, 800) ?? undefined }, problem: null };
    }
    case 'transform': {
      const source = str(r.source, 400);
      const answers = strList(r.answers, 400, 6);
      if (!source) return { fields: {}, problem: 'Viết lại câu cần câu gốc' };
      if (!answers.length) return { fields: {}, problem: 'Viết lại câu cần ít nhất 1 đáp án chấp nhận' };
      return { fields: { source, cue: str(r.cue, 60) ?? undefined, answers, key_phrases: strList(r.key_phrases, 80, 6) }, problem: null };
    }
    case 'reorder': {
      let tokens = strList(r.tokens, 60, 16);
      const answers = strList(r.answers, 400, 4);
      if (tokens.length < 3 && answers[0]) tokens = answers[0].split(' ').slice(0, 16);
      if (tokens.length < 3) return { fields: {}, problem: 'Sắp xếp câu cần ít nhất 3 mảnh ghép' };
      return { fields: { tokens, answers }, problem: null };
    }
    case 'cloze': {
      const text = str(r.text, 2000);
      const gaps: ClozeGap[] = (Array.isArray(r.gaps) ? r.gaps : [])
        .map((g) => ({ answers: strList((g as Record<string, unknown>)?.answers, 60, 5) }))
        .slice(0, 10);
      if (!text) return { fields: {}, problem: 'Điền từ cần đoạn văn có ô trống {{1}}' };
      const n = clozeGapCount(text);
      if (n < 1) return { fields: {}, problem: 'Đoạn văn chưa có ô trống {{1}}' };
      if (gaps.length !== n || gaps.some((g) => !g.answers.length)) return { fields: {}, problem: `Cần đáp án cho đủ ${n} ô trống` };
      let word_bank = strList(r.word_bank, 60, 16);
      if (word_bank.length) {
        // Every gap's first answer must be choosable.
        for (const g of gaps) if (!word_bank.some((w) => w.toLowerCase() === g.answers[0].toLowerCase())) word_bank.push(g.answers[0]);
        word_bank = Array.from(new Set(word_bank));
      }
      return { fields: { text, gaps, word_bank: word_bank.length ? word_bank : undefined }, problem: null };
    }
  }
}

// ---------------------------------------------------------------------------
// Studio: switch a question to another type, carrying over what makes sense
// ---------------------------------------------------------------------------

const BLANK_RE = /_{3,}/;

export function convertQuestion(q: Question, to: QuestionType): Question {
  const from = questionType(q);
  if (from === to) return q;
  const base: Question = {
    id: q.id,
    type: to,
    question: q.question,
    options: [],
    correct_idx: -1,
    difficulty: q.difficulty,
    topic: q.topic,
    skill_tag: q.skill_tag,
    hint: q.hint,
    explanation: q.explanation,
    is_review: q.is_review,
  };
  const correctOption = from === 'mcq' ? q.options[q.correct_idx] : undefined;
  const filled = correctOption && BLANK_RE.test(q.question) ? q.question.replace(BLANK_RE, correctOption) : undefined;

  switch (to) {
    case 'mcq':
      return { ...base, options: ['', '', '', ''], correct_idx: 0 };
    case 'cloze':
      return filled
        ? { ...base, question: 'Điền từ thích hợp vào chỗ trống.', text: q.question.replace(BLANK_RE, '{{1}}'), gaps: [{ answers: [correctOption!] }], word_bank: q.options.filter(Boolean) }
        : { ...base, question: 'Điền từ thích hợp vào chỗ trống.', text: '', gaps: [] };
    case 'reorder':
      return filled
        ? { ...base, question: 'Sắp xếp các từ thành câu hoàn chỉnh.', tokens: filled.split(' ') }
        : { ...base, question: 'Sắp xếp các từ thành câu hoàn chỉnh.', tokens: [] };
    case 'transform':
      return { ...base, question: 'Viết lại câu sao cho nghĩa không đổi, dùng từ trong ngoặc.', source: filled ?? '', answers: [''], key_phrases: [] };
    case 'matching':
      return { ...base, question: 'Nối mỗi khái niệm với vế tương ứng.', hub: q.topic, pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] };
    case 'essay':
      return { ...base, question: q.question, min_words: 30, max_words: 120, rubric: 'Dùng đúng cấu trúc của bài học; câu rõ nghĩa; từ vựng phù hợp trình độ.', key_points: [] };
    case 'reading':
      return { ...base, question: 'Thông điệp chính của đoạn văn là gì? Viết 1–3 câu.', passage: '', min_words: 10, max_words: 60, key_points: [] };
  }
}

/** Vietnamese reason a question can't be published yet, or null if it's fine. */
export function questionProblem(q: Question): string | null {
  if (!normalizeText(q.question)) return 'Thiếu nội dung câu hỏi / yêu cầu';
  const t = questionType(q);
  if (t === 'mcq') {
    const opts = q.options.map((o) => normalizeText(o));
    if (opts.length < 2) return 'Cần ít nhất 2 đáp án';
    if (opts.some((o) => !o)) return 'Có đáp án để trống';
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return 'Có đáp án trùng nhau';
    if (q.correct_idx < 0 || q.correct_idx >= opts.length) return 'Chưa chọn đáp án đúng';
    return null;
  }
  return sanitizeTypedFields(t, q as unknown as Record<string, unknown>).problem;
}

// ---------------------------------------------------------------------------
// Per-session shuffles (matching right column, reorder chips, cloze word bank)
// Display ids are positions in the shuffled list, so they reveal nothing.
// ---------------------------------------------------------------------------

export function sessionPermutation(seed: number, qid: number, n: number, salt: string): number[] {
  const ids = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return ids;
  const rand = mulberry32(hashString(`${seed}:${qid}:${salt}`));
  let perm = seededShuffle(ids, rand);
  // Never leave the canonical order in place — that would give the answer away.
  for (let i = 0; i < 4 && perm.every((v, k) => v === k); i++) perm = seededShuffle(ids, rand);
  if (perm.every((v, k) => v === k)) perm = [...ids.slice(1), ids[0]];
  return perm;
}

/** Display id → original index. */
export function fromDisplayId(perm: number[], id: number): number | null {
  return Number.isInteger(id) && id >= 0 && id < perm.length ? perm[id] : null;
}

/** Text used for the key-phrase / prefix hashes (shared with the browser). */
export function hashInput(salt: string, text: string): string {
  return `${salt}|${normalizeForCompare(text)}`;
}
