import type { BossAvatar, BossProfile, MapSetting, ThemeId } from './types';
import { THEMES } from './themes';
import { hashString } from './variants';

export const BOSS_AVATARS: { id: BossAvatar; name: string; emoji: string }[] = [
  { id: 'dragon', name: 'Rồng Lửa', emoji: '🐉' },
  { id: 'golem', name: 'Người Đá', emoji: '🗿' },
  { id: 'wizard', name: 'Phù Thủy', emoji: '🧙' },
  { id: 'shadow_king', name: 'Vua Bóng Tối', emoji: '👑' },
];

export const MAP_SETTINGS: { id: MapSetting; name: string }[] = [
  { id: 'forest', name: 'Rừng Cổ Thụ' },
  { id: 'castle', name: 'Lâu Đài Cổ' },
  { id: 'volcano', name: 'Núi Lửa' },
  { id: 'ice_cave', name: 'Hang Băng' },
  { id: 'dungeon', name: 'Hầm Ngục' },
  { id: 'sky_arena', name: 'Đấu Trường Trên Mây' },
];

export const BOSS_AVATAR_IDS = BOSS_AVATARS.map((b) => b.id);
export const MAP_SETTING_IDS = MAP_SETTINGS.map((m) => m.id);

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/** Boss used when the AI fails or for battles saved before bosses existed. */
export function defaultBoss(topic: string, themes: ThemeId[]): BossProfile {
  const theme = THEMES[themes[0] ?? 'rpg_classic'] ?? THEMES.rpg_classic;
  const h = hashString(topic || theme.id);
  const cleanTopic = topic.trim().slice(0, 40);
  return {
    boss_name: cleanTopic ? `Chúa Tể ${cleanTopic}` : theme.bossName,
    boss_avatar: BOSS_AVATAR_IDS[h % BOSS_AVATAR_IDS.length],
    boss_dialogue_on_attack: 'Ngươi nghĩ có thể đánh bại ta với kiến thức nửa vời đó sao?',
    boss_skills: ['Đòn Đánh Ngữ Pháp', 'Lời Nguyền Từ Vựng', 'Bão Câu Hỏi'],
    map_setting: MAP_SETTING_IDS[h % MAP_SETTING_IDS.length],
    map_name: theme.name,
    phase2_name: cleanTopic ? `${cleanTopic} — Hình Thái Cuồng Nộ` : `${theme.bossName} (Cuồng Nộ)`,
    phase2_dialogue: 'Ngươi khá lắm... Nhưng giờ ta mới thật sự nghiêm túc! Hãy đọc kỹ từng chữ!',
    enrage_dialogue: 'Sai liên tiếp rồi! Dừng lại, đọc lại câu hỏi và tìm từ khoá chỉ thời gian đi!',
  };
}

/** Validate an AI- or tutor-supplied boss, filling gaps from `fallback`. */
export function sanitizeBoss(raw: unknown, fallback: BossProfile): BossProfile {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const skills = Array.isArray(r.boss_skills)
    ? r.boss_skills.map((s) => str(s, 60)).filter((s): s is string => !!s).slice(0, 4)
    : [];
  return {
    boss_name: str(r.boss_name, 60) ?? fallback.boss_name,
    boss_avatar: BOSS_AVATAR_IDS.includes(r.boss_avatar as BossAvatar) ? (r.boss_avatar as BossAvatar) : fallback.boss_avatar,
    boss_dialogue_on_attack: str(r.boss_dialogue_on_attack, 160) ?? fallback.boss_dialogue_on_attack,
    boss_skills: skills.length ? skills : fallback.boss_skills,
    map_setting: MAP_SETTING_IDS.includes(r.map_setting as MapSetting) ? (r.map_setting as MapSetting) : fallback.map_setting,
    map_name: str(r.map_name, 60) ?? fallback.map_name,
    phase2_name: str(r.phase2_name, 60) ?? fallback.phase2_name,
    phase2_dialogue: str(r.phase2_dialogue, 200) ?? fallback.phase2_dialogue,
    enrage_dialogue: str(r.enrage_dialogue, 200) ?? fallback.enrage_dialogue,
  };
}
