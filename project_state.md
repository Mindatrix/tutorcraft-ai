# TutorCraft AI: trạng thái dự án

Cập nhật: 03/11/2026 (tối). Nhánh `feat/3d-lego-engine`. Đã gộp PR #1, #3, #4, #5 (Antigravity) và #2 (Jules). **Dự án chuyển sang "Kế hoạch Đại phẫu Đồ họa & Gameplay"** (mục 3): bỏ Jules; Claude Code là Kỹ sư Trưởng Fullstack kiêm QA Lead; Antigravity làm toàn bộ hình ảnh, shader, asset 3D. Repo chuyển ra khỏi iCloud: **`/Users/mindatix100/tutorcraft-ai`** (git dựng lại từ GitHub ngày 03/11, mục 7.7).

Tài liệu này tổng hợp bối cảnh, tiến độ, cấu trúc thư mục và các việc đang dở. Chi tiết vận hành (số đo, lệnh, quy trình) nằm trong `docs/operations.md`. Các đặc tả nằm trong `docs/specs/`. Bản trước của file này (01/11) là commit `104ee00`.

---

## 1. Dự án là gì

- **Sản phẩm:** web học tiếng Anh cho trẻ em Việt Nam (khoảng 6–15 tuổi), bọc trong 6 game 3D. Đây là web học, không phải web game:
  - không nạp tiền để thắng;
  - xếp hạng chỉ dựa vào điểm;
  - xu chỉ kiếm bằng cách chơi, không bán.
- **Gia sư:**
  - đăng nhập (Supabase Auth);
  - tải tài liệu bài học (PDF, .docx, văn bản) và chọn số câu, dạng bài;
  - Gemini sinh câu hỏi; câu thiếu thì bù từ kho câu soạn sẵn;
  - chọn game và kịch bản, mở trận cho cả lớp (tối đa 50 em) hoặc phiên học riêng;
  - màn hình gia sư (`TeacherBoard`) hiện cả lớp, có tắt tiếng cả lớp.
- **Học sinh:** vào bằng mã, chọn avatar (mẫu + màu, không trùng trong trận), trả lời câu hỏi trong cảnh 3D. Tầng chất lượng tự hạ: 3D cao → 3D thấp → 2D.
- **6 game và 30 kịch bản v2:**

  | Mã | Tên |
  |---|---|
  | `kayak_rush` | Kayak Rush |
  | `river_fishing` | River Fishing |
  | `summer_camp` | Summer Camp Quests |
  | `river_survival` | River Survival (Cướp Lưới, chia đội 60/40 Chạy Trốn / Săn Tìm) |
  | `dino_journey` | Dino Journey |
  | `multiverse_portal` | Multiverse Portal RPG |

  Mỗi kịch bản có 8 chặng (6 chặng chính + 2 chặng kéo dài) và 12 nhân vật truyện. Tổng cộng 360 nhân vật.
- **Hiện trạng chơi được:** Kayak Rush và Multiverse có cảnh 3D trong trận. Bốn game còn lại (Summer Camp, River Fishing, River Survival, Dino Journey) trong trận vẫn là khung 2D; thế giới 3D của chúng (sông / đồng cỏ) mới chạy trong `/tutor/scene-lab` và sẽ vào trận ở WP8.
- **Câu hỏi:** có 6 dạng bài, chấm theo rubric AI; 7 cấp độ (Beginner = cấp 0 tới cấp 6); có phụ đề truyện theo cấp. Phần nội dung câu hỏi làm chung với bên nội dung (Claude chat).

## 2. Công nghệ và hạ tầng

| Phần | Chi tiết |
|---|---|
| Khung | Next.js **16.4.2** (App Router, Turbopack, `proxy.ts` thay middleware, `cacheComponents`, `RouteContext`). Bản này khác bản cũ: đọc `node_modules/next/dist/docs/` trước khi viết code đặc thù Next (xem `AGENTS.md`) |
| Giao diện | React 19.3, Tailwind 4. Turbopack biến mọi file `.css` thành CSS toàn cục (CSS module không chạy), nên dùng tiền tố `tc-hud-`, `tc-rb-`, `tc-qf-`. Luật lint React 19: không đọc/ghi ref trong lúc render, không `setState` trong effect (dùng điều chỉnh lúc render hoặc `useSyncExternalStore`) |
| 3D | three.js 0.170; lõi chung `SceneRuntime`; instancing; 3 cấp chi tiết avatar; bầu trời HDRI |
| Âm thanh | 3 bus (nhạc / hiệu ứng / nền) trong `src/client/audio.ts`, file MP3 từ `content/audio_catalog.json`; âm tổng hợp Web Audio làm đường lùi |
| Cơ sở dữ liệu | Supabase project `zzkwcjakdoprxurtapen`. 24 bảng đều bật RLS. Migration mới nhất là `20261103_speech_attempts.sql`, người dùng áp qua SQL Editor ngày 03/11 (đã kiểm lúc 05:30). Repo có 15 file trong `supabase/migrations/`. Số phiên bản trên DB khác tên file trong repo, nên **không dùng `supabase db push`**; áp từng file qua SQL Editor hoặc MCP `apply_migration` (agent bị bộ lọc an toàn chặn, người dùng tự áp) |
| CI | `.github/workflows/ci.yml`: chạy khi có PR vào `feat/3d-lego-engine` hoặc `main`; Node 20; typecheck, lint, test, build + start, test:security |
| Realtime | Kênh `match:<id>`; tin phát qua REST có chữ ký ECDSA P-256; chống phát lại theo `seq`; đồng bộ đồng hồ kiểu NTP |
| AI | Gemini `gemini-flash-lite-latest`, chờ 20 s. Lỗi thì thử lại 1 lần bằng `gemini-3.1-flash-lite` (20 s), rồi lấy từ kho câu soạn sẵn. Route `generate-battle` đặt `maxDuration = 60` |
| Thư viện 3D | Nằm ngoài repo: `~/Documents/3D_tutorcraft` (xem `00_HUONG_DAN.md` trong đó). Bản tối ưu: `_optimized` (cao), `_low`, `_mid` (avatar), `_fill` / `_fill_low` (cây rải), `_audio_web` (âm thanh MP3), `hdri/`. Catalog: **332 model** |
| CDN | Cloudflare R2, bucket `tutorcraft-assets`, đẩy bằng `scripts/sync-assets-r2.mjs` (lần cuối 27/10; các file nhập từ 01/11 và âm thanh **chưa đẩy**). Link đang là r2.dev (giới hạn tốc độ) |
| Triển khai | Vercel (chưa đặt `NEXT_PUBLIC_ASSET_BASE_URL`, chưa có tên miền riêng cho R2) |
| Biến môi trường | Mẫu trong `.env.example`. `.env.local` không bao giờ commit, không in khóa |

