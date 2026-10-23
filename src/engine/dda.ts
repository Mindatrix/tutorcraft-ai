// Dynamic Difficulty Adjustment: after 2 wrong answers in a row the student
// gets a free "Miracle Buff" for the next question (50/50 hint + 10 extra seconds).

export const DDA_TRIGGER_STREAK = 2;
export const MIRACLE_BONUS_SECONDS = 10;

export interface MiracleBuff {
  fiftyFifty: boolean;
  bonusSeconds: number;
}

export function miracleBuffFor(consecutiveWrong: number): MiracleBuff | null {
  if (consecutiveWrong < DDA_TRIGGER_STREAK) return null;
  return { fiftyFifty: true, bonusSeconds: MIRACLE_BONUS_SECONDS };
}
