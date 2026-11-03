import bank from '../../content/demo_questions.json';
import type { BattleConfig, BattlePayload, BossProfile, Question, ScenarioId } from './types';
import { GameMode } from './types';
import { FALLBACK_TEACHING_NOTES, TYPED_BANK, fallbackPayload } from './fallback';
import { sanitizeQuestion } from './schema';
import { isGameMode } from './gameModes';

// Built-in demo served at /student (no database needed; results are never saved).
// WP10 U6 (02/11/2026): the player picks one of the six games; each game has its own demo battle id
// ("demo-kayak_rush", …). The plain "demo" id (old links) plays Multiverse. The questions are the 20
// simple multiple-choice questions in content/demo_questions.json (written by the content side).
export const DEMO_BATTLE_ID = 'demo';
const DEMO_PREFIX = 'demo-';
export const DEMO_DEFAULT_GAME: GameMode = GameMode.MULTIVERSE_PORTAL_RPG;

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

/** The battle id of one game's demo. */
export function demoBattleId(game: GameMode): string {
  return `${DEMO_PREFIX}${game}`;
}

/** "demo" or "demo-<game>". */
export function isDemoBattleId(id: unknown): boolean {
  return id === DEMO_BATTLE_ID || (typeof id === 'string' && id.startsWith(DEMO_PREFIX) && isGameMode(id.slice(DEMO_PREFIX.length)));
}

/** The game of a demo battle id (old "demo" = the default game), null when not a demo id. */
export function demoGameOf(id: unknown): GameMode | null {
  if (id === DEMO_BATTLE_ID) return DEMO_DEFAULT_GAME;
  return isDemoBattleId(id) ? ((id as string).slice(DEMO_PREFIX.length) as GameMode) : null;
}

/** The scenario each demo plays as: Kayak is a boat race; River Survival only accepts class scenarios. */
function demoScenario(game: GameMode): ScenarioId {
  if (game === GameMode.KAYAK_RUSH_3D) return 'boat_race';
  if (game === GameMode.RIVER_SURVIVAL) return 'in_class';
  return 'homework';
}

/** The 20 demo questions (content/demo_questions.json), checked like AI output; ids 1…n. */
export function demoQuestions(): Question[] {
  const raw = (bank as { questions: unknown[] }).questions;
  const out = raw.map((q, i) => sanitizeQuestion(q, i + 1)).filter((q): q is Question => !!q);
  // A broken content file must not take the demo down: fall back to the built-in bank.
  return out.length >= 5 ? out : fallbackPayload(10, DEMO_BATTLE_ID).questions.map((q, i) => ({ ...q, id: i + 1 }));
}

/**
 * One question of each lesson format (the demo before U6): multiple choice → matching → cloze →
 * reorder → transform → reading → multiple choice → essay. Kept for the format tests.
 */
export function formatShowcaseQuestions(): Question[] {
  const mcq = fallbackPayload(2, DEMO_BATTLE_ID).questions;
  const pick = (type: Question['type'], topic?: string) =>
    TYPED_BANK.find((q) => q.type === type && (!topic || q.topic === topic)) ?? TYPED_BANK.find((q) => q.type === type)!;
  const order = [mcq[0], pick('matching', 'past simple'), pick('cloze', 'past simple'), pick('reorder'), pick('transform', 'passive voice'), pick('reading'), mcq[1], pick('essay')];
  return order.map((q, i) => ({ ...q, id: i + 1 }));
}

export function demoBattle(game: GameMode = DEMO_DEFAULT_GAME): { topic: string; config: BattleConfig; payload: BattlePayload } {
  return {
    topic: 'Thì hiện tại đơn — Present simple (Demo)',
    config: { ...DEMO_CONFIG, scenario: demoScenario(game), gameMode: game, level: 1, durationMinutes: 6, questionTypes: ['mcq'] },
    payload: { teaching_notes: FALLBACK_TEACHING_NOTES, questions: demoQuestions(), boss: DEMO_BOSS },
  };
}
