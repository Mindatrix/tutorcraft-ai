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
5. Chạy `npm test`. Bộ test kiểm tra độ phủ, đảm bảo manifest không còn ô trống, và giữ ngân sách 40 MB (bản cao) / 15 MB (bản thấp) cho mỗi trận.

Ngân sách của bộ tối ưu (số mặt, cạnh ảnh tối đa, trần dung lượng):

| Loại | Bản cao | Bản thấp |
|---|---|---|
| Model quét lớn (cây, bụi, hang, nhà, phông nền) | 150 nghìn mặt, ảnh 1024, trần 6 MB | 30 nghìn mặt, ảnh 512, trần 2 MB |
| Mặt đất | 60 nghìn mặt | 20 nghìn mặt |
| Nhân vật, khủng long | 20 nghìn mặt | 10 nghìn mặt |
| Đồ nhỏ, cá | 8 nghìn mặt, dưới 1 MB | 4 nghìn mặt |

Model quét từ Meshy chia UV thành hàng nghìn mảnh, nên bộ giản lược thường bị "kẹt". Script tự chuyển sang chế độ *Permissive* (có tính tới UV). Nếu vẫn quá nặng, script lùi về chế độ *Sloppy*.

Phục vụ model:
- **Khi dev:** route `/dev-assets/web|low/<file>` đọc thẳng thư viện trên máy.
- **Khi production:** đặt `NEXT_PUBLIC_ASSET_BASE_URL` trỏ tới CDN, trong đó có hai thư mục `web/` (nội dung của `_optimized`) và `low/` (nội dung của `_low`). Nên dùng Cloudflare R2 vì không tính phí băng thông: một lớp 50 em × khoảng 30 MB là khoảng 1,5 GB mỗi buổi, vượt xa gói Free của Supabase.
- **Chưa có CDN:** mọi model trả về 404, và cảnh tự giữ mô hình dựng bằng code.

## Việc cần làm (phát sinh sau giai đoạn A, 27/10/2026)

- **Thời gian chờ Gemini khi sinh câu hỏi.** Hiện chờ 17 s cho model chính và 27 s cho model phụ (`src/server/gemini.ts`, tính theo số câu × trọng số dạng bài). Ngày 26/10 đo thực tế mất khoảng 31 s cho 10 câu mức Beginner, nên dễ rơi về ngân hàng câu dự phòng.
  - Cần làm: nâng thời gian chờ theo số đo thật và thêm model dự phòng thứ ba, mà vẫn giữ tổng thời gian dưới giới hạn của hàm trên Vercel.
  - Coi là xong khi: 10 lần sinh liên tiếp không lần nào phải dùng ngân hàng dự phòng.
- **Bộ nhớ GPU trên điện thoại tầm trung.** Texture đang là WebP chứ không phải KTX2 (máy chưa có `toktx`), nên GPU phải giải nén mỗi ảnh ra RGBA đầy đủ.
  - Cần làm: đo khi chơi `dino-02` (kịch bản nặng nhất: 34,5 MB bản cao / 11,4 MB bản thấp) trên 1–2 máy Android tầm trung và một iPad đời cũ. Nếu máy giật, tràn bộ nhớ hoặc mất ngữ cảnh WebGL thì chuyển bản cao sang KTX2.
