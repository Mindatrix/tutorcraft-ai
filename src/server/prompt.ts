import type { BattleConfig } from '../engine/types';
import { THEMES } from '../engine/themes';
import { SCENARIOS } from '../engine/scenarios';

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
  const level = p.config.cefrLevel ? `CEFR level ${p.config.cefrLevel}` : 'a CEFR level that fits the topic (A2–C1)';

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

Write exactly ${p.questionCount} multiple-choice questions:
- 4 options each, exactly one correct, plausible distractors, no duplicate options.
- Mix difficulties: about 40% easy, 40% medium, 20% hard.
- "topic" = the specific grammar point or vocabulary set tested (e.g. "present perfect", "phrasal verbs: travel").
- "skill_tag" = grammar | vocabulary | reading | listening | pronunciation | other.
- "hint" in Vietnamese, short, does not give away the answer.
- "explanation" in Vietnamese, one sentence on why the answer is right.
Also write 3 "teaching_notes" in Vietnamese: practical tips for the tutor to teach this topic.
Return JSON only.`;
}
