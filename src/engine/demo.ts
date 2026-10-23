import type { BattleConfig, BattlePayload, BossProfile } from './types';
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

export const DEMO_BOSS: BossProfile = {
  boss_name: 'Chúa Tể Ngữ Pháp',
  boss_avatar: 'dragon',
  boss_dialogue_on_attack: 'Hahaha! Chia sai thì rồi kìa, quay về ôn bài đi!',
  boss_skills: ['Hơi Thở Bị Động', 'Lời Nguyền Câu Điều Kiện', 'Bão Thì Hoàn Thành'],
  map_setting: 'volcano',
  map_name: 'Núi Lửa Ngữ Pháp',
};

export function demoBattle(): { topic: string; config: BattleConfig; payload: BattlePayload } {
  const q = computeScaling(DEMO_CONFIG).totalQuestions;
  return {
    topic: 'General English Grammar (Demo)',
    config: DEMO_CONFIG,
    payload: { ...fallbackPayload(q, DEMO_BATTLE_ID), boss: DEMO_BOSS },
  };
}
