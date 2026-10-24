import type { AnswerRecord, BattleConfig, Question, SkillTag } from './types';
import { computeScaling, damageFor } from './scaling';
import { answerScore, questionTimeLimit, questionWeight, PASS_SCORE } from './questionTypes';
import { SCENARIOS, speedBonus } from './scenarios';

// Pure scoring used by BOTH the client (live preview) and the server
// (authoritative Gems/EXP). The server never trusts client-sent totals.

export const GEMS_PER_CORRECT = 10;
export const EXP_PER_CORRECT = 15;
export const BOSS_DEFEAT_GEMS = 50;
export const DEFAULT_EXPECTED_ACCURACY = 0.8;

export interface TopicStat {
  topic: string;
  skill_tag: SkillTag;
  attempts: number;
  wrong: number;
}

export interface BattleScore {
  answered: number;
  correct: number;
  accuracy: number;
  maxCombo: number;
  damage: number;
  bossDefeated: boolean;
  speedPoints: number;
  gems: number;
  exp: number;
  milestoneMultiplier: number;
  /** Flat Gems from completed side quests (not multiplied). */
  questGems: number;
  topics: TopicStat[];
}

export function scoreBattle(
  questions: Question[],
  answers: AnswerRecord[],
  config: Pick<BattleConfig, 'durationMinutes' | 'scenario' | 'teamSize' | 'level'>,
  expectedAccuracy = DEFAULT_EXPECTED_ACCURACY,
  bonusGems = 0,
): BattleScore {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const scenario = SCENARIOS[config.scenario];
  const scaling = computeScaling({ ...config, teamSize: 1 }, questions.length, questions); // personal contribution
  const seen = new Set<number>();
  const topics = new Map<string, TopicStat>();

  let correct = 0;
  let combo = 0;
  let maxCombo = 0;
  let damage = 0;
  let speedPoints = 0;
  let earnedGems = 0;
  let earnedExp = 0;

  for (const a of answers) {
    const q = byId.get(a.questionId);
    if (!q || seen.has(a.questionId)) continue; // ignore unknown or duplicate answers
    seen.add(a.questionId);

    const limit = questionTimeLimit(q, config.level);
    const timeMs = Math.min(Math.max(0, Number(a.timeMs) || 0), (limit + 60) * 1000);
    const credit = answerScore(q, a);
    const ok = credit >= PASS_SCORE;
    const weight = questionWeight(q);

    const key = q.topic.toLowerCase();
    const stat = topics.get(key) ?? { topic: q.topic, skill_tag: q.skill_tag, attempts: 0, wrong: 0 };
    stat.attempts += 1;
    if (!ok) stat.wrong += 1;
    topics.set(key, stat);

    // Damage recorded by the reducer is authoritative (it includes matching pair hits
    // and partial credit); older records without it fall back to the classic formula.
    if (ok) {
      correct += 1;
      combo += 1;
      maxCombo = Math.max(maxCombo, combo);
      damage += typeof a.damage === 'number' ? a.damage : damageFor(combo);
      earnedGems += Math.round(GEMS_PER_CORRECT * weight * credit);
      earnedExp += Math.round(EXP_PER_CORRECT * weight * credit);
      if (scenario.speedBonus) speedPoints += speedBonus(timeMs, limit);
    } else {
      combo = 0;
      if (typeof a.damage === 'number') damage += a.damage; // partial hits still land
    }
  }

  const answered = seen.size;
  const accuracy = answered ? correct / answered : 0;
  const bossDefeated = damage >= scaling.bossHp;
  const milestoneMultiplier = answered >= 2 && accuracy >= expectedAccuracy ? 1.5 : 1;

  // Gems/EXP scale with the format weight and the graded score (mcq: weight 1, score 1 → 10 / 15).
  const baseGems = earnedGems + maxCombo * 5 + Math.floor(speedPoints / 10) + (bossDefeated ? BOSS_DEFEAT_GEMS : 0);
  return {
    answered,
    correct,
    accuracy,
    maxCombo,
    damage,
    bossDefeated,
    speedPoints,
    gems: Math.round(baseGems * milestoneMultiplier) + Math.max(0, Math.round(bonusGems)),
    exp: Math.round(earnedExp * milestoneMultiplier),
    milestoneMultiplier,
    questGems: Math.max(0, Math.round(bonusGems)),
    topics: Array.from(topics.values()),
  };
}

/** Topics sorted by fail rate — for the tutor's knowledge-gap view. */
export function weakTopics(topics: TopicStat[], minAttempts = 1): (TopicStat & { failRate: number })[] {
  return topics
    .filter((t) => t.attempts >= minAttempts && t.wrong > 0)
    .map((t) => ({ ...t, failRate: t.wrong / t.attempts }))
    .sort((a, b) => b.failRate - a.failRate || b.attempts - a.attempts);
}
