# Đối chiếu "Thay game mới.pdf" ↔ `ui-upgrade-spec.md` (Claude Code, 02/11/2026)

Đọc đủ 14 trang, cả chữ và ảnh (render từng trang ra PNG bằng PDFKit vì máy không có pdftoppm).
Cột cuối: **khớp** = spec đã có đúng ý · **sửa** = spec sai hoặc thiếu, đã sửa trong spec (ghi "Sửa 02/11 (Code)") · **chưa chắc** = PDF có thể hiểu hai cách, cần chủ dự án chốt · **thêm** = spec thêm ngoài PDF (hợp lý, giữ).

| # | Ý trong PDF (trang) | Mục spec | Kết quả |
|---|---|---|---|
| 1 | Thêm slogan, nguyên văn: “ đừng tự học từ vựng khô khan nữa hãy để Tutorcraft giúp bạn biến nó thành dopamine” (tr.1) | U0 | **sửa**: chữ đúng, nhưng spec thêm viết hoa "Đừng", dấu phẩy, dấu chấm. Đã ghi nguyên văn vào spec; bản hiển thị chỉ thêm viết hoa đầu câu + dấu câu (không đổi chữ), chờ user đồng ý |
| 2 | Slogan "thêm vào" slogan cũ, không thay (tr.1) | U0 | khớp |
| 3 | Mọi game là thế giới ảo mở (tr.1) | U1 | khớp |
| 4 | Điều khiển bên TRÁI (tr.1) | U1 | khớp (trái-dưới, cần ảo / gợi ý WASD) |
| 5 | Kỹ năng bên PHẢI, nhiều hay ít tùy game (tr.1) | U1 | khớp |
| 6 | Thanh công cụ trên cùng, nằm NGANG (tr.1) | U1 | khớp |
| 7 | Thanh công cụ "mờ không gian chơi, trong suốt" (tr.1) | U1 | **sửa**: spec ghi "không che không gian chơi". Hiểu đúng hơn: nền kính mờ (làm mờ nhẹ phần cảnh phía sau thanh, vẫn nhìn xuyên được) |
| 8 | Nút màu đậm (đen hoặc màu hợp lý), tương phản cao, dễ thấy (tr.1) | U1 | khớp (≥ 4.5:1) |
| 9 | Danh sách nút + công năng, chủ yếu chỉnh setting: tiếng game, thông tin nhân vật, kỹ năng của game; Code toàn quyền thêm (tr.1) | U1 bảng 10 nút | khớp; câu hỏi chốt danh sách để user duyệt |
| 10 | Minimap góc TRÁI-trên mặc định, đổi sang PHẢI bằng 1 nút trên thanh công cụ (tr.1) | U1 #5, U3 | khớp |
| 11 | Minimap cho: Sinh Tồn Sông Nước, Câu Cá Trại Hè (River Fishing), Nhiệm Vụ Trại Hè, Khủng Long (tr.1) + Kayak (tr.2) | U3 | khớp (5 game) |
| 12 | Minimap thể hiện rõ bối cảnh thu nhỏ, mô phỏng địa hình xung quanh (tr.1) | U3 | khớp; spec thêm "xoay theo hướng nhìn" (**thêm**, giữ) |
| 13 | 5 game trên BẮT BUỘC có thanh tọa độ (tr.1) | U3 | khớp |
| 14 | Thanh tọa độ cho biết hướng nhìn của mình (tr.1) | U3 | khớp |
| 15 | Thanh tọa độ cho biết vị trí đồng đội ĐANG ĐỨNG và ĐANG NHÌN (tr.1) | U3 | **sửa**: spec có vị trí, thiếu hướng nhìn của đồng đội. Đã thêm (mũi tên hướng trên biểu tượng đồng đội) |
| 16 | Thanh tọa độ NGAY DƯỚI thanh công cụ, chỉ tông trong suốt (tr.1) | U3 | khớp |
| 17 | Vạch dài/ngắn xen kẽ hướng xuống, số tọa độ bên dưới (tr.1) | U3 | khớp |
| 18 | Multiverse: KHÔNG minimap, KHÔNG thanh tọa độ, "còn lại phải có đủ" (tr.1) | U3 | khớp |
| 19 | Multiverse: thanh thẻ các không gian sắp xuyên tới, thẻ xoay vòng tròn như giao diện web từng làm; nhỏ gọn, viền trong suốt, góc TRÁI-trên (tr.1–2) | U3 PortalCardRail | khớp (`ScenarioCarousel3D.tsx` có thật trong repo) |
| 20 | Kayak: thanh công cụ + thanh tọa độ + minimap đường sông (tr.2) | U5 | khớp |
| 21 | Minimap Kayak chỉ rõ chỗ nhiều gỗ (né) và chỗ không gỗ ("trèo" = chèo nhanh, tăng tốc); kịch bản chưa có thì thêm (tr.2) | U5 | khớp |
| 22 | Kỹ năng Kayak bên phải "NHƯ LÀ" tăng tốc theo thanh Nộ (tr.2) | U5 | **sửa**: "như là" = ví dụ, có thể thêm kỹ năng khác. Đã ghi vào spec |
| 23 | Nộ tích ~30 s; đầy thì tăng tốc tối đa 30 s (tr.2) | U5 | khớp |
| 24 | "cứ theo mốc đó mà phân tích để chỉnh xuống dần" (tr.2) | U5 | **sửa**: spec bỏ sót. 30 s / 30 s là mốc trên, phải phân tích rồi chỉnh xuống. Đã thêm |
| 25 | "dùng thanh nộ quá 10 sẽ hồi lâu hơn trong khoảng 1 phút" (tr.2) | U5 | **chưa chắc**: "quá 10" có thể là quá 10 GIÂY một lần dùng (spec đang hiểu vậy) hoặc quá 10 LẦN. Hỏi user |
| 26 | Mục đích: kích thích tư duy chiến thuật (tr.2) | U5 | khớp |
| 27 | Nút nhỏ trên thanh công cụ mở khung cách chơi / hướng dẫn chơi khi quên (tr.2) | U4 | khớp; spec thêm tự mở lần đầu (**thêm**, giữ) |
| 28 | Khung hướng dẫn có nền mờ GIỐNG Y khung câu hỏi (tr.2) | U4 | khớp |
| 29 | Ảnh tham khảo dùng để mô phỏng thiết kế MÀN CHỜ, CHỌN NHÂN VẬT, và giao diện từng game (tr.2) | §0 | **sửa**: spec chỉ nói "học bố cục", không có việc màn chờ. Đã thêm U8 (màn chờ + chọn nhân vật, chờ user xác nhận phạm vi) |
| 30 | Ảnh Nguyên Phong 1258: màn chờ tối, menu dọc trái đánh số La Mã, tiêu đề serif lớn, nhân vật quay lưng nhìn cảnh (tr.2) | §0, U8 | khớp (§0) + U8 |
| 31 | Ảnh RuneScape: cảnh bến sông, khung thông tin mờ góc phải, thanh trạng thái đáy (tr.3) | §0 | khớp |
| 32 | 2 ảnh Raft: cần ảo trái-dưới, cụm nút hành động phải, la bàn mảnh ở giữa trên cùng, cài đặt góc trái-trên, thanh vật phẩm đáy, tài nguyên góc phải-trên (tr.4) | §0 | **sửa** nhỏ: spec không nhắc la bàn mảnh giữa-trên của Raft, chính là mẫu cho thanh tọa độ. Đã thêm |
| 33 | Genshin: ảnh nhóm nhân vật + màn đồ (lưới trái, nhân vật 3D giữa, thông số phải) (tr.5) | §0, U6 | khớp |
| 34 | Genshin: minimap tròn trên-trái, thanh EXP mảnh đáy; menu nhân vật thanh dọc trái, mũi tên chỉ Cài đặt (tr.6) | §0, U1 | khớp |
| 35 | Genshin menu đánh số 1–20: ảnh đại diện, mã, tên, thanh cấp/kinh nghiệm, ngày sinh, cửa hàng, đội, bạn bè, nhân vật, hồ sơ, túi đồ, nhiệm vụ, bản đồ, sự kiện, cầu nguyện, cộng đồng, góp ý, thanh dọc trái (tr.7) | U1 #2 | **sửa**: spec chưa ánh xạ 20 số. Đã thêm bảng: lấy 1, 3, 4, 9, 11, 12, 13, 16; số 6 (cửa hàng) dính bảng xu (phải báo trước); bỏ bạn bè, cộng đồng, cầu nguyện, mã UID (an toàn học sinh, không gacha) |
| 36 | Liên Quân 4 vùng: (1) minimap trên-trái, (2) gợi ý mua đồ dưới minimap, (3) thời gian/tỉ số/mạng trên-phải, (4) cụm kỹ năng dưới-phải; cần ảo dưới-trái (tr.7) | §0 | khớp |
| 37 | 2 màn Cài đặt: tab dọc trái; nội dung bên phải dạng thanh trượt nấc (độ phân giải, chất lượng 5 nấc, chi tiết 3 nấc, độ sáng 5 nấc), Dọn RAM, ngôn ngữ, Khôi phục; tab Điều khiển có lựa chọn kèm ảnh minh họa (tr.8) | U2 | khớp (3 nấc chất lượng = 3 tầng gfxTier) |
| 38 | Demo chơi bằng game 3D thật trong web, KHÔNG dùng giao diện cũ (tr.8) | U6 | khớp |
| 39 | Màn vào demo: thêm nút CHỌN GAME muốn chơi demo (tr.8) | U6 | khớp |
| 40 | 20 câu, "present simple đơn giản" (tr.8) | U6 | **sửa**: spec chỉ ghi "20 câu đơn giản", thiếu chủ đề thì hiện tại đơn. Ngân hàng demo hiện có 8 câu (quá khứ đơn, bị động…). Đã sửa |
| 41 | Ô nhập tên có dải đèn 7 màu chạy xung quanh (tr.8) | U6 | khớp |
| 42 | Thay biểu tượng "quê mùa" bằng tất cả nhân vật; demo để TOÀN BỘ nhân vật (tr.8) | U6 | khớp (PDF đã nói demo hiện hết; chỉ lớp thật mới cần hỏi có lọc theo game) |
| 43 | MỖI khung nhân vật là khung 3D xoay được 360° (tr.8) | U6 | **sửa**: spec cho mỗi thẻ ảnh tĩnh, chỉ thẻ đang chọn xoay. Đã đổi: mọi thẻ xoay 360° bằng ảnh quay vòng dựng sẵn (24 góc, kéo để xoay), thẻ đang chọn là 3D thật. Không tạo 62 canvas WebGL |
| 44 | Nút "tạo game" ở GIỮA màn hình (tr.8) | U6 | khớp |
| 45 | Phía trên nút: hướng dẫn và điều khoản chơi, xem chi tiết / thu gọn bằng nút "learn more" (tr.8–9) | U6 | **chưa chắc** nhỏ: spec dịch là "Tìm hiểu thêm". Đề xuất nhãn "Xem thêm" / "Thu gọn" (tiếng Việt cho học sinh); nếu user muốn giữ chữ "learn more" thì đổi |
| 46 | Thiết kế web trên 3 thiết bị: máy tính (laptop, desktop), tablet (iPad, tablet), điện thoại (Android, iOS) (tr.9) | U7 | khớp |
| 47 | 5 trang ảnh mockup responsive: một nội dung, bố cục đổi theo màn; điện thoại xếp 1 cột, tablet 2–3 cột, máy tính nhiều cột + menu ngang (tr.10–14) | U7 | khớp |
| 48 | Học triệt để phân tích + hình ảnh, ra web "perfect nhất có thể", "bớt sặc mùi AI" (tr.14) | §3 | khớp |
| 49 | "Hãy cho tôi biết bạn dự định học hỏi và làm thế nào?" (tr.14) | §3 | khớp; câu trả lời của Code trong báo cáo |

**Tổng:** 49 ý. Khớp 37 (kể cả 3 chỗ spec thêm hợp lý). Sửa 10 (#1, 7, 15, 22, 24, 29, 32, 35, 40, 43). Chưa chắc 2 (#25, #45), hỏi user.

Ghi chú: spec §0 nói "Trang 4–11 là ảnh"; thực tế ảnh bắt đầu ở cuối trang 2 (Nguyên Phong). Trang 3, 4, 5, 6, 7, 10, 11, 12, 13 chỉ có ảnh, không có chữ.
