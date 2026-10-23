import type { Question } from './types';

// In-battle side quests. Picked deterministically from the battle's questions so
// the server (authoritative) and client (display) always agree.

export type QuestKind = 'topic_perfect' | 'speed' | 'flawless';

export interface QuestReward {
  gems: number;
  mp: number;
  heal: number;
}

export interface QuestState {
  id: string;
  kind: QuestKind;
  title: string;
  description: string;
  progress: number;
  target: number;
  status: 'active' | 'done' | 'failed';
  reward: QuestReward;
  /** topic_perfect: lower-cased topic the quest tracks. */
  topic?: string;
}

export const QUEST_TARGET = 3;
/** "Speed" answers must land within this fraction of the time limit. */
export const SPEED_FRACTION = 1 / 3;

/** Most common topic with at least 3 questions — the "rewrite 3 sentences perfectly" quest. */
function topicForPerfectQuest(questions: Question[]): string | null {
  const counts = new Map<string, { label: string; n: number }>();
  for (const q of questions) {
    const key = q.topic.trim().toLowerCase();
    const c = counts.get(key) ?? { label: q.topic.trim(), n: 0 };
    c.n += 1;
    counts.set(key, c);
  }
  let best: { key: string; label: string; n: number } | null = null;
  for (const [key, c] of counts) if (c.n >= QUEST_TARGET && (!best || c.n > best.n)) best = { key, ...c };
  return best ? `${best.key}\u0000${best.label}` : null;
}

export function pickQuests(questions: Question[]): QuestState[] {
  const quests: QuestState[] = [];
  const topic = topicForPerfectQuest(questions);
  if (topic) {
    const [key, label] = topic.split('\u0000');
    quests.push({
      id: 'spirit_beast',
      kind: 'topic_perfect',
      title: 'Giải phóng Thần Thú',
      description: `Trả lời đúng hoàn hảo ${QUEST_TARGET} câu “${label}” (không sai câu nào của chủ điểm này).`,
      progress: 0,
      target: QUEST_TARGET,
      status: 'active',
      reward: { gems: 30, mp: 30, heal: 20 },
      topic: key,
    });
  }
  if (questions.length >= QUEST_TARGET) {
    quests.push({
      id: 'lightning',
      kind: 'speed',
      title: 'Tia Chớp Tri Thức',
      description: `Trả lời đúng ${QUEST_TARGET} câu, mỗi câu trong 1/3 thời gian.`,
      progress: 0,
      target: QUEST_TARGET,
      status: 'active',
      reward: { gems: 20, mp: 20, heal: 0 },
    });
  }
  if (questions.length >= 6) {
    quests.push({
      id: 'unbreakable',
      kind: 'flawless',
      title: 'Khiên Bất Hoại',
      description: 'Không mất HP nào cho đến khi Boss biến hình (còn 50% HP).',
      progress: 0,
      target: 1,
      status: 'active',
      reward: { gems: 25, mp: 40, heal: 0 },
    });
  }
  return quests;
}

export interface QuestUpdate {
  quests: QuestState[];
  completed: QuestState[];
}

/** Update quest progress after one answer. Pure. */
export function advanceQuests(
  quests: QuestState[],
  q: Question,
  correct: boolean,
  timeMs: number,
  limitSec: number,
  lostHp: boolean,
  bossEnteredPhase2: boolean,
): QuestUpdate {
  const completed: QuestState[] = [];
  const next = quests.map((quest) => {
    if (quest.status !== 'active') return quest;
    let progress = quest.progress;
    let status: QuestState['status'] = 'active';
    switch (quest.kind) {
      case 'topic_perfect':
        if (q.topic.trim().toLowerCase() === quest.topic) {
          if (correct) progress += 1;
          else status = 'failed';
        }
        break;
      case 'speed':
        if (correct && timeMs <= limitSec * 1000 * SPEED_FRACTION) progress += 1;
        break;
      case 'flawless':
        if (lostHp) status = 'failed';
        else if (bossEnteredPhase2) progress = 1;
        break;
    }
    if (status === 'active' && progress >= quest.target) status = 'done';
    const updated = { ...quest, progress: Math.min(progress, quest.target), status };
    if (status === 'done') completed.push(updated);
    return updated;
  });
  return { quests: next, completed };
}

export function questGems(quests: QuestState[]): number {
  return quests.filter((q) => q.status === 'done').reduce((sum, q) => sum + q.reward.gems, 0);
}
