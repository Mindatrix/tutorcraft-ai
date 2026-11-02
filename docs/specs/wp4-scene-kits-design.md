# WP4: bộ cảnh theo cấp độ (đã duyệt 02/11/2026; summer_camp đã làm)

Chưa viết code. Không đổi schema cũ: `scenarios_v2.json`, catalog, alias giữ nguyên; thêm **một file mới** `content/scene_kits.json` và một bước trong `buildSceneLayout`.

## 1. Hiện trạng (đo 02/11, summer_camp, seed 99)
- Đồ của mỗi chặng (`stages[].assets`) được rải **ngẫu nhiên** quanh một điểm (bán kính 1,5–6,5 m). Không có nhóm, không theo cấp độ.
- Bộ dựng cảnh không biết cấp độ của trận (0 = Beginner … 6).
- Mặt phần đồ mỗi chặng: TB 55k (cao) / 18k (thấp), tối đa 345k / 77k. Cảnh 3 chặng nặng nhất: 1,30 triệu / 296 nghìn. Trần test hiện tại: 1,3 triệu / 300 nghìn. Nghĩa là **gần như không còn chỗ** ở bản thấp.

## 2. Ý tưởng
Một **nhóm** = vài món đồ đi cùng nhau, bố cục tương đối cố định (toạ độ nhỏ trong nhóm, mét). Ví dụ "Khu trại" = mái che + 2 túi ngủ + ghế + đèn lồng + cờ + dây đèn.
- **Nhóm xuất hiện khi chặng có "món mồi"** của nhóm trong `stages[].assets` (nội dung vẫn do Claude chat quyết). Món của chặng được xếp vào đúng chỗ trong nhóm thay vì rải ngẫu nhiên; nhóm thêm "món đi kèm".
- **Cấp độ quyết số món đi kèm và số nhóm nền** (nhóm không có mồi, chỉ để cảnh đầy hơn).
- **Vị trí và góc xoay của cả nhóm theo seed** (`layoutSeed` + chặng + nhóm): mọi máy giống nhau; trận khác → bố cục khác. Bên trong nhóm giữ nguyên bố cục.
- Món nào là họ biến thể thì chọn bản bằng `pickVariant` (WP3).
- **Đổi tông theo cấp bằng tint** (nhân màu vật liệu, không nhân bản texture): 1 vật liệu tint cho mỗi model trong cả trận.
- Món của chặng không thuộc nhóm nào: rải như hiện nay.
- Khi làm (02/11): chỉ món chặng gọi là chắc chắn có; món lõi cũng qua ngân sách (bản đầu thêm lõi vô điều kiện làm cảnh vượt trần). Thêm trường `pick` và `size`; `y` là số mét.

## 3. Bảng cấp độ (đề xuất)
| Cấp | Món đi kèm | Nhóm nền mỗi chặng | Tint (nhân màu) |
|---|---|---|---|
| 0 Beginner | chỉ món "lõi" | 0 | `#ffffff` sáng, rõ |
| 1 | lõi + món `minLevel ≤ 1` | 0 | `#fffaf2` |
| 2 | `minLevel ≤ 2` | 0 | `#fff4e4` ấm |
| 3 | `minLevel ≤ 3` | 1 | `#ffeed6` |
| 4 | `minLevel ≤ 4` | 1 | `#fbe8d2` chiều |
| 5 | tất cả | 2 | `#f2e4dc` hoàng hôn nhẹ |
| 6 | tất cả | 2 | `#ece2ea` |

Tint nhẹ (≤ 8% mỗi kênh) để không làm sai màu đồ vật; trẻ nhỏ (cấp 0) thấy cảnh sáng, ít đồ, dễ nhìn.

