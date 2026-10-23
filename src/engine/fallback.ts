import type { BattlePayload, Question } from './types';
import { hashString, mulberry32, seededShuffle } from './variants';

// Local cached template payload — used when both Gemini attempts fail,
// so a tutor always gets a playable battle. CEFR A2–B2 general English.

type Q = Omit<Question, 'id'>;

const BANK: Q[] = [
  { question: 'She _____ to London three times this year.', options: ['has been', 'went', 'has gone', 'is going'], correct_idx: 0, difficulty: 'medium', topic: 'present perfect', skill_tag: 'grammar', hint: 'Life experience up to now → Present Perfect.' },
  { question: 'If I _____ more time, I would learn another language.', options: ['have', 'had', 'would have', 'will have'], correct_idx: 1, difficulty: 'medium', topic: 'second conditional', skill_tag: 'grammar', hint: 'Unreal present condition → If + past simple.' },
  { question: 'The bridge _____ in 1990.', options: ['built', 'was built', 'has built', 'is building'], correct_idx: 1, difficulty: 'easy', topic: 'passive voice', skill_tag: 'grammar', hint: 'The bridge receives the action → passive.' },
  { question: 'I was cooking when the phone _____.', options: ['rang', 'was ringing', 'rings', 'has rung'], correct_idx: 0, difficulty: 'easy', topic: 'past continuous', skill_tag: 'grammar', hint: 'Short action interrupts a longer one → past simple.' },
  { question: 'By next June, she _____ her degree.', options: ['finishes', 'will finish', 'will have finished', 'has finished'], correct_idx: 2, difficulty: 'hard', topic: 'future perfect', skill_tag: 'grammar', hint: '"By + future time" → future perfect.' },
  { question: 'He asked me where I _____.', options: ['live', 'lived', 'do live', 'am living'], correct_idx: 1, difficulty: 'medium', topic: 'reported speech', skill_tag: 'grammar', hint: 'Reported questions backshift the tense.' },
  { question: 'There isn\'t _____ milk left in the fridge.', options: ['some', 'many', 'any', 'a few'], correct_idx: 2, difficulty: 'easy', topic: 'quantifiers', skill_tag: 'grammar', hint: 'Negative sentences use "any".' },
  { question: 'This is the _____ film I have ever seen.', options: ['more boring', 'most boring', 'boringest', 'boring'], correct_idx: 1, difficulty: 'easy', topic: 'superlatives', skill_tag: 'grammar', hint: 'Long adjectives: the most + adjective.' },
  { question: 'You _____ wear a seatbelt. It\'s the law.', options: ['must', 'might', 'could', 'would'], correct_idx: 0, difficulty: 'easy', topic: 'modal verbs', skill_tag: 'grammar', hint: 'Obligation → must.' },
  { question: 'I\'m looking forward to _____ you.', options: ['see', 'seeing', 'saw', 'have seen'], correct_idx: 1, difficulty: 'medium', topic: 'gerunds', skill_tag: 'grammar', hint: '"Look forward to" is followed by -ing.' },
  { question: 'The man _____ car was stolen called the police.', options: ['who', 'which', 'whose', 'whom'], correct_idx: 2, difficulty: 'medium', topic: 'relative clauses', skill_tag: 'grammar', hint: 'Possession → whose.' },
  { question: 'If she had studied, she _____ the exam.', options: ['would pass', 'will pass', 'would have passed', 'passed'], correct_idx: 2, difficulty: 'hard', topic: 'third conditional', skill_tag: 'grammar', hint: 'Unreal past → would have + past participle.' },
  { question: 'I wish I _____ taller.', options: ['am', 'were', 'will be', 'have been'], correct_idx: 1, difficulty: 'hard', topic: 'wish clauses', skill_tag: 'grammar', hint: 'Wish about the present → past form ("were").' },
  { question: 'Neither Tom nor his friends _____ coming.', options: ['is', 'are', 'was', 'be'], correct_idx: 1, difficulty: 'hard', topic: 'subject-verb agreement', skill_tag: 'grammar', hint: 'Verb agrees with the nearer subject (friends).' },
  { question: 'She has lived here _____ 2015.', options: ['for', 'since', 'from', 'during'], correct_idx: 1, difficulty: 'easy', topic: 'for / since', skill_tag: 'grammar', hint: 'Point in time → since.' },
  { question: 'Choose the synonym of "enormous".', options: ['tiny', 'huge', 'quiet', 'fast'], correct_idx: 1, difficulty: 'easy', topic: 'synonyms', skill_tag: 'vocabulary', hint: 'Think of an elephant.' },
  { question: 'Choose the opposite of "generous".', options: ['kind', 'selfish', 'brave', 'honest'], correct_idx: 1, difficulty: 'easy', topic: 'antonyms', skill_tag: 'vocabulary', hint: 'Someone who never shares.' },
  { question: 'We need to _____ a decision by Friday.', options: ['do', 'make', 'take on', 'get'], correct_idx: 1, difficulty: 'medium', topic: 'collocations', skill_tag: 'vocabulary', hint: 'Collocation: ___ a decision.' },
  { question: 'Please turn _____ the lights when you leave.', options: ['off', 'up', 'over', 'out of'], correct_idx: 0, difficulty: 'easy', topic: 'phrasal verbs', skill_tag: 'vocabulary', hint: 'Stop the power → turn ___.' },
  { question: 'The meeting was _____ because the manager was ill.', options: ['called off', 'called up', 'called for', 'called in'], correct_idx: 0, difficulty: 'medium', topic: 'phrasal verbs', skill_tag: 'vocabulary', hint: 'Cancelled = called ___.' },
  { question: 'She is very _____ — she always tells the truth.', options: ['honest', 'anxious', 'jealous', 'lazy'], correct_idx: 0, difficulty: 'easy', topic: 'personality adjectives', skill_tag: 'vocabulary', hint: 'Truth-teller.' },
  { question: 'The new policy had a huge _____ on small businesses.', options: ['affect', 'impact', 'effort', 'issue'], correct_idx: 1, difficulty: 'medium', topic: 'academic vocabulary', skill_tag: 'vocabulary', hint: 'Noun meaning "strong effect".' },
  { question: 'It\'s raining cats and dogs means it is raining _____.', options: ['lightly', 'heavily', 'briefly', 'warmly'], correct_idx: 1, difficulty: 'medium', topic: 'idioms', skill_tag: 'vocabulary', hint: 'A lot of rain!' },
  { question: 'A person who designs buildings is an _____.', options: ['engineer', 'architect', 'electrician', 'author'], correct_idx: 1, difficulty: 'easy', topic: 'jobs', skill_tag: 'vocabulary', hint: 'Plans and draws buildings.' },
  { question: 'The scientist\'s findings were _____ by later experiments.', options: ['confirmed', 'conformed', 'confined', 'confused'], correct_idx: 0, difficulty: 'hard', topic: 'academic vocabulary', skill_tag: 'vocabulary', hint: 'Proved to be true.' },
  { question: '"Reluctant" most nearly means _____.', options: ['eager', 'unwilling', 'careful', 'grateful'], correct_idx: 1, difficulty: 'hard', topic: 'synonyms', skill_tag: 'vocabulary', hint: 'You do it, but you don\'t want to.' },
  { question: 'Tom: "Sorry I\'m late." Anna: "_____"', options: ['Don\'t worry about it.', 'Yes, you are welcome.', 'Me too.', 'Not at all, thanks.'], correct_idx: 0, difficulty: 'easy', topic: 'functional language', skill_tag: 'other', hint: 'Accepting an apology.' },
  { question: '"The museum opens at 9 but closes early on Sundays." When might it close early?', options: ['Monday', 'Saturday', 'Sunday', 'Every day'], correct_idx: 2, difficulty: 'easy', topic: 'reading for detail', skill_tag: 'reading', hint: 'Find the day in the sentence.' },
  { question: '"Despite the rain, the match continued." This means the match _____.', options: ['was cancelled', 'went on', 'was delayed', 'ended early'], correct_idx: 1, difficulty: 'medium', topic: 'linking words', skill_tag: 'reading', hint: '"Despite" shows contrast.' },
  { question: 'Which word has the stress on the second syllable?', options: ['TAble', 'deCIDE', 'HAPpy', 'WINdow'], correct_idx: 1, difficulty: 'medium', topic: 'word stress', skill_tag: 'pronunciation', hint: 'Most two-syllable verbs stress the 2nd syllable.' },
];

export const FALLBACK_TEACHING_NOTES = [
  'Warm up with 2 quick examples from students\' daily life before the battle.',
  'After each wrong answer, ask the student to explain the rule in their own words.',
  'Review the weak topics shown in the diagnostics panel at the start of next lesson.',
];

/** Return `count` questions from the local bank. Repeats (reshuffled) if count > bank size. */
export function fallbackPayload(count: number, seedText = 'fallback'): BattlePayload {
  const rand = mulberry32(hashString(seedText));
  const out: Question[] = [];
  while (out.length < count) {
    for (const q of seededShuffle(BANK, rand)) {
      if (out.length >= count) break;
      out.push({ ...q, id: out.length + 1 });
    }
  }
  return { teaching_notes: FALLBACK_TEACHING_NOTES, questions: out };
}

export const FALLBACK_BANK_SIZE = BANK.length;
