# TutorCraft AI: trạng thái dự án

Cập nhật: 01/11/2026. Nhánh `feat/3d-lego-engine`, HEAD `5f4984a`, đi trước `origin/feat/3d-lego-engine` 19 commit (chưa push).

Tài liệu này tổng hợp bối cảnh, tiến độ, cấu trúc thư mục và các việc đang dở. Chi tiết vận hành (số đo, lệnh, quy trình) nằm trong `docs/operations.md`. Các đặc tả nằm trong `docs/specs/`.

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
- **Câu hỏi:** có 6 dạng bài, chấm theo rubric AI; 7 cấp độ (Beginner = cấp 0 tới cấp 6); có phụ đề truyện theo cấp. Phần nội dung câu hỏi làm chung với bên nội dung (Claude chat).

## 2. Công nghệ và hạ tầng

| Phần | Chi tiết |
|---|---|
| Khung | Next.js **16.4.2** (App Router, Turbopack, `proxy.ts` thay middleware, `cacheComponents`, `RouteContext`). Bản này khác bản cũ: đọc `node_modules/next/dist/docs/` trước khi viết code đặc thù Next (xem `AGENTS.md`) |
| Giao diện | React 19.3, Tailwind 4. Turbopack biến mọi file `.css` thành CSS toàn cục (CSS module không chạy), nên dùng tiền tố `tc-rb-`, `tc-qf-` |
| 3D | three.js 0.170; lõi chung `SceneRuntime`; instancing; 3 cấp chi tiết avatar; bầu trời HDRI |
| Cơ sở dữ liệu | Supabase project `zzkwcjakdoprxurtapen`. 23 bảng đều bật RLS; 25 migration đã áp (mới nhất `20261027161930 coins_seasons`). Repo có 14 file trong `supabase/migrations/` (đặt tên theo ngày giờ Việt Nam). Migration áp qua MCP `apply_migration` |
| Realtime | Kênh `match:<id>`; tin phát qua REST có chữ ký ECDSA P-256; chống phát lại theo `seq`; đồng bộ đồng hồ kiểu NTP |
| AI | Gemini `gemini-flash-lite-latest`, chờ 20 s. Lỗi thì thử lại 1 lần bằng `gemini-3.1-flash-lite` (20 s), rồi lấy từ kho câu soạn sẵn. Route `generate-battle` đặt `maxDuration = 60` (Vercel Fluid: Hobby tối đa 300 s, Pro 800 s) |
| Thư viện 3D | Nằm ngoài repo: `~/Documents/3D_tutorcraft` (13 GB; xem `00_HUONG_DAN.md` trong đó). Bản tối ưu: `_optimized` (cao), `_low`, `_mid` (avatar ~5 nghìn mặt), `_fill` / `_fill_low` (cây rải ≤ 8 / 3 nghìn mặt), `hdri/` |
| CDN | Cloudflare R2, bucket `tutorcraft-assets`, đẩy bằng `scripts/sync-assets-r2.mjs` (27/10: 670 file, 287,8 MB). Thư mục: `web/ 244 · low/ 244 · mid/ 29 · fill/ 74 · fill_low/ 74 · hdri/ 5`. CORS cho `https://tutorcraft-ai.vercel.app` và `http://localhost:3000`. Link đang là r2.dev (giới hạn tốc độ) |
| Triển khai | Vercel (chưa đặt `NEXT_PUBLIC_ASSET_BASE_URL`, chưa có tên miền riêng cho R2) |
| Biến môi trường | Mẫu trong `.env.example`: `NEXT_PUBLIC_ASSET_BASE_URL`, `R2_*`, các biến Gemini (`GEMINI_PRIMARY_MODEL`, `GEMINI_RETRY_MODEL`, `GEMINI_*_TIMEOUT_MS`). `.env.local` không bao giờ commit, không in khóa |

