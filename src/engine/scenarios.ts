import type { ScenarioId } from './types';

export interface ScenarioDefinition {
  id: ScenarioId;
  name: string;
  nameVi: string;
  style: string;
  /** Answering faster earns bonus points (Time Attack). */
  speedBonus: boolean;
  showLeaderboard: boolean;
  /** Boss HP is shared across the team. */
  sharedBoss: boolean;
  allowRetry: boolean;
}

export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  homework: {
    id: 'homework',
    name: 'Homework Assignment',
    nameVi: 'Bài tập về nhà',
    style: 'Single Player · Async · Story Mode',
    speedBonus: false,
    showLeaderboard: false,
    sharedBoss: false,
    allowRetry: true,
  },
  in_class: {
    id: 'in_class',
    name: 'In-Class Practice',
    nameVi: 'Luyện tập trên lớp',
    style: 'Speed Run · Time Attack · Leaderboard',
    speedBonus: true,
    showLeaderboard: true,
    sharedBoss: false,
    allowRetry: false,
  },
  coop_raid: {
    id: 'coop_raid',
    name: 'Co-op Raid',
    nameVi: 'Đột kích tổ đội',
    style: 'Group Assessment · Shared Boss HP · Turn-based Synergy',
    speedBonus: false,
    showLeaderboard: true,
    sharedBoss: true,
    allowRetry: false,
  },
  boat_race: {
    id: 'boat_race',
    name: 'Boat Race',
    nameVi: 'Đua thuyền',
    style: '1v1 vs Bot · Race · Speed Bonus',
    speedBonus: true,
    showLeaderboard: true,
    sharedBoss: false,
    allowRetry: true,
  },
};

export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && value in SCENARIOS;
}

/** Speed bonus for Time Attack: up to +50 points for an instant answer. */
export function speedBonus(timeMs: number, limitSec: number): number {
  const ratio = 1 - Math.min(1, timeMs / (limitSec * 1000));
  return Math.round(50 * ratio);
}
