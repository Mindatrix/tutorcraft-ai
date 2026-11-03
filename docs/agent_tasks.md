# Việc giao cho từng bên (tổng hợp 03/11/2026, 20:00)

Gom mọi việc Claude Code đã giao ra ngoài, kiểm lại với code ở `feat/3d-lego-engine` `5dac5ab`. Việc đã xong được ghi rõ để không làm lại.

Vai trò từ 03/11 tối ("Kế hoạch Đại phẫu Đồ họa & Gameplay"):
- **Claude Code:** logic, server, Spatial UI, nối cảnh vào trận thật, test, đo FPS.
- **Antigravity:** toàn bộ hình ảnh, shader, asset 3D.
- **Jules:** đã bỏ.

Vì vậy một số việc trước đây giao Antigravity (nối trận thật, giao diện WP7) nay chuyển về Claude Code (mục 5).

---

## 1. Antigravity (hình ảnh, shader, asset 3D)

**Cách làm chung:**
- Tạo nhánh `agy/<tên-việc>` từ `feat/3d-lego-engine` mới nhất. Chỉ sửa phần hình ảnh: cảnh 3D, shader, vật liệu, hiệu ứng, model.
- Mở PR vào `feat/3d-lego-engine`; CI phải xanh.
- Đọc trước: `AGENTS.md` (Next.js 16 khác bản cũ), `docs/dai_phau_physics_spatial_ui.md`, `docs/wp8_phonetic_worlds_handoff.md`.
- Không tự tính điểm, sao, xu hay hiệu ứng thưởng trong trình duyệt: chỉ phát những gì server trả về (`reply.effect`).
- Đừng sửa `src/engine/`, `src/server/`, `src/client/spatialInput.ts`, `SpatialControls.tsx`. Cần đổi gì ở đó thì ghi vào mô tả PR.

### A1. Lưới va chạm cho từng cảnh (ưu tiên 1)

Mỗi cảnh cần một lưới va chạm đơn giản, tách khỏi lưới hình ảnh: mặt đất, dốc, cầu, bậc, đá lớn, tường.
- **Cảnh:** River Survival, Summer Camp, Kayak (bờ, cầu tàu), Multiverse (sàn từng phòng, ngưỡng cổng).
- **Ngân sách:** vài nghìn tam giác mỗi cảnh. Đặt trong một nhóm `userData.collision = true` để Claude Code nạp bằng `trianglesFrom(mesh)`.
- **Không tạo khối va chạm dài quá khoảng 100 m:** Rapier 0.21 để nhân vật rơi xuyên qua khối quá lớn. Mặt đất lớn thì chia ô.
- **Nghiệm thu:** đi bằng `/tutor/physics-lab` (hoặc cảnh đã gắn vật lý) không rơi xuyên, không kẹt; leo được bậc ≤ 0,35 m và dốc ≤ 45°.

### A2. Nhân vật có hoạt ảnh thay viên thuốc

- **Hiện tại:** nhân vật trong `/tutor/physics-lab` là capsule màu cam.
- **Cần làm:** gắn model nhân vật có xương (thư viện `3D_tutorcraft`, `content/character_casting.json`), chân chạm mặt đất.
- **Ghép clip:** bộ điều khiển trả `character.clip` = `idle | walk | run | jump | fall`; hướng mặt là `motion.facing`. Ghép đủ 5 clip, chuyển mượt 0,15–0,25 s. Tạm dùng clip gần nhất nếu thiếu, và liệt kê clip còn thiếu.
- **Kích thước:** capsule cao 1,5 m (bán kính 0,3 m); model khớp chiều cao đó.

### A3. Hiệu ứng "Xuyên không"

- **Cổng:** cổng sáng, xoáy, có điểm nhấn khi `slot.golden` hoặc cổng mở (thay vòng tròn tím tạm trong physics-lab).
- **Hiệu ứng dịch chuyển:** dài 0,9 s (đúng `WARP.warpMs`), thay lớp màn tím tạm; tôn trọng `prefers-reduced-motion`.
- **Máy yếu:** tầng thấp dùng bản rẻ (không hậu kỳ toàn màn).