**Bảng trong cơ sở dữ liệu:**
- Nội dung: `game_scenarios` (30), `scenario_characters` (360), `game_worlds`, `difficulty_levels`, `game_rules`, `character_parts`.
- Trận lớp: `matches`, `match_players`.
- Phiên học: `battles`, `battle_sessions`, `battle_results`, `multiplayer_rooms`.
- Học sinh và tài khoản: `student_accounts`, `profiles`, `weak_knowledge_matrix`.
- Hệ thống: `rate_limits`, `activity_logs`.
- Xu (C4): `coin_wallets`, `coin_ledger`, `character_inventory`, `seasons`, `season_scores`, `rewards_catalog`.

## 3. Quy ước làm việc (người dùng đã chốt)

- Báo cáo bằng **tiếng Việt**, ngắn, có số đo. Mỗi mục ghi rõ: xong / chưa / vướng.
- **KHÔNG push GitHub.** Chỉ commit khi người dùng bảo; mỗi đợt một commit riêng, cuối message có dòng `Co-Authored-By`.
- Không sửa `content/` và `scripts/scenarios-v2/`, vì phần đó Claude chat lo. Ngoại lệ là khi được cho phép, ví dụ catalog sinh bằng script.
- Đổi schema (bảng, cột, JSON schema câu hỏi): báo kế hoạch trước, chờ đồng ý.
- Không xoá file trong thư viện `3D_tutorcraft`. File vô dụng thì chuyển vào `_de_xoa/` để người dùng tự xoá. Sửa file gốc thì sao lưu vào `_backup/` trước.
- Ngân sách mặt giữ nguyên:
  - cây rải mỗi chặng 700 nghìn (cao) / 220 nghìn (thấp);
  - mỗi bản sao cây rải ≤ 8 nghìn / 3 nghìn;
  - mỗi trận ≤ 40 MB (cao) / 15 MB (thấp).
- Không tạo tài khoản, không nhập mật khẩu hay khóa thay người dùng. Không gửi email của người dùng đi đâu.
- Lệnh dán cho người dùng chạy phải ghi rõ là "Terminal trong VS Code" hay "app Terminal của Mac".
- Lệnh dài chạy nền; không chờ ở tiền cảnh lâu (người dùng từng dừng phiên vì việc này).

## 4. Lộ trình và tiến độ

Theo tài liệu "Nhiệm vụ phần code" (Claude Docs, đã ghim) và `docs/specs/C4-spec.md`.

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| A | Thư viện 3D: tối ưu, kiểm Blender, catalog, nạp model theo game; phụ đề 25 kịch bản; bỏ Unity; HDRI 2K ra khỏi git | **Xong** |
| B | Trận chung cả lớp: đồng hồ máy chủ, lệnh gia sư, sao, đội 60/40, luật Sinh tồn, tin có chữ ký, thử tải 50 máy | **Xong**, đạt cổng 6/6 (27/10) |
| C | Cảnh 3D dùng chung (`SceneRuntime`, dựng cảnh từ dữ liệu, dấu chân, hiệu ứng), avatar 3 cấp chi tiết, chọn avatar, âm thanh tổng hợp, tắt tiếng lớp, đạo diễn camera, trang thử `/tutor/scene-lab` | **Code xong. Cổng CHƯA đạt:** chờ số đo FPS trên điện thoại thật |
| C4 | Khung hỏi trong cảnh + RainbowEdge, bộ lập lịch câu hỏi, gợi ý 2 bậc (máy chủ), hệ quả đúng/sai, cứu hộ, xu/điểm/hộp quà/top 3 | **Xong** phần làm được bây giờ (gộp `80c3116`). Còn 4 việc chuyển sang D (mục 7.2) |
| Đợt tài nguyên 01/11 | Nhập 73 file inbox, giảm nặng, âm thanh, biến thể theo seed, bộ cảnh theo cấp, nhân vật nhiều vai, Multiverse RoomKit | **Chưa bắt đầu** phần Code (mục 7.1) |
| D | Game đầu tiên làm trọn; D4 kiểm vị trí Sinh tồn; D6 Multiverse (vòng lặp phòng và cổng) | **Chưa bắt đầu.** Chờ cổng C |
| E | Các game còn lại làm trọn, hệ quả riêng từng game (C4.15) | Chưa |
| G | Đo trên thiết bị thật (cổng 30 FPS máy yếu) | Đang chờ người dùng |

### Kết quả đo chính

