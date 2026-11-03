# Đại phẫu Đồ họa & Gameplay: vật lý, Spatial UI, đo FPS (đợt 1)

> 03/11/2026, Claude Code (Kỹ sư Trưởng Fullstack + QA). Hình ảnh, shader, asset là việc của Antigravity; tài liệu này nói phần logic họ nối vào.

## 1. Quyết định: Rapier trực tiếp, không Ecctrl

Ecctrl cần React Three Fiber, drei, `@react-three/rapier`, leva và three ≥ 0.184. Dự án dùng three 0.170 viết trực tiếp (SceneRuntime và các cảnh Kayak, Multiverse, River Survival). Chủ dự án chọn (03/11): **Rapier trực tiếp** (`@dimforge/rapier3d-compat` 0.21.0) với bộ điều khiển nhân vật có sẵn của Rapier. Cùng các tính năng như Ecctrl, không phải viết lại cảnh, không nâng three.

## 2. Vật lý (`src/components/modes/three/physics/`)

| File | Việc |
|---|---|
| `rapierWorld.ts` | `loadRapier()` nạp WASM một lần (lười, trang không dùng vật lý không tốn gì). `createPhysicsWorld(R)`: bước cố định 60 Hz, tối đa 4 bước mỗi khung (máy chậm không làm vỡ mô phỏng), `addGround`, `addBox`, `addTriangles`, `dispose` |
| `characterController.ts` | `createCharacter(phys, { position })`: viên thuốc (capsule), tự leo bậc ≤ 0,35 m, bám dốc khi xuống, leo dốc ≤ 45°, trượt trên dốc gắt, đẩy vật nhẹ, `teleport` (Xuyên không), `renderPosition(alpha)` để vẽ mượt giữa hai bước |
| `fromThree.ts` | `trianglesFrom(mesh)`: lưới three.js → va chạm tam giác (dốc, cầu, địa hình). Dùng lưới va chạm đơn giản, vài nghìn tam giác mỗi cảnh, không dùng lưới hình ảnh đầy đủ |
| `src/engine/characterMotion.ts` | Luật đi thuần (có test): tốc độ đi / chạy cho trẻ em, tăng tốc, trọng lực, nhảy có "coyote time" (0,12 s sau khi rời mép) và nhớ phím nhảy (0,15 s trước khi chạm đất), hướng mặt, chọn clip idle / walk / run / jump / fall |

Cách nối vào một cảnh:

```ts
const R = await loadRapier();
const phys = createPhysicsWorld(R);
phys.addGround(0, 80);
phys.addTriangles(trianglesFrom(collisionMesh));
const hero = createCharacter(phys, { position: { x: 0, y: 0.1, z: 0 } });
runtime.run((dt) => {
  const input = mixer.read();                       // SpatialControls
  phys.step(dt, (h) => hero.update(input, cameraYaw, h));
  const p = hero.renderPosition(phys.alpha);
  avatar.position.set(p.x, p.y, p.z);
  avatar.rotation.y = hero.motion.facing;
  avatar.play(hero.clip);
});
```

**Lỗi Rapier đã gặp:** một khối hộp mặt đất rất lớn (ví dụ 400 × 1 × 400) làm nhân vật rơi xuyên khi chạm đất. `addGround` lát ô 40 m nên không bị. Đừng tạo khối va chạm dài hơn khoảng 100 m.

Vật lý chỉ là di chuyển: đáp án, điểm, xu vẫn do server quyết.

## 3. Spatial UI

| File | Việc |
|---|---|
| `src/client/spatialInput.ts` | Logic thuần (có test): joystick nổi một ngón (vùng chết 12%, núm giữ trong vòng), nút **Xuyên không** (giữ 0,6 s để nạp, thả sớm là huỷ, hiệu ứng 0,9 s, hồi 8 s, chỉ sẵn sàng khi game cho phép), gộp bàn phím WASD / mũi tên / Space / Shift với joystick (nhảy tính một lần mỗi lần bấm, mất focus thì nhả hết phím) |
| `src/components/hud/SpatialControls.tsx` | Vẽ joystick bên tay `moveHand`, nút Nhảy và Xuyên không bên tay kia, vòng tiến độ, theo cỡ nút và độ trong của Cài đặt HUD, có nhãn cho trình đọc màn hình |
| `src/components/hud/spatial.css` | Kính mờ `tc-sp-glass` (mờ 14 px). **Tắt mờ** ở tầng thấp (`tc-hud-lite`), khi trình duyệt không hỗ trợ, và khi người dùng chọn giảm trong suốt; nền đặc tối giữ độ tương phản. Chạm ≥ 44 px, tôn trọng giảm chuyển động |

Game cho phép Xuyên không bằng `warpAvailable` (ví dụ đứng gần cổng, hoặc server mở cổng); `onWarp` dịch chuyển nhân vật.

## 4. Đo FPS tự động

- Trang `/tutor/physics-lab`: đường thử (bậc, dốc, tường, bục, 2 cổng) + 50 học sinh di chuyển. `?bench=20&tier=low&crowd=50` tự chạy, đo 20 giây sau 2 giây khởi động, hiện kết quả và đặt `window.__tcBench`.
- `src/engine/fpsStats.ts`: FPS trung bình, giây tệ nhất, 1% thấp, p95, khung dài nhất, số lần giật (> 50 ms). Cổng: trung bình ≥ 30 và giây tệ nhất ≥ 25.
- `scripts/fps-benchmark.mjs` (`npm run test:fps`):
  - giả lập điện thoại trong Chromium (màn, dpr, cảm ứng, CPU chậm 4–6×), hồ sơ `phone-mid`, `phone-low`, `iphone-se`;
  - `--android`: máy Android thật qua ADB (cần cài `adb`, bật USB debugging);
  - iPhone: mở URL trong Safari, chụp ô kết quả.
  - Báo cáo vào `_report/fps/<ngày>/` (JSON + bảng Markdown), mã thoát 1 khi có lượt trượt cổng.
- Lần chạy đầu 03/11 (giả lập `phone-mid` và `phone-low`, GPU Apple M4): 60 FPS, giây tệ nhất 59, đạt. Đây là số so sánh, chưa thay số đo trên điện thoại thật.

## 5. Việc tiếp theo

1. Đưa nhân vật vật lý + SpatialControls vào cảnh thật đầu tiên (đề xuất River Survival hoặc Summer Camp: đi bộ tự do). Antigravity cung cấp lưới va chạm đơn giản cho từng cảnh.
2. Nối Xuyên không với cổng Multiverse (`portal_open` từ server và luật chặng).
3. Camera xoay bằng ngón tay phải (hiện camera cố định sau lưng).
4. Chạy `test:fps` trên một máy Android tầm trung thật; thêm benchmark cho cảnh River / Kayak / Multiverse thật.
