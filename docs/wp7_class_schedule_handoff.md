# WP7: lịch câu hỏi trong trận lớp, thử thách vàng, nghĩa tiếng Việt (bàn giao cho Antigravity)

> Viết 03/11/2026 bởi Claude Code. **Server xong; giao diện chưa làm.** Từ tối 03/11: giao diện (Spatial UI) do Claude Code làm, hình ảnh 3D/shader do Antigravity.

## 1. Server đã làm gì

| Phần | Chỗ trong code |
|---|---|
| Phiên trong trận lớp đi theo lịch câu hỏi (C4.6–C4.10): câu chỉ mở ở điểm hỏi; server chọn câu cho từng em (theo mức, câu sai quay lại ở dạng khác, sai 2 câu liên tiếp thì dễ hơn); điểm hỏi lỡ = hết giờ; chốt chặng = 3 câu liền trong một khung; vào muộn thì bỏ qua các điểm đã qua | `src/engine/classSession.ts`, `src/server/sessionService.ts` |
| Thử thách vàng đổi câu sang câu khó hơn một bậc, rồi câu đó được nhân đôi xu | `takeGolden()`, `POST /api/session/golden` |
| Trường `meaning_vi` (nghĩa tiếng Việt, không bắt buộc) cho gợi ý bậc 1 | `src/engine/types.ts`, `schema.ts`, `hints.ts`, `src/server/prompt.ts`, kho dự phòng `fallback.ts` |

Phiên **demo** và phiên **riêng** (không thuộc trận lớp) vẫn phát câu tuần tự như cũ: `view.slot` không có.

## 2. Hợp đồng API cho giao diện

### `view.slot` (trong mọi `view` của `/api/session*`; chỉ có ở phiên trận lớp)

```ts
interface ClassSlotView {
  id: string;            // "s3-2" hoặc "s3-chot"
  kind: 'point' | 'chot';
  stage: number;
  chain: number;         // 0..2 trong chốt
  questions: number;     // 1, hoặc 3 với chốt
  golden: boolean;       // vật phát sáng đang có, em còn nhận được
  goldenTaken: boolean;
  open: boolean;         // câu hiện tại trả lời được ngay bây giờ
  opensAt: number | null;  // giờ máy chủ (ms); null khi tạm dừng / chưa bắt đầu
  closesAt: number | null;
}
```

- `view.question` là `null` cho tới khi điểm hỏi mở. Hiện đồng hồ chờ từ `opensAt`, rồi gọi lại `GET /api/session` (hoặc `/api/session/slot`) đúng lúc mở.
- Gửi trả lời khi điểm hỏi chưa mở → `409 "Chưa tới điểm hỏi — chờ câu tiếp theo nhé."`.
- `view.totalQuestions` = tổng câu của lịch (chốt tính ×3), không phải số câu của tài liệu.
- Câu sai quay lại có **id riêng** (id gốc + 1.000.000 × lần lặp) và `is_review: true`; gửi đúng `question.id` đang hiện.

### `GET /api/session/slot`
Trả `{ slot, serverNow }`. Dùng `serverNow` để tính lệch đồng hồ máy em (không dùng `Date.now()` của máy để so với `opensAt`). Giới hạn 60 lần/phút: chỉ gọi khi cần (lúc mở trang, khi điểm hỏi tới giờ), không gọi mỗi khung hình.

### `POST /api/session/golden`
- Chỉ khi `slot.golden === true` và `slot.open === true`. Trả `{ ok, view }`; `view.question` là câu mới (khó hơn), hiện ngay thay câu cũ.
- Lỗi `409 "Chưa có vật phát sáng lúc này."` khi không ở điểm vàng, đã nhận rồi, hoặc ngoài trận lớp.
- Sai câu vàng chỉ mất chuỗi đúng, không mất xu.

### Gợi ý bậc 1 (`POST /api/session/hint`, `tier: 1`)
Không đổi hợp đồng. `hint.meaning` giờ là `meaning_vi` nếu câu có, không thì như cũ.

## 3. Việc giao diện cần làm (Claude Code; vật phát sáng 3D: Antigravity)

1. Màn trận lớp của em: đồng hồ chờ tới điểm hỏi (từ `opensAt` và `serverNow`), ẩn khung hỏi khi `question === null`, nhãn "Chốt chặng 1/3, 2/3, 3/3" theo `chain`.
2. Vật phát sáng trong cảnh 3D khi `slot.golden`, chạm để nhận (gọi `/api/session/golden`); không bắt buộc, có nút "Bỏ qua".
3. `ClassPodium` (top 3 vàng, bạc, đồng) cho màn trận lớp phía em: thành phần đã có ở `src/components/ClassPodium.tsx`, dữ liệu từ bảng điểm trận.
4. Khi trận kết thúc (`view.state.phase === 'result'`), gọi `/api/battle-result` để ghi kết quả. Phiên trận lớp giờ kết thúc theo đồng hồ trận, không theo câu cuối.

## 4. Đã chốt (chủ dự án, 03/11)

- **Hết máu giữa trận lớp:** em vẫn chơi tiếp tới hết giờ (`BattleCtx.keepPlaying`, bật cho mọi phiên trận lớp). HP về 0 chỉ là hình ảnh.
- **Mức riêng từng em:** `personalLevel(mức lớp, match_players.skill)`: +1 mức cho mỗi 0,2 độ chính xác trên 0,6, −1 cho mỗi 0,2 dưới; giới hạn 0–5.
- **Server tự ghi kết quả khi hết giờ:** khi trận kết thúc (hết giờ hoặc gia sư bấm kết thúc), `matchService` gọi `onEnded` → `sessions.finalizeMatch` chấm và ghi kết quả của mọi em trong trận. Trình duyệt gọi `/api/battle-result` sau đó vẫn được (trả kết quả đã lưu, không ghi hai lần).

Từ 03/11, phần giao diện trong mục 3 là việc của **Claude Code** (Spatial UI); Antigravity lo hình ảnh (vật phát sáng 3D, shader).