- **Thử tải pha B** (50 máy × 30 phút, bản production):
  - 2/42.055 lượt nhận bị lỡ, đều tự bù trong ≤ 3,3 s;
  - độ trễ trung bình 134 ms (p95 214 ms);
  - đồng hồ các máy lệch nhau 489 ms; 0 lần lệch chặng;
  - 10/10 lần kết nối lại giữ đúng điểm; 50/50 điểm khớp;
  - dồn dập: 95 lần bị chặn 429, không em nào khác bị chặn.
- **Cảnh sông** `camp-01` chặng 1, 50 em + 12 nhân vật, sau đợt giảm tam giác ngày 27/10:
  - bản cao 1.571 nghìn tam giác (trước đó 3.672), lượt vẽ bóng 421 nghìn;
  - bản thấp 432 nghìn (trước đó 739); phần thế giới 161 nghìn, dưới ngân sách 220 nghìn;
  - cảnh nặng nhất trên 30 kịch bản (chỉ phần thế giới): 1,18 triệu (cao) / 262 nghìn (thấp).
- **Bộ nhớ ảnh ước lượng:** bản cao ~293 MB (phần lớn là ảnh 1024 px của 12 nhân vật và bầu trời 2K); chế độ máy yếu ~93 MB. Đã có kế hoạch giảm (mục 7.4).
- **Trên Mac M4:** bản cao 1,0 ms/khung; máy yếu 0,4 ms/khung.
- **Vào ra cảnh 10 lần:** còn 1 runtime sống, heap 86 → 87 MB.
- **Nhân vật truyện:**
  - lặp mô hình trên 30 kịch bản: 59 → 33 lần;
  - camp-01 dùng 12/12 mô hình khác nhau;
  - không còn ai đứng chữ T (tay được hạ xuống khi mô hình thiếu clip idle).
- **Test:** 168/168 đạt (01/11). Lint và type check sạch.

## 5. Commit gần nhất

`origin/feat/3d-lego-engine` dừng ở `b96bd24` (25/10). 19 commit sau đây chỉ có trên máy:

| Commit | Nội dung |
|---|---|
| `5f4984a` | perf(scene): bản cây rải `_fill`/`_fill_low`, chặng kề chỉ vẽ gần ranh giới, cây rải không đổ bóng; Gemini 20 s + 1 lần thử lại; ảnh phòng Multiverse ở tầm mắt; cấu hình `prod-lan`; danh sách việc D |
| `80c3116` | merge: gộp C4 vào nhánh (đổi tên migration thành `20261027_coins_seasons.sql` cho khớp bản đã áp) |
| `ea988b8` | feat(c4): khung hỏi, bộ lập lịch, gợi ý, hệ quả, xu (41 file) |
| `3518638` | chore(assets): đồng bộ R2, nhập inbox, dọn GLB (`camp_grill`, `char_wanderer`), phòng Multiverse, hạ tay cho mô hình chữ T |
| `4f8babd` | content: khung dữ liệu phòng Multiverse (D6) và nhân vật cửa hàng xu cho Meshy |
| `7547b18` | feat(scene): lõi cảnh 3D, avatar 3 cấp chi tiết, đạo diễn camera (pha C) |
| `5f637a4` | content: hệ quả đúng/sai cho 6 game (`consequences_v2.json`) |
| `0291289` | feat(match): kênh máy học sinh, thử tải 50 máy, kiểm bảo mật, tài liệu vận hành |
| `69972cb` | feat(match): trận lớp trên máy chủ (bảng, tin có chữ ký, API, giới hạn bền) |
| `d936996` | feat(match): engine trận lớp (đồng hồ, lệnh gia sư, sao, đội, luật Sinh tồn) |
| `c9e2acc` | chore(seed): 30 kịch bản (có Dino Journey) trong bản sao SQL |
| `033ed08` | chore(assets): HDRI 2K ra khỏi git, ghi GLB an toàn, kiểm ảnh tối |
| `a037c3c` | content(subtitles): phụ đề theo cấp cho 25 kịch bản |
| `18693ce` | chore(kayak): bỏ Unity, Kayak Rush chạy bằng three.js |
| `79624a1` | fix(arena): dừng vòng trả lời khi mất phiên; giãn nhịp thử lại mạng |
| `04fe613` | feat(assets): đường ống thư viện 3D (tối ưu, kiểm Blender, catalog, nạp theo game) |
| `9d07d47` | feat(subtitles): phụ đề truyện 6 cấp, chạm từ khoá để nghe |
| `e89a478` | feat(levels): cấp Beginner (cấp 0) |
| `deb1866` | content: bộ 6 thế giới, 30 kịch bản v2, sự kiện chạy, manifest thư viện 3D |

