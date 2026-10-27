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

Model quét từ Meshy chia UV thành hàng nghìn mảnh, nên bộ giản lược thường bị "kẹt". Script tự chuyển sang chế độ *Permissive* (có tính tới UV). Nếu vẫn quá nặng, script lùi về chế độ *Sloppy*.

`optimize-glb.mjs` ghi an toàn: dựng GLB trong bộ nhớ, ghi ra tệp tạm cạnh tệp đích, kiểm đầu tệp (chữ `glTF`, phiên bản 2, độ dài khớp, khối đầu là JSON), đạt thì mới đổi tên đè lên tệp cũ. Lỗi giữa chừng thì tệp cũ còn nguyên. Không dùng `io.write()` với tên tệp không có đuôi `.glb`: hàm đó chọn định dạng theo đuôi tệp, nên sẽ ghi ra glTF dạng JSON kèm tệp rời. Ngày 27/10 lỗi này đã làm hỏng cả thư viện.

### Ảnh trời HDRI

- Có 5 bầu trời (Poly Haven, CC0), mỗi bầu trời 2 cỡ, tải bằng `node scripts/fetch-hdri.mjs`.
- **Bản 1K** (1,2–1,7 MB mỗi ảnh, tổng 6,6 MB) nằm trong `public/assets/hdri/` và trong git. Điện thoại dùng bản này, và mọi máy cũng dùng nó khi không tải được bản 2K: `hdriSize(url, '1k')` trong `src/config/assetLibrary.ts`.
- **Bản 2K** (4–7 MB mỗi ảnh, tổng 26 MB) **không** nằm trong git hay bản triển khai: `.gitignore` và `.vercelignore` chặn `public/assets/hdri/*_2k.hdr`. Bản này nằm cùng thư viện model, ở `~/Documents/3D_tutorcraft/hdri/`. Manifest lấy địa chỉ qua `hdri('<tên>')`, tức là `NEXT_PUBLIC_ASSET_BASE_URL/hdri/river_<tên>_2k.hdr`; khi dev thì route `/dev-assets/hdri/…` phục vụ.

Phục vụ model:
- **Khi dev:** route `/dev-assets/web|low/<file>` đọc thẳng thư viện trên máy.
- **Khi production:** đặt `NEXT_PUBLIC_ASSET_BASE_URL` trỏ tới CDN, trong đó có ba thư mục: `web/` (nội dung của `_optimized`), `low/` (nội dung của `_low`) và `hdri/` (các ảnh trời 2K trong `~/Documents/3D_tutorcraft/hdri`). Nên dùng Cloudflare R2 vì không tính phí băng thông: một lớp 50 em × khoảng 30 MB là khoảng 1,5 GB mỗi buổi, vượt xa gói Free của Supabase.
- **Chưa có CDN:** mọi model trả về 404, và cảnh tự giữ mô hình dựng bằng code. Trời thì dùng bản 1K trong `public/`.

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

## Việc cần làm (phát sinh sau giai đoạn A, 27/10/2026)

- **Thời gian chờ Gemini khi sinh câu hỏi.** Hiện chờ 17 s cho model chính và 27 s cho model phụ (`src/server/gemini.ts`, tính theo số câu × trọng số dạng bài). Ngày 26/10 đo thực tế mất khoảng 31 s cho 10 câu mức Beginner, nên dễ rơi về ngân hàng câu dự phòng.
  - Cần làm: nâng thời gian chờ theo số đo thật và thêm model dự phòng thứ ba, mà vẫn giữ tổng thời gian dưới giới hạn của hàm trên Vercel. Route sinh câu hỏi hiện chưa đặt `maxDuration`, nên chạy theo mặc định của Vercel.
  - Chữa tạm, không cần sửa code: đặt biến môi trường `GEMINI_PRIMARY_TIMEOUT_MS` (ví dụ `35000`) và `GEMINI_SECONDARY_TIMEOUT_MS` trên Vercel. Hai biến này thay hẳn công thức tính theo số câu.
  - Coi là xong khi: 10 lần sinh liên tiếp không lần nào phải dùng ngân hàng dự phòng.
- **Bộ nhớ GPU trên điện thoại tầm trung.** Texture đang là WebP chứ không phải KTX2 (máy chưa có `toktx`), nên GPU phải giải nén mỗi ảnh ra RGBA đầy đủ.
  - Cần làm: đo khi chơi kịch bản nặng nhất trên 1–2 máy Android tầm trung và một iPad đời cũ. Ngày 27/10, kịch bản nặng nhất là `dino-01`: 36,2 MB bản cao / 13,0 MB bản thấp, tính cả bản `palm_b` và `tree_nursery_pot` mới có màu; xếp sau là `dino-02` với 33,5 / 10,5 MB. Nếu máy giật, tràn bộ nhớ hoặc mất ngữ cảnh WebGL thì chuyển bản cao sang KTX2.
  - Coi là xong khi: có số đo FPS và bộ nhớ, kèm quyết định giữ WebP hay chuyển KTX2.
- **Model hỏng cần làm lại bên Meshy: `camp_grill`.** File mới thay ngày 27/10 vẫn còn hai tấm phông đen: 84% bề mặt, 93 trên 2.051 mặt nằm ở hai mặt phẳng y = ±0,95; cỏ và đá rơi vãi quanh. Lỗi nằm ở file gốc, không do tối ưu, và không vá được gọn bằng code.
  - Cần làm: tạo lại một bếp nướng đứng riêng, không có nền hay mặt đất, rồi chạy `optimize-glb.mjs --files camp/camp_grill.glb --force` (bản cao và bản thấp) và `validate-glb.py`.
  - Coi là xong khi: Blender không còn báo bề mặt đen cho file này.
