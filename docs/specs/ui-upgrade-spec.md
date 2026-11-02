# UI-UPGRADE — Nâng cấp giao diện "Thay game mới" (WP10)
Nguồn: `Thay game mới.pdf` (14 trang, chủ dự án viết 02/11/2026). Người soạn: Claude chat. Người làm: Claude Code.
Quy tắc chung vẫn theo `code-next-steps.md` §0 (không push, commit khi user nói "commit", đổi schema DB phải hỏi, nói rõ Terminal nào, file không dùng được -> `_de_xoa`).

## 0. Ảnh tham khảo trong PDF (chỉ học BỐ CỤC, không chép)
Ảnh là ảnh chụp game thương mại (Nguyên Phong 1258, RuneScape, Raft, Genshin Impact, Liên Quân) và mockup web responsive.
KHÔNG dùng icon/font/logo/tên/hình của các game đó, không dựng lại chính xác. Chỉ rút nguyên tắc:
- Genshin: minimap tròn góc trên trái, menu lưới icon, thanh tiến độ mảnh, màn hình nhân vật có 3D xoay giữa.
- Liên Quân: 4 vùng — (1) minimap TL, (2) thông tin phụ TL-dưới, (3) thanh trạng thái TR, (4) cụm kỹ năng BR; joystick BL; màn Cài đặt có tab trái + slider chất lượng 5 nấc.
- Raft/RuneScape: thanh công cụ nhanh ở đáy, ngắm/cần câu giữa, số liệu nhỏ ở góc.
- Nguyên Phong: màn chờ tối, menu dọc bên trái, hình nghệ thuật bên phải, chữ tiêu đề serif lớn.
- Mockup responsive: 1 nội dung, 3 bố cục (desktop nhiều cột, tablet 2 cột, phone 1 cột).

## 1. Hiện trạng repo (đã kiểm tra 02/11)
- Chưa có HUD chung, minimap, thanh tọa độ, thanh công cụ, màn Cài đặt. `ModeStage.tsx` chỉ chọn cảnh theo `gameModes`.
- Slogan: `src/components/landing/Shapes.tsx` `CurvedSlogan` ("Học mà chơi, chơi mà học"), dùng ở `Landing.tsx:250`; hero `<h1>` ở `Landing.tsx:47`.
- Demo: `app/student/page.tsx` -> `BattleLoader` với `DEMO_BATTLE_ID` (`src/engine/demo`), chạy bằng ngân hàng câu hỏi sẵn, không DB.
- Join: `JoinForm.tsx` (45 dòng) + `AvatarPicker.tsx` (emoji 🧒👦🎮…, 12 màu, trùng "mẫu+màu" bị gạch).
- Có: `gfxTier.ts` (3D cao/thấp/2D), `QuestionFrame` + `questionFrame.css` (khung kính mờ + RainbowEdge), `AudioManager` 3 bus (WP2), `ClassPodium.tsx`, `character_casting.json` (62 nhân vật).

## 2. Danh sách việc (U0–U7)

### U0. Slogan (nhỏ, làm ngay)
Thêm đúng câu: **"Đừng tự học từ vựng khô khan nữa, hãy để Tutorcraft giúp bạn biến nó thành dopamine."**
- Sửa 02/11 (Code): nguyên văn trong PDF là “đừng tự học từ vựng khô khan nữa hãy để Tutorcraft giúp bạn biến nó thành dopamine” (không viết hoa đầu, không dấu phẩy, không dấu chấm). Bản hiển thị ở trên chỉ thêm viết hoa đầu câu + dấu câu, không đổi chữ nào: chờ user đồng ý, nếu không thì dùng đúng nguyên văn.
- Đặt dưới `CurvedSlogan`/hero ở `Landing.tsx`, đồng thời vào `<meta description>` và og:description (`app/layout.tsx`).
- Giữ nguyên slogan cũ (thêm, không thay). Chữ "Tutorcraft" giữ đúng viết hoa như user viết, "dopamine" có thể nhấn màu.