Không còn ảnh HDRI 2K trong nhánh nào; chỉ còn trong reflog trên máy, và push không gửi reflog. Vì vậy không cần viết lại lịch sử trước khi push.

## 6. Cấu trúc thư mục

### Repo `/Users/mindatix100/tutorcraft-ai`

```
app/                         Next.js App Router
  page.tsx                   trang chủ (landing)
  tutor/                     /tutor → /tutor/create (Studio 3 bước: tài liệu → game → mở trận)
    create/  characters/  animation-lab/
    scene-lab/               trang thử cảnh 3D: sông/đồng cỏ, 12 nhân vật (kiểm trùng), màn gia sư 50 em,
                             chọn avatar, Multiverse, "Khung hỏi + RainbowEdge (C4)"; đo 10 giây, máy yếu,
                             nút camera/hệ quả, vào ra 10 lần
  student/                   /student (nhập mã), /student/[id], /student/play
  credits/                   ghi công tài nguyên
  dev-assets/[...path]/      phục vụ thư viện 3D trên máy (dev; production chỉ khi TC_SERVE_LOCAL_ASSETS=1)
  api/
    generate-battle/         Gemini sinh câu (maxDuration 60) + kho câu dự phòng
    battles/ battle-result/ scenarios/ cron/retry-results/
    session/                 phiên học: answer, cast, pair, hint (C4), golden (C4), coins (C4)
    match/                   trận lớp: tạo, [id], join, leave, state, action, box (hộp quà), rescue (cứu hộ)
src/
  engine/                    luật thuần (có test): match, teams, survivalRules, questionSchedule, hints,
                             consequences, coins, rescue, sceneBuilder, avatars, director, assetLoader,
                             variants, scoring, grading, levels, subtitles, schema, …
  server/                    chạy trên máy chủ: matchService/Store/Broadcast, sessionService, coinStore,
                             rewardService, gemini, prompt, grader, documents, rateLimit, auth, …
  client/                    trình duyệt: matchChannel (kênh trận, NTP), audio (âm nền tổng hợp, tắt tiếng),
                             sfx, questionSfx, sessionApi, supabaseBrowser
  config/                    assetLibrary (lib(), withQuality, hdri()), threeAssets (manifest 6 thế giới)
  components/
    modes/                   KayakRush, MultiversePortalRPG, ModeStage, gfxTier (cao/thấp/2D), kit
      three/                 SceneRuntime, cameraDirector, director (playOutcome), avatar (LodAvatar,
                             relaxArms), riverWorld, instancing, effects, footprints, nameBoard,
                             questionCamera, sceneTimer, consequenceHooks, rainbowEdgeMaterial
    question/                QuestionFrame (khung hỏi), QuestionLab (demo), skins (6 "áo" theo game)
    fx/                      RainbowEdge (shader + CSS conic + giảm chuyển động)
    TeacherBoard, AvatarPicker, ClassPodium, BattleArena, …
content/                     DO PHẦN NỘI DUNG GIỮ: scenarios_v2, consequences_v2, multiverse_rooms,
                             game_worlds_v2, asset_aliases, asset_credits;
                             asset_catalog + asset_coverage (sinh bằng scripts/build-asset-catalog.mjs)
scripts/
  optimize-glb.mjs           tối ưu GLB (cao / --low / --tris / --tex), ghi an toàn
  build-asset-catalog.mjs    script DUY NHẤT ghi catalog + coverage
  validate-glb.py            kiểm bằng Blender (ảnh tối, sai đơn vị, xương sai tỉ lệ, ảnh chụp)
  clean-glb.mjs              gỡ tấm phông, đĩa đất, mảnh vụn khỏi file gốc (có sao lưu)
  import-inbox.mjs           inbox → thư viện (kiểm giấy phép, đổi tên theo mã, tối ưu, credits)
  sync-assets-r2.mjs         đẩy bản tối ưu lên R2 (mặc định chạy khô, không in khóa)
  room-eye-views.py          chụp phòng Multiverse ở tầm mắt 1,6 m
  match-load-test.mjs        thử tải 50 máy; security-check.mjs; seed-scenarios-v2.mjs
  generate-meshy-models.mjs + meshy-models-extra.mjs, fetch-hdri.mjs, fetch-sketchfab-models.mjs
  scenarios-v2/              (phần nội dung)
supabase/migrations/         14 file SQL (bản sao các migration đã áp)
supabase/seed/               bản sao SQL 30 kịch bản
tests/                       23 file test (node --test), 168 test
docs/
  operations.md              tài liệu vận hành chính (số đo, quy trình, việc cần làm, việc của D)
  specs/                     C4-spec.md (đã commit); asset-reuse-plan.md, code-tasks-asset-reuse.md,
                             tasks-2026-11-01.md (mới, chưa commit)
  images/rooms-eye/          2 bảng ảnh phòng ở tầm mắt + views.jsonl
public/assets/               hdri 1K (trong git), 3d, textures
out/                         (git bỏ qua) cast-check/, rooms-eye/, backups/, r2-manifest.json
.claude/launch.json          dev (3000), prod (3001), prod-lan (3005)
proxy.ts                     giới hạn tốc độ theo IP cho /api
```

