// Random run events ("biến cố ngẫu nhiên", plan 2026-10-26).
// The same scenario plays differently every time: weather, a twist per stage, where props spawn,
// and (fishing) the "fish of the day". The SERVER calls planRun() once when a match starts and
// sends the plan to every device, so all 50 phones in a class see exactly the same events.
// No new 3D models: every effect is lighting, shaders, numbers or props already in the asset catalog.

import { GameMode } from './types';
import { hashString, mulberry32 } from './variants';

export type RunEventKind = 'weather' | 'event' | 'finale';
/** Who an event helps in River Survival; the planner keeps the two teams balanced. */
export type RunEventFavors = 'escapers' | 'pursuers' | 'neutral';

/** Effect knobs read by the game scenes. Multipliers default to 1, flags to false. */
export interface RunEventEffect {
  /** How far players can see (fog, rain, night). */
  visibilityMul?: number;
  /** Fishing: how often fish bite. */
  biteMul?: number;
  /** Fishing: chance the next fish is one rarity tier higher. */
  rarityBoost?: number;
  /** Fishing: the cast gauge drifts sideways (wind). */
  castDrift?: number;
  /** Survival: footprints fade faster (>1) or last longer (<1). */
  footprintFadeMul?: number;
  /** Movement speed for everyone in the zone. */
  moveMul?: number;
  /** Kayak: Nitro strength. */
  nitroMul?: number;
  /** Extra correct answers an action needs (wet wood, strong wind on the tent…). */
  extraAnswers?: number;
  /** Stars are doubled while the event lasts. */
  doubleStars?: boolean;
  /** Spawns a bonus object (crate, golden bobber, chest…) at a seeded spot. */
  spawn?: string;
  /** Short bonus quest: this many questions for the reward. */
  bonusQuestions?: number;
  /** Boss battles: crit chance bonus (0..1). */
  critBonus?: number;
}

export interface RunEventDef {
  id: string;
  /** 'river' = shared weather for the 4 river worlds. */
  game: GameMode | 'river';
  kind: RunEventKind;
  nameVi: string;
  /** What students read when it happens (Vietnamese, one line). */
  description: string;
  effect: RunEventEffect;
  /** Core stages it may appear in (default: events 2-5, finales 6). Optional stages 7-8 accept any event. */
  stages?: number[];
  /** Scenario tags that must all be present. */
  requires?: string[];
  /** Scenario tags that rule it out. */
  excludes?: string[];
  weight?: number;
  favors?: RunEventFavors;
  /** How long it lasts in seconds (default: the whole stage). */
  durationSec?: number;
}

const DAY_ONLY = ['night'];
const NIGHT_ONLY = ['night'];

const RIVER_WEATHER: RunEventDef[] = [
  { id: 'w_clear', game: 'river', kind: 'weather', nameVi: 'Trời quang', description: 'Nắng đẹp, gió nhẹ, mặt nước trong vắt.', effect: {}, excludes: DAY_ONLY, weight: 3 },
  { id: 'w_fog', game: 'river', kind: 'weather', nameVi: 'Sương sớm', description: 'Sương mỏng trên mặt nước, nhìn xa khó hơn nhưng cá cắn câu nhiều hơn.', effect: { visibilityMul: 0.6, biteMul: 1.15 }, weight: 2 },
  { id: 'w_drizzle', game: 'river', kind: 'weather', nameVi: 'Mưa phùn', description: 'Mưa lất phất: dấu chân mờ nhanh, củi khó bén lửa hơn.', effect: { footprintFadeMul: 1.6, extraAnswers: 1, visibilityMul: 0.85 }, weight: 1.5 },
  { id: 'w_wind', game: 'river', kind: 'weather', nameVi: 'Gió lớn', description: 'Gió thổi mạnh: thanh quăng cần lệch, bạt lều phần phật.', effect: { castDrift: 0.25, extraAnswers: 1 }, weight: 1.5 },
  { id: 'w_hot', game: 'river', kind: 'weather', nameVi: 'Nắng gắt', description: 'Trời nóng: nhiệm vụ nước được gấp đôi sao, cá lặn sâu hơn.', effect: { biteMul: 0.9, rarityBoost: 0.1 }, excludes: DAY_ONLY, weight: 1 },
  { id: 'w_clouds', game: 'river', kind: 'weather', nameVi: 'Mây che nắng', description: 'Mây kéo qua, bóng râm phủ bờ sông: dễ lẩn trốn hơn.', effect: { visibilityMul: 0.8 }, excludes: DAY_ONLY, weight: 1.5 },
  { id: 'w_starry', game: 'river', kind: 'weather', nameVi: 'Trời đầy sao', description: 'Đêm trong, sao sáng: nhìn được xa hơn một chút.', effect: { visibilityMul: 1.1 }, requires: NIGHT_ONLY, weight: 3 },
  { id: 'w_moonless', game: 'river', kind: 'weather', nameVi: 'Đêm không trăng', description: 'Mây che trăng: chỉ còn ánh đèn lồng và đèn pin.', effect: { visibilityMul: 0.6 }, requires: NIGHT_ONLY, weight: 1.5 },
];

