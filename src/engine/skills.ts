import type { SkillDefinition, SkillId } from './types';

export const MAX_MP = 100;

export const SKILLS: Record<SkillId, SkillDefinition> = {
  shield: {
    id: 'shield',
    name: 'Shield',
    nameVi: 'Khiên Bảo vệ',
    cost: 50,
    description: 'Blocks the penalty of your next wrong answer.',
  },
  freeze: {
    id: 'freeze',
    name: 'Time Freeze',
    nameVi: 'Đóng băng Thời gian',
    cost: 40,
    description: 'Pauses the timer for 30 seconds.',
  },
  eye_of_truth: {
    id: 'eye_of_truth',
    name: 'Eye of Truth',
    nameVi: 'Mắt thần',
    cost: 60,
    description: 'Removes 2 incorrect options.',
  },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];
export const FREEZE_SECONDS = 30;

/** MP earned for a correct answer grows with the combo: 10, 20, 30 (cap). */
export function mpGain(comboAfterAnswer: number): number {
  return Math.min(30, 10 * Math.max(1, comboAfterAnswer));
}

export function canCast(skill: SkillId, mp: number): boolean {
  return mp >= SKILLS[skill].cost;
}

/** Pick two wrong options to hide (Eye of Truth / 50:50). Deterministic per seed. */
export function optionsToRemove(optionCount: number, correctIdx: number, seed: number): number[] {
  const wrong = Array.from({ length: optionCount }, (_, i) => i).filter((i) => i !== correctIdx);
  const start = Math.abs(seed) % Math.max(1, wrong.length);
  const rotated = [...wrong.slice(start), ...wrong.slice(0, start)];
  return rotated.slice(0, Math.min(2, Math.max(0, wrong.length - 1)));
}

// --- Gacha Chest (unlocked after defeating a boss) ---

export interface LootItem {
  id: string;
  name: string;
  kind: 'cosmetic' | 'exp_booster';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  emoji: string;
}

export const GACHA_TABLE: { item: LootItem; weight: number }[] = [
  { item: { id: 'exp_x1_5', name: 'EXP Booster x1.5', kind: 'exp_booster', rarity: 'common', emoji: '🧪' }, weight: 40 },
  { item: { id: 'frame_bronze', name: 'Bronze Avatar Frame', kind: 'cosmetic', rarity: 'common', emoji: '🖼️' }, weight: 25 },
  { item: { id: 'exp_x2', name: 'EXP Booster x2', kind: 'exp_booster', rarity: 'rare', emoji: '⚗️' }, weight: 18 },
  { item: { id: 'pet_dragon', name: 'Baby Dragon Pet Skin', kind: 'cosmetic', rarity: 'epic', emoji: '🐲' }, weight: 12 },
  { item: { id: 'crown_gold', name: 'Golden Crown Title', kind: 'cosmetic', rarity: 'legendary', emoji: '👑' }, weight: 5 },
];

/** `roll` must be in [0, 1). */
export function rollGacha(roll: number): LootItem {
  const total = GACHA_TABLE.reduce((sum, e) => sum + e.weight, 0);
  let target = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const entry of GACHA_TABLE) {
    if (target < entry.weight) return entry.item;
    target -= entry.weight;
  }
  return GACHA_TABLE[0].item;
}