### Thư viện `~/Documents/3D_tutorcraft` (ngoài repo)

```
camp/ fishing/ survival/ dino/ kayak/ river_world/ multiverse/ characters/ fx/ hdri/
                             file gốc theo mã (đã nhập kho)
multiverse/rooms/            8 phòng Meshy đặt tên theo mã (r_bedroom_a/b, r_cyber, r_courtyard,
                             r_salon, r_fortress_a/b, r_future)
_optimized/ _low/ _mid/ _fill/ _fill_low/
                             bản do script sinh ra: không sửa tay
_backup/                     bản gốc trước khi clean-glb.mjs sửa
inbox/                       73 file chờ nhập (57 GLB + 16 FBX Mixamo) + credits.csv (73 dòng)
_ung_vien/                   ứng viên chưa vào game (nhân vật, Multiverse, vật phẩm, Mixamo, …),
                             MANIFEST.csv 226 dòng
audio/                       nhạc đã duyệt (music/<vị trí>/), sfx/ và ambient/ (chưa có), AUDIO_MANIFEST.csv
_de_xoa/                     file để người dùng tự xoá
_report/                     doi_ten.json (nhật ký đổi tên), ảnh, báo cáo
Multiverse Portal/           12 file Meshy gốc (bản sao phòng đã ở multiverse/rooms/)
00_HUONG_DAN.md              bản đồ thư mục (01/11)
```

## 7. Việc đang dở và việc chờ

### 7.1. Đợt tài nguyên 01/11 (`docs/specs/tasks-2026-11-01.md`, `code-tasks-asset-reuse.md`): chưa bắt đầu

Phần của Claude Code. Làm theo thứ tự, mỗi bước dừng báo cáo và chờ duyệt.

