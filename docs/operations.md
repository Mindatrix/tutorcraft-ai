# Vận hành TutorCraft AI

## Kết quả trận không bao giờ mất lặng lẽ

- Học sinh trả lời câu cuối → phiên được đánh dấu `battle_sessions.result_saved = false` ("chờ lưu").
- `POST /api/battle-result` ghi vào `battle_results`, thử lại 3 lần ngay trong request. Nếu vẫn lỗi, kết quả nằm lại trên phiên kèm `pending: true`, và học sinh thấy dòng "đang tự gửi lại".
- Có ba đường gửi lại. Đường nào chạy cũng an toàn, vì nhờ `session_id` là duy nhất nên một kết quả không bao giờ bị ghi hai lần:
  1. Trình duyệt giữ token trong `localStorage` (`tc:result-outbox`) và tự gửi lại khi có mạng (`ResultOutbox`, gắn ở layout gốc).
  2. Mỗi lần có học sinh khác nộp thành công, máy chủ ghi thêm tối đa 3 kết quả đang chờ (`after()`).
  3. `GET /api/cron/retry-results` có header `Authorization: Bearer $CRON_SECRET`. Vercel Cron gọi route này mỗi ngày (`vercel.json`). Gói Hobby chỉ cho cron chạy 1 lần/ngày; muốn dày hơn thì dùng cron-job.org hoặc GitHub Actions gọi cùng URL.
- Cần đặt biến môi trường `CRON_SECRET` trên Vercel (một chuỗi ngẫu nhiên dài).

## Bản Unity (Boat Race 3D) nằm trên CDN, không nằm trong bản triển khai

- `public/unity/` đã có trong `.gitignore` và `.vercelignore`.
- Sau mỗi lần build lại Unity:

  ```bash
  node --env-file=.env.local scripts/publish-unity-build.mjs
  ```

  Script nén gzip bản build (45 MB còn khoảng 14 MB), tải lên bucket công khai `unity-builds` của Supabase Storage, vào thư mục có hash nội dung (cache 1 năm), rồi ghi lại `src/config/unityBuild.json`. Commit file JSON đó.
- Dùng bản build cục bộ khi phát triển: `NEXT_PUBLIC_UNITY_BUILD_URL=/unity/boatrace/Build`.
- Chuyển sang CDN khác (ví dụ Cloudflare R2, miễn phí băng thông) thì đặt `NEXT_PUBLIC_UNITY_BUILD_URL` trỏ tới thư mục chứa các file `.gz`, kèm `NEXT_PUBLIC_UNITY_BUILD_GZIP=1`.
- Gói Free của Supabase có 5 GB băng thông/tháng, tức khoảng 350 lượt tải lần đầu (trình duyệt cache lại sau đó).

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