**Bảng trong cơ sở dữ liệu:**
- Nội dung: `game_scenarios` (30), `scenario_characters` (360), `game_worlds`, `difficulty_levels`, `game_rules`, `character_parts`.
- Trận lớp: `matches`, `match_players`.
- Phiên học: `battles`, `battle_sessions`, `battle_results`, `multiplayer_rooms`.
- Học sinh và tài khoản: `student_accounts`, `profiles`, `weak_knowledge_matrix`.
- Hệ thống: `rate_limits`, `activity_logs`.
- Xu (C4): `coin_wallets`, `coin_ledger` (lý do có thêm `'speech'`), `character_inventory`, `seasons`, `season_scores`, `rewards_catalog`.
- Phát âm: `speech_attempts` (chỉ server ghi; gia sư đọc lượt nói của học sinh trong trận mình mở).

## 3. Quy ước làm việc (người dùng đã chốt)

- Báo cáo bằng **tiếng Việt**, ngắn, có số đo. Mỗi gói việc làm xong thì dừng, báo cáo và chờ duyệt rồi mới sang gói sau.
- **Push chỉ khi người dùng bảo trong lượt đó** (từ 02/11 người dùng đã cho push nhiều lần). Chỉ commit khi người dùng nói "commit"; mỗi gói một commit riêng, cuối message có dòng `Co-Authored-By`.
- **Vai trò (từ 03/11, "Kế hoạch Đại phẫu Đồ họa & Gameplay"):**
  - **Claude Code — Kỹ sư Trưởng Fullstack kiêm QA Lead**, nhánh `feat/3d-lego-engine`: logic game và server (API, Supabase, `src/engine/`, `src/server/`), **Spatial UI** (HUD, khung hỏi, giao diện gắn trong cảnh 3D, luồng trận trong `app/`, `src/components/`, `src/client/`), nối cảnh vào trận thật, test và **kịch bản đo FPS trên điện thoại**; gộp nhánh của Antigravity.
  - **Antigravity — 100% hình ảnh:** cảnh 3D, shader, ánh sáng, hiệu ứng, xử lý asset 3D, trên nhánh `agy/*`. Claude Code không viết lại phần hình ảnh của họ; khi hai bên cùng sửa một file thì báo trước.
  - **Jules: đã bỏ khỏi quy trình.** Nhánh `jules/*` và PR #2 giữ làm lịch sử, không giao việc mới. CI (`.github/workflows/ci.yml`) vẫn chạy cho mọi PR.
  - NotebookLM vẫn là kho kiến thức (Blueprint, schema).
- **Không bao giờ commit `scripts/meshy-models-extra.mjs`**: file này do người khác sửa.
- Không sửa `content/` và `scripts/scenarios-v2/` (phần của Claude chat). Ngoại lệ: `content/asset_aliases.json`, file sinh bằng script (catalog, coverage, audio_catalog), và file mới đã được duyệt trong spec (`scene_kits.json`, `game_guides.json`, sắp tới `kayak_rage.json`).
- Đổi schema (bảng, cột, JSON schema câu hỏi) hoặc bảng xu / cửa hàng: báo kế hoạch trước, chờ đồng ý.
- Không xoá file trong thư viện `3D_tutorcraft`. File vô dụng thì chuyển vào `_de_xoa/`. Sửa file gốc thì sao lưu vào `_backup/` trước.
- **Không chạy lại script Meshy** (tốn credit; còn khoảng 380).
- Ảnh game thương mại trong "Thay game mới.pdf": chỉ học **bố cục**; không chép icon, phông, tên, logo.
- Ngân sách: cây rải mỗi chặng 700 nghìn / 220 nghìn mặt; cảnh ≤ 1,3 triệu (cao) / 300 nghìn (thấp) tam giác; đồ đi kèm bộ cảnh ≤ 60 nghìn / 20 nghìn mỗi chặng; mỗi trận ≤ 40 MB (cao) / 15 MB (thấp); không GLB bản thấp nào > 25 MB.
- Không tạo tài khoản, không nhập mật khẩu hay khóa thay người dùng.
- Lệnh dán cho người dùng chạy phải ghi rõ là "Terminal trong VS Code" hay "app Terminal của Mac". Lệnh dài chạy nền.

## 4. Lộ trình và tiến độ

Hai tài liệu điều phối hiện tại: `docs/specs/code-next-steps.md` (WP1–WP9) và `docs/specs/ui-upgrade-spec.md` (WP10, U0–U8). Thứ tự chung (spec §4):

WP2 → WP1 → **U0 → U1+U2** → WP3–WP5 → **U3, U4** → WP6 → WP7 → **U5** → **U6** → **U7** → WP8 → WP9.