| Bước | Việc | Ghi chú |
|---|---|---|
| C1 | Viết `scripts/promote-candidate.mjs` (từ `_ung_vien/` sang `inbox/<mã>.glb` + một dòng `credits.csv`). Chạy khô `import-inbox.mjs` cho 73 file đang chờ; báo file bị từ chối, trùng mã, vượt ngân sách. Chỉ `--apply` khi được đồng ý | FBX Mixamo `anim_*`: kiểm bản "Without Skin", thử gắn lên một nhân vật mẫu |
| C2 | Giảm nặng các file lớn: Snow_3 163 MB, A_low_poly 124 MB, Medieval_Throne_Room, Old_Teddy_Bear, Desert_Citadel, Pavilions, Stone_Torch_Stand, …; báo trước/sau | Không file nào > 25 MB ở bản thấp |
| C3–C4 | Hệ thống âm thanh: nén nhạc; `AudioManager` 3 bus (nhạc, hiệu ứng, nền) với nút tắt riêng; hạ nhỏ nhạc khi câu hỏi hiện; nhạc đổi lớp theo trạng thái; tiếng bước chân, tiếng quẫy khớp hoạt ảnh | Credits ghi vào `asset_credits.json` |
| C5 | `pickVariant(id, seed, slotKey)` (có test); `planScenarioAssets` tải cả họ biến thể `_2`, `_3`, tính ngân sách theo bản nặng nhất | |
| C6 | `content/scene_kits.json`: bộ cảnh theo cấp độ; báo thiết kế trước; làm summer_camp đầu tiên | Không đổi schema cũ |
| C7 | Nhân vật một mô hình nhiều vai: mở rộng `HUMAN_POOLS` theo bảng do Claude chat cung cấp; tint; phụ kiện mua bằng xu | Báo trước khi đụng bảng cửa hàng/xu |
| C8 | Multiverse `RoomKit` (dựng phòng bằng hình khối + nội thất); cảnh lớn làm cảnh xa; render 6 góc ở tầm mắt có ánh sáng | |
| C9 | Instancing/LOD, đo lại cảnh xấu nhất, đồng bộ R2 (khi được đồng ý), cập nhật tài liệu | |

Phần của Claude chat (B1–B7) và của người dùng (giấy phép nhạc Heavenly Loop, dọn `_de_xoa/`) nằm trong cùng file.

### 7.2. Việc của giai đoạn D (đã ghi trong `docs/operations.md`, chưa làm)

1. Nối bộ lập lịch câu hỏi (`src/engine/questionSchedule.ts`) vào luồng câu thật. Hiện phiên của em vẫn phát câu tuần tự.
2. Thử thách vàng chọn câu khó hơn; hiện chỉ nhân đôi xu.
3. `ClassPodium` (top 3) cho màn của em; hiện mới có trên màn gia sư và trong demo.
4. Trường "nghĩa tiếng Việt" trong schema câu hỏi, prompt Gemini và kho câu, dùng cho gợi ý bậc 1. **Báo người dùng trước khi sửa schema.**

D chỉ bắt đầu sau khi có số đo điện thoại.

### 7.3. Cổng C: đo trên điện thoại thật (người dùng làm, đang chờ)

- Chưa có số đo nào. Hiện không có server nào chạy.
- Địa chỉ LAN của máy đã đổi thành **`192.168.11.125`**, nên cần sửa `prod-lan` trong `.claude/launch.json` (đang là `192.168.1.253`).
- Cách chạy lại (Terminal trong VS Code):
  1. `npx next build`
  2. `TC_SERVE_LOCAL_ASSETS=1 npx next start -H 192.168.11.125 -p 3005`
- Mở `http://192.168.11.125:3005/tutor/scene-lab` trên điện thoại, bấm "Đo 10 giây" và chụp 4 lần: Bản cao; Bản thấp; Bản thấp + Máy yếu; Màn hình gia sư 50 em.
- **Đạt cổng khi:** chế độ máy yếu có FPS trung bình ≥ 30 và giây tệ nhất ≥ 25 trên điện thoại tầm thấp.

### 7.4. Kế hoạch chờ kích hoạt (chỉ làm khi số đo điện thoại cho thấy cần)

- **Giảm bộ nhớ ảnh bản cao (~293 MB):**
  - phương án A: nhân vật truyện dùng bản vừa và bầu trời 1K trên điện thoại (khoảng nửa ngày);
  - phương án B: chuyển ảnh sang KTX2/Basis (1–2 ngày).
- **Nhân vật truyện dùng 3 cấp chi tiết:** dự kiến 232 → khoảng 100 nghìn tam giác ở bản cao; đây là phần còn nặng nhất của cảnh.

### 7.5. Việc mở khác

