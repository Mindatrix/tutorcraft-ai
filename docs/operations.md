# Vận hành TutorCraft AI

## Kết quả trận không bao giờ mất lặng lẽ

- Học sinh trả lời câu cuối → phiên được đánh dấu `battle_sessions.result_saved = false` ("chờ lưu").
- `POST /api/battle-result` ghi vào `battle_results`, thử lại 3 lần ngay trong request. Nếu vẫn lỗi, kết quả nằm lại trên phiên kèm `pending: true`, và học sinh thấy dòng "đang tự gửi lại".
- Có ba đường gửi lại. Đường nào chạy cũng an toàn, vì nhờ `session_id` là duy nhất nên một kết quả không bao giờ bị ghi hai lần:
  1. Trình duyệt giữ token trong `localStorage` (`tc:result-outbox`) và tự gửi lại khi có mạng (`ResultOutbox`, gắn ở layout gốc).
  2. Mỗi lần có học sinh khác nộp thành công, máy chủ ghi thêm tối đa 3 kết quả đang chờ (`after()`).
  3. `GET /api/cron/retry-results` có header `Authorization: Bearer $CRON_SECRET`. Vercel Cron gọi route này mỗi ngày (`vercel.json`). Gói Hobby chỉ cho cron chạy 1 lần/ngày; muốn dày hơn thì dùng cron-job.org hoặc GitHub Actions gọi cùng URL.
- Cần đặt biến môi trường `CRON_SECRET` trên Vercel (một chuỗi ngẫu nhiên dài).

## Tài liệu bài giảng

- Định dạng hỗ trợ: PDF, ảnh, TXT/MD và Word `.docx`. Trình duyệt tự giải nén `.docx` và chỉ gửi chữ lên máy chủ; trình duyệt cũ thì gửi nguyên file để máy chủ đọc. File `.doc` đời cũ cần lưu lại thành `.docx` hoặc PDF.
- Tài liệu dài được chia thành các đoạn khoảng 1.800 ký tự, cắt theo tiêu đề. Nếu dài quá khoảng 32.000 ký tự, AI nhận các đoạn liên quan nhất tới chủ đề, cộng thêm các đoạn rải đều khắp tài liệu. Studio sẽ báo cho gia sư biết điều này.

## Giới hạn tốc độ

Giới hạn theo IP được đặt cho cỡ một lớp khoảng 60 học sinh dùng chung một Wi-Fi. Phần chống lạm dụng nằm ở giới hạn theo từng phiên chơi (mỗi học sinh một token) và theo từng gia sư. Xem `proxy.ts` và các route trong `app/api`.

## Thử tải

```bash
node scripts/load-test.mjs --students 40 --same-ip
```

Mặc định dùng trận demo, không ghi vào cơ sở dữ liệu. Các tuỳ chọn khác:
- `--code <MÃ>`: chạy trên một trận thật.
- `--essays`: gọi AI chấm bài viết thật (tốn quota Gemini).

## Thử trên điện thoại thật

1. Trên Mac, lấy IP mạng LAN: `ipconfig getifaddr en0` (ví dụ ra `192.168.1.23`).
2. Chạy `npx next dev --experimental-https -H 192.168.1.23`.
   - Cần HTTPS vì Web Crypto, service worker và `crypto.randomUUID` chỉ chạy trong ngữ cảnh an toàn.
   - Cần `-H <IP>` vì Next chặn tài nguyên dev từ tên máy lạ.
3. Cho điện thoại và máy tính vào cùng một Wi-Fi. Trên điện thoại, mở `https://192.168.1.23:3000/student/play?code=<MÃ>` rồi chọn "Vẫn truy cập" (chứng chỉ tự ký).

## Thư viện model 3D (giai đoạn A3)

Thư viện gốc nằm ngoài repo, ở `~/Documents/3D_tutorcraft` (khoảng 7,9 GB). Đổi chỗ thì đặt biến `TC_3D_DIR`. Thứ tự chạy mỗi khi thêm hoặc đổi model:

1. Tối ưu bản cao: `node --max-old-space-size=12288 scripts/optimize-glb.mjs ~/Documents/3D_tutorcraft ~/Documents/3D_tutorcraft/_optimized --over`
2. Tối ưu bản thấp: lệnh như trên, nhưng thư mục đích là `~/Documents/3D_tutorcraft/_low` và thêm cờ `--low`.
3. Dựng danh mục: `node scripts/build-asset-catalog.mjs`. Đây là script **duy nhất** ghi `content/asset_catalog.json` và `content/asset_coverage.json`; bản Python cũ (`build-asset-catalog.py`) đã bị xoá, đừng tạo lại script thứ hai ghi cùng file.
4. Kiểm tra bằng Blender: `/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/validate-glb.py -- ~/Documents/3D_tutorcraft/_optimized ~/Documents/3D_tutorcraft/_report/validate.json --thumbs ~/Documents/3D_tutorcraft/_report/thumbs`
   - Script báo thiếu chất liệu, màu nền đen, ảnh hỏng, sai đơn vị, và **phần bề mặt phủ ảnh gần đen**: lấy mẫu ảnh tại tâm từng mặt, tính theo diện tích; trên 40% thì báo lỗi. Phép kiểm này bắt được trường hợp chất liệu vẫn có ảnh nhưng ảnh đen từng mảng, ví dụ `camp_grill` bị Meshy dựng nhầm hai tấm phông đen.
   - Model tối có chủ ý (quái bóng tối, đất ẩm, quần áo đen) được ghi trong `DARK_OK` ở đầu script. Chỉ thêm vào đó sau khi đã xem ảnh chụp.
5. Chạy `npm test`. Bộ test kiểm tra độ phủ, đảm bảo manifest không còn ô trống, và giữ ngân sách 40 MB (bản cao) / 15 MB (bản thấp) cho mỗi trận.

Ngân sách của bộ tối ưu (số mặt, cạnh ảnh tối đa, trần dung lượng):

| Loại | Bản cao | Bản thấp |
|---|---|---|
| Model quét lớn (cây, bụi, hang, nhà, phông nền) | 150 nghìn mặt, ảnh 1024, trần 6 MB | 30 nghìn mặt, ảnh 512, trần 2 MB |
| Mặt đất | 60 nghìn mặt | 20 nghìn mặt |
| Nhân vật, khủng long | 20 nghìn mặt | 10 nghìn mặt |
| Đồ nhỏ, cá | 8 nghìn mặt, dưới 1 MB | 4 nghìn mặt |
| Phòng Multiverse (`multiverse/rooms/`) | 250 nghìn mặt, ảnh 2048, trần 8 MB | 80 nghìn mặt, ảnh 1024, trần 3 MB |

Model quét từ Meshy chia UV thành hàng nghìn mảnh, nên bộ giản lược thường bị "kẹt". Script tự chuyển sang chế độ *Permissive* (có tính tới UV). Nếu vẫn quá nặng, script lùi về chế độ *Sloppy*.

`optimize-glb.mjs` ghi an toàn: dựng GLB trong bộ nhớ, ghi ra tệp tạm cạnh tệp đích, kiểm đầu tệp (chữ `glTF`, phiên bản 2, độ dài khớp, khối đầu là JSON), đạt thì mới đổi tên đè lên tệp cũ. Lỗi giữa chừng thì tệp cũ còn nguyên. Không dùng `io.write()` với tên tệp không có đuôi `.glb`: hàm đó chọn định dạng theo đuôi tệp, nên sẽ ghi ra glTF dạng JSON kèm tệp rời. Ngày 27/10 lỗi này đã làm hỏng cả thư viện.

### Ảnh trời HDRI

