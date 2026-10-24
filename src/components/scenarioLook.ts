import type { ScenarioId } from '../engine';

export const LOOK: Record<ScenarioId, { icon: string; grad: string; blurb: string; rules: string[] }> = {
  homework: { icon: '📚', grad: 'from-sky-500 to-indigo-600', blurb: 'Học viên tự làm ở nhà, theo cốt truyện.', rules: ['Một người chơi, không giới hạn thời gian nộp', 'Được thử lại', 'Không bảng xếp hạng'] },
  in_class: { icon: '⚡', grad: 'from-amber-500 to-rose-600', blurb: 'Cả lớp thi tốc độ, có bảng xếp hạng.', rules: ['Trả lời nhanh được thêm điểm', 'Bảng xếp hạng trực tiếp', 'Không thử lại'] },
  coop_raid: { icon: '🐉', grad: 'from-fuchsia-500 to-purple-700', blurb: 'Cả đội cùng đánh một Boss chung.', rules: ['HP Boss dùng chung', 'Đối kháng theo lượt', 'Có bảng xếp hạng'] },
  boat_race: { icon: '🚣', grad: 'from-cyan-500 to-emerald-600', blurb: 'Đua thuyền 1v1 với robot hoặc đội với đội.', rules: ['Đúng nhiều và nhanh hơn thì thắng', 'Chọn mức độ để đổi độ khó robot', 'Được thử lại'] },
};
