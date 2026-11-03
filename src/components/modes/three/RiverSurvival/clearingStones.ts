import type { PhoneticStoneTarget } from '../../../../client/phoneticStones';
import type { SurvivalZoneId } from './zones';

export interface SurvivalClearingStoneSpec {
  targetId: string;
  word: string;
  ipa: string;
  viMeaning: string;
  mouthTipVi: string;
  zoneId: SurvivalZoneId;
  stationId: string;
  stationLabelVi: string;
  /** World-space position `[x, y, z]` at the Decoder clearing station in this zone. */
  position: [number, number, number];
}

/**
 * A4 — Phonetic Stones placed at the Decoder clearing stations ("khu dọn dẹp cho vai Thợ giải mã")
 * across the 3 River Survival zones (`zone_alpha`, `zone_bravo`, `zone_charlie`).
 * Total count: 6 stones (strictly ≤ 12 `MAX_PHONETIC_STONES` per scene).
 * Passing 2 distinct stones unlocks the `'pen'` clue (Chuồng Gỗ); passing 4 unlocks the `'net'` clue (Lưới Gắn Thẻ).
 */
export const RIVER_SURVIVAL_CLEARING_STONES: readonly SurvivalClearingStoneSpec[] = [
  {
    targetId: 'surv_stone_compass',
    word: 'compass',
    ipa: '/ˈkʌmpəs/',
    viMeaning: 'la bàn định hướng',
    mouthTipVi: 'Mở nhẹ miệng ở âm /ʌ/ (như "căm") rồi khép môi bật âm /p/ và xì nhẹ /s/ ở cuối.',
    zoneId: 'zone_alpha',
    stationId: 'clearing_alpha_spring',
    stationLabelVi: 'Trạm Suối Bắc (Khu A)',
    position: [-19.5, 0.45, -10.5],
  },
  {
    targetId: 'surv_stone_shelter',
    word: 'shelter',
    ipa: '/ˈʃeltər/',
    viMeaning: 'nơi trú ẩn',
    mouthTipVi: 'Chu môi nhẹ thổi âm /ʃ/ (như "sờ" nặng), nâng đầu lưỡi chạm lợi ở âm /l/.',
    zoneId: 'zone_alpha',
    stationId: 'clearing_alpha_pine',
    stationLabelVi: 'Bãi Thông Bắc (Khu A)',
    position: [-24.2, 0.45, -13.2],
  },
  {
    targetId: 'surv_stone_rescue',
    word: 'rescue',
    ipa: '/ˈreskjuː/',
    viMeaning: 'giải cứu đồng đội',
    mouthTipVi: 'Cuộn nhẹ đầu lưỡi âm /r/ đầu từ, xì rõ âm /s/ ở giữa rồi tròn môi âm /juː/.',
    zoneId: 'zone_bravo',
    stationId: 'clearing_bravo_ford',
    stationLabelVi: 'Bãi Giữa Sông (Khu B)',
    position: [-3.4, 0.45, 2.2],
  },
  {
    targetId: 'surv_stone_bridge',
    word: 'bridge',
    ipa: '/brɪdʒ/',
    viMeaning: 'cầu gỗ vượt sông',
    mouthTipVi: 'Bật nhanh cụm phụ âm /br/, giữ nguyên âm /ɪ/ ngắn gọn rồi khép răng bật âm /dʒ/.',
    zoneId: 'zone_bravo',
    stationId: 'clearing_bravo_bridge',
    stationLabelVi: 'Đầu Cầu Gỗ (Khu B)',
    position: [3.2, 0.45, -1.6],
  },
  {
    targetId: 'surv_stone_lantern',
    word: 'lantern',
    ipa: '/ˈlæntərn/',
    viMeaning: 'đèn lồng tín hiệu',
    mouthTipVi: 'Mở rộng miệng âm /æ/, chạm lưỡi lên vòm miệng cho âm /n/ và /t/ thật rõ.',
    zoneId: 'zone_charlie',
    stationId: 'clearing_charlie_reed',
    stationLabelVi: 'Đầm Lau Nam (Khu C)',
    position: [19.4, 0.45, 10.6],
  },
  {
    targetId: 'surv_stone_paddle',
    word: 'paddle',
    ipa: '/ˈpædəl/',
    viMeaning: 'mái chèo vượt thác',
    mouthTipVi: 'Mím hai môi rồi bật hơi âm /p/, hạ hàm rộng cho âm /æ/ và cong lưỡi âm /l/ cuối.',
    zoneId: 'zone_charlie',
    stationId: 'clearing_charlie_cave',
    stationLabelVi: 'Cửa Hang Trú (Khu C)',
    position: [23.8, 0.45, 13.4],
  },
] as const;

export const RIVER_SURVIVAL_SPEECH_TARGETS: PhoneticStoneTarget[] =
  RIVER_SURVIVAL_CLEARING_STONES.map((s) => ({
    targetId: s.targetId,
    text: s.word,
    kind: 'word',
    ipa: s.ipa,
    modes: ['shadow', 'dictate', 'repeat'],
    ttsRate: 0.85,
    listenMs: 8000,
    attemptsLeft: 3,
    stationId: s.stationId,
    viMeaning: s.viMeaning,
    mouthTipVi: s.mouthTipVi,
  }));