- Có 5 bầu trời (Poly Haven, CC0), mỗi bầu trời 2 cỡ, tải bằng `node scripts/fetch-hdri.mjs`.
- **Bản 1K** (1,2–1,7 MB mỗi ảnh, tổng 6,6 MB) nằm trong `public/assets/hdri/` và trong git. Điện thoại dùng bản này, và mọi máy cũng dùng nó khi không tải được bản 2K: `hdriSize(url, '1k')` trong `src/config/assetLibrary.ts`.
- **Bản 2K** (4–7 MB mỗi ảnh, tổng 26 MB) **không** nằm trong git hay bản triển khai: `.gitignore` và `.vercelignore` chặn `public/assets/hdri/*_2k.hdr`. Bản này nằm cùng thư viện model, ở `~/Documents/3D_tutorcraft/hdri/`. Manifest lấy địa chỉ qua `hdri('<tên>')`, tức là `NEXT_PUBLIC_ASSET_BASE_URL/hdri/river_<tên>_2k.hdr`; khi dev thì route `/dev-assets/hdri/…` phục vụ.

Phục vụ model:
- **Khi dev:** route `/dev-assets/web|low|mid/<file>` đọc thẳng thư viện trên máy (khi `NEXT_PUBLIC_ASSET_BASE_URL` để trống).
- **Khi production:** đặt `NEXT_PUBLIC_ASSET_BASE_URL` trỏ tới CDN có bốn thư mục:
  - `web/`: nội dung của `_optimized`;
  - `low/`: nội dung của `_low`;
  - `mid/`: nội dung của `_mid`;
  - `hdri/`: ảnh trời 2K.

  Dùng Cloudflare R2 vì không tính phí băng thông: một lớp 50 em × khoảng 30 MB là khoảng 1,5 GB mỗi buổi.
- **Chưa có CDN:** mọi model trả về 404, và cảnh tự giữ mô hình dựng bằng code. Trời thì dùng bản 1K trong `public/`.

### Thư viện trên R2 (27/10)