### A4. Đặt Đá Phát Âm trong River Survival

- **Hiện tại:** Kayak và Multiverse đã có đá (PR #5); `RiverSurvivalScene` chưa có.
- **Cần làm:** đặt các đá ở khu dọn dẹp cho vai Thợ giải mã, tối đa 12 đá mỗi cảnh, theo `docs/wp8_phonetic_worlds_handoff.md` mục 2b.
- **Hiệu ứng khi giải được manh mối:** nhịp sáng ở Chuồng Gỗ, dấu chỉ vị trí lưới. Hàm `applySurvivalSpeechEffect` đã trả sẵn vị trí cần đánh dấu.

### A5. Vật phát sáng "Thử thách vàng" trong cảnh 3D

Vật sáng hiện khi `view.slot.golden === true`, tắt khi `goldenTaken`. Chạm vào thì gọi hàm Claude Code cung cấp; không tự gọi API. Hợp đồng: `docs/wp7_class_schedule_handoff.md`.

### A6. Hiệu năng hình ảnh (cùng QA)

- **Ngân sách:** mỗi trận ≤ 40 MB (cao) / 15 MB (thấp); cảnh ≤ 1,3 triệu (cao) / 300 nghìn (thấp) tam giác; không GLB bản thấp nào > 25 MB.
- **Vật lặp lại:** dùng instancing hoặc LOD.
- **Máy yếu:** tầng thấp không dùng `backdrop-filter` hay hậu kỳ nặng.
- **Kiểm tra:** sau mỗi PR cảnh, chạy `npm run test:fps` và ghi số vào PR. Cổng đạt: trung bình ≥ 30 FPS và giây tệ nhất ≥ 25 trên máy yếu.

### A7. Việc nhỏ còn sót trong code hình ảnh

- Lời thoại Pet đang ở `src/content/pet_dialogues.json`: chuyển sang `content/` cùng chỗ với nội dung khác (báo Claude Code để sửa đường import).
- Cảnh Kayak và Multiverse đang tính tăng tốc / mở cổng từ `response.stars` trong trình duyệt. Hình ảnh giữ nguyên; Claude Code sẽ đổi nguồn sang `reply.effect` khi nối trận thật, nên giữ hàm phát hiệu ứng tách riêng, nhận tham số.

---

## 2. Claude chat (nội dung trong `content/`)

1. Soạn **20 câu hiện tại đơn** cho bản chơi thử (U6). Ngân hàng demo hiện có 8 câu quá khứ đơn / bị động.
2. Gán kịch bản hoặc bí danh cho **23 model mới**. Hai test độ phủ model đang tạm `skip` chờ việc này.
3. **Đổi tên file đặt sai:** `camp_lantern`, `camp_grill_2`, `camp_water_filter_2`, `camp_string_lights_2`, `camp_backpack`, `camp_cup`, `camp_firepit__alt1`, `camp_tent_stage__alt2/3`.
4. **Prompt Meshy mới:**
   - `food_sausage` (bản cũ ra hình chuối);
   - bản có texture cho `camp_table`, `fish_reel`, `fish_bait_2`.
   - Còn khoảng 380 credit; không chạy khi chủ dự án chưa duyệt.
5. Bổ sung ghi công còn thiếu cho vài file âm thanh (`content/asset_credits.json`).
6. **B5:** bản đồ trạng thái hoạt ảnh Mixamo (idle / run / happy / sad / correct / wrong / vấp ngã) ↔ clip; liệt kê clip thiếu. Cần cho việc A2.
7. **B7:** xác nhận giấy phép bài nhạc Heavenly Loop (cùng chủ dự án).
8. Trường mới **`meaning_vi`** (nghĩa tiếng Việt cho gợi ý bậc 1): thêm vào câu hỏi trong kho câu soạn sẵn ở `content/` nếu có. Kho dự phòng trong code đã có đủ.
9. Soạn lại các tài liệu `docs/specs/*` bị mất khi chuyển thư mục (`code-next-steps.md`, `tasks-2026-11-01.md`, `asset-reuse-*.md`, `code-tasks-asset-reuse.md`) nếu còn bản ở phía Claude chat.

---

## 3. NotebookLM (kho kiến thức)

Tải lên lại làm nguồn (bản mới nhất ở GitHub):
- `project_state.md`, `docs/operations.md`, `docs/TECHNICAL_BLUEPRINT.md` (nếu còn bản);
- `docs/pronunciation_logic_handoff.md`, `docs/wp7_class_schedule_handoff.md`, `docs/wp8_phonetic_worlds_handoff.md`, `docs/dai_phau_physics_spatial_ui.md`, file này;
- `supabase/schema.sql`, `content/game_worlds_v2.json`.

Không tải `.env*` hay nội dung có đáp án đề thi thật.

---

## 4. Chủ dự án (việc chỉ bạn làm được)

1. **Đo FPS trên điện thoại thật (cổng C):**
   - **Android:** cài `adb` (`brew install android-platform-tools`, trong app Terminal của Mac), bật USB debugging, cắm cáp, chạy `npm run test:fps -- --android --url http://<IP LAN>:3001`.
   - **iPhone:** mở `http://<IP LAN>:3001/tutor/physics-lab?bench=20&tier=low` trong Safari, chụp ô kết quả.
2. **Thư viện 3D:** `~/Documents/3D_tutorcraft` vẫn nằm trong Documents (iCloud đồng bộ). Chuyển ra ngoài (ví dụ `~/3D_tutorcraft`) rồi báo Claude Code đặt `TC_3D_DIR` cho đúng.
3. **R2:**
   - Gắn tên miền riêng cho bucket `tutorcraft-assets` và đặt `NEXT_PUBLIC_ASSET_BASE_URL` trên Vercel.
   - Cho phép chạy `sync-assets-r2.mjs --apply`: các file nhập từ 01/11 và âm thanh chưa được đẩy lên.
4. **Biến môi trường trên Vercel:** `TUTORCRAFT_SESSION_SECRET` (≥ 32 ký tự), `CRON_SECRET`.
5. **Câu hỏi còn chờ trả lời** (`project_state.md` 7.2):
   - Thanh công cụ có thêm nút chụp màn hình không.
   - Lớp thật có lọc nhân vật theo game không.
   - Viết hoa / dấu câu cho slogan.
   - Nhãn "learn more" hay "Xem thêm / Thu gọn".
   - Phạm vi màn chờ U8.
   - `camp_grill` thay bản cũ hay thêm làm biến thể.
6. **Giấy phép:** nhắn tác giả bài nhạc Heavenly Loop (isaiah658) xác nhận CC0, hoặc chọn bài khác.
7. **`next.config.ts`:** dòng `allowedDevOrigins: ['192.168.1.99']` chưa commit (cấu hình riêng máy bạn); quyết định có đưa lên GitHub không.

---

## 5. Chuyển về Claude Code (để biết ai làm)

- **Nối cảnh 3D vào trận thật** (trước đây giao Antigravity): `ModeStage.tsx`, Đá Phát Âm cho Summer Camp / River Fishing, `KayakRushStage`, `MultiversePortalStage`, `RiverSurvivalStage` (hiện chưa trang nào dùng). Theo danh sách 5 điều kiện ở `docs/wp8_phonetic_worlds_handoff.md` mục 4. Gỡ nút debug của River Survival khỏi màn học sinh.
- **Giao diện trận lớp WP7:** đồng hồ chờ điểm hỏi, nút nhận thử thách vàng, `ClassPodium` cho màn của em.
- **Sự kiện `stone:effect`** trên bus của Đá Phát Âm; sửa chỗ `intersectObjects` cấp phát mảng mới mỗi lần raycast.
- **Gắn vật lý + `SpatialControls` vào cảnh thật đầu tiên;** xoay camera bằng tay phải; nối Xuyên không với cổng Multiverse do server mở.
- **Benchmark FPS cho từng cảnh thật** (River, Kayak, Multiverse).
