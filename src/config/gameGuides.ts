// How-to-play text per game (WP10, 02/11/2026). Opened from the toolbar ("Cách chơi").
// Kayak only for now; U4 moves this to content/game_guides.json for every game.

export interface GameGuide {
  goal: string;
  controls: string[];
  skills: string[];
  tips: string[];
}

export const GAME_GUIDES: Record<string, GameGuide> = {
  kayak_rush: {
    goal: 'Về đích trước thuyền máy. Mỗi câu trả lời đúng là một nhịp chèo mạnh về phía trước; trả lời đúng và nhanh thì thuyền bứt tốc.',
    controls: ['Lái thuyền: phím A / D hoặc ← / →; trên điện thoại kéo thanh lái ở góc dưới bên trái.', 'Trả lời câu hỏi ở khung bên dưới cảnh sông.', 'Kỹ năng: bấm nút tròn bên phải, hoặc phím 1, 2, 3.'],
    skills: ['Khiên: chặn hình phạt của một lần trả lời sai.', 'Đóng băng: dừng đồng hồ 30 giây để suy nghĩ.', 'Mắt thần: bỏ bớt 2 đáp án sai.'],
    tips: ['Kỹ năng tốn MP; MP tăng khi trả lời đúng.', 'Sai không bị trừ xu, cứ bình tĩnh đọc kỹ câu hỏi.', 'Muốn nghe rõ câu hỏi hơn: tắt nhạc ở nút Âm thanh, hiệu ứng vẫn còn.'],
  },
};
