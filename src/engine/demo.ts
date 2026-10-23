import type { BattleConfig, BattlePayload } from './types';
import { computeScaling } from './scaling';
import { fallbackPayload } from './fallback';

// Built-in demo battle served at /student (no database needed).
export const DEMO_BATTLE_ID = 'demo';

export const DEMO_CONFIG: BattleConfig = {
  scenario: 'homework',
  themes: ['minecraft', 'genshin', 'moba_lol'],
  durationMinutes: 4,
  mode: 'gamified',
  examType: 'individual',
  studentCount: 1,
  teamSize: 1,
};

export function demoBattle(): { topic: string; config: BattleConfig; payload: BattlePayload } {
  const q = computeScaling(DEMO_CONFIG).totalQuestions;
  return { topic: 'General English Grammar (Demo)', config: DEMO_CONFIG, payload: fallbackPayload(q, DEMO_BATTLE_ID) };
}