## 4. Ngân sách (bắt buộc, có test)
- **Trần món đi kèm mỗi chặng:** cao 60k / thấp 20k mặt (tính theo bản nặng nhất của họ, như WP3). Vượt thì bỏ món có `minLevel` cao nhất trước.
- **Chặng kề chỉ hiện món lõi** (không món đi kèm, không nhóm nền), giống cách cây rải chặng kề chỉ vẽ gần ranh giới.
- **Trần cả cảnh giữ nguyên** 1,3 triệu / 300 nghìn: món đi kèm của chặng hiện tại chỉ thêm khi còn chỗ dưới trần. Ở bản thấp hiện chỉ còn ~4k nên **trên máy yếu cảnh camp nặng nhất gần như không thêm đồ**; các chặng nhẹ hơn (TB 18k) thì có. Khi có số đo điện thoại có thể nới.
- MB: món đi kèm phải có trong plan tải (`planScenarioAssets` thêm món của nhóm); test giữ 40 / 15 MB mỗi trận.

## 5. Định dạng `content/scene_kits.json` (bản nháp summer_camp)
```json
{
  "version": 1,
  "note": "Nhóm đồ theo cấp độ (WP4). x/z mét quanh tâm nhóm, rot độ. core = luôn có khi nhóm xuất hiện.",
  "levels": {
    "0": { "ambient": 0, "tint": "#ffffff" }, "1": { "ambient": 0, "tint": "#fffaf2" },
    "2": { "ambient": 0, "tint": "#fff4e4" }, "3": { "ambient": 1, "tint": "#ffeed6" },
    "4": { "ambient": 1, "tint": "#fbe8d2" }, "5": { "ambient": 2, "tint": "#f2e4dc" },
    "6": { "ambient": 2, "tint": "#ece2ea" }
  },
  "games": {
    "summer_camp": {
      "groups": [
        { "id": "khu_trai", "title": "Khu trại", "trigger": ["camp_tarp", "camp_sleeping_bag", "camp_tent_stage", "camp_tent_green"],
          "members": [
            { "asset": "camp_tarp", "x": 0, "z": 0, "rot": 0, "core": true },
            { "asset": "camp_sleeping_bag", "x": -0.8, "z": 0.2, "rot": 90, "core": true },
            { "asset": "camp_sleeping_bag", "x": 0.8, "z": 0.2, "rot": 90, "minLevel": 1 },
            { "asset": "camp_lantern", "x": 1.6, "z": -1.2, "rot": 0, "minLevel": 1 },
            { "asset": "camp_chair", "x": 2.4, "z": 1.4, "rot": -150, "minLevel": 2 },
            { "asset": "camp_bench", "x": -2.4, "z": 1.6, "rot": 20, "minLevel": 3 },
            { "asset": "camp_bunting", "x": 0, "z": -1.8, "rot": 0, "minLevel": 4 },
            { "asset": "camp_string_lights", "x": 0, "z": -2.4, "rot": 0, "minLevel": 5 }
          ] },
        { "id": "leu", "title": "Lều và hành lý", "trigger": ["camp_tent_stage", "camp_tent_green", "camp_backpack"],
          "members": [
            { "asset": "camp_tent_stage", "x": 0, "z": 0, "rot": 0, "core": true },
            { "asset": "camp_backpack", "x": 1.4, "z": 0.9, "rot": 30, "minLevel": 1 },
            { "asset": "camp_rope", "x": -1.3, "z": 1.0, "rot": 0, "minLevel": 3 }
          ] },
        { "id": "goc_lua", "title": "Góc lửa trại", "trigger": ["camp_firepit", "camp_matchbox", "camp_marshmallow_stick"],
          "members": [
            { "asset": "camp_firepit", "x": 0, "z": 0, "rot": 0, "core": true },
            { "asset": "camp_matchbox", "x": 0.9, "z": 0.6, "rot": 15, "minLevel": 1 },
            { "asset": "camp_marshmallow_stick", "x": -0.9, "z": 0.5, "rot": -30, "minLevel": 2 },
            { "asset": "camp_tripod", "x": 0, "z": 0, "rot": 0, "minLevel": 3 },
            { "asset": "camp_axe", "x": 1.8, "z": -0.6, "rot": 70, "minLevel": 4 }
          ] },
        { "id": "so_cuu", "title": "Góc sơ cứu và nước", "trigger": ["camp_firstaid", "camp_water_filter", "camp_bottle", "camp_bucket"],
          "members": [
            { "asset": "camp_firstaid", "x": 0, "z": 0, "rot": 0, "core": true },
            { "asset": "camp_water_filter", "x": 0.8, "z": 0.1, "rot": 0, "minLevel": 1 },
            { "asset": "camp_bottle", "x": -0.6, "z": 0.3, "rot": 40, "minLevel": 2 },
            { "asset": "camp_bucket", "x": 0.4, "z": 1.0, "rot": 0, "minLevel": 3 }
          ] },
        { "id": "bep", "title": "Bếp dã ngoại", "trigger": ["camp_table", "camp_grill", "camp_skewer", "food_meat_raw"],
          "members": [
            { "asset": "camp_table", "x": 0, "z": 0, "rot": 0, "core": true },
            { "asset": "camp_grill", "x": 1.8, "z": 0, "rot": 0, "minLevel": 1 },
            { "asset": "food_bread", "x": -0.3, "z": 0, "rot": 0, "y": "table", "minLevel": 2 },
            { "asset": "food_corn", "x": 0.3, "z": 0.1, "rot": 30, "y": "table", "minLevel": 3 },
            { "asset": "camp_pan", "x": 1.8, "z": 0, "rot": 0, "y": "grill", "minLevel": 4 },
            { "asset": "food_apple", "x": 0.1, "z": -0.2, "rot": 0, "y": "table", "minLevel": 5 }
          ] }
      ],
      "ambient": ["so_cuu", "goc_lua", "bep"]
    }
  }
}
```
`"y": "table"` = đặt lên mặt bàn (chiều cao lấy từ kích thước model bàn). Mặt kín: 5 nhóm × tối đa 8 món, ước lượng đủ món mỗi nhóm ở bản thấp: khu trại 32k, góc lửa 20k, sơ cứu 17k, bếp 17k, lều 18k.