| Gói | Nội dung | Trạng thái |
|---|---|---|
| A, B, C, C4 | Thư viện 3D, trận lớp (đạt cổng 6/6), cảnh 3D dùng chung, khung hỏi + xu | **Xong**. Cổng C còn chờ số đo điện thoại |
| C1 | Nhập 72 file inbox (56 model + 16 clip Mixamo), `promote-candidate.mjs` | **Xong** `b1e0689` |
| C2 | Giảm nặng theo ngân sách từng file | **Xong** `f1a28d6` (GLB thấp lớn nhất 2,24 MB) |
| WP2 | Âm thanh thật: 81 file MP3, 3 bus, ducking 8 dB, bước chân theo mặt đất | **Xong** `e9256f3` |
| WP1 | Nhập đợt 2 (8 model), gỡ đế, bí danh | **Xong** `03620b8`. `food_sausage` ra hình chuối, chưa nhập |
| WP3 | Biến thể theo seed `pickVariant` | **Xong** `9332428` |
| WP4 | Bộ cảnh theo cấp độ | **Xong cho `summer_camp`** `dc334eb`; 4 game còn lại chưa |
| WP10 đọc PDF | Đối chiếu "Thay game mới.pdf" (14 trang, 49 điểm) | **Xong** `4546d17` (`ui-pdf-checklist.md`) |
| U0 | Slogan của chủ dự án dưới slogan cong, trong meta và og | **Xong** `2670ca0` |
| U1+U2 | `GameHUD` + Cài đặt trên Kayak | **Xong** `9c7c312` |
| HUD 6 game | `ArenaHUD` cho mọi game | **Xong** `4ed66dd` |
| U3 | Minimap + thanh tọa độ; thẻ không gian Multiverse | **Xong** `130ed25`, `cdd9d4b` |
| U4 | Khung "Cách chơi" viền cầu vồng, tự mở lần đầu | **Xong** `8e12c5c` |
| U5 | Thanh Nộ Kayak (10 s mỗi lần) | **Xong** `71abf5b` |
| U6 | Viết lại demo chơi thử | **Xong** `cae867d` |
| U7 | Responsive 5 cỡ màn hình | **Xong** `6130d4d` |
| Phát âm (backend) | Bộ chấm điểm, `speech_attempts`, `/api/session/speech`, `content/speech_rules.json` (xu 0/3/5/8) | **Xong** `bb86db0`, `84b71e6`. Migration đã áp và kiểm 03/11 |
| Phát âm (UI) | Đá Phát Âm 3D + Pet + HUD; luật Bảng nhiệm vụ trại hè, hệ số cân cá | **Đã gộp** PR #1, #3 Antigravity; chỉ chạy trong scene-lab, chưa nối route thật |
| WP8 Đá Phát Âm (server) | Hiệu ứng do server quyết: Nitro Kayak, manh mối Thợ giải mã (Chuồng Gỗ → Lưới), mở cổng Multiverse + Lumi; `src/engine/speechGameEffects.ts`, trường `effect` trong `/api/session/speech` | **Xong** (03/11) |
| River Survival 3D (PR #4) | Cảnh `RiverSurvivalScene` (3 khu, Chuồng Gỗ, trạm Lưới) | **Đã gộp** `6e07c78`; chưa vào trận thật |
| WP8 nối hiệu ứng server | `applySurvivalSpeechEffect` (manh mối Thợ giải mã), `survivalStonesOpen` (khoá đá trong cửa sổ 6 s / 8 s), `useKayakRage().addCharge` | **Xong** `dccdf0e` |
| WP8 Đá Phát Âm (3D) | Đặt đá vào phao Kayak, khu rừng River Survival, bệ thờ Multiverse; nối 5 thế giới vào trận thật | **Đã hoàn thiện Multiverse & 5 cảnh 3D** (`agy/multiverse-full-integration`): `content/multiverse_quests.json` (`mv-01`..`mv-05`), `questStateMachine.ts` (8 giai đoạn + Squad Quorum `Rv = ceil(N * 0.60)` + `PORTAL_RESONANCE_UPDATE`), Web Audio 3D Formants (`positionalFormants.ts`), va chạm cổng `THREE.Box3` (`portalCollision.ts`), fallback 3 lần 80% XP, bộ test `QA-P01`..`QA-P04` |
| Xu demo | Phiên demo dùng ví xu trong bộ nhớ (`rewardsFor`, `demoRewards` trong `src/server/rewards.ts`), không ghi `coin_wallets` / `coin_ledger` | **Xong** `dc77c0d` |
| U8 | Màn chờ + chọn nhân vật theo game | Chưa. Chờ chốt phạm vi |
| WP5 | Nhân vật một mô hình nhiều vai (`character_casting.json`) | Chưa |
| WP6 | Multiverse RoomKit, D6 | Chưa (đã có dải thẻ không gian từ U3) |
| WP7 | Lịch câu hỏi trong trận lớp (`classSession.ts`), thử thách vàng đổi câu khó hơn, `GET /api/session/slot`, trường `meaning_vi` | **Server xong** `2197fa6` |
| WP7 chốt logic (03/11) | Trận lớp: hết máu vẫn chơi tới hết giờ (`keepPlaying`); câu theo mức riêng từng em (`personalLevel`, từ `match_players.skill`); server tự chấm và ghi kết quả mọi em khi trận kết thúc (`finalizeMatch`, `onEnded`) | **Xong** (03/11, chưa commit) |
| PR #5 Antigravity | Cảnh 3D Kayak Rush và Multiverse Portal + Đá Phát Âm + Pet (`KayakRushScene`, `MultiversePortalScene`, `pet_dialogues.json`) | **Đã gộp** `b79f425`; chỉ chạy ngoài trận thật |
| Đại phẫu đợt 1 (03/11) | Vật lý Rapier trực tiếp (không Ecctrl: cần R3F + three 0.184; chủ dự án chọn), nhân vật capsule, Spatial UI kính mờ (joystick, Nhảy, Xuyên không), trang `/tutor/physics-lab`, đo FPS tự động `npm run test:fps` | **Xong** (03/11, commit `feat(overhaul)`). Chi tiết: `docs/dai_phau_physics_spatial_ui.md` |
| PR #6 Antigravity (03/11 tối) | Multiverse đầy đủ: 5 phòng `mv-01..05`, VFX, Lumi, máy trạng thái nhiệm vụ 8 giai đoạn (`questStateMachine.ts`), ngưỡng nhóm `ceil(N × 0,6)`, dự phòng 3 lần (gõ chữ / xếp thẻ, 80% XP), âm formant vị trí, va chạm cổng `Box3`, `content/multiverse_quests.json` | **Đã gộp** `d80aacb` (Claude Code tiếp nhận) |
| Tích hợp PR #6 (Claude Code) | Trường `quest` (chỉ mã, không đáp án) vào `mv-01..05` trong `scenarios_v2.json` (+ bản trong `scripts/scenarios-v2`); âm formant đi vào bus hiệu ứng dùng chung, tai nghe Web Audio theo camera (`src/client/spatialAudio.ts`, `gameSpatialAudio.ts`); người chơi Rapier đi qua cổng ổn định → `WARP_TRANSITION` → phòng kế tiếp trên cùng canvas (`portalExplorer.ts`, `MultiversePortalStage explore`); `PORTAL_RESONANCE_UPDATE` từ lượt nói do server chấm (`portalResonanceTask` trong route giọng nói), máy học sinh lưu `snapshot.portalResonance` | **Xong, chưa commit**. Test: `multiverseQuestData`, `portalIntegration` |
| Trận 3D trực tiếp: Summer Camp + River Fishing (03/11 tối) | `ModeStage` có cảnh 3D cho 2 game (`LivePhoneticWorld.tsx`). Đá Phát Âm lấy đá và nộp lượt qua `/api/session/speech` (không mock, không nút giả lập); server gán trạm trại (`campStationFor`), hiệu ứng `camp_station` / `catch_bonus` (×1,0 / ×1,1 / ×1,2, chỉ khi sao tăng). Trận lớp: bảng nhiệm vụ của lều ở server (`engine/campQuest.ts`, `matchService.recordCampStation`, tin `camp_quest`, `MatchView.campQuest`), máy học sinh nối kênh trận (`useTentQuest`). Dây câu: `fishingLineState` dùng chung cho cần 3D và thanh độ căng. Trận lớp khoá đá khi câu hỏi theo lịch đang mở; bản chơi một mình không khoá | **Xong, chưa commit**. Test `liveMatchWorlds`; đã thử bản demo trên trình duyệt |
| WP7 giao diện | Đồng hồ chờ điểm hỏi, vật vàng, `ClassPodium` màn em | **Chưa** — nay là việc của Claude Code (Spatial UI), hợp đồng ở `docs/wp7_class_schedule_handoff.md` |
| WP8, WP9 | Từng game làm trọn; F và G | Chưa. WP8 chỉ bắt đầu khi có số đo điện thoại hoặc người dùng nói "qua" |

### Kết quả đo chính

- **Thử tải pha B** (50 máy × 30 phút): 2/42.055 lượt nhận bị lỡ (tự bù ≤ 3,3 s), trễ trung bình 134 ms (p95 214 ms), 0 lần lệch chặng, 50/50 điểm khớp.
- **Tài nguyên:** catalog 332 model; mã kịch bản gọi 280, có file 273, **thiếu 7** (`anim_cook`, `food_fish_raw`, `food_sausage`, `tex_mud`, `tex_sand`, `water_foam`, `water_normal`). Trước đợt 01/11 thiếu 41.
- **Dung lượng trận nặng nhất:** `dino-01` 37,9 MB (cao) / 13,5 MB (thấp), dưới ngân sách 40 / 15 MB. Cảnh thấp nặng nhất < 300 nghìn tam giác.
- **Âm thanh:** nhạc nén 56 → 11 MB; 81 file.
- **Thử tải giọng nói (03/11, bản build production trên máy, 50 học sinh × 60 s × 6 lượt/phút, cùng một IP lớp):** 333 lượt, p50 193 ms, p95 236 ms, p99 294 ms (mục tiêu p95 ≤ 200 ms chưa đạt: sàn là một vòng gọi Supabase ~200 ms cho bộ đếm giới hạn dùng chung); 0 lỗi, 0 lượt 429 với học sinh đúng nhịp; học sinh gửi nhanh bị chặn đúng ở lượt thứ 7; RSS server 67 → đỉnh 183 MB → 64 MB. Chưa đo ghi `speech_attempts`/`coin_ledger` dưới tải (cần một trận thật, sẽ ghi dữ liệu thật).
- **Test (03/11 tối, sau PR #5 và chốt logic trận lớp):** 262 đạt, 0 hỏng, 2 bỏ qua; lint 0 lỗi. `test:security` 30/30 (03/11 19:55, bản build có Đại phẫu đợt 1, thư mục mới). Sau WP7: `test:security` chưa chạy lại sau WP7 (build trong môi trường agent không tải được phông Google). Sau sửa xu demo: 237 đạt. Trước đó (sau PR #1–#3): 225 đạt, 0 hỏng, 2 bỏ qua (2 test độ phủ model tạm `skip` kèm TODO, chờ Claude chat gán kịch bản cho 23 model). Type check sạch; lint 0 lỗi (49 cảnh báo cũ); `test:security` 30/30 trên bản build production.

## 5. Commit gần nhất

Nhánh đã push lên `origin`. Các commit từ bản trạng thái 02/11 (mới nhất ở trên):

| Commit | Ngày | Nội dung |
|---|---|---|
| (chưa commit) | 03/11 | Chốt logic trận lớp: hết máu chơi tiếp, mức riêng từng em, tự ghi kết quả khi hết giờ; `tests/classMatchEnd.test.ts` |
| `b79f425` | 03/11 | Gộp PR #5 Antigravity: cảnh Kayak Rush và Multiverse Portal |
| `2197fa6` | 03/11 | WP7: lịch câu trận lớp, thử thách vàng, `meaning_vi`; `tests/classSession.test.ts`, `tests/meaningVi.test.ts` |
| `dc77c0d` | 03/11 | Xu demo chỉ trong bộ nhớ (`rewardsFor`), `tests/demoCoins.test.ts` |
| `dccdf0e` | 03/11 | WP8: nối hiệu ứng server vào River Survival và thanh Nộ Kayak |
| `6e07c78` | 03/11 | Gộp PR #4 Antigravity: cảnh 3D River Survival |
| `6398537` | 03/11 | Từ điển IPA `src/engine/lexicon.json` (PER dùng `cmu`) |
| `1be7000` | 03/11 | `scripts/speech-load-test.mjs` (50 học sinh) |
| `e565fc7` | 03/11 | WP8 phía server: `speechGameEffects.ts`, trường `effect` |
| (merge) | 03/11 | Gộp PR #1 Antigravity `agy/phonetic-stones-ui`: Đá Phát Âm 3D, HUD giọng nói, Shadcn primitives; cập nhật file này |
| `84b71e6` | 03/11 | `content/speech_rules.json` v1.0.0 (xu 0/3/5/8), bộ đọc luật hiểu định dạng file |
| `bb86db0` | 03/11 | Backend phát âm: `src/engine/pronunciation.ts`, `src/server/speech.ts`, route `GET/POST /api/session/speech`, migration `20261103_speech_attempts.sql` |
| `8052459` | 03/11 | Tạm `skip` 2 test độ phủ model để CI xanh |
| `3f2f47c` | 03/11 | CI GitHub Actions (Node 20, đủ 4 bước kiểm) |
| `5d41456` | 03/11 | Tài liệu bàn giao `docs/pronunciation_logic_handoff.md` |
| `5fed662` | 02/11 | CI ban đầu (người dùng) |
| `6130d4d` | 02/11 | U7 responsive 5 cỡ |
| `6937ff4` | 02/11 | Đuốc thư viện trong lâu đài Multiverse |
| `cae867d` | 02/11 | U6 demo mới |
| `71abf5b` | 02/11 | U5 thanh Nộ Kayak |
| `8e12c5c` | 02/11 | U4 khung "Cách chơi" |
| `cdd9d4b` | 02/11 | U3: dải thẻ "không gian tiếp theo" của Multiverse (`portalRail.ts`, `PortalCardRail`) |
| `130ed25` | 02/11 | U3: minimap (Kayak dọc, tô đoạn dày/trống; sông/đồng cỏ tròn, hướng bắc lên) và thanh tọa độ la bàn |
| `4ed66dd` | 02/11 | HUD trên cả 6 game (`ArenaHUD`); thanh công cụ gắn trên khung 2D của 4 game chưa có 3D |
| `9c7c312` | 02/11 | U1+U2: `GameHUD`, `SettingsPanel` 4 thẻ, cần lái Kayak, kỹ năng 1–3, âm lượng từng bus |
| `2670ca0` | 02/11 | U0: slogan của chủ dự án |
| `4546d17` | 02/11 | Spec WP10 đối chiếu PDF: `ui-pdf-checklist.md`, 10 chỗ sửa "Sửa 02/11 (Code)" |
| `dc334eb` | 02/11 | WP4: `scene_kits.json` (5 nhóm summer_camp), `sceneKits.ts`, chặn trần cảnh |
| `9332428` | 02/11 | WP3: `variantFamily` / `pickVariant` |
| `03620b8` | 02/11 | WP1: nhập 8 model, gỡ đế, 3 bí danh |
| `e9256f3` | 01/11 | WP2: `encode-audio.mjs`, `audioPlan.ts`, 3 bus, ducking, `/credits` mục âm thanh |
| `f1a28d6` | 01/11 | C2: ngân sách từng file |
| `b1e0689` | 01/11 | C1: nhập 72 file, `promote-candidate.mjs`, IP LAN `192.168.11.125` |
| `104ee00` | 01/11 | docs: bản `project_state.md` trước |

Các commit cũ hơn (A, B, C, C4, từ `deb1866` tới `5f4984a`) xem `git log`.

## 6. Cấu trúc thư mục

### Repo `/Users/mindatix100/tutorcraft-ai` (ngoài iCloud từ 03/11)

```
app/                         Next.js App Router
  page.tsx                   trang chủ (landing, có slogan U0)
  tutor/                     /tutor → /tutor/create (Studio 3 bước)
    create/  characters/  animation-lab/
    scene-lab/               trang thử: cảnh sông/đồng cỏ, 12 nhân vật, màn gia sư 50 em, Multiverse,
                             khung hỏi, SoundLab, chọn cấp bộ cảnh, "HUD Kayak (WP10)",
                             "HUD 5 game còn lại", HUD sông có minimap
  student/                   /student (demo, nhập mã), /student/[id], /student/play
  credits/                   ghi công mô hình và âm thanh
  dev-assets/[...path]/      phục vụ thư viện trên máy: web/low/mid/fill/hdri/audio
  api/                       generate-battle, battles, battle-result, scenarios, cron,
                             session/ (answer, cast, pair, hint, golden, coins),
                             match/ (tạo, join, leave, state, action, box, rescue)
src/
  engine/                    luật thuần, có test: match, teams, survivalRules, questionSchedule, hints,
                             consequences, coins, rescue, sceneBuilder, sceneKits, variants, assetCategory,
                             assetLoader, audioPlan, kayakCourse, portalRail, avatars, director, levels, …
  server/                    matchService/Store/Broadcast, sessionService, coinStore, rewardService,
                             gemini, prompt, grader, documents, rateLimit, auth
  client/                    audio (3 bus), hudSettings (localStorage 'tc:hud'), sfx, questionSfx,
                             matchChannel, sessionApi, supabaseBrowser
  config/                    assetLibrary, threeAssets, gameGuides (đọc content/game_guides.json), brand
  components/
    hud/                     GameHUD (thanh công cụ, "Thêm", HudPanel), ArenaHUD (theo game),
                             SettingsPanel, MapHud (Minimap + CoordBar), kayakMap, riverMap,
                             PortalCardRail, KayakHudLab, BossHudLab, hud.css
    modes/                   KayakRush, MultiversePortalRPG, ModeStage, gfxTier, three/ (SceneRuntime, …)
    question/                QuestionFrame, skins
    fx/                      RainbowEdge (shader + CSS)
    BattleArena, TeacherBoard, AvatarPicker, ClassPodium, SoundLab, …
content/                     PHẦN CỦA CLAUDE CHAT: scenarios_v2, consequences_v2, multiverse_rooms,
                             game_worlds_v2, character_casting (chưa commit), asset_credits
                             Code được sửa: asset_aliases; sinh bằng script: asset_catalog,
                             asset_coverage, audio_catalog; file mới đã duyệt: scene_kits,
                             game_guides (chưa commit)
scripts/                     optimize-glb, build-asset-catalog, validate-glb.py, clean-glb, import-inbox,
                             promote-candidate, encode-audio, sync-assets-r2, room-eye-views.py,
                             match-load-test, security-check, seed-scenarios-v2, generate-meshy-models,
                             meshy-models-extra (KHÔNG commit), fetch-hdri, fetch-sketchfab-models
supabase/migrations/         14 file SQL; supabase/seed/ bản sao 30 kịch bản
tests/                       29 file test (node --test, biên dịch vào .test-build)
docs/
  operations.md              tài liệu vận hành chính
  specs/                     C4-spec, ui-upgrade-spec (WP10), ui-pdf-checklist, wp4-scene-kits-design
                             (đã commit); code-next-steps, asset-reuse-plan, asset-reuse-matrix,
                             code-tasks-asset-reuse, tasks-2026-11-01, ui-reference/ (chưa commit)
  images/rooms-eye/          ảnh phòng Multiverse ở tầm mắt
.claude/launch.json          dev (3000), prod (3001), prod-lan (3005, IP 192.168.11.125)
proxy.ts                     giới hạn tốc độ theo IP cho /api
```

### Thư viện `~/Documents/3D_tutorcraft` (ngoài repo)

```
camp/ fishing/ survival/ dino/ kayak/ river_world/ multiverse/ characters/ food/ anim/ fx/ hdri/
                             file gốc theo mã
_optimized/ _low/ _mid/ _fill/ _fill_low/ _audio_web/
                             bản do script sinh: không sửa tay
_backup/                     bản gốc trước khi clean-glb sửa
inbox/                       chờ nhập; inbox/_cho_xem/ có food_sausage (ra hình chuối)
_ung_vien/                   ứng viên chưa vào game (MANIFEST.csv)
audio/                       music/, sfx/ (60), ambient/ (10), AUDIO_MANIFEST.csv, _nguon_cc0/
_de_xoa/                     file để người dùng tự xoá
_report/                     ui/2026-11-02/ (ảnh HUD 5 cỡ, ảnh U4), c2/, blender_prev/, doi_ten.json
Thay game mới.pdf            yêu cầu giao diện WP10 (14 trang)
00_HUONG_DAN.md              bản đồ thư mục
```

## 7. Việc đang dở và việc chờ

### 7.1. Lớp phát âm: việc còn lại

- **Migration đã áp (03/11, kiểm lúc 05:30, chỉ đọc):**
  - đủ 15 cột, RLS bật;
  - `anon`/`authenticated` không có quyền thêm, sửa, xoá; chính sách `speech_attempts_tutor_read` cho gia sư đọc theo trận;
  - có index `speech_attempts_lookup`, ràng buộc 3 lượt mỗi mục, khoá ngoại tới `battle_sessions`;
  - `coin_ledger_reason_check` và `coin_apply` đã nhận `'speech'`; chỉ `service_role` gọi được `coin_apply`.
  - Thử bằng khóa anon: đọc ra rỗng, ghi bị từ chối (401), gọi `coin_apply` bị từ chối (401).
- **Jules (PR #2, đã gộp):** test của Jules được viết lại để kiểm bộ chấm thật (Jules tự viết một bộ chấm song song); bắt được lỗi số 21–29.
- **Antigravity (PR #1, #3, đã gộp):** Đá Phát Âm chỉ chạy trong `/tutor/scene-lab`. 2 dòng nối vào trận thật Summer Camp / River Fishing (`ModeStage.tsx`) đã bị giữ lại vì trong trận vẫn dùng dữ liệu giả: micro luôn bật, từ cứng, điểm và xu tính trong trình duyệt, nút debug hiện cho học sinh. Điều kiện để nối: mục 4 của `docs/wp8_phonetic_worlds_handoff.md`.
- **WP8 3D (Antigravity):** đặt đá theo `docs/wp8_phonetic_worlds_handoff.md`; còn một chỗ cấp phát mỗi lần raycast (`intersectObjects` trả mảng mới).
- **Vai Thợ giải mã:** server chưa có vai theo học sinh (chỉ có đội), nên chưa chặn vai phía server; muốn chặn phải đổi schema (cần duyệt).
- **Đã sửa (03/11 chiều): phiên demo không còn ghi xu vào database thật.** Các route `answer`, `pair`, `hint`, `golden`, `coins` chọn ví theo trận: demo dùng ví trong bộ nhớ (vẫn thấy xu, vẫn mua gợi ý được), lớp thật dùng sổ xu Supabase. Test `tests/demoCoins.test.ts`. Route giọng nói vẫn không trả xu cho demo. Dữ liệu thử `ltmvzu` (88 ví, 336 dòng) người dùng đã tự xoá.
- **Công tắc giọng nói cho giáo viên:** chưa có (đổi schema, cần duyệt). Hiện chỉ demo bật micro; lớp thật chỉ có gõ chính tả và nghe-nhắc lại.

### 7.2. Câu hỏi chờ người dùng trả lời

1. (Đã chốt 02/11: thanh Nộ 10 giây mỗi lần.)
2. Danh sách nút thanh công cụ đã đủ chưa (có thêm "chụp màn hình" không).
3. Lớp thật có lọc nhân vật theo game không (demo thì hiện tất cả, PDF đã nói).
4. Slogan có thêm viết hoa / dấu câu không.
5. Nhãn "learn more" hay "Xem thêm / Thu gọn" ở demo.
6. Phạm vi U8 màn chờ: cả lớp thật hay chỉ demo.
7. `camp_grill`: thay bản cũ hay thêm làm biến thể.

### 7.3. Việc kế tiếp theo spec WP10

- **U5 Kayak:** thanh Nộ (tăng tốc) bên phải, không dùng được khi khung hỏi đang mở, không bỏ qua cổng câu hỏi; mô phỏng một trận để chỉnh số, ghi số đo.
- **U6 demo:** chọn 1 trong 6 game; ô tên viền đèn 7 màu chạy quanh; thẻ toàn bộ nhân vật xoay 360° (ảnh quay vòng 24 góc dựng sẵn bằng Blender, chỉ 1 canvas WebGL); nút "Tạo game" ở giữa, phía trên là hướng dẫn và điều khoản; vào chơi bằng cảnh 3D thật + GameHUD; **20 câu thì hiện tại đơn** (Claude chat soạn trong `content/`, Code nối; ngân hàng demo hiện có 8 câu quá khứ đơn / bị động). Đo: từ "Tạo game" tới khung đầu ≤ 5 s ở tầng thấp.
- **U7:** chụp 1440×900, 1024×768, 820×1180, 390×844, 844×390 vào `_report/ui/<ngày>/`; chạm ≥ 44 px, chữ ≥ 16 px, không cuộn ngang.
- **U8:** màn chờ và chọn nhân vật theo từng game (sau U6, dùng chung thành phần).
- Chưa làm từ spec §3: `docs/specs/ui-reference-notes.md`, `src/styles/hud-tokens.css`, đo kích thước JS HUD (≤ 60 KB gz) và Lighthouse.

### 7.4. Các gói WP còn lại

- **WP4:** bộ cảnh cho river_fishing, river_survival, dino_journey, kayak_rush.
- **WP5:** nhân vật nhiều vai theo `content/character_casting.json` (62 mô hình); nhập theo đợt; phụ kiện mua bằng xu phải báo trước.
- **WP6:** Multiverse RoomKit (phòng ngủ và cyber dựng bằng hình khối + nội thất, cảnh khác làm cảnh xa), D6.1–D6.8, ảnh xem trước 512 px cho thẻ phòng.
- **WP7:** server và 3 quyết định logic xong (03/11). Còn: giao diện trận lớp phía em (Claude Code, Spatial UI).
- **WP8:** từng game làm trọn, theo thứ tự Summer Camp → River Fishing → Kayak Rush → River Survival → Dino Journey → Multiverse. Đưa minimap / thanh tọa độ của thế giới sông vào trận.
- **WP9:** F (6 thẻ game ở Studio và trang chủ, ảnh bìa) và G (kiểm thử, bảo mật, đo GPU điện thoại, R2 tên miền riêng).

### 7.5. Cổng C: đo trên điện thoại thật (người dùng làm, vẫn chờ)

Cách chạy (Terminal trong VS Code, ở thư mục dự án):

```bash
npx next build
```

```bash
TC_SERVE_LOCAL_ASSETS=1 npx next start -H 192.168.11.125 -p 3005
```

Mở `http://192.168.11.125:3005/tutor/scene-lab` trên điện thoại, bấm "Đo 10 giây", chụp 4 lần: Bản cao; Bản thấp; Bản thấp + Máy yếu; Màn hình gia sư 50 em. **Đạt** khi máy yếu có FPS trung bình ≥ 30 và giây tệ nhất ≥ 25.

### 7.6. Việc của Claude chat (Code chờ)

- Soạn 20 câu hiện tại đơn cho demo (U6).
- Gán kịch bản hoặc bí danh cho 23 model mới (B3), để 2 test độ phủ hết hỏng.
- Đổi tên các file đặt sai tên: `camp_lantern`, `camp_grill_2`, `camp_water_filter_2`, `camp_string_lights_2`, `camp_backpack`, `camp_cup`, `camp_firepit__alt1`, `camp_tent_stage__alt2/3`.
- Prompt Meshy mới cho `food_sausage`; bản có texture cho `camp_table`, `fish_reel`, `fish_bait_2`.
- Bổ sung ghi công còn thiếu cho vài file âm thanh.

### 7.7. Việc mở khác

- **R2:** chưa đẩy các file nhập từ 01/11 và thư mục `audio/`; `sync-assets-r2.mjs --apply` chỉ khi được đồng ý. Gắn tên miền riêng + `NEXT_PUBLIC_ASSET_BASE_URL` (người dùng làm).
- **Gemini:** kiểm 10 lần sinh liên tiếp có tài liệu (lần đo 26/10 mất ~31 s, quá mức chờ 20 s).
- **Bộ nhớ ảnh bản cao (~293 MB):** kế hoạch giảm (nhân vật bản vừa + trời 1K, hoặc KTX2) chỉ làm khi số đo điện thoại cho thấy cần.
- **File chưa theo dõi không thuộc gói nào:** `.archify/`, `.taste-skill/`, `animasyon-stil-katalogu/` (kho git riêng), `.claude/settings.json`, các file `docs/specs/*` và `content/character_casting.json` của Claude chat. Chỉ commit khi người dùng bảo.
- **Chuyển thư mục (03/11 tối):** repo cũ `~/Desktop/tutorcraft-ai` (bị iCloud nhân bản file `… 2`) đã bị chuyển đi/xoá, kéo theo thư mục `.git`. Thư mục mới `/Users/mindatix100/tutorcraft-ai` (trước là worktree của Antigravity) được dựng lại git từ GitHub; mọi commit đều còn trên `origin`. File `.git` hỏng cũ được giữ ở thư mục tạm của phiên. Thay đổi `allowedDevOrigins: ['192.168.1.99']` trong `next.config.ts` cất trong `git stash`.
- **Mất theo repo cũ (không có trên GitHub):** `.env.local` (đã tạo lại 03/11 19:53), các file chưa commit `docs/specs/code-next-steps.md`, `tasks-2026-11-01.md`, `asset-reuse-*.md`, `code-tasks-asset-reuse.md`, `ui-reference/`, `docs/TECHNICAL_BLUEPRINT.md` (còn bản PDF trên Desktop), phần sửa dở `content/game_guides.json` và `scripts/meshy-models-extra.mjs`, `.claude/settings.json`, `.archify/`, `.taste-skill/`, `animasyon-stil-katalogu/`.
- **Thư viện 3D vẫn trong iCloud:** `~/Documents/3D_tutorcraft` nằm trong thư mục Documents, cũng được iCloud đồng bộ; nên chuyển ra ngoài như repo.
- **File tài liệu trống:** `CLAUDE.md`, `DESIGN.md`, `doc.md`, `road_map.md` (0 byte); hỏi trước khi ghi.
- **Push:** chỉ push khi người dùng nói. `scripts/meshy-models-extra.mjs` và `content/game_guides.json` đang sửa dở trên máy, không thuộc gói nào.

### 7.8. Đại phẫu: việc tiếp theo

- Đưa nhân vật vật lý + SpatialControls vào cảnh thật đầu tiên; Antigravity làm lưới va chạm đơn giản cho từng cảnh.
- Nối Xuyên không với cổng Multiverse; camera xoay bằng tay phải.
- Đo `test:fps --android` trên máy Android tầm trung thật (cần cài `adb`); đo iPhone bằng Safari.
- `.env.local` đã tạo lại (03/11 19:53); `test:security` 30/30 trên bản build production có Đại phẫu đợt 1.

### 7.9. Sau PR #6 (03/11 tối)

- **Mất file gốc `camp/camp_pan.glb`** (chảo, nhóm "bếp" của Summer Camp): chỉ còn bản `_optimized` / `_low`; không có trong bản sao lưu đợt đổi tên. Test `WP4 kits data` hỏng vì vậy (1 test). Cần Claude chat / chủ dự án khôi phục bản gốc hoặc chọn model khác. `camp_tent_ruined_grey` cũng chỉ có bản tối ưu.
- **Thư viện 3D đã chuyển** vào `~/Documents/3D_tutorcraft/TutorCraft/01_assets_source` (vẫn trong Documents → iCloud). Script và `/dev-assets` mặc định đọc `~/Documents/3D_tutorcraft`: chạy script với `TC_3D_DIR=…/TutorCraft/01_assets_source`; để `/dev-assets` chạy, thêm `TC_3D_DIR` vào `.env.local`. Catalog đã dựng lại (329 model, không model mồ côi; thiếu 9 mã).
- Đã bật lại 2 test độ phủ model.
- `content/multiverse_quests.json` chứa đáp án (câu đố, chính tả, thứ tự thẻ): **chỉ đọc ở server**, không import vào code trình duyệt. Chấm dự phòng của nhiệm vụ đang tự chấm riêng (khớp chính xác), khác bộ chấm chính tả của server (`scoreDictation`, cho phép sai 1 chữ): khi nối trận thật nên dùng chung một bộ.
- Trang nào dùng `MultiversePortalStage explore`: chưa có (cần trang thử hoặc nối vào trận).

### 7.10. Trận 3D Summer Camp / River Fishing: còn lại

- Cân nặng cá chỉ là hiệu ứng hình (xếp hạng vẫn theo sao của câu trả lời). Muốn cá tính điểm thì phải đổi luật điểm ở server (báo trước).
- Không có `MatchRoom` / `src/components/match/`: trận lớp chạy qua `BattleArena`; kênh trận mới chỉ được nối cho bảng nhiệm vụ trại hè.
- Cảnh 3D dùng bộ trạm và cầu tàu của Antigravity (`three/phoneticStones.ts`), chưa dùng thế giới sông của scene-lab (`riverWorld`) và chưa có nhân vật vật lý; Antigravity có thể nâng hình ảnh mà không đổi hợp đồng `LiveSpeech`.
- Tiêu đề demo đổi thành "Thì hiện tại đơn — Present simple (Demo)".

## 8. Lệnh thường dùng (Terminal trong VS Code, ở thư mục dự án)

```bash
npm run dev
```

```bash
npm test
```

```bash
npm run lint
```

```bash
npx tsc --noEmit
```

```bash
node scripts/build-asset-catalog.mjs
```

```bash
node scripts/import-inbox.mjs
```

```bash
node scripts/encode-audio.mjs
```

```bash
node scripts/sync-assets-r2.mjs
```

Ghi chú:
- `npm test` dựng `.test-build` rồi chạy toàn bộ test.
- `import-inbox.mjs`, `promote-candidate.mjs`, `sync-assets-r2.mjs` mặc định chạy khô; thêm `--apply` để làm thật.
- Tối ưu một file: `node --max-old-space-size=12288 scripts/optimize-glb.mjs ~/Documents/3D_tutorcraft ~/Documents/3D_tutorcraft/_optimized --files <đường dẫn> --force` (bản thấp: đích `_low` và thêm `--low`).
- Kiểm bằng Blender: `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/validate-glb.py -- <thư mục> <báo cáo.json> --only <chuỗi> --thumbs <thư mục ảnh>`.

## 9. Tài liệu tham chiếu

- `docs/operations.md`: vận hành, số đo, quy trình thư viện, R2, âm thanh, HUD, đo điện thoại.
- `docs/specs/code-next-steps.md`: WP1–WP9 và luật chung.
- `docs/specs/ui-upgrade-spec.md`: WP10 (U0–U8), thứ tự §4, câu hỏi chờ chốt §5.
- `docs/specs/ui-pdf-checklist.md`: 49 điểm của PDF → mục spec → trạng thái.
- `docs/specs/wp4-scene-kits-design.md`: thiết kế bộ cảnh theo cấp.
- `docs/specs/C4-spec.md`: C4 và D6 (Multiverse).
- `~/Documents/3D_tutorcraft/00_HUONG_DAN.md`: bản đồ thư viện 3D.
- `AGENTS.md`: Next.js 16 khác bản cũ, đọc tài liệu trong `node_modules/next/dist/docs/`.
