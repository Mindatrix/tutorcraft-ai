import type { AnswerRecord, BattleConfig, Question, SkillCast } from './types';
import { computeScaling } from './scaling';
import { MAX_MP, SKILLS, mpGain } from './skills';

// Server-side replay of a finished battle: rebuilds MP and HP from the raw
// answers so a client can't claim shields it never paid for or HP it never had.

export interface ReplayResult {
  hpRemaining: number;
  validCasts: number;
  rejectedCasts: number;
}

export function replayBattle(
  questions: Question[],
  answers: AnswerRecord[],
  casts: SkillCast[],
  config: Pick<BattleConfig, 'durationMinutes' | 'scenario' | 'teamSize' | 'mode'>,
): ReplayResult {
  const scaling = computeScaling(config, questions.length);
  if (config.mode === 'standard') return { hpRemaining: scaling.playerHp, validCasts: 0, rejectedCasts: casts.length };

  const byId = new Map(questions.map((q) => [q.id, q]));
  const castsByQuestion = new Map<number, SkillCast[]>();
  for (const c of casts) {
    if (!SKILLS[c.skill]) continue;
    castsByQuestion.set(c.questionId, [...(castsByQuestion.get(c.questionId) ?? []), c]);
  }

  let hp = scaling.playerHp;
  let mp = 0;
  let combo = 0;
  let shield = false;
  let valid = 0;
  let rejected = 0;
  const seen = new Set<number>();

  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q || seen.has(a.questionId)) continue;
    seen.add(a.questionId);

    for (const c of castsByQuestion.get(q.id) ?? []) {
      const cost = SKILLS[c.skill].cost;
      if (mp < cost || (c.skill === 'shield' && shield)) {
        rejected += 1;
        continue;
      }
      mp -= cost;
      valid += 1;
      if (c.skill === 'shield') shield = true;
    }

    if (a.chosenIdx === q.correct_idx) {
      combo += 1;
      mp = Math.min(MAX_MP, mp + mpGain(combo));
    } else {
      combo = 0;
      if (shield) shield = false;
      else hp = Math.max(0, hp - scaling.wrongPenalty);
    }
    if (hp <= 0) break; // knocked out — later answers can't have happened
  }
  return { hpRemaining: hp, validCasts: valid, rejectedCasts: rejected };
}