- **Lệnh đồng bộ:** `node scripts/sync-assets-r2.mjs`.
  - Chạy không cờ là chạy khô: in danh sách, dung lượng, và file nào cần đẩy.
  - `--apply` đẩy thật. Bỏ qua file đã có cùng nội dung (so MD5 với ETag).
  - Khóa đọc từ `.env.local` (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`). Script không in khóa.
  - Chỉ đẩy bản đã tối ưu. `multiverse/rooms/` bị bỏ qua cho tới khi nội dung phòng được duyệt (cờ `--include-rooms`).
- **Lần đẩy đầu, 27/10:** 522 file, 264,5 MB, không lỗi. Chạy lại cho kết quả 522 file giống hệt.

  | Thư mục | Số file | Dung lượng |
  |---|---|---|
  | `web` | 244 | 173,8 MB |
  | `low` | 244 | 58,2 MB |
  | `mid` | 29 | 5,4 MB |
  | `hdri` | 5 | 27,1 MB |

  Có thêm `manifest.json` ở gốc bucket. Bản trên máy nằm ở `out/r2-manifest.json`.
- **Header:**
  - `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`. Tên file không đổi khi tối ưu lại, nên không đặt `immutable`.
  - `Content-Type` là `model/gltf-binary` cho GLB và `image/vnd.radiance` cho HDR.
- **Còn phải làm trên Cloudflare** (khóa hiện có là loại đọc/ghi đối tượng, không đổi được cài đặt bucket):
  - CORS (kiểm bằng curl 27/10, sau khi chủ dự án sửa trên Cloudflare): `https://tutorcraft-ai.vercel.app` và `http://localhost:3000` đều được trả `Access-Control-Allow-Origin` đúng tên miền, kể cả preflight (`GET, HEAD`, header `range`). Địa chỉ LAN chưa có, nên khi thử điện thoại thì dùng thư viện trên máy (mục "Đo trên điện thoại thật").
  - Link `r2.dev` bị giới hạn tốc độ, chỉ dùng để thử. Bản chính thức cần gắn tên miền riêng cho bucket, rồi đặt `NEXT_PUBLIC_ASSET_BASE_URL` trên Vercel.
- **Thư mục cây rải (27/10):** `fill/` và `fill_low/`, mỗi thư mục 74 file (14,1 / 9,1 MB), đẩy lần hai 148 file, không lỗi.
- **Mẫu biến môi trường:** `.env.example`.

### Nhập tài nguyên mới (inbox)

1. Thả file vào `~/Documents/3D_tutorcraft/inbox/`. Nhận `.glb`, `.gltf`, `.fbx`, `.obj`, và ảnh `.png`/`.jpg`/`.webp` cho mã `tex_*`, `water_*`.
2. Điền `inbox/credits.csv` theo cột `file,id,title,author,source,license`.
3. Chạy khô `node scripts/import-inbox.mjs`, rồi chạy thật với `--apply`.

Script làm gì với từng file:
- **Từ chối** khi:
  - thiếu giấy phép;
  - giấy phép không cho dùng thương mại (NC) hoặc không cho sửa (ND);
  - thiếu nguồn;
  - CC BY mà thiếu tác giả;
  - mã đã có trong thư viện (trừ khi có `--replace`).
- `fx_fire`, `fx_smoke`, `fx_spark` không nhập: làm bằng hạt trong `effects.ts`, và catalog tính là đã có.
- `anim_*`: lưu ở `anim/`. Script đối chiếu tên xương với khung xương các nhân vật, rồi báo khớp với nhân vật nào. Xương kiểu Mixamo khớp `char_tpose_boy`, `char_iridescent_voyager`, `char_kid_dancer`, `char_generic_female_2`; khung xương Meshy (`char_sunny_boy`, `char_grass_kid`) có tên khác.
- Model:
  - đổi tên theo mã, đặt vào thư mục theo tiền tố;
  - Blender đổi `.fbx`/`.obj`/`.gltf` sang `.glb`;
  - tối ưu bản cao và bản thấp; nhân vật và khủng long thêm bản vừa.
- Ghi `content/asset_credits.json` và nhật ký đổi tên `_report/doi_ten.json`, rồi chạy lại catalog. File đã nhập chuyển sang `inbox/_da_nhap/`.
- Ngày 27/10 đã thử trên một thư viện giả: nhận 3 file (model, ảnh, hoạt ảnh), từ chối 3 (thiếu giấy phép, NC, `fx_fire`).

Hiện thiếu **41/280** mã:
- `anim` 8, `camp` 15, `food` 6, `fish` 5;
- `tex` 2, `water` 2;
- `kayak`, `river`, `surv` mỗi nhóm 1.

### Nhập kho đợt 2 (WP1, 01/11)
- 8 file: `camp_chair`, `camp_chair_2` (promote từ `_ung_vien/vat_pham/camp_chair`, 262k → 8k / 4k mặt), `fish_net`, `food_apple`, `food_bread`, `food_corn`, `food_meat_raw`, `river_shed` (Meshy). Catalog 332 model; kịch bản gọi 280 mã, **thiếu 7**: `anim_cook`, `food_fish_raw`, `food_sausage`, `tex_mud`, `tex_sand`, `water_foam`, `water_normal`.
- Gỡ đế (cắt theo độ cao vì cả file là một khối liền; bản gốc ở `_backup/`): `food_apple` `--drop-below 0.38`, `food_meat_raw` `--drop-below -0.13`, `river_shed` `--drop-below -0.56`; `food_bread` bỏ vụn bánh rời `--keep-pieces-over 0.05`.
- `food_sausage` ra nải chuối: không nhập, để ở `inbox/_cho_xem/` (chờ prompt Meshy mới). `camp_grill` (bản 11,4 MB) vẫn chờ quyết định thay hay làm biến thể.
- Alias: `mv_world_castle` → `mv_castle_module`, `mv_world_cyberpunk` → `mv_cyber_room`, `river_log_fallen` → `kayak_log_spinning`.

### Biến thể theo seed (WP3, 02/11)
- Họ `<mã>`, `<mã>_2`, `<mã>__alt1`… (`stemOf`). `variantFamily()` / `pickVariant(id, seed, slotKey)` trong `src/engine/assetLoader.ts`: chọn theo `mulberry32(hashString(seed|slot))`, mọi máy cùng kết quả; chỉ đồ vật và công trình (`VARIANT_CATEGORIES`, `src/engine/assetCategory.ts`), cây cỏ rải nền vẫn chọn từ pool riêng. Kịch bản gọi đích danh một bản (`camp_bottle_4`) thì dùng đúng bản đó. Không bao giờ trả bản không có file web.
- Bản thấp bỏ bản nặng hơn 2× bản nhẹ nhất (MB +0,3 hoặc mặt +2 nghìn), giữ ≥ 1 (ví dụ `river_sign`: 6 bản → 1 bản ở máy yếu).
- `planScenarioAssets` tải cả họ (`inLow` cho bản thấp); số mặt mỗi chỗ đặt tính theo bản nặng nhất của họ (không phụ thuộc seed). Số đo 02/11: trận nặng nhất dino-01 37,9 MB cao / 13,5 MB thấp; camp-01 28,0 / 8,0 MB; cảnh xấu nhất bản thấp dưới 300 nghìn mặt (test C1.5).

### Bộ cảnh theo cấp độ (WP4, 02/11; thiết kế `docs/specs/wp4-scene-kits-design.md`)
- Dữ liệu `content/scene_kits.json` (hiện có summer_camp: khu trại, lều, góc lửa, sơ cứu, bếp). Luật `src/engine/sceneKits.ts`; đặt trong `buildSceneLayout({ kits, level })`; tải trong `planScenarioAssets(…, kits)`; tint qua màu từng bản sao (`instancing.ts`, không thêm vật liệu). Scene-lab: ô "Cấp 0–6".
- Món chặng gọi luôn có (xếp vào nhóm); món lõi + món đi kèm chỉ ở chặng hiện tại, ≤ 60k / 20k mặt mỗi chặng và dưới trần cảnh 1,3 triệu / 300 nghìn. `pick` chặn bản ghép sai mã.
- Trần cảnh nay được bảo đảm: vượt thì bỏ cây rải xa ranh giới nhất của chặng kề (trước đây chỉ đạt nhờ seed của test).
- Số đo scene-lab camp-01: chặng 5 cấp 0 → 6: 110 → 119 vật; chặng 7: 114 → 120; chặng 2 (cảnh nặng nhất, đã chạm trần) không thêm.

### Dọn file gốc trước khi tối ưu

`node scripts/clean-glb.mjs <file> --inspect` in các mặt phẳng lớn và các mảnh rời. Các cờ dọn:
- `--drop-planes`: bỏ tấm phẳng;
- `--drop-below y`: bỏ phần nằm dưới độ cao y (đĩa đất);
- `--keep-within r`: chỉ giữ vật ở giữa;
- `--keep-pieces-over k`: bỏ mảnh vụn.

Bản gốc được sao vào `_backup/` trước khi ghi. Ngày 27/10:
- `camp_grill`: `--keep-within 0.35` bỏ ba tấm phông và 25 mảnh cỏ đá (752/2.051 mặt, 82% bề mặt). Còn 1.299 mặt, Blender không báo lỗi; phần tối giảm từ 84% còn 29% (là lòng bếp màu đen).
- `char_wanderer`: `--drop-below -0.885` rồi `--keep-pieces-over 0.001` bỏ đĩa cỏ (373 nghìn mặt). Bản cao 20 nghìn, thấp 10 nghìn, vừa 5 nghìn mặt.

## Trận chung cả lớp (giai đoạn B)

Một lớp tối đa 60 em vào cùng một trận: cùng đồng hồ, cùng chặng, cùng sự kiện ngẫu nhiên, cùng bảng điểm. Mất mạng rồi vào lại không mất điểm. Máy chủ quyết định mọi thứ; máy học sinh chỉ vẽ.

Luồng:
1. Gia sư mở trận: `POST /api/match` với `{ battleId }` (cần đăng nhập). Trận nằm ở trạng thái `lobby`. Gọi lại khi trận chưa kết thúc thì nhận lại đúng trận đó.
2. Học sinh vào đấu trường như cũ (`POST /api/session`), rồi vào phòng: `POST /api/match/join`, header `x-battle-session`. Game khủng long gửi thêm `{ species, color }`: được trùng loài, không được trùng cả loài lẫn màu.
3. Gia sư bấm `POST /api/match/<id>` với `{ action }`. Thứ tự hợp lệ: `start` → `pause` / `resume` → `extend` (một lần, mở 2 chặng phụ) → `end`. Thao tác sai thứ tự bị từ chối (409).
4. Máy học sinh nghe kênh Supabase Realtime `match:<id>`. Cứ 20 giây, và ngay khi có mạng lại, máy hỏi `GET /api/match/state`.
5. Riêng Sinh tồn: các thao tác bắt, cướp lưới, đóng băng, giải cứu, lấy lại lưới đi qua `POST /api/match/action`.

Những điểm chính:
- **Đồng hồ:** 6 chặng × 5 phút; thêm 2 chặng phụ khi gia sư bấm "Kéo dài". Thời gian tạm dừng không tính. Máy chủ không chạy hẹn giờ (hàm Vercel ngủ giữa các lần gọi): yêu cầu đầu tiên sau mốc giờ sẽ làm trận sang chặng mới (phát tin `stage` đúng một lần) hoặc kết thúc trận (phát tin `ended` đúng một lần). Mỗi máy tự tính độ lệch giờ so với máy chủ, nên dù đồng hồ điện thoại sai vài phút vẫn thấy cùng chặng và cùng số giây còn lại.
- **Chia đội lúc bấm bắt đầu** (`src/engine/match.ts` và `teams.ts`):
  - Sinh tồn: Chạy Trốn / Săn Tìm theo tỉ lệ **60/40** đúng luật game (49 em → 29/20), cân trình độ theo độ chính xác gần đây của từng em, chia tiểu đội 4–5. Từ 1 đến 5 em thì tất cả là Chạy Trốn, đấu với 2–3 người máy.
  - Kayak: hai đội 50/50.
  - Khủng long: 1 em chơi một mình (vai Mốc); từ 2 em trở lên là một bầy, chia nhóm 4–5 em.
  - Em vào muộn được xếp vào đội đang thiếu người, rồi vào nhóm ít người nhất.
- **Điểm:** mỗi câu đúng được 1–3 sao theo tốc độ. Hàm `match_answer` trong database cộng điểm nguyên tử ngay trong lúc trận đang chạy; khi tạm dừng hoặc sau giờ, câu trả lời không được tính. Bảng điểm phát tối đa 2 giây một lần cho mỗi trận, dù lớp trả lời nhiều đến đâu.
- **Luật Cướp Lưới** (`src/engine/survivalRules.ts`) bám đúng luật game trong database. Máy chủ kiểm tra đội, lượt nạp lưới, thời gian chờ, các cửa sổ 6 giây và 8 giây, ai đang tự do và ai đang trong chuồng. Thao tác sai luật không được áp dụng và bị đếm (`refused`) để gia sư xem. Riêng khoảng cách (ai đứng gần ai) do máy học sinh vẽ; giai đoạn D4 sẽ thêm phần kiểm tra vị trí.
- **Tin có chữ ký:** kênh Realtime là kênh công khai. Ngày 27/10 tôi thử thì thấy một máy học sinh gửi được tin giả lên kênh, và các máy khác đều nhận. Vì vậy máy chủ ký mọi tin bằng ECDSA P-256, và máy học sinh kiểm chữ ký bằng Web Crypto rồi mới dùng. Tin sai chữ ký, tin của trận khác, tin cũ hơn hoặc tin phát lại đều bị bỏ.
  - Khoá ký được suy ra từ `TUTORCRAFT_SESSION_SECRET`, hoặc từ khoá service role nếu biến đó chưa đặt. Không cần thêm biến môi trường mới.
  - Đổi khoá bí mật thì máy học sinh tự nhận khoá mới ở lần hỏi trạng thái kế tiếp.
- **Giới hạn tần suất:**
  - Mỗi em: 5 yêu cầu/giây và 120 yêu cầu/phút (bộ nhớ từng máy chủ), cộng 60 câu trả lời/phút tính chung cho mọi máy chủ (bảng `rate_limits`, không mất khi Vercel khởi động lại hàm).
  - Mỗi lớp: 3.000 câu trả lời/phút.
  - Vào phòng: 150 lần/phút cho mỗi IP.
  - Bước kiểm tra giới hạn dùng chung chạy song song với việc đọc phiên, nên không làm chậm câu trả lời.
- **Bảng mới:** `matches`, `match_players`, cột `battle_sessions.match_id`, và hai cột `game_scenarios.solo_mode` / `class_mode` (migration `20261027_class_matches.sql`). RLS cho gia sư quản lý trận của mình; học sinh không đọc bảng trực tiếp.

Thử tải: `node --env-file=.env.local scripts/match-load-test.mjs --students 50 --stage-seconds 300` (xem đầu file để biết cần build và chạy máy chủ trước). Script tạo một đấu trường gắn nhãn `[LOAD TEST]` rồi tự xoá sau khi chạy.

## Cảnh 3D dùng chung, avatar, âm thanh (giai đoạn C)

- **Lõi cảnh** `src/components/modes/three/SceneRuntime.ts` gồm renderer, bộ đèn ngoài trời, bầu trời HDRI 2K (bản thấp dùng vòm gradient), vòng lặp và số liệu. Khi rời cảnh, lõi trả lại ngữ cảnh WebGL; trình duyệt chỉ giữ được khoảng 16 ngữ cảnh. `createStage()` cũ trong `kit.ts` chạy trên lõi này, nên Multiverse và Kayak dùng chung.
  - Vòm trời đi theo camera, nên camera đi xa (chặng 8, hoặc camera đặt lệch tâm) không còn bị một mảng đen trên trời.
  - `stats()` có thêm ước lượng bộ nhớ đồ họa: ảnh (kể cả bầu trời, bản môi trường PMREM, bản đồ bóng) và lưới, tính theo kích thước sau khi giải nén. Draw call và tam giác đếm mọi lượt vẽ trong khung, kể cả lượt vẽ bóng và lượt làm tối nền.
  - `maxPixelRatio` / `setPixelRatioCap()`: hạ độ nét dưới mức của tầng (chế độ máy yếu dùng 0,75).
- **Ba tầng chất lượng** (`gfxTier.ts`):
  - Mặc định là 3D cao. Ba giây đầu chậm (dưới 30 FPS) thì tự hạ xuống 3D thấp ngay tại chỗ: độ nét 1×, tắt bóng đổ, dùng bầu trời gradient. Thấp mà vẫn chậm 5 giây nữa thì chuyển sang 2D.
  - Tầng của mỗi thiết bị được nhớ trong phiên trình duyệt.
  - Cảnh cần nạp nhiều mô hình thì đặt `probe: 'manual'` và gọi `armProbe()` khi nạp xong. Lý do: lúc giải nén mô hình, máy nào cũng chậm, nên đo sớm sẽ xếp nhầm máy mạnh vào tầng thấp.
- **Dựng cảnh từ dữ liệu** (`src/engine/sceneBuilder.ts`):
  - Bố cục từng chặng lấy từ danh sách mô hình của kịch bản và `layoutSeed` của trận, nên mọi máy trong lớp dựng ra y hệt nhau.
  - Cây, bụi, đá rải trên hai bờ luôn dùng bản thấp, có trần số mặt cho mỗi bản sao và cho cả chặng (bản cao 700 nghìn, bản thấp 220 nghìn).
  - Vật dẹt hoặc dài đo theo cạnh dài nhất, vật đứng đo theo chiều cao; một số vật hay gặp có kích thước thật cố định.
  - Mỗi mô hình lặp lại được vẽ một lần (instancing).
- **Dấu chân** (`footprints.ts`): dán phẳng đúng chỗ chân chạm, mờ dần sau 20 giây; cả vệt dấu chân chỉ tốn một lần vẽ.
- **Avatar** (`avatar.ts`):
  - Ba cấp chi tiết (`LodAvatar`, luật trong `src/engine/director.ts`):
    - gần: mô hình đầy đủ, khoảng 20 nghìn tam giác ở bản cao, 10 nghìn ở bản thấp;
    - vừa: file `_mid` khoảng 5 nghìn tam giác, ảnh 512 px (29 file nhân vật và khủng long, 5,4 MB; CDN cần thêm thư mục `mid/` cạnh `web/` và `low/`);
    - xa: không có mô hình, chỉ tên và màu (vòng màu dưới chân, chấm màu, tên trong bảng tên chung).
  - Máy học sinh chỉ vẽ đầy đủ 6 bạn gần nhất, 10 bạn tiếp theo bản vừa, xa quá 45 m thì chỉ tên và màu (`STUDENT_LOD`). Chế độ máy yếu: 3 + 6, xa quá 30 m (`WEAK_STUDENT_LOD`). Mô hình chỉ nạp khi cần lần đầu rồi giữ lại; lúc mô hình gần đang nạp thì bản vừa đứng thay.
  - Đổi màu bằng vật liệu dùng chung; mạng lưới dùng chung, nên 50 avatar chỉ tốn khoảng 10 mạng lưới.
  - 6 trạng thái: đứng, chạy, vui, buồn, đúng, sai. Nhân vật có xương dùng đoạn hoạt ảnh có sẵn; khủng long và mô hình không xương dùng chuyển động bằng code.
  - Mô hình có xương được đo trong tư thế nghỉ, sau khi đã cập nhật xương. Không làm vậy thì `char_sunny_boy`, file dùng đơn vị cm, có bản sao bị to gấp 100 lần.
- **Chọn avatar** (`AvatarPicker.tsx`, `POST /api/match/join` với `{ species, color, name }`):
  - Mẫu + 1 trong 12 màu, không trùng trong trận. Kiểu đã có bạn chọn bị gạch, kèm gợi ý; máy chủ kiểm lại và trả 409 kèm `suggest`.
  - Khủng long có 6 loài; các game khác có 6 nhân vật hành trình.
- **Nhân vật truyện** (`castModels`): dùng mô hình ghi trong `[asset_id]` ở đầu `clothing_text`. Nhân vật chưa ghi thì chọn mô hình theo độ tuổi và giới tính, pha màu theo `outfit_color`. Cả 360 nhân vật đều có mô hình.
  - Thứ tự chọn (27/10): nhân vật ít lựa chọn nhất chọn trước (người già có 1 mô hình, bé gái 2, bé trai 4); người lớn và tuổi teen hết mô hình thì mượn nhóm tuổi bên cạnh; chỉ khi đó mới lặp, và lặp mô hình ít dùng nhất. Trên 30 kịch bản: số lần lặp giảm từ 59 xuống 33, số kịch bản không lặp tăng từ 3 lên 7, không mô hình nào dùng quá 2 lần trong một kịch bản (có test giữ mức này).
  - Phần lặp còn lại hầu hết là bé gái: thư viện chỉ có 2 mô hình bé gái (`char_hiker_girl`, `char_kid_dancer`). Ảnh kiểm trùng: chế độ "12 nhân vật truyện" trong trang thử.
- **Màn hình gia sư** (`TeacherBoard.tsx`): 3 cấp chi tiết (`BOARD_LOD`): 14 em gần camera là mô hình đầy đủ, 24 em tiếp theo bản vừa, các em còn lại chỉ có vòng màu và bảng tên. Tên cả lớp nằm trong một ảnh chung (`nameBoard.ts`), nên chỉ tốn một lần vẽ.
- **Đạo diễn camera và hệ quả** (nền cho C4):
  - `rt.director` (`cameraDirector.ts`):
    - `dollyTo(neo)`: lướt tới mỏ neo trong 0,4 giây, giữ, rồi lướt về đúng vị trí cảnh muốn; `dollyBack()` về sớm;
    - `focus(vật)` / `clearFocus()`: làm tối nền, vật được hỏi vẫn sáng và hiện xuyên qua vật che;
    - `cameraMove(tên)`: các tên trong `content/consequences_v2.json` (`zoom_<neo>`, `shake_small`, `shake_big`, `warp_distort`, `follow_*`, `pan_*`, `dolly_through`);
    - `rideRail(điểm)`: camera chạy trên đường cong, dùng cho cổng Multiverse.
  - Camera của cảnh vẫn tự chạy mỗi khung; đạo diễn chỉ trộn tư thế của nó lên trước khi vẽ rồi trả lại, nên khi hết động tác camera không bị giật.
  - `playOutcome()` (`three/director.ts`) chạy một hệ quả: hiệu ứng theo tên (khói, lửa, bụi, nhiễu, té nước, bong bóng, pháo hoa…: cả 72 tên trong `consequences_v2.json` đều có công thức), động tác camera và trạng thái avatar. Âm thanh và chữ chú thích để lớp giao diện của game lo.
  - Cảnh tự đăng ký mỏ neo của mình (`setAnchor('grill', vật)`); tên neo chưa có thì động tác bỏ qua.
- **Âm thanh** (`src/client/audio.ts`):
  - Hiệu ứng và âm nền (sông, lửa trại, đêm có dế, gió) đều tổng hợp bằng Web Audio, không cần tải file.
  - Có hai nút tắt: học sinh tự tắt, và gia sư tắt cả lớp (`POST /api/match/<id>` với `{ action: 'mute' | 'unmute' }`, phát qua kênh trận có chữ ký).
  - Âm thanh có giấy phép (việc C3.3) sau này chỉ cần thay nguồn phát.
- **Trang thử** `/tutor/scene-lab` có 5 chế độ: thế giới sông, 12 nhân vật truyện (kiểm trùng), màn hình gia sư 50 em, bảng chọn avatar, và Multiverse.
  - Thế giới sông: chọn kịch bản, chặng, số học sinh, tầng chất lượng, và ô "Máy yếu" (độ nét 0,75, tắt bóng, bầu trời gradient, 3 + 6 bạn có mô hình, tầm nhìn ngắn).
  - Bảng số: FPS, draw call, tam giác, bộ nhớ đồ họa ước lượng, số bạn ở từng cấp chi tiết, thời gian hiệu ứng, và dòng thiết bị (tên GPU, DPR, kích thước màn hình, số lõi, RAM).
  - "Đo 10 giây" đo thời gian khung thật bằng `requestAnimationFrame`: FPS trung bình, giây tệ nhất, khung p95. Kết quả in vào bảng số để chụp màn hình.
  - Hàng nút camera: Dolly 0,4 s, Làm tối nền, Đường ray, và "Chạy hệ quả" với mọi hệ quả trong `consequences_v2.json`.
  - "Vào ra 10 lần" kiểm rò rỉ. Ở bản dev, React chạy mỗi hiệu ứng hai lần, nên "tạo thêm" là 20.
  - Chế độ 12 nhân vật: hàm `__lab.snap()` (chỉ bản dev) xuất bảng ảnh từng nhân vật kèm tên, mô hình, màu; ô đỏ là mô hình bị lặp.

Số đo ngày 27/10 trên Mac (Apple M4), sau khi có 3 cấp chi tiết. Thời gian mỗi khung đo bằng cách vẽ liền 60 khung, buộc GPU làm xong từng khung (`gl.finish`). Draw call và tam giác đã gồm lượt vẽ bóng:

| Cảnh | Draw call | Tam giác | Bộ nhớ đồ họa (ước lượng) | Thời gian mỗi khung |
|---|---|---|---|---|
| Sông `camp-01`, bản cao (bóng đổ, HDRI 2K, độ nét 1,75×), 50 học sinh (6 gần, 10 vừa, 34 xa) và 12 nhân vật | 102 (63 không tính bóng) | 3,68 triệu (1,88 triệu không tính bóng) | ~293 MB ảnh + 10 MB lưới | 1,0 ms (p95 3,0) |
| Như trên, chế độ máy yếu (độ nét 0,75, không bóng, 3 gần, 6 vừa, 41 xa) | 57 | 689 nghìn | ~93 MB ảnh + 7 MB lưới | 0,4 ms (p95 0,6) |
| Màn hình gia sư, 50 em (14 gần, 24 vừa, 12 xa), bản cao | 80 | 748 nghìn | ~52 MB ảnh + 4 MB lưới | (không đo riêng) |

- Vào ra 10 lần với cảnh sông: còn 1 runtime sống; heap JS 86 → 87 MB.
- Vào ra 20 lần với Multiverse (đo 26/10): heap dao động quanh 85–100 MB, không tăng dần; console không có cảnh báo WebGL.
- Bộ nhớ ảnh là phần đáng lo nhất trên điện thoại: ảnh WebP được giải nén thành RGBA 8 bit trên GPU. Ở bản cao, ảnh 1024 px của 12 nhân vật truyện và ảnh 2K của bầu trời chiếm phần lớn. Nếu điện thoại thật bị tràn bộ nhớ (trang tự tải lại), hướng xử lý: nhân vật truyện dùng bản vừa trên tầng thấp, hoặc chuyển ảnh sang KTX2/Basis (nén ngay trên GPU, nhỏ hơn 4–8 lần).
- Cổng "30 FPS trên máy yếu" CHƯA đạt: mới có số đo trên M4, mà GPU điện thoại tầm thấp chậm hơn vài chục lần. Cần số liệu từ điện thoại thật (cách đo ở mục dưới).

### Âm thanh thật (WP2, 01/11)
- Nguồn: `~/Documents/3D_tutorcraft/audio/{music,sfx,ambient}` + `AUDIO_MANIFEST.csv` (giấy phép). Nén: `node scripts/encode-audio.mjs` (Terminal trong VS Code; Blender làm việc nén vì máy không có ffmpeg) → `_audio_web/*.mp3` + `content/audio_catalog.json` + `audio_*` trong `content/asset_credits.json`. MP3 cho mọi file vì Safari iPhone cũ không giải mã OGG.
- Số đo: 81 file. Nhạc 12 bài 56,0 → 11,0 MB (112 kbps), hiệu ứng 60 file 0,4 MB, nền 9 file 1,1 MB (64 kbps mono). Mỗi game tải 1–2 bài (1,2–3 MB).
- Không dùng: `ambient/wind_snow.ogg` (giấy phép chờ xác nhận; dùng `wind_window`), mọi thứ trong `audio/_nguon_cc0/`. SFXMint (campfire, wind_window, crowd_cheer_kids) ghi "AI" trên `/credits`.
- Phục vụ: dev `/dev-assets/audio/…`; production `NEXT_PUBLIC_ASSET_BASE_URL/audio/…` (`sync-assets-r2.mjs` có thư mục `audio/`). Tải lỗi → âm tổng hợp cũ.
- Luật (`src/engine/audioPlan.ts`, test `tests/audio.test.ts`): 3 bus nhạc / hiệu ứng / nền; nút tắt riêng nhạc và hiệu ứng (nền đi theo hiệu ứng); gia sư tắt tiếng lớp thắng tất cả (`matchChannel.ts`); câu hỏi mở → nhạc −8 dB, nền −4 dB; lớp nhạc đổi sau 4 s (kayak: dẫn đầu hoặc 3 câu đúng liền → `happy_adventure`; survival: kẻ săn < 8 m hoặc đồng đội bị bắt < 10 s → `dodging_lights`), chuyển mờ 1,25 s; nhạc phát theo đoạn có khoảng lặng 6–8 s; đoạn nền ngắn lặp bằng bản chồng nhau + mờ 0,4 s; máy yếu → nền tổng hợp; bước chân theo nhịp chạm chân của clip chạy (0 và ½ chu kỳ), file theo mặt đất từng nơi, cát/đá trái–phải xen kẽ; mái chèo kayak và hiệu ứng `splash` phát tiếng nước; tiếng cười đám đông chỉ khi ≥ 8 người.
- Kiểm: `/tutor/scene-lab` → khối "Âm thanh (WP2)" (chọn nơi, các công tắc, nghe từng tiếng, dòng trạng thái).

### Giao diện trong game (WP10, 02/11)
- HUD chung `src/components/hud/` (GameHUD, ArenaHUD, SettingsPanel, MapHud): thanh công cụ kính mờ, kỹ năng phải, điều khiển trái (Kayak: lái), Cài đặt 4 tab (`tc:hud` trong localStorage), Cách chơi: nội dung `content/game_guides.json` (U4), khung viền cầu vồng như khung câu hỏi, tự mở 1 lần mỗi game (`seen_guide_<game>`); đồng hồ câu hỏi do máy chủ giữ nên vẫn chạy (khung ghi rõ). Kayak + Multiverse: HUD phủ cảnh 3D; 4 game còn 2D: thanh công cụ gắn trên khung.
- U3: minimap + thanh tọa độ cho Kayak (đường sông dọc, đoạn 20 m tô cam = nhiều chướng ngại, xanh = trống; `src/engine/kayakCourse.ts` dùng chung với cảnh 3D) và thế giới sông/đồng cỏ (bản đồ tròn từ `SceneLayout`, chỉ có trong scene-lab đến khi WP8 đưa cảnh 3D vào trận). Nút "Bản đồ nhỏ" đổi trái ↔ phải; Cài đặt: Trái/Phải/Tắt, thanh tọa độ Hiện/Ẩn. Multiverse không có.
- Kiểm: `/tutor/scene-lab` → "HUD Kayak (WP10)", "HUD 5 game còn lại (WP10)", "Thế giới sông / đồng cỏ". Ảnh: `3D_tutorcraft/_report/ui/2026-11-02/`.

### Đo trên điện thoại thật

1. Máy tính và điện thoại dùng chung một mạng Wi-Fi. Xem địa chỉ mạng nội bộ của máy bằng `ipconfig getifaddr en0` (ngày 27/10 là `192.168.1.253`; địa chỉ đổi khi đổi mạng). Build production (`npx next build`), rồi chạy `TC_SERVE_LOCAL_ASSETS=1 npx next start -H 192.168.1.253 -p 3005` (cấu hình `prod-lan` trong `.claude/launch.json`).
   - `TC_SERVE_LOCAL_ASSETS=1` cho bản production đọc thư viện 3D trên máy qua `/dev-assets/…`. Không có cờ này thì route trả 404 và cảnh chỉ còn mô hình dựng bằng code. Không đặt cờ này trên Vercel.
   - Phải dùng đúng địa chỉ, không dùng `0.0.0.0`.
2. Trên điện thoại, mở `http://192.168.1.253:3005/tutor/scene-lab`. Không cần đăng nhập; kịch bản và nhân vật đọc được bằng khóa công khai. Mục "Khung hỏi + RainbowEdge (C4)" nằm trong cùng menu.
3. Đợi bảng số hiện "cảnh: … mô hình" (đã nạp xong), không chạm màn hình, rồi bấm "Đo 10 giây". Chụp màn hình khi dòng "ĐO …" hiện ra.
4. Chụp 4 lần: (a) Bản cao; (b) Bản thấp; (c) Bản thấp + Máy yếu; (d) Màn hình gia sư 50 em. Nếu điện thoại tự hạ tầng (dòng đầu ghi "tầng low" dù đã chọn Bản cao), đó cũng là một kết quả cần ghi.
5. Cổng đạt khi (c) có FPS trung bình từ 30 trở lên và giây tệ nhất từ 25 trở lên trên một điện thoại tầm thấp (ví dụ Android 3–4 năm tuổi, RAM 3–4 GB). Ghi thêm tên máy và kết quả vào bảng trên.

### Số tam giác cảnh sông, tách theo phần (27/10)

Đo tại `camp-01` chặng 1, có 50 học sinh và 12 nhân vật. Camera thấy chặng hiện tại và chặng kề, ở chặng 1 là 2 chặng. Đơn vị: nghìn tam giác.

| Phần | Bản cao | Bản thấp |
|---|---|---|
| Thế giới | 1.447 | 469 |
| ↳ cây cỏ đá rải hai bờ (fill) | 699 + 694 (2 chặng) | 219 + 212 |
| ↳ vật chính của chặng (focal) | 60 | 32 |
| ↳ mặt đất, nước, bờ | 11 | 11 |
| 50 học sinh | 153 (6 gần × ~20, 10 vừa × 5) | 110 (6 × ~10, 10 × 5) |
| 12 nhân vật truyện | 232 | 119 |
| Vòng màu, chấm, bảng tên | 9 | 9 |
| Lượt vẽ bóng | 1.799 (39 draw call) | 0 (tắt bóng) |
| Tổng | 3.672 (không tính bóng: 1.873) | 739 |

Ở chặng giữa camera thấy 3 chặng. Trường hợp nặng nhất trên 30 kịch bản là `dino-02` chặng 5: phần thế giới 2.242 nghìn ở bản cao (fill 2.072) và 735 nghìn ở bản thấp (fill 648).

So với ngân sách 700 nghìn (cao) và 220 nghìn (thấp):
- Fill của **từng chặng** nằm đúng trần (699/694 và 219/212). Lý do: `FILL_BUDGET` trong `sceneBuilder.ts` tính theo một chặng.
- **Một cảnh** vượt 2–3 lần, vì ba nguyên nhân:
  - camera thấy 2–3 chặng cùng lúc;
  - mỗi cây dùng bản thấp vẫn tới khoảng 30 nghìn tam giác (`palm_b`, `tree_nursery_pot`);
  - ở bản cao, lượt vẽ bóng vẽ lại gần như toàn bộ cảnh.
- Thêm 12 nhân vật (232 / 119 nghìn) và 50 em (153 / 110 nghìn).
- Ngân sách chưa sửa. Đề xuất, chờ duyệt:
  1. Chặng kề chỉ vẽ fill trong khoảng gần ranh giới (khoảng 1/3 chặng), hoặc vẽ fill chặng kề bằng bản `_mid` / tấm ảnh phẳng. Dự kiến giảm 30–45% phần thế giới.
  2. Fill không đổ bóng; chỉ vật chính, avatar và nhân vật đổ bóng. Lượt bóng dự kiến từ 1,8 triệu xuống khoảng 0,4 triệu.
  3. Nhân vật truyện dùng 3 cấp chi tiết như học sinh: chỉ 3–4 nhân vật gần điểm hỏi dùng bản đầy đủ, còn lại bản vừa 5 nghìn. Dự kiến giảm từ 232 xuống khoảng 100 nghìn ở bản cao.
  4. Đặt trần riêng cho cây khi dùng làm fill: bản thấp tối đa 10–15 nghìn mỗi cây.

**Đã làm 27/10 (ngân sách không đổi):**
- (a) Chặng kề chỉ giữ cây rải trong 1/3 chặng sát ranh giới (`NEIGHBOUR_REACH`, `current` trong `buildSceneLayout`). Lọc sau khi đặt, nên bố cục giống hệt trên mọi máy; vật chính của chặng kề vẫn giữ.
- (b) Cây rải không đổ bóng; vật chính vẫn đổ bóng ở bản cao (`riverWorld.ts`).
- (c) Bản cây rải riêng: `_fill` tối đa 8 nghìn mặt, `_fill_low` tối đa 3 nghìn, ảnh 512 px, cho 74 mô hình cây, bụi, đá, mặt đất, phông nền, đồ trên nước. Thực tế cao nhất 10,2 / 3,9 nghìn (vài phông nền không giản lược thêm được).
  - `river_reed` không có bản cây rải: ở 3 nghìn mặt thân và bông lau tan thành một cục (đã xem ảnh). Lau sậy vẫn không vào cây rải như trước.
  - `palm_b` ở 3 nghìn mặt vẫn rõ là cây cọ; `tree_x02` ở 1,6 nghìn mặt góc cạnh nhưng dùng được khi đứng xa.

Đo lại ở `camp-01` chặng 1 (nghìn tam giác):

| Phần | Bản cao: trước → sau | Bản thấp: trước → sau |
|---|---|---|
| Thế giới | 1.447 → 730 (cây rải 482 + 173 chặng kề) | 469 → 161 (cây rải 96 + 33) |
| 50 học sinh | 153 → 146 | 110 → 110 |
| 12 nhân vật truyện | 232 → 232 | 119 → 119 |
| Lượt vẽ bóng | 1.799 → 421 | 0 → 0 |
| Tổng | 3.672 → 1.571 (không tính bóng 1.150) | 739 → 432 |

Trường hợp nặng nhất trên 30 kịch bản (phần thế giới, 3 chặng): bản cao 2.242 → 1.181 nghìn, bản thấp 735 → 262 nghìn, cùng là `camp-01` chặng 2. Có test giữ mức này.
- Bản thấp: phần thế giới của chặng 1 (161 nghìn) đã nằm dưới 220 nghìn; cảnh xấu nhất 262 nghìn, trong đó 103 nghìn là vật chính.
- Bản cao: phần thế giới 730 nghìn, gần đúng mức 700 nghìn.
- Phần còn nặng là 12 nhân vật truyện (232 / 119 nghìn). Đề xuất 3 (nhân vật truyện dùng 3 cấp chi tiết) chưa làm.

### Kế hoạch giảm bộ nhớ ảnh bản cao (~293 MB): chuẩn bị sẵn, chỉ làm khi số đo điện thoại cần

Bộ nhớ ảnh đo ngày 27/10 ở `camp-01`, bản cao. Ảnh WebP được giải nén thành RGBA 8 bit, có mipmap:

| Phần | Ước lượng |
|---|---|
| 32 ảnh 1024 px (12 nhân vật truyện, mỗi nhân vật 3–4 ảnh: màu, normal, roughness, emissive; cộng mô hình chính) | ~179 MB |
| 24 ảnh 512 px (fill, học sinh) | ~34 MB |
| Bầu trời HDR 2K | ~22 MB |
| Bản môi trường PMREM | ~25 MB |
| Bản đồ bóng 1024² | 4 MB |

**Phương án A: nhân vật truyện dùng bản vừa** (nhanh, ít rủi ro, nên làm trước).
- Cách làm: `createAvatar({ quality: 'mid' })` (ảnh 512 px, 5 nghìn tam giác) cho nhân vật truyện. Riêng 3–4 nhân vật gần điểm hỏi dùng bản đầy đủ, qua `LodAvatar` như học sinh.
- Dự kiến giảm khoảng 130 MB, còn khoảng 160 MB. Kèm theo trên điện thoại: HDR 1K thay 2K (giảm khoảng 35 MB).
- Công: khoảng nửa ngày. Đo lại bằng nút "Đo 10 giây" và dòng bộ nhớ trong trang thử.

**Phương án B: KTX2 / Basis Universal** (ảnh nén ngay trên GPU, nhỏ hơn 4–8 lần).
- Công cụ: cài `toktx` (KTX-Software) hoặc `basisu`; thêm bước `ktx2` vào `optimize-glb.mjs`. Ảnh màu dùng ETC1S, normal map dùng UASTC.
- Trình duyệt: `KTX2Loader` của three.js cùng bộ giải mã (wasm, khoảng 200 KB) đặt trong `public/`; gọi `detectSupport(renderer)`; `withQuality` không đổi.
- Dự kiến: bộ nhớ ảnh khoảng 40–60 MB ở bản cao; file tải về tương đương hoặc nhỏ hơn WebP.
- Rủi ro:
  - ETC1S làm mờ chi tiết ảnh Meshy;
  - mã hoá chậm (vài phút cho cả thư viện);
  - phải đẩy lại toàn bộ lên R2.
- Công: 1–2 ngày, kèm kiểm ảnh bằng `validate-glb.py --thumbs`.

**Khi nào làm:** khi một trong các điều sau xảy ra trên điện thoại thật:
- trang tự tải lại hoặc mất ngữ cảnh WebGL;
- dòng bộ nhớ ảnh trên 150 MB với máy RAM 3–4 GB;
- FPS trung bình dưới 30 ở bản thấp mà draw call và tam giác vẫn trong ngân sách.

Làm phương án A trước. Vẫn chưa đủ thì làm B.

### Phòng Multiverse (D6.1, 27/10)

Bản sao của 8 file Meshy trong `Multiverse Portal/` được đặt tên theo mã phòng ở `multiverse/rooms/`; bản gốc giữ nguyên chỗ cũ. Ngân sách riêng cho phòng: bản cao 250 nghìn mặt, ảnh 2048, trần 8 MB; bản thấp 80 nghìn mặt, ảnh 1024, trần 3 MB. Blender kiểm đạt cả 8 file.

| Mã | Gốc | Bản cao | Bản thấp | Nội dung thật (ảnh chụp Blender) |
|---|---|---|---|---|
| `r_bedroom_a` | 42,9 MB | 2,20 MB | 0,90 MB | một cái giường có màu, không phải phòng |
| `r_bedroom_b` | 19,4 MB | 1,04 MB | 0,35 MB | cùng cái giường, chưa tô màu |
| `r_cyber` | 34,4 MB | 2,20 MB | 0,87 MB | một chiếc bàn, không phải phòng |
| `r_courtyard` | 218,7 MB | 3,18 MB | 1,29 MB | sân vườn thu nhỏ (hồ cá, cây phong) |
| `r_salon` | 59,6 MB | 4,24 MB | 1,49 MB | biệt thự hiện đại nhìn từ ngoài, không phải phòng khách cổ điển |
| `r_fortress_a` | 21,8 MB | 2,83 MB | 1,17 MB | lâu đài tối nhìn từ ngoài |
| `r_fortress_b` | 2,3 MB | 0,66 MB | 0,37 MB | pháo đài vuông, ít mặt |
| `r_future` | 8,7 MB | 1,25 MB | 0,52 MB | khoang nhà tương lai nhìn từ ngoài |

- Cả 8 file đạt mục tiêu dung lượng: tối đa 8 MB bản cao, 3 MB bản thấp.
- Ảnh chụp từ trên xuống cho thấy phần lớn là cảnh thu nhỏ. Kiểm lại ở tầm mắt người (27/10, `scripts/room-eye-views.py`):
  - mỗi cảnh phóng theo cỡ thật (giường 2,1 m, cyber 8 m, sân vườn 20 m, biệt thự 40 m, lâu đài 80 m, pháo đài 60 m, khoang tương lai 15 m);
  - camera cao 1,6 m trên sàn thấp nhất có đủ chỗ đứng, chụp ở 3 vị trí;
  - hai bảng ảnh và số đo: `docs/images/rooms-eye/phong-tam-mat-1.jpg`, `phong-tam-mat-2.jpg`, `views.jsonl` (24 ảnh lẻ ở `out/rooms-eye/`, ngoài git).

  | Mã | Đi vào được? | Ghi chú |
  |---|---|---|
  | `r_future` | **được** | Trong khoang: cửa sổ lục giác, ghế, trần 4,75 m. Đẹp nhất. |
  | `r_salon` | **được, nhưng thô** | Trong biệt thự có sofa, ghế, các gian; trần cách mắt 2,1–2,4 m; tối, đồ đạc vón cục. |
  | `r_courtyard` | **được (ngoài trời)** | Đứng trong vườn thấy hồ cá, đèn đá, cây phong. Không có tường hay trần. |
  | `r_fortress_b` | một phần | Sân trong tường thành đi được, nhưng 24 nghìn mặt trải trên 60 m nên ảnh mờ bệt. |
  | `r_fortress_a` | không | Lâu đài nhìn từ ngoài; chỗ kín bên trong chật, tối, toàn mặt vỡ. |
  | `r_bedroom_a`, `r_bedroom_b` | không | Chỉ là một cái giường: ở tầm mắt nhìn qua giường chỉ thấy trời. |
  | `r_cyber` | không | Một cái bàn; ở tầm mắt chỉ thấy trời. |
- Đề xuất của chủ dự án (chờ chốt sau khi xem ảnh): phòng ngủ và cyber dựng bằng hình học cộng đồ nội thất; các cảnh còn lại phóng to.
- Chưa đổi bí danh `mv_world_castle` / `mv_world_cyberpunk`. Chưa đẩy lên R2.
- Ba file còn lại trong thư mục đó không phải phòng: `Forest_Mage` và `Neon_Catgirl` là nhân vật, `Design_magical_func` chưa rõ. Cây thông 143 MB bỏ qua.

## Việc của giai đoạn D (ghi 27/10, chưa làm; D bắt đầu sau khi có số đo điện thoại)

- **Nối bộ lập lịch câu hỏi vào luồng câu thật.** `src/engine/questionSchedule.ts` đã tính điểm hỏi theo đồng hồ trận và seed (test 50 máy, tạm dừng, kéo dài). Phiên của em vẫn phát câu tuần tự. Nối vào `sessionService` / `matchService` để mọi máy hỏi đúng lúc lịch định.
- **Thử thách vàng chọn câu khó hơn.** Hiện chỉ nhân đôi xu. Khi nối lịch, câu vàng lấy từ mức khó cao hơn mức của em.
- **`ClassPodium` cho màn của em.** Khung top 3 (vàng, bạc, đồng) đã có trên màn gia sư và trong demo. Còn thiếu màn trận lớp phía em.
- **Trường "nghĩa tiếng Việt" trong schema câu hỏi, cho gợi ý bậc 1.** Hiện gợi ý bậc 1 dùng trường `hint` tiếng Việt có sẵn.
  - Cần thêm trường vào schema câu hỏi (`src/engine/schema.ts`, `GEMINI_RESPONSE_SCHEMA`), prompt Gemini (`src/server/prompt.ts`) và kho câu dự phòng.
  - **Báo chủ dự án trước khi sửa schema**, vì phần nội dung câu hỏi làm chung với bên nội dung.

## Việc cần làm (phát sinh sau giai đoạn A, 27/10/2026)

- **Thời gian chờ Gemini khi sinh câu hỏi: đã đổi 27/10.**
  - Model chính `gemini-flash-lite-latest` chờ 20 s.
  - Lỗi hoặc hết giờ thì thử lại đúng một lần bằng `gemini-3.1-flash-lite` (đời Flash-Lite trước), cũng 20 s. Vẫn lỗi thì lấy câu từ kho soạn sẵn ("Local Cached Template").
  - Route `generate-battle` đặt `maxDuration = 60`.
  - Giới hạn Vercel (vercel.com/docs/functions/configuring-functions/duration, cập nhật 24/08/2026), khi bật Fluid compute (mặc định): Hobby mặc định và tối đa 300 s; Pro mặc định 300 s, tối đa 800 s. Vì vậy 60 s nằm trong giới hạn của mọi gói.
  - Biến môi trường để đổi: `GEMINI_PRIMARY_MODEL`, `GEMINI_RETRY_MODEL`, `GEMINI_PRIMARY_TIMEOUT_MS`, `GEMINI_RETRY_TIMEOUT_MS`.
  - Đo 27/10, mỗi model một lần, 10 câu mức Beginner không có tài liệu: `flash-lite-latest` 7,8 s, `3.1-flash-lite` 8,1 s, `3.5-flash-lite` 16,5 s; `2.5-flash-lite` không còn (404).
  - Rủi ro: lần đo 26/10 có tài liệu mất khoảng 31 s cho 10 câu, nên với tài liệu dài lượt đầu có thể hết 20 s và chuyển sang lượt thử lại.
  - Coi là xong khi: 10 lần sinh liên tiếp (có tài liệu) không lần nào phải dùng kho câu.
- **Bộ nhớ GPU trên điện thoại tầm trung.** Texture đang là WebP chứ không phải KTX2 (máy chưa có `toktx`), nên GPU phải giải nén mỗi ảnh ra RGBA đầy đủ. Kế hoạch giảm (chưa làm) ở mục "Kế hoạch giảm bộ nhớ ảnh" bên dưới.
  - Cần làm: đo khi chơi kịch bản nặng nhất trên 1–2 máy Android tầm trung và một iPad đời cũ. Ngày 27/10, kịch bản nặng nhất là `dino-01`: 36,2 MB bản cao / 13,0 MB bản thấp, tính cả bản `palm_b` và `tree_nursery_pot` mới có màu; xếp sau là `dino-02` với 33,5 / 10,5 MB. Nếu máy giật, tràn bộ nhớ hoặc mất ngữ cảnh WebGL thì chuyển bản cao sang KTX2.
  - Coi là xong khi: có số đo FPS và bộ nhớ, kèm quyết định giữ WebP hay chuyển KTX2.
- ~~**`camp_grill` có hai tấm phông đen.**~~ Xong 27/10 bằng `scripts/clean-glb.mjs`, không cần tạo lại trên Meshy (xem mục "Dọn file gốc trước khi tối ưu").
- **`char_sunny_boy` dùng đơn vị cm** (cao 155 đơn vị, khung xương không có tỉ lệ 0,01 như các nhân vật khác). Code đã tự quy đổi nên hiển thị đúng; nếu bên nội dung xuất lại với tỉ lệ 0,01 thì file sẽ gọn và đồng bộ hơn. `validate-glb.py` có thêm phép kiểm "xương sai tỉ lệ" cho trường hợp hỏng thật (hông nằm ngoài thân).

- **Thiếu mô hình nhân vật truyện** (ảnh kiểm trùng ngày 27/10, chế độ "12 nhân vật truyện" trong trang thử). Thư viện có 16 mô hình người, trong đó:
  - Chỉ 2 bé gái (`char_hiker_girl`, `char_kid_dancer`): đây là phần lớn 33 lần lặp còn lại. Ví dụ `kayak-01` có 4 bé gái, nên mỗi mô hình dùng 2 lần.
  - Không có người già: bà dùng `char_female_b` (phụ nữ trẻ), ông dùng `char_wanderer`.
  - `char_wanderer` đã bỏ đĩa cỏ (27/10). Áo vải rách nên vẫn không hợp vai thầy giáo.
  - Nhân vật không phải người (robot "Bot Sóng Bạc", "Cá Heo Sông Nhí", "Sóc Hạt Dẻ") đang nhận mô hình người. Cách sửa: bên nội dung ghi `[asset_id]` ở đầu `clothing_text`, hoặc làm mô hình riêng.
  - Tư thế chữ T: 3 mô hình `char_iridescent_voyager`, `char_tpose_boy`, `char_grass_kid` không có đoạn hoạt ảnh đứng yên. Từ 27/10, `relaxArms()` trong `avatar.ts` hạ hai cánh tay xuống dọc thân khi mô hình có xương mà không có clip idle. `char_kid_dancer` cũng vậy, vì "Bar_Hang_Idle" là treo xà, tay giơ lên: luật chọn idle giờ bỏ qua các clip hang/step/turn/jump/walk. `char_boy_1` không có xương nên vẫn đứng chữ A.
  - Phong cách lẫn lộn: mô hình gần như ảnh thật (`char_female_a`, `char_female_b`, `char_skater_boy`, `char_boy_1`) đứng cạnh mô hình hoạt hình (`char_sunny_boy`, `char_hiker_girl`, `char_kid_dancer`).
  - Cần làm: tạo thêm ít nhất 4 bé gái, 2 người già (nam, nữ), 1 thầy giáo hoặc người lớn nam, cùng phong cách hoạt hình, có hoạt ảnh đứng. Chạy `optimize-glb.mjs` (bản cao, thấp và `--low --tris 10000` vào `_mid`) và `validate-glb.py`, rồi thêm vào `HUMAN_POOLS` trong `src/engine/avatars.ts`.
  - Coi là xong khi: số lần lặp trên 30 kịch bản (test trong `tests/scene.test.ts`) giảm xuống gần 0, và bảng ảnh kiểm trùng không còn ô đỏ.
