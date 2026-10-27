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

### Đo trên điện thoại thật

1. Máy tính và điện thoại dùng chung một mạng Wi-Fi. Trên máy tính, chạy dev server bằng địa chỉ mạng nội bộ của máy (ví dụ `192.168.100.184`, xem bằng `ipconfig getifaddr en0`): `npx next dev -H 192.168.100.184 -p 3005`. Next chỉ cho phép tên máy mà server được khởi động với, nên phải dùng đúng địa chỉ này, không dùng `0.0.0.0`.
2. Trên điện thoại, mở `http://192.168.100.184:3005/tutor/scene-lab`. Không cần đăng nhập; kịch bản và nhân vật đọc được bằng khóa công khai.
3. Đợi bảng số hiện "cảnh: … mô hình" (đã nạp xong), không chạm màn hình, rồi bấm "Đo 10 giây". Chụp màn hình khi dòng "ĐO …" hiện ra.
4. Chụp 4 lần: (a) Bản cao; (b) Bản thấp; (c) Bản thấp + Máy yếu; (d) Màn hình gia sư 50 em. Nếu điện thoại tự hạ tầng (dòng đầu ghi "tầng low" dù đã chọn Bản cao), đó cũng là một kết quả cần ghi.
5. Cổng đạt khi (c) có FPS trung bình từ 30 trở lên và giây tệ nhất từ 25 trở lên trên một điện thoại tầm thấp (ví dụ Android 3–4 năm tuổi, RAM 3–4 GB). Ghi thêm tên máy và kết quả vào bảng trên.

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
- **`char_sunny_boy` dùng đơn vị cm** (cao 155 đơn vị, khung xương không có tỉ lệ 0,01 như các nhân vật khác). Code đã tự quy đổi nên hiển thị đúng; nếu bên nội dung xuất lại với tỉ lệ 0,01 thì file sẽ gọn và đồng bộ hơn. `validate-glb.py` có thêm phép kiểm "xương sai tỉ lệ" cho trường hợp hỏng thật (hông nằm ngoài thân).

- **Thiếu mô hình nhân vật truyện** (ảnh kiểm trùng ngày 27/10, chế độ "12 nhân vật truyện" trong trang thử). Thư viện có 16 mô hình người, trong đó:
  - Chỉ 2 bé gái (`char_hiker_girl`, `char_kid_dancer`): đây là phần lớn 33 lần lặp còn lại. Ví dụ `kayak-01` có 4 bé gái, nên mỗi mô hình dùng 2 lần.
  - Không có người già: bà dùng `char_female_b` (phụ nữ trẻ), ông dùng `char_wanderer`.
  - `char_wanderer` có sẵn một đĩa cỏ dưới chân và trông như bù nhìn, không hợp vai thầy giáo hay ông bà.
  - Nhân vật không phải người (robot "Bot Sóng Bạc", "Cá Heo Sông Nhí", "Sóc Hạt Dẻ") đang nhận mô hình người. Cách sửa: bên nội dung ghi `[asset_id]` ở đầu `clothing_text`, hoặc làm mô hình riêng.
  - Đứng tư thế chữ T (không có hoạt ảnh đứng): `char_iridescent_voyager`, `char_tpose_boy`, `char_grass_kid`. `char_boy_1` đứng chữ A.
  - Phong cách lẫn lộn: mô hình gần như ảnh thật (`char_female_a`, `char_female_b`, `char_skater_boy`, `char_boy_1`) đứng cạnh mô hình hoạt hình (`char_sunny_boy`, `char_hiker_girl`, `char_kid_dancer`).
  - Cần làm: tạo thêm ít nhất 4 bé gái, 2 người già (nam, nữ), 1 thầy giáo hoặc người lớn nam, cùng phong cách hoạt hình, có hoạt ảnh đứng. Chạy `optimize-glb.mjs` (bản cao, thấp và `--low --tris 10000` vào `_mid`) và `validate-glb.py`, rồi thêm vào `HUMAN_POOLS` trong `src/engine/avatars.ts`.
  - Coi là xong khi: số lần lặp trên 30 kịch bản (test trong `tests/scene.test.ts`) giảm xuống gần 0, và bảng ảnh kiểm trùng không còn ô đỏ.
