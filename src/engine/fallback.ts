import type { BattlePayload, Question, QuestionType } from './types';
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

// Non-multiple-choice templates, 2 per format, used when the tutor asked for those formats.
export const TYPED_BANK: Q[] = [
  {
    type: 'cloze', question: 'Điền dạng đúng của động từ vào chỗ trống.', options: [], correct_idx: -1, difficulty: 'easy', topic: 'past simple', skill_tag: 'grammar',
    text: 'Yesterday I {{1}} to the park and {{2}} football with my friends.', gaps: [{ answers: ['went'] }, { answers: ['played'] }],
    word_bank: ['went', 'go', 'played', 'play', 'going'], hint: 'Có “Yesterday” → dùng quá khứ đơn.', explanation: 'Yesterday là dấu hiệu quá khứ đơn: go → went, play → played.',
  },
  {
    type: 'cloze', question: 'Điền giới từ thích hợp.', options: [], correct_idx: -1, difficulty: 'medium', topic: 'prepositions of time', skill_tag: 'grammar',
    text: 'My birthday is {{1}} May. The party starts {{2}} 7 p.m. {{3}} Saturday.', gaps: [{ answers: ['in'] }, { answers: ['at'] }, { answers: ['on'] }],
    hint: 'in + tháng, at + giờ, on + thứ.', explanation: 'in May (tháng), at 7 p.m. (giờ), on Saturday (thứ).',
  },
  {
    type: 'reorder', question: 'Sắp xếp các từ thành câu hoàn chỉnh.', options: [], correct_idx: -1, difficulty: 'easy', topic: 'present continuous', skill_tag: 'grammar',
    tokens: ['She', 'is', 'reading', 'a', 'book', 'now.'], hint: 'Chủ ngữ + am/is/are + V-ing.', explanation: 'Hiện tại tiếp diễn: S + is + V-ing + O.',
  },
  {
    type: 'reorder', question: 'Sắp xếp thành câu hỏi đúng.', options: [], correct_idx: -1, difficulty: 'medium', topic: 'question formation', skill_tag: 'grammar',
    tokens: ['Where', 'did', 'you', 'go', 'last', 'weekend?'], hint: 'Từ để hỏi + trợ động từ + chủ ngữ + động từ.', explanation: 'Câu hỏi quá khứ: Wh- + did + S + V nguyên mẫu.',
  },
  {
    type: 'transform', question: 'Viết lại câu sao cho nghĩa không đổi, dùng từ trong ngoặc.', options: [], correct_idx: -1, difficulty: 'medium', topic: 'passive voice', skill_tag: 'grammar',
    source: 'They built this school in 1998.', cue: 'was', answers: ['This school was built in 1998.', 'This school was built by them in 1998.'],
    key_phrases: ['this school', 'was built', 'in 1998'], hint: 'Đưa tân ngữ lên làm chủ ngữ: was + V3.', explanation: 'Bị động quá khứ: S + was/were + V3.',
  },
  {
    type: 'transform', question: 'Viết lại câu với từ gợi ý, giữ nguyên nghĩa.', options: [], correct_idx: -1, difficulty: 'hard', topic: 'present perfect', skill_tag: 'grammar',
    source: 'I started learning English five years ago.', cue: 'for', answers: ['I have learned English for five years.', 'I have been learning English for five years.', 'I have learnt English for five years.'],
    key_phrases: ['have', 'english', 'for five years'], hint: 'started … ago → have + V3 … for.', explanation: 'Hành động bắt đầu trong quá khứ và còn tiếp diễn → hiện tại hoàn thành + for.',
  },
  {
    type: 'matching', question: 'Nối mỗi cấu trúc với ví dụ đúng.', options: [], correct_idx: -1, difficulty: 'medium', topic: 'past simple', skill_tag: 'grammar',
    hub: 'Thì Quá khứ Đơn — Past Simple',
    pairs: [
      { left: 'S + V2/ed', right: 'She visited Hue last summer.', relation: 'formula_example' },
      { left: 'S + did not + V', right: "We didn't watch TV yesterday.", relation: 'formula_example' },
      { left: 'Did + S + V?', right: 'Did you finish your homework?', relation: 'formula_example' },
      { left: 'Dấu hiệu thời gian', right: 'yesterday, last week, two days ago', relation: 'term_definition' },
    ],
    deep_insight: 'Quá khứ đơn diễn tả hành động đã kết thúc tại thời điểm xác định trong quá khứ. Câu phủ định và nghi vấn mượn “did”, nên động từ chính trở về nguyên mẫu.',
    hint: 'Câu có “did” thì động từ chính không chia.',
  },
  {
    type: 'matching', question: 'Nối nguyên nhân với kết quả.', options: [], correct_idx: -1, difficulty: 'easy', topic: 'cause and effect', skill_tag: 'vocabulary',
    hub: 'Because / So — Nguyên nhân & Kết quả',
    pairs: [
      { left: 'It was raining heavily', right: 'so we stayed at home.', relation: 'cause_effect' },
      { left: 'She studied very hard', right: 'so she passed the exam.', relation: 'cause_effect' },
      { left: 'He forgot his umbrella', right: 'so he got wet.', relation: 'cause_effect' },
    ],
    deep_insight: '“so” đứng trước KẾT QUẢ, “because” đứng trước NGUYÊN NHÂN: We stayed at home because it was raining.',
  },
  {
    type: 'reading', question: 'Thông điệp chính của đoạn văn là gì? Viết 1–3 câu bằng tiếng Anh.', options: [], correct_idx: -1, difficulty: 'medium', topic: 'main idea', skill_tag: 'reading',
    passage: 'Every morning, Lan waters the small garden behind her house. At first, nothing grew and her neighbours laughed at her. But she kept watering, weeding and learning from her mistakes. After two years, her garden was full of flowers and vegetables, and the same neighbours came to ask for her advice.',
    min_words: 8, max_words: 60, key_points: ['patience and hard work bring results', 'do not give up when others laugh', 'learning from mistakes'],
    sample_answer: 'If we keep working patiently and learn from our mistakes, we will succeed, even when other people doubt us.',
    rubric: 'Nêu được ý kiên trì/không bỏ cuộc dẫn đến thành công. Không cần kể lại chi tiết.',
    hint: 'Điều gì đã thay đổi sau hai năm, và vì sao?',
  },
  {
    type: 'essay', question: 'Write 3–5 sentences about what you did last weekend. Use the past simple.', options: [], correct_idx: -1, difficulty: 'medium', topic: 'past simple', skill_tag: 'grammar',
    min_words: 25, max_words: 100, key_points: ['activities last weekend', 'past simple verbs', 'time expressions like on Saturday'],
    rubric: 'Dùng đúng quá khứ đơn (động từ có quy tắc và bất quy tắc). Có ít nhất 3 hoạt động. Câu rõ ràng.',
    sample_answer: 'Last weekend I visited my grandparents. On Saturday we cooked lunch together and I helped my grandmother in the garden. On Sunday I went to the cinema with my friends and we watched a funny film.',
    hint: 'Kể theo thứ tự: Saturday… then… On Sunday…',
  },
];

/** Return `count` questions from the local bank. Repeats (reshuffled) if count > bank size. */
/** Return `count` questions from the local bank. Repeats (reshuffled) if count > bank size. */
export function fallbackPayload(count: number, seedText = 'fallback', types: QuestionType[] = ['mcq']): BattlePayload {
  const rand = mulberry32(hashString(seedText));
  const wanted = types.length ? types : (['mcq'] as QuestionType[]);
  // One pool per requested format; formats are interleaved so a battle mixes them.
  const pools = wanted.map((t) => (t === 'mcq' ? BANK : TYPED_BANK.filter((q) => q.type === t))).filter((p) => p.length);
  const decks = pools.map((p) => seededShuffle(p, rand));
  const cursor = decks.map(() => 0);
  const out: Question[] = [];
  for (let k = 0; out.length < count && decks.length; k++) {
    const d = k % decks.length;
    if (cursor[d] >= decks[d].length) {
      decks[d] = seededShuffle(pools[d], rand);
      cursor[d] = 0;
    }
    out.push({ ...decks[d][cursor[d]++], id: out.length + 1 });
  }
  return { teaching_notes: FALLBACK_TEACHING_NOTES, questions: out };
}

export const FALLBACK_BANK_SIZE = BANK.length;