### U1. Khung HUD chung `GameHUD` (mọi game 3D)
Component `src/components/hud/GameHUD.tsx` bọc cảnh, nhận cấu hình theo game: `{ skills[], minimap: boolean, coordBar: boolean, extraTools[] }`.
Bố cục (mô hình thế giới mở):
- **Trái-dưới:** điều khiển di chuyển (cần ảo trên cảm ứng; trên máy tính hiện gợi ý WASD/mũi tên mờ, ẩn sau 10s).
- **Phải-dưới:** cụm kỹ năng của game (ít hay nhiều tùy game; nút tròn ≥ 56px, có cooldown vòng, phím tắt hiện trên máy tính).
- **Trên cùng, ngang:** `ToolBar` — nền trong suốt/mờ (không che không gian chơi), nút màu đậm tương phản cao (đen/xanh đậm + viền sáng, kiểm tra tương phản ≥ 4.5:1).
  - Sửa 02/11 (Code): PDF viết "mờ không gian chơi, trong suốt" = nền kính mờ: làm mờ nhẹ phần cảnh ngay sau thanh (`backdrop-filter: blur`), vẫn nhìn xuyên; máy yếu / tier 2D bỏ blur, chỉ nền trong suốt tối.
- Khung câu hỏi (QuestionFrame) giữ nguyên; HUD tự thu nhỏ/ẩn bớt khi câu hỏi hiện (tránh che đáp án).
- Biến vùng an toàn `env(safe-area-inset-*)`; ngang điện thoại là hướng chơi chính.

**Danh sách nút thanh công cụ (user cho toàn quyền thêm) — đề xuất, mỗi nút có công năng rõ:**
| # | Nút | Công năng | Game |
|---|-----|-----------|------|
| 1 | Âm thanh | bật/tắt tổng + mở mixer 3 slider (nhạc/hiệu ứng/môi trường) | tất cả |
| 2 | Nhân vật | thẻ thông tin: tên, mẫu, màu, xu, điểm, cấp độ | tất cả |
| 3 | Kỹ năng | liệt kê kỹ năng của game + mô tả ngắn | tất cả |
| 4 | Hướng dẫn chơi | mở khung hướng dẫn nền mờ y như khung câu hỏi (xem U4) | tất cả |
| 5 | Bản đồ nhỏ | đổi vị trí minimap góc trái <-> phải; bật/tắt | trừ Multiverse |
| 6 | Bảng xếp hạng | `ClassPodium` thu gọn (chỉ top 5 + mình) | tất cả |
| 7 | Gợi ý | dùng gợi ý 2 tầng (C4), hiện số lần còn | khi có câu hỏi |
| 8 | Cài đặt | mở màn Cài đặt (U2) | tất cả |
| 9 | Toàn màn hình | fullscreen API (ẩn trên iOS nếu không hỗ trợ) | tất cả |
| 10 | Tạm dừng/Thoát | giáo viên điều khiển; học sinh chỉ "Rời trận" có xác nhận | tất cả |
Không thêm nút trò chuyện tự do (an toàn học sinh). Mọi nhãn tiếng Việt, có `aria-label`.