- **Phòng Multiverse** (ảnh ở tầm mắt, `docs/images/rooms-eye/`):
  - đi vào được: `r_future`, `r_salon` (tối, thô), `r_courtyard` (ngoài trời);
  - không đi vào được: giường (`r_bedroom_a/b`), bàn (`r_cyber`), `r_fortress_a`; `r_fortress_b` chỉ một phần;
  - đề xuất của người dùng: phòng ngủ và cyber dựng bằng hình học + nội thất, các cảnh còn lại phóng to. **Chờ chốt.**
  - Chưa đổi bí danh `mv_world_castle` / `mv_world_cyberpunk`, chưa đẩy phòng lên R2.
- **Thiếu mô hình:**
  - catalog: 252 model, kịch bản gọi 280 mã, **thiếu 41** (`anim` 8, `camp` 15, `food` 6, `fish` 5, `tex` 2, `water` 2, `kayak`/`river`/`surv` mỗi nhóm 1); con số này tính trước khi nhập 73 file inbox;
  - nhân vật truyện: chỉ có 2 mô hình bé gái, không có người già, một số nhân vật không phải người đang nhận mô hình người.
- **Gemini:** kiểm 10 lần sinh liên tiếp có tài liệu, xem có lần nào phải dùng kho câu không. Lần đo 26/10 có tài liệu mất khoảng 31 s, dài hơn mức chờ 20 s.
- **R2:**
  - gắn tên miền riêng cho bucket rồi đặt `NEXT_PUBLIC_ASSET_BASE_URL` trên Vercel (người dùng làm);
  - CORS chưa có địa chỉ LAN, vì thế khi thử điện thoại thì dùng thư viện trên máy.
- **File chưa theo dõi trong repo (không phải của phiên Code):** `docs/specs/{asset-reuse-plan,code-tasks-asset-reuse,tasks-2026-11-01}.md`, `.archify/`, `.taste-skill/`, `animasyon-stil-katalogu/` (một kho git riêng), `.claude/settings.json`. Chưa commit.
- **Các file tài liệu trống:** `CLAUDE.md`, `DESIGN.md`, `doc.md`, `road_map.md` đang rỗng (0 byte).
- **Push:** 19 commit chờ. Chỉ push khi người dùng nói.

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
npx next build
```

```bash
node scripts/build-asset-catalog.mjs
```

```bash
node scripts/import-inbox.mjs
```

```bash
node scripts/sync-assets-r2.mjs
```

Ghi chú cho từng lệnh:
- `npm test` dựng `.test-build` rồi chạy toàn bộ test.
- `node scripts/import-inbox.mjs` là chạy khô; thêm `--apply` để nhập thật.
- `node scripts/sync-assets-r2.mjs` là chạy khô; thêm `--apply` để đẩy thật.
- Tối ưu một file: `node --max-old-space-size=12288 scripts/optimize-glb.mjs ~/Documents/3D_tutorcraft ~/Documents/3D_tutorcraft/_optimized --files <đường dẫn> --force`. Bản thấp thì đổi đích thành `_low` và thêm `--low`.
- Kiểm bằng Blender: `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/validate-glb.py -- <thư mục> <báo cáo.json> --only <chuỗi> --thumbs <thư mục ảnh>`.
- Thử tải: `node --env-file=.env.local scripts/match-load-test.mjs --students 50 --stage-seconds 300` (cần build và chạy server trước).

## 9. Tài liệu tham chiếu

- `docs/operations.md`: vận hành, số đo, quy trình thư viện, R2, inbox, đo điện thoại, việc cần làm, việc của D.
- `docs/specs/C4-spec.md`: đặc tả C4 và D6 (Multiverse).
- `docs/specs/tasks-2026-11-01.md`, `code-tasks-asset-reuse.md`, `asset-reuse-plan.md`: đợt tài nguyên 01/11.
- `~/Documents/3D_tutorcraft/00_HUONG_DAN.md`: bản đồ thư viện 3D.
- `content/consequences_v2.json`: luật chung (25 s mỗi câu, gợi ý sau 8 s, xu, độ khó, cứu hộ) và hệ quả từng game.
- `AGENTS.md`: Next.js 16 khác bản cũ, đọc tài liệu trong `node_modules/next/dist/docs/`.
- Tài liệu "Nhiệm vụ phần code" (Claude Docs, đã ghim): lộ trình các giai đoạn A–G.
