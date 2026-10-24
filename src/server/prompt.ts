import type { BattleConfig } from '../engine/types';
import { THEMES } from '../engine/themes';
import { SCENARIOS } from '../engine/scenarios';
import { levelOf } from '../engine/levels';
import { configTypes, planQuestionTypes } from '../engine/questionTypes';
import { planFromCounts } from '../engine/questionCount';
import type { QuestionType } from '../engine/types';

export interface PromptInput {
  topic: string;
  config: BattleConfig;
  questionCount: number;
  documentText?: string;
  hasInlineDocument: boolean;
  reviewTopics: string[];
  reviewCount: number;
}

export function buildBattlePrompt(p: PromptInput): string {
  const scenario = SCENARIOS[p.config.scenario];
  const themes = p.config.themes.map((t) => `${THEMES[t].name} (${THEMES[t].genre})`).join(' + ');
  const lv = levelOf(p.config);
  const pct = (n: number) => Math.round(n * 100);
  const level = `CEFR level ${p.config.cefrLevel || lv.cefr} — difficulty level ${lv.level}/5 (${lv.nameVi}). ${lv.guidance}`;

  const source = p.hasInlineDocument || p.documentText
    ? `SOURCE DOCUMENT: Base every question ONLY on the attached/provided lesson material. First extract its key knowledge points into "knowledge_matrix".${
        p.documentText ? `\n--- DOCUMENT START ---\n${p.documentText}\n--- DOCUMENT END ---` : ''
      }`
    : 'No document provided: write original questions on the lesson topic.';

  const review = p.reviewCount > 0
    ? `SPACED REPETITION: Of the ${p.questionCount} questions, make exactly ${p.reviewCount} review questions on these weak topics the class failed before: ${p.reviewTopics.join('; ')}.`
    : '';

  return `You are a senior English curriculum designer (Oxford, British Council, BBC Learning English standards) building a quiz for a Vietnamese tutor.

LESSON TOPIC: "${p.topic}"
TARGET: ${level}, age-appropriate, accurate terminology.
SCENARIO: ${scenario.name} — ${scenario.style}.
GAME THEME: ${themes}. Keep question text academic; the game layer is added by the app.
${source}
${review}

GAME DESIGN — design the boss of this arena from the lesson content:
- "boss_name": Vietnamese, epic, tied to the lesson (e.g. "Chúa Tể Thì Quá Khứ Đơn").
- "boss_avatar": one of dragon | golem | wizard | shadow_king — pick the one that fits.
- "boss_dialogue_on_attack": one short taunting Vietnamese line the boss says when a student answers wrong, referencing the lesson (age-appropriate, never insulting).
- "boss_skills": 3 boss skill names in Vietnamese, themed on the lesson's typical mistakes.
- "map_setting": one of forest | castle | volcano | ice_cave | dungeon | sky_arena.
- "map_name": short Vietnamese arena name.
- "phase2_name": the boss's transformed name at 50% HP (Vietnamese).
- "phase2_dialogue": one Vietnamese line when it transforms — a challenge that names the harder part of the lesson.
- "enrage_dialogue": one Vietnamese line when the student misses 3 in a row: a short taunt PLUS a genuinely useful study tip for this lesson (no answers).

Write exactly ${p.questionCount} questions.
${typeInstructions(configTypes(p.config), p.questionCount, p.config.typeCounts)}
For EVERY question:
- Mix difficulties: about ${pct(lv.mix.easy)}% easy, ${pct(lv.mix.medium)}% medium, ${pct(lv.mix.hard)}% hard.
- "topic" = the specific grammar point or vocabulary set tested (e.g. "present perfect", "phrasal verbs: travel").
- "skill_tag" = grammar | vocabulary | reading | listening | pronunciation | other.
- "hint" in Vietnamese, short, does not give away the answer.
- "explanation" in Vietnamese, one or two sentences on why the answer is right.
Also write 3 "teaching_notes" in Vietnamese: practical tips for the tutor to teach this topic.
Return JSON only.`;
}

const TYPE_SPECS: Record<QuestionType, string> = {
  mcq: `"mcq" (multiple choice): "options" = 4 strings, exactly one correct, plausible distractors, no duplicates; "correct_idx" = 0-based index of the right one.`,
  cloze: `"cloze" (gap-filling): "text" = a short passage with 2–5 gaps written as {{1}}, {{2}}, … in order; "gaps" = one object per gap {"answers": [accepted answers]} (include valid variants); optional "word_bank" = the right words plus 1–3 distractors. "question" = the instruction.`,
  reorder: `"reorder" (unscramble): "tokens" = the words or short chunks of ONE correct sentence IN THE CORRECT ORDER (4–10 tokens, keep final punctuation on the last token); optional "answers" = other fully correct orderings as sentences. "question" = the instruction.`,
  transform: `"transform" (rewrite keeping EXACTLY the same meaning — e.g. active→passive, "started … ago"→"have … for", "too … to"→"not … enough", direct→reported speech; NEVER a negation or tense change that alters the meaning): "source" = original sentence; "cue" = the word in brackets the rewrite must use; "answers" = ALL accepted complete rewrites (2–4 variants); "key_phrases" = 2–4 key chunks of the rewrite (e.g. "was built", "for five years").`,
  matching: `"matching" (pairs around a core concept): "hub" = the core concept / topic header (e.g. "Thì Quá khứ Đơn – Past Simple"); "pairs" = 3–6 objects {"left","right","relation"} built AROUND the hub, mixing relations: "term_definition" (term → definition), "formula_example" (structure → real example), "situation_response" (situation → correct way to respond), "cause_effect" (cause → effect / logical link). Every left and right must be unique and each left has exactly one right. "deep_insight" = 2–3 Vietnamese sentences of deeper explanation unlocked after all pairs are matched.`,
  reading: `"reading" (passage + core message): "passage" = an original 60–150 word passage at the target level; "question" = an inference / main-message / summary question answered in 1–3 sentences; "key_points" = 2–4 ideas a good answer contains; "sample_answer"; "rubric" = Vietnamese grading guidance; "min_words" ≈ 8, "max_words" ≈ 60.`,
  essay: `"essay" (free writing): "question" = a clear writing task in English that uses the lesson's grammar / vocabulary; "rubric" = Vietnamese grading guidance (grammar target, required content); "key_points" = 2–4 things to include; "sample_answer"; "min_words" / "max_words" suited to the level (e.g. 20–80 for A2, 60–150 for B2).`,
};

/** Exact format per question (a numbered plan) + the spec of each format used. */
function typeInstructions(types: QuestionType[], count: number, counts?: BattleConfig['typeCounts']): string {
  const plan = counts ? planFromCounts(counts, count) : planQuestionTypes(types, count);
  const used = Array.from(new Set(plan));
  return `Set "type" on every question. EVERY question object must contain ALL fields of the schema: fill the ones its format uses, and send "" / [] / -1 / 0 for the others.
Follow this plan EXACTLY, in this order (question number → type):
${plan.map((t, i) => `${i + 1}. ${t}`).join('\n')}
Format specs:
${used.map((t) => `- ${TYPE_SPECS[t]}`).join('\n')}`;
}
