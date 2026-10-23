// Tutor-centric Rewards Store. Tutors own the catalogue; these are starter presets.

export interface RewardItem {
  id: string;
  name: string;
  emoji: string;
  gemCost: number;
  rule?: string;
}

export const PRESET_REWARDS: RewardItem[] = [
  { id: 'break_5min', name: '5-minute break', emoji: '⏸️', gemCost: 100 },
  { id: 'homework_pass', name: 'Homework Pass', emoji: '🎟️', gemCost: 300, rule: 'Once per month' },
  { id: 'preferred_seat', name: 'Preferred seat', emoji: '💺', gemCost: 150 },
  { id: 'bubble_tea', name: 'Bubble tea', emoji: '🧋', gemCost: 500, rule: 'Tutor approval required' },
];

export const COOP_WIN_BONUS_GEMS = 40;
export const MVP_MULTIPLIER = 1.25;

/** Co-op Raid payout: every member gets the win bonus; the top damage dealer gets an MVP boost. */
export function coopPayout(baseGems: number, won: boolean, isMvp: boolean): number {
  const withBonus = baseGems + (won ? COOP_WIN_BONUS_GEMS : 0);
  return Math.round(isMvp ? withBonus * MVP_MULTIPLIER : withBonus);
}
