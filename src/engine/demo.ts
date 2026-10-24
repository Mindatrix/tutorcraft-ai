import type { BattleConfig, BattlePayload, BossProfile } from './types';
import { FALLBACK_TEACHING_NOTES, TYPED_BANK, fallbackPayload } from './fallback';
import type { Question } from './types';

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
  phase2_name: 'Hắc Long Ngữ Pháp',
  phase2_dialogue: 'Gràooo! Vảy ta đã đổi màu — từ giờ mỗi thì động từ đều là bẫy!',
  enrage_dialogue: 'Ba lần sai rồi! Gợi ý cho ngươi: hãy tìm dấu hiệu thời gian trong câu trước khi chọn!',
};

/**
 * The demo shows every lesson format once: multiple choice → matching (hub) → cloze →
 * reorder → transform → reading → multiple choice → essay.
 */
export function demoQuestions(): Question[] {
  const mcq = fallbackPayload(2, DEMO_BATTLE_ID).questions;
  const pick = (type: Question['type'], topic?: string) =>
    TYPED_BANK.find((q) => q.type === type && (!topic || q.topic === topic)) ?? TYPED_BANK.find((q) => q.type === type)!;
  const order = [
    mcq[0],
    pick('matching', 'past simple'),
    pick('cloze', 'past simple'),
    pick('reorder'),
    pick('transform', 'passive voice'),
    pick('reading'),
    mcq[1],
    pick('essay'),
  ];
  return order.map((q, i) => ({ ...q, id: i + 1 }));
}

export function demoBattle(): { topic: string; config: BattleConfig; payload: BattlePayload } {
  return {
    topic: 'General English Grammar (Demo)',
    config: { ...DEMO_CONFIG, questionTypes: ['mcq', 'matching', 'cloze', 'reorder', 'transform', 'reading', 'essay'] },
    payload: { teaching_notes: FALLBACK_TEACHING_NOTES, questions: demoQuestions(), boss: DEMO_BOSS },
  };
}