Sau summer_camp: river_fishing (`fish_net`, `fish_rod_*`, `fish_bait`, `fish_bucket`, `food_*`, `river_shed`, `fish_dock_lamp`), river_survival (`surv_*`, đuốc, `camp_firstaid`, đèn lồng), dino_journey (`dino_footprint`, `dino_sand`, đá, đuốc), kayak_rush (`kayak_log_spinning`, phao `kayak_lifejacket`, `kayak_finish_arch`).

## 6. Code dự kiến (sau khi duyệt)
- `src/engine/sceneKits.ts` (thuần): đọc kit, `kitGroupsFor(game, stageAssets, level, quality, budget)` → nhóm + món; đặt nhóm theo seed (vòng 4–12 m quanh tâm chặng, tránh nước, không chồng nhau).
- `buildSceneLayout`: thêm `level?: number` vào `LayoutInput`; bước nhóm chạy trước bước rải món lẻ; placement thêm `group?: string` và `tint?: string`.
- `planScenarioAssets`: tải thêm món của nhóm (mọi cấp, để đổi cấp giữa trận không phải tải lại; vẫn trong 40 / 15 MB).
- Tint: trình duyệt tạo 1 vật liệu tint cho mỗi model (như avatar).
- Test: cùng seed → cùng bố cục; cấp cao ≥ cấp thấp về số món; mọi id trong kit có trong catalog (hoặc liệt kê thiếu); không món nào trên mặt nước; trần mặt 1,3 triệu / 300 nghìn và 150 lần vẽ vẫn đạt; scene-lab có ô chọn cấp.

## 7. Cần quyết trước khi code
1. **Đồng ý tạo `content/scene_kits.json`** (file mới trong `content/`, Code viết bản đầu, Claude chat chỉnh sau)?
2. **4 mã ghép sai** sẽ lọt vào nhóm qua biến thể (WP3): `camp_lantern` (cây + đèn), `camp_grill_2` (nồi), `camp_water_filter_2` (túi Ration Pack), `camp_string_lights_2` (đống đồ trại). Đề xuất: Claude chat đổi tên 4 file (ví dụ `camp_pot`, `camp_ration_pack`, `camp_gear_pile`, `camp_lantern_tree`) trước; tạm thời kit chỉ dùng biến thể đúng (ghi đích danh `camp_lantern_2`, `camp_grill`, `camp_water_filter`, `camp_string_lights`).
3. **Trần bản thấp**: giữ 300 nghìn (máy yếu gần như không thêm đồ ở cảnh camp nặng nhất) hay chờ số đo điện thoại rồi mới nới.