const SUMMER_CAMP: RunEventDef[] = [
  { id: 'c_squirrel', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Sóc tinh nghịch', description: 'Một chú sóc tha mất một món đồ của đội! Trả lời 2 câu để lấy lại.', effect: { bonusQuestions: 2, spawn: 'squirrel' } },
  { id: 'c_visitor', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Khách bất ngờ', description: 'Bác kiểm lâm ghé trại, giao nhiệm vụ phụ 3 câu, thưởng một công cụ hiếm.', effect: { bonusQuestions: 3 } },
  { id: 'c_wet_wood', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Củi ướt', description: 'Một nửa đống củi bị ướt sương, chọn đúng bó củi khô.', effect: { extraAnswers: 1 }, stages: [2, 3, 4] },
  { id: 'c_ducks', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Đàn vịt qua trại', description: 'Đàn vịt lạch bạch đi ngang: chạm vào vịt để nhận câu thưởng.', effect: { bonusQuestions: 2, spawn: 'ducks' }, excludes: NIGHT_ONLY },
  { id: 'c_map_wind', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Gió thổi bay bản đồ', description: 'Bản đồ trại bay thành 3 mảnh, nhặt lại để mở đường tắt.', effect: { bonusQuestions: 3, spawn: 'map_pieces' } },
  { id: 'c_spice_box', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Hộp gia vị bí mật', description: 'Đầu bếp để lại hộp gia vị: món nướng ngon hơn, gấp đôi sao 60 giây.', effect: { doubleStars: true }, durationSec: 60, stages: [3, 4, 5] },
  { id: 'c_berries', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Bụi quả chín', description: 'Bụi quả mọng ven lối đi: chỉ hái quả có biển "an toàn".', effect: { bonusQuestions: 2 }, excludes: NIGHT_ONLY },
  { id: 'c_lantern_flicker', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Đèn lồng chập chờn', description: 'Vài đèn lồng tắt, thắp lại để lối đi sáng.', effect: { visibilityMul: 0.8, extraAnswers: 1 }, requires: NIGHT_ONLY },
  { id: 'c_fireflies', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Đom đóm kéo tới', description: 'Đàn đom đóm bay quanh trại: gấp đôi sao 45 giây.', effect: { doubleStars: true, visibilityMul: 1.1 }, durationSec: 45, requires: NIGHT_ONLY },
  { id: 'c_inspection', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'event', nameVi: 'Trưởng trại đi kiểm tra', description: 'Trưởng trại kiểm tra lều: lều nào chắc nhận huy hiệu.', effect: { bonusQuestions: 2 }, stages: [3, 4, 5] },
  { id: 'c_finale_song', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'finale', nameVi: 'Bài ca lửa trại', description: 'Cả trại hát chung: mỗi câu đúng làm lửa trại cao thêm.', effect: { doubleStars: true }, durationSec: 60 },
  { id: 'c_finale_fireworks', game: GameMode.SUMMER_CAMP_QUESTS, kind: 'finale', nameVi: 'Pháo hoa bên hồ', description: 'Pháo hoa bắn lên khi Bảng Nhiệm vụ gần đầy: 60 giây cuối gấp đôi sao.', effect: { doubleStars: true }, durationSec: 60 },
];

const RIVER_FISHING: RunEventDef[] = [
  { id: 'f_frenzy', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Cá ăn mồi rộ', description: 'Cá ăn mồi rộ trong 60 giây: cắn câu nhanh gấp đôi.', effect: { biteMul: 2 }, durationSec: 60 },
  { id: 'f_bait_gift', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Ông lão tặng mồi', description: 'Ông lão trên bến tặng một hộp mồi xịn: trả lời 2 câu để nhận.', effect: { bonusQuestions: 2, rarityBoost: 0.15 }, stages: [2, 3] },
  { id: 'f_snag', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Mồi mắc cành', description: 'Lưỡi câu mắc cành dưới nước: trả lời để gỡ, không mất mồi.', effect: { extraAnswers: 1 } },
  { id: 'f_rival', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Thuyền bạn ghé thăm', description: 'Một thuyền bạn rủ thi 2 phút: ai câu nhiều điểm hơn thắng.', effect: { bonusQuestions: 3 }, durationSec: 120 },
  { id: 'f_school', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Đàn cá bơi qua', description: 'Bóng đàn cá dưới thuyền: quăng ngay để có cá to hơn.', effect: { rarityBoost: 0.25 }, durationSec: 40 },
  { id: 'f_otter', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Rái cá xin cá', description: 'Rái cá ngoi lên xin một con cá nhỏ; cho nó thì lần sau dễ gặp cá hiếm.', effect: { rarityBoost: 0.3 }, excludes: ['tournament'] },
  { id: 'f_current', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Dòng chảy đổi hướng', description: 'Dòng nước đổi hướng, thuyền trôi: trả lời để giữ neo.', effect: { castDrift: 0.15, extraAnswers: 1 } },
  { id: 'f_golden_bobber', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Phao vàng trôi tới', description: 'Một chiếc phao vàng trôi qua: vớt được thì nâng cần miễn phí.', effect: { spawn: 'golden_bobber', bonusQuestions: 2 } },
  { id: 'f_kingfisher', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Chim bói cá lao xuống', description: 'Chim bói cá lao xuống chỗ có cá to: quăng vào đó!', effect: { rarityBoost: 0.2, spawn: 'kingfisher' }, excludes: NIGHT_ONLY },
  { id: 'f_glow_fish', game: GameMode.RIVER_FISHING, kind: 'event', nameVi: 'Phao phát sáng', description: 'Phao lóe sáng xanh khi cá chạm mồi: dễ canh giật hơn.', effect: { biteMul: 1.3 }, requires: NIGHT_ONLY },
  { id: 'f_finale_shadow', game: GameMode.RIVER_FISHING, kind: 'finale', nameVi: 'Bóng cá khổng lồ', description: 'Bóng cá khổng lồ lượn quanh thuyền: ai có cần vàng sẽ có một lượt thử.', effect: { rarityBoost: 0.5 } },
  { id: 'f_finale_weighin', game: GameMode.RIVER_FISHING, kind: 'finale', nameVi: 'Cân cá cuối giờ', description: '60 giây cuối: mọi con cá cân được tính gấp đôi điểm.', effect: { doubleStars: true }, durationSec: 60 },
];

const RIVER_SURVIVAL: RunEventDef[] = [
  { id: 's_supply', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Thùng tiếp tế', description: 'Một thùng tiếp tế rơi xuống: tiểu đội nào trả lời đúng 3 câu trước sẽ mở được.', effect: { spawn: 'supply_crate', bonusQuestions: 3 }, favors: 'neutral' },
  { id: 's_fog_bank', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Màn sương lớn', description: 'Sương lớn tràn qua một khu: Ống nhòm chỉ soi được nửa tầm.', effect: { visibilityMul: 0.5 }, favors: 'escapers', durationSec: 90 },
  { id: 's_owl', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Cú kêu báo động', description: 'Cú kêu: ai trốn một chỗ quá 60 giây sẽ hiện vị trí 5 giây. Phải di chuyển!', effect: {}, favors: 'pursuers' },
  { id: 's_mud', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Bùn trơn', description: 'Lối ven sông thành bùn trơn: ai đi qua cũng chậm lại.', effect: { moveMul: 0.8 }, favors: 'neutral' },
  { id: 's_second_net', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Lưới thứ hai', description: 'Một thùng Lưới Gắn Thẻ dự phòng xuất hiện: thêm cơ hội cướp lưới.', effect: { spawn: 'net_crate' }, favors: 'escapers', stages: [3, 4, 5] },
  { id: 's_tunnel', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Lối tắt thân cây', description: 'Thân cây rỗng mở lối tắt giữa hai khu (chỉ đội Chạy Trốn dùng được).', effect: { spawn: 'hollow_log' }, favors: 'escapers' },
  { id: 's_whistle', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Còi trọng tài', description: 'Còi vang: mọi người đứng yên 30 giây trả lời câu nhanh; đội đúng nhiều được thưởng.', effect: { bonusQuestions: 3 }, favors: 'neutral', durationSec: 30 },
  { id: 's_rain_wash', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Mưa rào xóa dấu', description: 'Mưa rào bất chợt xóa sạch dấu chân trên bãi cát.', effect: { footprintFadeMul: 3 }, favors: 'escapers', excludes: ['weather_locked'] },
  { id: 's_lookout', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Tháp canh mở', description: 'Đội Săn Tìm leo được tháp canh: quét dấu chân xa gấp đôi trong 45 giây.', effect: { visibilityMul: 1.5 }, favors: 'pursuers', durationSec: 45 },
  { id: 's_tracker_dog', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Chó trại đánh hơi', description: 'Chú chó trại chạy theo dấu chân mới nhất trong 30 giây.', effect: {}, favors: 'pursuers', durationSec: 30 },
  { id: 's_lost_letter', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Mật thư rơi', description: 'Một mật thư phụ rơi xuống: giải xong sẽ lộ thêm một chỗ trốn an toàn.', effect: { bonusQuestions: 3 }, favors: 'escapers', stages: [3, 4, 5] },
  { id: 's_flare', game: GameMode.RIVER_SURVIVAL, kind: 'event', nameVi: 'Pháo sáng', description: 'Đội Săn Tìm bắn pháo sáng: cả bãi sáng rõ 20 giây.', effect: { visibilityMul: 1.6 }, favors: 'pursuers', requires: NIGHT_ONLY, durationSec: 20 },
  { id: 's_finale_jailbreak', game: GameMode.RIVER_SURVIVAL, kind: 'finale', nameVi: 'Phá chuồng phút chót', description: '60 giây cuối: mọi Chuồng Gỗ mở thêm một lượt giải cứu nếu đội trả lời đúng 5 câu liền.', effect: {}, favors: 'escapers' },
  { id: 's_finale_dragnet', game: GameMode.RIVER_SURVIVAL, kind: 'finale', nameVi: 'Vòng vây cuối', description: '60 giây cuối: Đội Săn Tìm quét dấu chân không cần nạp kỹ năng.', effect: {}, favors: 'pursuers' },
];

const KAYAK_RUSH: RunEventDef[] = [
  { id: 'k_log_jam', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Đám gỗ trôi', description: 'Thêm khúc gỗ xoay trôi xuống: lách khéo nhé!', effect: { extraAnswers: 1, spawn: 'logs' } },
  { id: 'k_tailwind', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Gió xuôi', description: 'Gió xuôi chiều: Nitro mạnh hơn 20% trong 60 giây.', effect: { nitroMul: 1.2 }, durationSec: 60 },
  { id: 'k_headwind', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Gió ngược', description: 'Gió ngược: kayak chậm lại, câu đúng liền 2 câu để vượt gió.', effect: { moveMul: 0.85 }, durationSec: 45 },
  { id: 'k_shortcut', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Lạch tắt mở', description: 'Một lạch tắt mới mở bên bờ: đọc đúng biển báo để vào.', effect: { spawn: 'shortcut', bonusQuestions: 2 } },
  { id: 'k_ducks', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Đàn vịt qua sông', description: 'Đàn vịt bơi ngang sông: đi chậm nhường đường, nhận sao thưởng.', effect: { moveMul: 0.9, bonusQuestions: 1, spawn: 'ducks' }, excludes: NIGHT_ONLY },
  { id: 'k_crowd', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Khán giả cổ vũ', description: 'Khán giả trên bờ reo hò: gấp đôi sao 45 giây.', effect: { doubleStars: true }, durationSec: 45 },
  { id: 'k_whirlpool', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Xoáy nước', description: 'Một xoáy nước xuất hiện giữa dòng: trả lời để thoát xoáy.', effect: { extraAnswers: 1, spawn: 'whirlpool' } },
  { id: 'k_golden_buoy', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Phao vàng', description: 'Cổng phao vàng: đi qua đúng lúc = Siêu Nitro.', effect: { nitroMul: 1.5, spawn: 'golden_buoy' }, durationSec: 30 },
  { id: 'k_rapids_up', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Nước lên', description: 'Nước dâng, ghềnh mạnh hơn: câu hỏi ngắn 8 giây.', effect: { extraAnswers: 1 }, requires: ['rapids'] },
  { id: 'k_lanterns', game: GameMode.KAYAK_RUSH_3D, kind: 'event', nameVi: 'Đèn lồng trôi', description: 'Hàng trăm đèn lồng trôi qua: lách không chạm đèn được thưởng sao.', effect: { bonusQuestions: 2, spawn: 'lanterns' }, requires: NIGHT_ONLY },
  { id: 'k_finale_sprint', game: GameMode.KAYAK_RUSH_3D, kind: 'finale', nameVi: 'Nước rút cuối', description: '100 m cuối: Nitro gấp đôi.', effect: { nitroMul: 2 } },
  { id: 'k_finale_photo', game: GameMode.KAYAK_RUSH_3D, kind: 'finale', nameVi: 'Ảnh về đích', description: 'Máy ảnh trên cổng đích: về đích sau chuỗi 3 câu đúng được ảnh vàng.', effect: { doubleStars: true } },
];

const MULTIVERSE: RunEventDef[] = [
  { id: 'm_fog_castle', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'weather', nameVi: 'Sương tím', description: 'Sương tím dày đặc trong lâu đài.', effect: { visibilityMul: 0.7 }, requires: ['castle'] },
  { id: 'm_rain_neon', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'weather', nameVi: 'Mưa neon', description: 'Mưa rơi trên bảng hiệu neon, sấm xa.', effect: {}, requires: ['cyberpunk'] },
  { id: 'm_sandstorm', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'weather', nameVi: 'Bão cát', description: 'Gió cát thổi từng đợt.', effect: { visibilityMul: 0.75 }, requires: ['desert'] },
  { id: 'm_calm', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'weather', nameVi: 'Trời yên', description: 'Bầu trời yên ả trước trận đánh.', effect: {}, weight: 2 },
  { id: 'm_portal_flicker', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'event', nameVi: 'Cổng chập chờn', description: 'Cổng không gian chập chờn: thế giới kế tiếp hiện thoáng qua.', effect: { bonusQuestions: 1 } },
  { id: 'm_minions', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'event', nameVi: 'Đợt lính nhỏ', description: 'Một đợt lính nhỏ tràn ra: mỗi câu đúng hạ một tên.', effect: { bonusQuestions: 3 } },
  { id: 'm_power_rune', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'event', nameVi: 'Ấn sức mạnh', description: 'Ấn sức mạnh sáng trên sàn: tỉ lệ chí mạng tăng 60 giây.', effect: { critBonus: 0.2 }, durationSec: 60 },
  { id: 'm_boss_shield', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'event', nameVi: 'Boss dựng khiên', description: 'Boss dựng khiên: cần chuỗi 3 câu đúng để phá.', effect: { extraAnswers: 2 }, stages: [3, 4, 5] },
  { id: 'm_ally', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'event', nameVi: 'Đồng minh tới', description: 'Kỵ Sĩ Thép xuất hiện đỡ đòn cho cả tổ đội 45 giây.', effect: {}, durationSec: 45 },
  { id: 'm_chest', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'event', nameVi: 'Rương báu', description: 'Rương báu rơi ra: mở bằng 2 câu đúng để nhận phép mới.', effect: { spawn: 'chest', bonusQuestions: 2 } },
  { id: 'm_mirror', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'event', nameVi: 'Phân thân Boss', description: 'Boss tách làm hai: câu đúng chỉ ra đâu là thân thật.', effect: { bonusQuestions: 2 }, stages: [4, 5] },
  { id: 'm_slow_time', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'event', nameVi: 'Thời gian chậm', description: 'Đồng hồ cát lật ngược: thêm 5 giây cho mỗi câu trong 60 giây.', effect: {}, durationSec: 60 },
  { id: 'm_finale_rage', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'finale', nameVi: 'Cơn thịnh nộ cuối', description: 'Boss dồn sức cuối: mọi đòn chí mạng gây gấp đôi.', effect: { critBonus: 0.15 } },
  { id: 'm_finale_unity', game: GameMode.MULTIVERSE_PORTAL_RPG, kind: 'finale', nameVi: 'Hợp sức', description: 'Cả tổ đội cùng đúng 3 câu liền tung tuyệt kỹ chung.', effect: { doubleStars: true } },
];

const DINO_JOURNEY: RunEventDef[] = [
  { id: 'd_w_clear', game: GameMode.DINO_JOURNEY, kind: 'weather', nameVi: 'Nắng trải đồng cỏ', description: 'Nắng vàng, gió nhẹ, cỏ cao rạp theo từng đợt.', effect: {}, excludes: ['night', 'storm'], weight: 3 },
  { id: 'd_w_mist', game: GameMode.DINO_JOURNEY, kind: 'weather', nameVi: 'Sương mù đồng cỏ', description: 'Sương trắng phủ cỏ: nhìn xa khó hơn nhưng dễ lẩn khỏi kẻ săn mồi.', effect: { visibilityMul: 0.65 }, excludes: ['storm'], weight: 2 },
  { id: 'd_w_dust', game: GameMode.DINO_JOURNEY, kind: 'weather', nameVi: 'Gió bụi cao nguyên', description: 'Gió thổi bụi đỏ từng đợt, cả bầy đi chậm lại.', effect: { visibilityMul: 0.8, moveMul: 0.9 }, requires: ['plateau'], weight: 2 },
  { id: 'd_w_rain', game: GameMode.DINO_JOURNEY, kind: 'weather', nameVi: 'Mưa rào', description: 'Mưa rào mát lành: dấu chân mờ nhanh, mặt đất trơn hơn.', effect: { footprintFadeMul: 1.5, moveMul: 0.95 }, excludes: ['night', 'drought'], weight: 1.5 },
  { id: 'd_w_stars', game: GameMode.DINO_JOURNEY, kind: 'weather', nameVi: 'Đêm đầy sao', description: 'Đêm trong, sao sáng và hai mặt trăng soi đường về tổ.', effect: { visibilityMul: 1.1 }, requires: ['night'], excludes: ['storm'], weight: 3 },
  { id: 'd_w_storm', game: GameMode.DINO_JOURNEY, kind: 'weather', nameVi: 'Bão sấm', description: 'Sấm chớp liên hồi, gió giật: cả bầy phải nép sát nhau.', effect: { visibilityMul: 0.55, extraAnswers: 1 }, requires: ['storm'], weight: 3 },
  { id: 'd_herd_cross', game: GameMode.DINO_JOURNEY, kind: 'event', nameVi: 'Bầy cổ dài đi ngang', description: 'Bầy khủng long cổ dài đi ngang đường: đợi họ qua, trả lời 2 câu để xin đi cùng.', effect: { bonusQuestions: 2 } },
  { id: 'd_egg_found', game: GameMode.DINO_JOURNEY, kind: 'event', nameVi: 'Quả trứng lạc', description: 'Một quả trứng lạc nằm trong cỏ: trả lời đúng để đưa nó về với mẹ, thưởng sao.', effect: { bonusQuestions: 2, spawn: 'egg' } },
  { id: 'd_berries', game: GameMode.DINO_JOURNEY, kind: 'event', nameVi: 'Bụi quả chín', description: 'Bụi quả đỏ ven đường: hái đúng quả ăn được, đúng nhiều thì gấp đôi sao.', effect: { doubleStars: true }, stages: [2, 3, 4] },
  { id: 'd_footprints', game: GameMode.DINO_JOURNEY, kind: 'event', nameVi: 'Dấu chân khổng lồ', description: 'Dấu chân to nằm giữa đường: đọc đúng để biết hướng đi an toàn.', effect: { extraAnswers: 1 } },
  { id: 'd_watering', game: GameMode.DINO_JOURNEY, kind: 'event', nameVi: 'Vũng nước mới', description: 'Một vũng nước mới hiện ra sau mưa: cả bầy uống nước, hồi đầy sức bền.', effect: { spawn: 'water_hole' }, excludes: ['drought'] },
  { id: 'd_pterosaur', game: GameMode.DINO_JOURNEY, kind: 'event', nameVi: 'Bóng thằn lằn bay', description: 'Bóng thằn lằn bay lướt qua: nằm rạp xuống đúng lúc, trả lời nhanh trong 20 giây.', effect: { visibilityMul: 0.85, bonusQuestions: 1 }, durationSec: 20 },
  { id: 'd_cliff', game: GameMode.DINO_JOURNEY, kind: 'event', nameVi: 'Vách đá chắn lối', description: 'Vách đá chắn đường: cả bầy xếp hàng leo, mỗi câu đúng là một bậc.', effect: { extraAnswers: 1 }, stages: [3, 4, 5] },
  { id: 'd_fireflies', game: GameMode.DINO_JOURNEY, kind: 'event', nameVi: 'Đom đóm dẫn đường', description: 'Đàn đom đóm bay trước mặt, soi lối về tổ: gấp đôi sao.', effect: { doubleStars: true, visibilityMul: 1.1 }, requires: ['night'] },
  { id: 'd_finale_rescue', game: GameMode.DINO_JOURNEY, kind: 'finale', nameVi: 'Đứng lên bảo vệ cha', description: 'Bọn bắt nạt vây quanh cha già! Mỗi câu đúng của cả bầy là một tiếng gầm, dọa chúng bỏ chạy.', effect: { doubleStars: true } },
  { id: 'd_finale_homecoming', game: GameMode.DINO_JOURNEY, kind: 'finale', nameVi: 'Cả bầy về tổ', description: 'Mặt trời lặn, cả bầy cùng đi về tổ: trả lời đúng chuỗi 3 câu để thắp sáng đường về.', effect: { bonusQuestions: 3 } },
];

export const RUN_EVENTS: RunEventDef[] = [...RIVER_WEATHER, ...SUMMER_CAMP, ...RIVER_FISHING, ...RIVER_SURVIVAL, ...KAYAK_RUSH, ...MULTIVERSE, ...DINO_JOURNEY];
const BY_ID = new Map(RUN_EVENTS.map((e) => [e.id, e]));

export function runEventById(id: string | null | undefined): RunEventDef | null {
  return id ? BY_ID.get(id) ?? null : null;
}

const RIVER_WORLDS: GameMode[] = [GameMode.KAYAK_RUSH_3D, GameMode.SUMMER_CAMP_QUESTS, GameMode.RIVER_FISHING, GameMode.RIVER_SURVIVAL];

/** Every event a game can draw (its own + the shared river weather). */
export function runEventsFor(game: GameMode): RunEventDef[] {
  return RUN_EVENTS.filter((e) => e.game === game || (e.game === 'river' && RIVER_WORLDS.includes(game)));
}

export interface RunPlanStage {
  n: number;
  eventId: string | null;
}

export interface RunPlan {
  seed: number;
  /** Weather for the whole run, possibly changing once. null = the scenario fixes its own weather. */
  weather: { start: string; change: { atStage: number; to: string } | null } | null;
  /** 8 entries (stages 1-8). Stage 1 never has an event so the story starts clearly. */
  stages: RunPlanStage[];
  /** Seed for where props, crates and hiding spots spawn. */
  layoutSeed: number;
  /** Fishing: species with bonus points today. */
  featuredSpecies: string | null;
}

export interface PlanRunInput {
  game: GameMode;
  scenarioId: string;
  /** Scenario tags, e.g. ['night'], ['weather_locked'], ['castle', 'cyberpunk']. */
  tags: string[];
  /** Unique per match (battle id + run number). Same key → same plan on every device. */
  seedKey: string;
  /** Event ids used in this class's recent runs of the same scenario; avoided when possible. */
  recent?: string[];
  /** Fishing: species ids the scenario uses (catalog ids like 'fish_basa'). */
  species?: string[];
}

const CORE_EVENT_STAGES = [2, 3, 4, 5];

function fits(e: RunEventDef, tags: string[], stage: number | null): boolean {
  if (e.requires?.some((t) => !tags.includes(t))) return false;
  if (e.excludes?.some((t) => tags.includes(t))) return false;
  if (stage == null || stage >= 7) return true;
  const allowed = e.stages ?? (e.kind === 'finale' ? [6] : CORE_EVENT_STAGES);
  return allowed.includes(stage);
}

function weighted<T extends { weight?: number }>(items: T[], rand: () => number): T | null {
  if (!items.length) return null;
  const total = items.reduce((s, i) => s + (i.weight ?? 1), 0);
  let r = rand() * total;
  for (const i of items) {
    r -= i.weight ?? 1;
    if (r <= 0) return i;
  }
  return items[items.length - 1];
}

/**
 * Build the random-event plan for one match. Pure and deterministic: call it on the server,
 * store the result with the session and broadcast it; clients only render it.
 */
export function planRun(input: PlanRunInput): RunPlan {
  const seed = hashString(`${input.seedKey}|${input.scenarioId}`);
  const rand = mulberry32(seed);
  const tags = input.tags;
  const recent = new Set(input.recent ?? []);
  const pool = runEventsFor(input.game);

  // Weather
  let weather: RunPlan['weather'] = null;
  if (!tags.includes('weather_locked')) {
    const options = pool.filter((e) => e.kind === 'weather' && fits(e, tags, null));
    const start = weighted(options, rand);
    if (start) {
      let change: { atStage: number; to: string } | null = null;
      if (rand() < 0.35) {
        const to = weighted(options.filter((e) => e.id !== start.id), rand);
        if (to) change = { atStage: 4, to: to.id };
      }
      weather = { start: start.id, change };
    }
  }

  // Events
  const used = new Set<string>();
  const favorCount = { escapers: 0, pursuers: 0 };
  const pick = (stage: number, kind: 'event' | 'finale'): string | null => {
    let options = pool.filter((e) => e.kind === kind && !used.has(e.id) && fits(e, tags, stage));
    const fresh = options.filter((e) => !recent.has(e.id));
    if (fresh.length) options = fresh;
    if (input.game === GameMode.RIVER_SURVIVAL) {
      const lead = favorCount.escapers - favorCount.pursuers;
      const balanced = options.filter((e) => (lead >= 1 ? e.favors !== 'escapers' : lead <= -1 ? e.favors !== 'pursuers' : true));
      if (balanced.length) options = balanced;
    }
    const e = weighted(options, rand);
    if (!e) return null;
    used.add(e.id);
    if (e.favors === 'escapers' || e.favors === 'pursuers') favorCount[e.favors]++;
    return e.id;
  };

  const stages: RunPlanStage[] = [{ n: 1, eventId: null }];
  for (const n of CORE_EVENT_STAGES) stages.push({ n, eventId: rand() < 0.75 ? pick(n, 'event') : null });
  // Never fewer than 2 twists in the core stages.
  for (const s of stages) {
    if (stages.filter((x) => x.eventId).length >= 2) break;
    if (s.n >= 2 && !s.eventId) s.eventId = pick(s.n, 'event');
  }
  stages.push({ n: 6, eventId: pick(6, 'finale') });
  for (const n of [7, 8]) stages.push({ n, eventId: rand() < 0.5 ? pick(n, 'event') : null });

  const layoutSeed = Math.floor(rand() * 0xffffffff) >>> 0;
  const species = (input.species ?? []).filter((s) => s !== 'fish_king_salmon');
  const featuredSpecies = input.game === GameMode.RIVER_FISHING && species.length ? species[Math.floor(rand() * species.length)] : null;

  return { seed, weather, stages, layoutSeed, featuredSpecies };
}

/** Event ids a plan uses, for the "recent" list of the next run. */
export function runPlanEventIds(plan: RunPlan): string[] {
  return plan.stages.map((s) => s.eventId).filter((id): id is string => !!id);
}