**Bảng "Nhân vật" (nút #2) — học từ menu Genshin đánh số 1–20 (PDF tr.7). Sửa 02/11 (Code): spec chưa ánh xạ các số.**
| Số trong ảnh | Ý gốc | Dùng ở TutorCraft |
|---|---|---|
| 1 ảnh đại diện, 3 tên | thẻ người chơi | Có: avatar 3D nhỏ + tên trong trận |
| 4 thanh cấp/kinh nghiệm | tiến độ | Có: cấp độ bài (0–6) + thanh câu đúng trong trận |
| 9 nhân vật, 11 túi đồ | đổi nhân vật, đồ | Có (chỉ xem): mẫu, màu, phụ kiện đã có |
| 6 cửa hàng | mua đồ | Chưa: dính bảng xu/cửa hàng → phải báo user trước (luật chung) |
| 12 nhiệm vụ, 13 bản đồ | mục tiêu, bản đồ lớn | Có: mục tiêu chặng + bản đồ cả màn (mở từ minimap) |
| 16 góp ý | phản hồi | Có: "Báo lỗi" gửi cho giáo viên, không phải chat |
| 2 mã UID, 5 ngày sinh, 8 bạn bè, 14 cầu nguyện, 15 cộng đồng | | Không: dữ liệu cá nhân / mạng xã hội / gacha không hợp với học sinh |
| 7 đội, 10 hồ sơ, 17–20 thanh dọc trái | | Đội: chỉ game chia đội (Sinh Tồn). Thanh dọc trái → ý tưởng cho menu tạm dừng trên điện thoại dọc |

### U2. Màn Cài đặt (học bố cục Liên Quân, nội dung riêng)
Tab trái: **Chung · Điều khiển · Giao diện · Âm thanh**.
- Chung: chất lượng hình ảnh (Tiêu chuẩn / Cao / Siêu cao — nối với `gfxTier`: 2D / 3D thấp / 3D cao), chi tiết (1-Thấp/2-Trung/3-Cao: mật độ cây, cỏ, hạt), độ sáng (5 nấc), **Dọn bộ nhớ** (dispose cache texture/geometry không dùng), ngôn ngữ (Việt Nam; chỉ có vi), **Khôi phục mặc định**.
- Điều khiển: kích cỡ/độ mờ cần ảo và nút kỹ năng, bên cầm tay (đổi trái-phải cho người thuận tay trái), độ nhạy camera.
- Giao diện: vị trí minimap, bật/tắt thanh tọa độ, cỡ chữ HUD.
- Âm thanh: 3 slider + nút tắt từng bus (dùng AudioManager WP2).
Lưu `localStorage` (try/catch, render đúng khi không có storage) + áp dụng ngay (xem trước trực tiếp).

### U3. Minimap + thanh tọa độ (Sinh Tồn Sông Nước, Câu Cá Trại Hè, Nhiệm Vụ Trại Hè, Khủng Long, Kayak Rush)
**Minimap** (mặc định góc TRÁI-trên, đổi sang PHẢI bằng nút #5, nhớ lựa chọn):
- Camera trực giao nhìn từ trên xuống, render vào RenderTarget nhỏ (128–192px), cập nhật ~10 fps, tắt hẳn ở tier 2D/thấp (thay bằng vẽ canvas 2D từ dữ liệu vị trí).
- Khung tròn/bo góc, viền trong suốt cùng tông với HUD; xoay theo hướng nhìn; chấm: mình (mũi tên), đồng đội (màu avatar), mục tiêu nhiệm vụ.
- Dữ liệu địa hình lấy từ `SceneRuntime`/`riverWorld` — KHÔNG dựng cảnh thứ hai.
**Thanh tọa độ** (bắt buộc cho 5 game trên; ngay DƯỚI thanh công cụ; chỉ tông trong suốt):
- Dải la bàn ngang: vạch dài/ngắn xen kẽ hướng xuống, số độ bên dưới (0/45/90…), N-E-S-W ở vạch chính.
- Hiện hướng đang nhìn ở giữa; biểu tượng đồng đội chạy dọc dải theo góc phương vị; hiện tọa độ (x,z làm tròn) của mình, và đồng đội khi chạm/hover.
- Sửa 02/11 (Code): PDF yêu cầu biết đồng đội "đang đứng" VÀ "đang nhìn": biểu tượng đồng đội có mũi tên nhỏ chỉ hướng nhìn của bạn đó (gửi kèm góc nhìn trong gói vị trí).
- Mẫu bố cục gần nhất: la bàn mảnh ở giữa trên cùng của ảnh Raft (PDF tr.4).
- Dữ liệu đồng đội đã có trong luồng `matchBroadcast`; chỉ tăng tần suất gửi vị trí ≤ 4 lần/giây/học sinh, lớp 50 em phải vẫn dưới ngân sách băng thông (đo và báo).
**Multiverse Portal RPG: KHÔNG minimap, KHÔNG thanh tọa độ**, nhưng có đủ trái/phải/toolbar và thêm `PortalCardRail`:
- Dải nhỏ gọn, khung trong suốt, góc TRÁI-trên, hiện các thẻ không gian sắp xuyên tới (theo `multiverse_rooms.json`/kịch bản mv-01..05); thẻ xoay vòng (carousel tròn) giống màn chọn kịch bản trong web (`ScenarioCarousel3D.tsx` — tái dùng), thẻ hiện tại sáng, thẻ sau mờ.

### U4. Khung "Cách chơi" (không bị quên hướng dẫn)
Nút #4 trên thanh công cụ mở khung hướng dẫn: nền mờ + RainbowEdge y như QuestionFrame (tái dùng `questionFrame.css`/`skins.ts`, không viết CSS mới nếu tránh được).
Nội dung theo game từ file mới `content/game_guides.json` (`{game, controls[], skills[], goal, tips[]}`, tiếng Việt, ≤ 6 dòng/mục). Lần đầu vào game tự mở 1 lần (cờ `seen_guide_<game>` trong localStorage), có "Đóng" và Esc. Game đang chạy: hộp thoại tạm dừng riêng tư của học sinh đó, không dừng cả lớp.

### U5. Kayak Rush 3D (ngoài HUD chung)
- Thanh công cụ + thanh tọa độ + minimap **đường sông/đường đua**.
- Minimap tô nhiệt độ gỗ: đoạn nhiều gỗ = đỏ cam ("tập trung né"), đoạn trống = xanh ("tăng tốc/trèo nhanh"). Tính từ vị trí vật cản theo đoạn sông (mật độ/đoạn 20 m). Nếu kịch bản chưa có đoạn trống/đoạn dày thì THÊM vào sinh cảnh (báo cáo thay đổi kịch bản trước).
- Kỹ năng bên phải: **Tăng tốc theo thanh Nộ** (PDF viết "như là": đây là ví dụ, có thể thêm kỹ năng khác — sửa 02/11):
  - Nộ tích đầy trong ~30 giây chơi; khi đầy được tăng tốc tối đa 30 giây (thanh tụt dần theo thời gian dùng).
  - Sửa 02/11 (Code): PDF thêm "cứ theo mốc đó mà phân tích để chỉnh xuống dần" = 30 s / 30 s là MỐC TRÊN; phải mô phỏng một trận và chỉnh xuống (đề xuất bắt đầu ở tích 30 s / dùng tối đa 8–10 s), ghi số đo vào báo cáo.
  - "quá 10" CHƯA CHẮC: quá 10 GIÂY trong một lần dùng, hay quá 10 LẦN dùng trong trận. Hỏi user.
  - Dùng liên tục quá 10 giây => hồi lâu hơn (~60 giây); dùng ngắn hơn => hồi tỷ lệ (≤ 30 giây). Đây là cách mình hiểu câu "dùng thanh nộ quá 10 sẽ hồi lâu hơn trong khoảng 1 phút" — **CHƯA CHẮC, đặt các số này trong `content/kayak_rage.json` để chỉnh, và hỏi lại user trước khi chốt**.
  - Mục tiêu sư phạm: kích thích tư duy chiến thuật (dành nộ cho đoạn sông trống), KHÔNG được làm thắng/thua phụ thuộc kỹ năng thay cho trả lời câu hỏi; tốc độ không bỏ qua cổng câu hỏi; máy chủ vẫn giữ đáp án và điểm.
  - Sai không mất xu (luật C4). Nộ không dùng được khi QuestionFrame đang hiện.

### U6. Demo chơi thử (viết lại)
Yêu cầu của user: chơi demo trên web bằng đồ họa 3D thật, không dùng giao diện cũ.
1. **Màn vào** (thay `StudentDemoPage` + `JoinForm` + `AvatarPicker` khi ở chế độ demo; lớp học thật vẫn giữ ràng buộc "mẫu+màu không trùng"):
   - Ô nhập tên: viền có **dải đèn 7 màu chạy xung quanh** (conic-gradient xoay, tôn trọng `prefers-reduced-motion`).
   - **Chọn game muốn chơi demo** (6 game, nút lớn).
   - Thay các biểu tượng emoji bằng **toàn bộ nhân vật** (đọc `content/character_casting.json`; demo hiển thị hết, lọc theo game chỉ ở lớp thật). Mỗi thẻ có khung 3D **xoay 360°**.
   - Hiệu năng: KHÔNG tạo 62 canvas WebGL. Dùng 1 renderer chung; thẻ đang chọn/hover xoay thật, các thẻ còn lại dùng ảnh thu nhỏ webp dựng sẵn (script `scripts/render-character-thumbs.mjs`, chạy bằng Playwright, lưu `public/characters/thumbs/`). Tier thấp: chỉ ảnh tĩnh.
   - Sửa 02/11 (Code): PDF muốn MỖI khung nhân vật xoay được 360°. Thay ảnh tĩnh bằng **ảnh quay vòng dựng sẵn** (24 góc mỗi nhân vật, 1 sprite webp, Blender render như `validate-glb.py --thumbs`): mọi thẻ tự xoay chậm và kéo được để xoay; thẻ đang chọn là 3D thật. Vẫn chỉ 1 canvas WebGL. Tier thấp/`prefers-reduced-motion`: đứng yên, kéo vẫn xoay.
   - Nút **"Tạo game"** ở giữa màn hình; phía trên là **hướng dẫn và điều khoản chơi**, thu gọn/xem chi tiết bằng nút "Tìm hiểu thêm" (learn more).
     (PDF dùng chữ "learn more". Đề xuất nhãn tiếng Việt "Xem thêm" / "Thu gọn"; chờ user chọn.)
2. **Vào chơi:** dùng đúng cảnh 3D của game đã chọn + GameHUD; dữ liệu đầu vào là **20 câu đơn giản** (ngân hàng demo `src/engine/demo`, mở rộng lên 20 câu, đơn giản, có nghĩa tiếng Việt).
   - Sửa 02/11 (Code): PDF ghi rõ **20 câu "present simple" (thì hiện tại đơn) đơn giản**. Ngân hàng demo hiện có 8 câu, chủ đề quá khứ đơn / bị động: phải thay bằng 20 câu hiện tại đơn (do Claude chat soạn trong `content/`, Code chỉ nối). Không DB, không lưu kết quả (`resultSaved: null` như hiện tại).
3. Đo: thời gian từ nhấn "Tạo game" đến khung hình đầu ≤ 5 s trên máy yếu (tier thấp).

### U7. Responsive 3 thiết bị (máy tính / máy tính bảng / điện thoại)
- Điểm ngắt: ≥1024 (desktop), 640–1023 (tablet), <640 (điện thoại). Game: ưu tiên ngang; dọc hiện nhắc xoay màn hình (không chặn nếu chơi được).
- Cảm ứng: mục tiêu chạm ≥ 44px, không phụ thuộc hover, chặn double-tap zoom và pull-to-refresh trong cảnh.
- Trang web (Landing, Join, Demo, Teacher): 1 nội dung, 3 bố cục; không cuộn ngang; chữ ≥ 16px.
- Kiểm thử bằng Playwright chụp ảnh ở: 1440×900, 1024×768, 820×1180, 390×844, 844×390; lưu `_report/ui/<ngày>/` và báo cáo. Không đạt = chưa xong.
- "Làm web hoàn hảo nhất, bớt sặc mùi AI" -> xem §3.

### U8. Màn chờ + chọn nhân vật theo từng game (thêm 02/11, Code)
PDF tr.2: "Các hình có thể tham khảo và mô phỏng theo thiết kế của **Màn chờ, chọn nhân vật, từng game tương ứng**". Spec cũ chưa có việc màn chờ.
- Màn chờ (lobby trước khi gia sư bắt đầu, và màn mở đầu từng game): bố cục kiểu ảnh Nguyên Phong — nền là cảnh 3D của chính game đó (không ảnh vẽ thương mại), menu dọc bên trái đánh số, tiêu đề game lớn, dòng "hành trình của bạn" (tiến độ) phía dưới, góc phải nhỏ ghi trạng thái âm thanh.
- Chọn nhân vật: theo màn đồ Genshin tr.5 — lưới thẻ bên trái, nhân vật 3D lớn ở giữa xoay được, thông tin bên phải (mẫu, màu, phụ kiện).
- Phạm vi chờ user xác nhận (có làm màn chờ cho cả lớp thật hay chỉ demo); làm sau U6, dùng chung thành phần với U6.

## 3. Cách học và làm (trả lời câu hỏi cuối trong PDF)
1. **Phân tích có hệ thống trước khi code:** lập bảng `docs/specs/ui-reference-notes.md` cho từng ảnh tham khảo: vùng màn hình, kích thước tương đối, mật độ thông tin, màu/tương phản, cử chỉ. Rút ra 10–15 nguyên tắc, không sao chép tài sản.
2. **Design tokens** một nơi (`src/styles/hud-tokens.css`): màu, bán kính, bóng, khoảng cách, độ trong suốt, thời gian chuyển động. Mọi HUD dùng token.
3. **Bớt "mùi AI":** không dùng gradient tím-xanh mặc định, không icon emoji, không thẻ bo tròn đồng loạt + bóng đổ giống nhau, không câu chữ sáo rỗng. Chọn 1 tông thương hiệu (từ landing hiện có), 1 font hiển thị + 1 font nội dung, nhịp chuyển động có chủ đích (không chớp tất cả). Dùng bộ icon SVG nhất quán tự vẽ hoặc thư viện có giấy phép mở (ghi vào `credits`).
4. **Làm theo lát cắt dọc:** U0 -> khung HUD + Toolbar + Cài đặt chạy trên MỘT game (Kayak) -> báo cáo kèm ảnh chụp -> mới nhân ra các game còn lại. Mỗi lát có ảnh chụp trước/sau.
5. **Đo:** FPS máy yếu, kích thước JS (HUD ≤ 60 KB gz), Lighthouse (Performance/Accessibility ≥ 90 trang thường).

## 4. Thứ tự và phụ thuộc với WP cũ
WP2 (âm thanh) -> WP1 (7 mô hình Meshy) -> **U0 -> U1+U2 (trên Kayak)** -> WP3–WP5 -> **U3, U4** -> WP6 (Multiverse + PortalCardRail) -> WP7 -> **U5** -> **U6** -> **U7** -> WP8 theo từng game (gắn HUD) -> WP9.
Không cần Meshy mới cho WP10 (chỉ tạo ảnh thu nhỏ từ GLB đã có). Tín dụng Meshy còn ~380, không chi.

## 5. Việc cần user quyết (Code hỏi, không tự chốt)
a) Số liệu thanh Nộ (§U5), đặc biệt "quá 10" là 10 giây hay 10 lần. b) Danh sách nút thanh công cụ có đủ chưa (§U1; ví dụ có nên thêm "chụp màn hình"?). c) Demo: PDF đã nói demo hiện TOÀN BỘ nhân vật; chỉ cần hỏi lớp thật có lọc theo game không. e) Slogan hiển thị có thêm viết hoa + dấu câu không (§U0). f) Nhãn "learn more" hay "Xem thêm / Thu gọn" (§U6). g) Phạm vi U8 màn chờ. d) Chấp nhận thêm `content/game_guides.json`, `kayak_rage.json` (không đổi schema DB).
