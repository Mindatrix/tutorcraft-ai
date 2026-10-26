"""Lớp vá kịch bản (26/10): gắn các mô hình 3D bạn đã tải về nhưng chưa có chỗ đứng vào đúng chặng.

Mỗi mục: id kịch bản -> {'setting': câu thêm vào bối cảnh, 'stages': {số chặng: (asset thêm, [từ vựng thêm], 'nhịp truyện thêm')}}
Chạy trong build.py trước khi tính asset_ids. Không đổi số chặng, thời lượng hay nhân vật.
"""

PATCH = {
    # ------------------------------------------------------------ Kayak Rush
    'kayak-01': {
        'setting': 'Phao cứu sinh trắng xanh treo dọc bến, đàn bồ câu đậu trên lan can cầu.',
        'stages': {
            1: (['river_buoy', 'river_birds'], ['lifebuoy', 'pigeon'], 'Trọng tài chỉ vào phao cứu sinh ở bến: ai đọc đúng tên đồ an toàn thì được xuất phát trước.'),
            6: (['river_buoy'], ['finish line'], 'Hai phao cứu sinh làm cổng phụ ở vạch đích; qua đúng giữa hai phao là cộng Nitro.'),
        }},
    'kayak-02': {
        'setting': 'Thác cao đổ xuống hồ xanh, bụi nước phủ cầu vồng; phao cứu sinh cam buộc vào cọc ở mỗi bến.',
        'stages': {
            1: (['river_buoy', 'kayak_lifejacket'], ['life jacket', 'lifebuoy'], 'Khám phao cứu sinh và áo phao: mỗi món đúng tên là một dấu kiểm.'),
            3: (['river_waterfall', 'river_waterfall_pool'], ['waterfall', 'pool'], 'Dòng nước đổ từ thác tạo ba bậc; cổng phao đặt ngay trước vực nước.'),
        }},
    'kayak-03': {
        'setting': 'Dãy núi xa phủ sương cam phía cuối hẻm.',
        'stages': {
            1: (['backdrop_mountain_valley'], ['valley', 'mountain'], 'Thung lũng núi xa hiện ra làm mốc: đội nào gọi đúng tên mốc thì biết mình đi đúng hướng.'),
        }},
    'kayak-04': {
        'setting': 'Thuyền chèo của dân chài neo dọc bến, bồ câu bay trên mái đình làng, giỏ đan bày ở chợ nổi.',
        'stages': {
            2: (['river_birds', 'river_boat_row'], ['rowboat', 'pigeon'], 'Chuyền cờ tiếp sức giữa kayak và thuyền chèo của bác chài.'),
            3: (['river_boat_row', 'fish_basket', 'river_buoy'], ['basket', 'rowboat', 'market'], 'Chợ nổi: kayak lách qua thuyền chèo chất đầy giỏ đan, mỗi món đọc đúng tên là mở lối.'),
        }},
    # ------------------------------------------------------------ Multiverse Portal
    'mv-03': {
        'setting': 'Giữa bão cát thấp thoáng một cù lao xanh có cọ và gốc cây cổ: ốc đảo thật.',
        'stages': {
            2: (['ground_sand_slab'], ['slab', 'sand'], 'Tấm đá cát nằm nghiêng làm bục đứng cho tượng đá; đặt đúng chữ thì tượng mới nhúc nhích.'),
            6: (['mini_large_island'], ['oasis', 'palm tree'], 'Ốc đảo hiện lên giữa cát: đúng câu thì cọ xanh trở lại.'),
        }},
    'mv-04': {
        'setting': 'Một đảo xanh nhỏ có sông và hải đăng trôi lạc giữa các mảnh vỡ.',
        'stages': {
            7: (['mini_floating_island'], ['island', 'lighthouse'], 'Mảnh vỡ lạc là một đảo nhỏ có hải đăng: đưa nó về đúng cổng để thắp đèn dẫn đường.'),
        }},
    'mv-05': {
        'setting': 'Khi hòa bình trở lại, một đảo xanh nhỏ có sông và thác nổi lên giữa ba cổng.',
        'stages': {
            6: (['mini_floating_island'], ['peace', 'waterfall'], 'Đảo xanh nở hoa khi cả lớp đọc lời thề đúng: dấu hiệu đa vũ trụ lành lại.'),
        }},
    # ------------------------------------------------------------ Summer Camp
    'camp-01': {
        'setting': 'Từ đồi cao nhìn xuống thấy cả khu trại nhỏ: nhà gỗ, nhà trên cây, bếp lửa; cô hướng dẫn viên đeo ba lô đứng chờ ở cổng.',
        'stages': {
            1: (['mini_camp_hero', 'char_hiker_girl', 'ground_grass_platform'], ['camp map', 'counselor', 'backpack'], 'Cô hướng dẫn mở bản đồ nổi của trại; mỗi nơi chạm đúng tên là sáng lên.'),
        }},
    'camp-02': {
        'setting': 'Sau bếp là luống rau của trại và đất tơi mới xới.',
        'stages': {
            2: (['ground_farmland', 'fish_basket', 'ground_soil_patch'], ['vegetable', 'basket', 'soil'], 'Hái rau ở luống của trại bỏ vào giỏ đan; mỗi loại rau đọc đúng tên mới được hái.'),
        }},
    'camp-03': {
        'stages': {
            2: (['camp_tent_damaged'], ['torn tent', 'rope'], 'Lều rách từ trận gió trước nằm cạnh lều mới để so sánh: nhìn chỗ nào hở thì chằng chỗ đó.'),
        }},
    'camp-05': {
        'setting': 'Bản đồ nổi của thung lũng sông đặt trên bàn đá ở điểm xuất phát; trên đường có thác nhỏ đổ xuống hồ.',
        'stages': {
            1: (['char_hiker_girl'], ['hiker', 'backpack'], 'Chị dẫn đường kiểm ba lô của từng bạn trước khi lên đường.'),
            2: (['mini_ganga_valley'], ['relief map', 'valley'], 'Bản đồ nổi của thung lũng: ghim đúng tên nơi cần đến, kim la bàn sẽ xoay theo.'),
            4: (['river_waterfall_pool'], ['waterfall', 'spring water'], 'Nước thượng nguồn chảy từ thác nhỏ: lọc xong mới được uống.'),
            6: (['river_boat_row'], ['rowboat', 'sunset'], 'Chuyến chèo thuyền hoàng hôn dùng thuyền chèo gỗ trắng của bến hồ.'),
        }},
    # ------------------------------------------------------------ River Fishing
    'fish-01': {
        'setting': 'Bên cạnh thuyền nhôm là một chiếc thuyền chèo trắng có lưới vàng và phao cứu sinh treo cạnh bến.',
        'stages': {
            1: (['river_boat_row', 'river_buoy'], ['rowboat', 'net', 'lifebuoy'], 'Bác Năm chỉ chiếc thuyền chèo cũ của ông: mỗi món trên thuyền đọc đúng tên được một mồi giun.'),
            5: (['fish_basket'], ['basket', 'weigh'], 'Cá được bỏ vào giỏ đan trước khi cân.'),
        }},
    'fish-02': {
        'setting': 'Phao cứu sinh ngăn làn thi và thuyền chèo của ban tổ chức neo cạnh bến.',
        'stages': {
            2: (['river_buoy'], ['lane', 'lifebuoy'], 'Phao ngăn làn: thuyền nào vượt phao khi chưa trả lời đúng bị trừ điểm.'),
            3: (['river_boat_row'], ['referee boat', 'net'], 'Thuyền trọng tài đi giữa sông chấm cá bán kết.'),
            5: (['fish_basket'], ['basket', 'record'], 'Cá chung kết được đặt trong giỏ đan trước bảng điểm.'),
        }},
    'fish-03': {
        'setting': 'Thung lũng sông nhìn từ trên cao làm bản đồ dòng chảy; thác cao đổ xuống vũng xanh, bọt trắng nổi đầy.',
        'stages': {
            1: (['mini_ganga_valley', 'river_waterfall'], ['current', 'map', 'waterfall'], 'Bản đồ nổi của thung lũng sông: ghim ba vũng cá vào đúng chỗ.'),
            2: (['river_waterfall_pool'], ['anchor', 'rapids'], 'Chân thác nước xiết: thả neo đúng chỗ thì thuyền không trôi.'),
            3: (['fx_bubbles'], ['foam', 'bubble'], 'Vũng Bọt: bong bóng nổi lên là dấu cá nheo ở dưới.'),
            4: (['fish_hemibagrus'], ['hemibagrus', 'deep pool'], 'Cá lăng nhiều màu chỉ ngoi lên ở Vũng Xanh.'),
        }},
    'fish-05': {
        'setting': 'Trong cuốn sổ ông Chài Tư có bản đồ nổi của lưu vực sông.',
        'stages': {
            1: (['mini_indus_basin'], ['river basin', 'map'], 'Bản đồ nổi lưu vực sông chỉ ba khúc sông; chạm đúng tên khúc sông thì sổ mở trang.'),
            2: (['river_boat_row', 'fish_basket'], ['rowboat', 'basket'], 'Thuyền chèo và giỏ đan của làng chài nằm sẵn ở bến.'),
            3: (['mini_clear_river'], ['clear water', 'rock'], 'Hồ giữa núi nhìn thấy đáy: đá nào, cá nào đọc đúng tên mới thấy.'),
        }},
    # ------------------------------------------------------------ River Survival
    'surv-01': {
        'setting': 'Ở góc bờ có một chiếc thuyền chèo cũ phủ lưới bỏ quên.',
        'stages': {
            2: (['mini_clear_river'], ['spring', 'clear water'], 'Suối trong chảy ra từ bãi đá: gọi đúng tên mới được múc nước.'),
            5: (['river_boat_row'], ['net', 'rowboat'], 'Thùng lưới nằm trong thuyền chèo bỏ quên cạnh bờ: tìm ra nó để lấy Lưới Cướp.'),
        }},
    'surv-02': {
        'setting': 'Thác nước ba tầng đổ xuống hồ phía dưới; một thác cao một tầng nằm khuất bên phải.',
        'stages': {
            1: (['river_waterfall'], ['waterfall', 'mist'], 'Đội nghe tiếng thác dội: gọi đúng tên các tầng thác để định hướng.'),
            2: (['river_waterfall_pool'], ['clear water', 'pool'], 'Giọt nước trong rơi xuống hồ chân thác: múc ở đây.'),
        }},
    'surv-04': {
        'stages': {
            5: (['ground_soil_patch'], ['mud', 'footprint'], 'Mảnh đất bùn ướt in rõ dấu chân: đội nào xóa dấu đúng chỗ thì đội kia lạc hướng.'),
        }},
    'surv-05': {
        'setting': 'Cù lao nhìn từ xa có cọ và gốc cây cổ, thuyền chèo neo cạnh bến.',
        'stages': {
            1: (['mini_large_island'], ['island', 'dock'], 'Cù lao lau sậy nhìn từ bến cũ: nhận mặt các điểm nhiệm vụ.'),
            5: (['river_boat_row'], ['rowboat', 'anchor'], 'Thuyền chèo neo cạnh bờ chứa thùng lưới; chỉ cướp được khi đọc đúng tên các món trên thuyền.'),
            6: (['river_buoy'], ['lifebuoy'], 'Phao cứu sinh treo ở bến là mốc để đội đếm người cuối trận.'),
        }},
}


# ------------------------------------------------------------------------------------------------
# Lớp vá đợt 2 (26/10 chiều): gắn nốt các mô hình còn lại để MỌI id gốc trong thư mục GLB đều có chỗ dùng.
# Gộp vào PATCH ở trên (cùng chặng thì nối thêm tài sản, từ vựng, nhịp truyện).
# ------------------------------------------------------------------------------------------------
_MORE = {
    # ---------------- Kayak
    'kayak-01': {'setting': 'Tay chèo Nắng đứng chỉ đường ở bến, khoác áo phao cam.',
                 'stages': {1: (['char_sunny_boy'], ['paddler', 'start'], 'Tay chèo Nắng vẫy cờ xuất phát: đọc đúng khẩu lệnh thì được xuống nước trước.')}},
    'kayak-04': {'setting': 'Dân làng dắt ngựa ra bến, bạn trẻ trượt ván dọc chợ nổi.',
                 'stages': {1: (['char_skater_boy', 'char_boy_1'], ['team', 'baton'], 'Hai bạn trẻ trao gậy tiếp sức: mỗi câu đúng là một lần trao gậy.'),
                            2: (['village_horse_a'], ['horse', 'village'], 'Ngựa nâu của làng kéo thuyền qua bến cạn: đọc đúng tên mới đi tiếp.'),
                            4: (['village_horse_b'], ['bridge', 'horse'], 'Ngựa trắng đứng chờ ở đầu cầu làng, nhìn các kayak lách qua.')}},
    # ---------------- Multiverse
    'mv-01': {'setting': 'Bên kia hành lang kính màu là khu rừng phép lấp lánh; tường lâu đài nứt thành vết sáng.',
              'stages': {2: (['mv_world_enchanted_candidate'], ['enchanted', 'forest'], 'Cửa kính mở ra khu rừng phép: đọc đúng chữ thì lối đi hiện.'),
                         5: (['mv_wall_breach'], ['crack', 'wall'], 'Vết nứt trên tường mở rộng: mỗi câu đúng làm nó khép lại một đoạn.')}},
    'mv-02': {'stages': {1: (['mv_ruin_building'], ['building', 'ruin'], 'Tòa nhà hoang trong hẻm neon là chỗ ẩn của robot: chạm đúng cửa sổ phát sáng để vào.')}},
    'mv-03': {'stages': {2: (['mv_world_ruin_candidate'], ['temple', 'ruin'], 'Một ngôi đền cổ thu nhỏ hiện sau tượng đá: đặt đúng chữ để mở cửa đền.')}},
    'mv-04': {'stages': {2: (['char_crimson_kick'], ['kick', 'portal'], 'Đấu sĩ Đỏ chỉ đường qua cổng đầu tiên, rồi biến mất vào ánh sáng.'),
                         4: (['mv_weapon_runecrossbow'], ['crossbow', 'rune'], 'Scarlet lắp nỏ ấn phép: mỗi câu đúng nạp một mũi tên sáng.')}},
    'mv-05': {'stages': {1: (['char_iridescent_voyager', 'char_grovaen_female', 'char_tpose_boy', 'char_wanderer'], ['hero', 'team', 'gather'], 'Bốn lữ khách từ các thế giới tới điểm triệu tập: ghép đúng tên và đặc điểm từng người.'),
                         5: (['mv_boss_verdant'], ['guardian', 'forest'], 'Thần giữ rừng thức dậy làm một phần của Boss Hợp Thể: câu đúng làm lá trên người nó rụng dần.')}},
    # ---------------- Camp
    'camp-01': {'stages': {2: (['camp_tent_green'], ['green tent', 'tent'], 'Cạnh lều bạt là một chiếc lều xanh lá của trại bạn để so sánh cách chằng.'),
                           3: (['camp_tripod', 'ground_cobble_circle'], ['tripod', 'stone circle'], 'Giá ba chân treo nồi trên vòng đá quanh bếp: dựng đúng ba chân thì nồi không nghiêng.')}},
    'camp-02': {'setting': 'Chợ trại có xe lừa chở rau, bò sữa đứng gần, và giếng đá giữa sân.',
                'stages': {2: (['village_cart', 'village_cow', 'ground_cobble_path_b'], ['cart', 'cow', 'market'], 'Xe lừa chở rau tới chợ trại, bò sữa đứng cạnh: đọc đúng tên hàng mới mua được.'),
                           3: (['camp_well'], ['well', 'wash'], 'Giếng đá giữa sân dùng rửa rau: kéo gàu đúng số lần theo câu trả lời.')}},
    'camp-03': {'stages': {1: (['char_grass_kid'], ['forecast', 'storm'], 'Bạn nhỏ áo cỏ chạy khắp trại báo tin bão: nghe đúng bản tin mới chuyển được tin.')}},
    'camp-04': {'setting': 'Nhà trên cây treo đèn lồng, lối lát đá dẫn tới vòng ghế quanh lửa.',
                'stages': {1: (['tree_fort'], ['tree house', 'lantern'], 'Đèn lồng được treo lên nhà trên cây: mỗi câu đúng thắp một ngọn.'),
                           3: (['ground_cobble_path_a'], ['path', 'bench'], 'Lối lát đá dẫn tới ghế dài: xếp ghế theo đúng thứ tự câu chuyện.'),
                           6: (['char_nomad_boy'], ['storyteller', 'campfire'], 'Cậu bé lang thang kể chuyện bên lửa: cả trại lặp lại câu cuối cho đúng.')}},
    'camp-05': {'stages': {1: (['char_female_a'], ['guide', 'map'], 'Cô hướng đạo kiểm tra danh sách đồ mang: nhận đúng tên từng món.')}},
    # ---------------- Fishing
    'fish-01': {'stages': {1: (['fish_rod_wood'], ['wooden rod', 'beginner'], 'Cần câu gỗ cấp một của bác Năm: cầm đúng tay mới quăng được.'),
                           5: (['fish_cod', 'fish_box'], ['cod', 'fish box'], 'Cá tuyết nhỏ nằm trong thùng cá trước khi cân: đọc tên cá trên nhãn thùng.')}},
    'fish-02': {'setting': 'Năm cần câu thi đấu bày trên giá ở bến, người dẫn chương trình chờ khai mạc.',
                'stages': {1: (['rod_cand_1', 'rod_cand_2', 'rod_cand_3', 'rod_cand_4', 'rod_cand_5', 'char_female_b'], ['rod', 'contest', 'lucky draw'], 'Năm cần câu thi đấu bày ra, mỗi đội bốc thăm một cần: nối đúng tên bộ phận trên cần để chọn.'),
                           2: (['fish_bass'], ['bass', 'qualifying'], 'Cá rô biển ở vòng loại cắn mồi: đọc đúng tên mồi để quăng trúng.'),
                           3: (['fish_silver_carp'], ['silver carp', 'semi-final'], 'Cá mè bạc xuất hiện ở bán kết: nhìn màu vảy để đoán đúng tên.')}},
    'fish-04': {'stages': {2: (['fish_unknown'], ['mystery', 'night fish'], 'Một con cá lạ ánh bạc chưa ai biết tên: cả đội đoán đặc điểm để đặt tên cho nó.')}},
    'fish-05': {'stages': {2: (['char_wanderer'], ['stranger', 'village'], 'Một người lạ đi bộ qua bến làng chài, hỏi đường tới hồ giữa núi.'),
                           6: (['fish_golden_carp'], ['golden carp', 'rare'], 'Trước khi Vua Cá Hồi hiện ra, một con cá chép vàng hiếm bơi qua: ghi lại đặc điểm của nó.')}},
    # ---------------- Survival
    'surv-01': {'stages': {1: (['surv_pen_wall_window'], ['wall', 'window'], 'Tường gỗ có cửa sổ của Chuồng Gỗ: nhìn qua cửa sổ đọc câu hỏi để đoán chỗ giấu dây.'),
                           3: (['surv_container_blue'], ['container', 'storage'], 'Thùng container xanh gỉ là kho của trại địch: gọi đúng tên công cụ bên trong mới mở được.'),
                           5: (['surv_net_launcher_a'], ['launcher', 'net'], 'Nỏ bắn lưới của Đội Săn Tìm nằm gần thùng lưới bỏ quên: chỉ cướp được khi đọc đúng ba bộ phận.')}},
    'surv-02': {'stages': {3: (['surv_container_red'], ['barrier', 'container'], 'Thùng container đỏ chặn đường cầu treo: giải câu đố để kéo nó sang bên.')}},
    'surv-03': {'stages': {1: (['watchtower', 'char_gamer_boy'], ['lookout', 'lantern'], 'Cậu bé leo tháp canh quan sát bãi đèn lồng: gọi đúng vị trí đèn để báo cho đội.'),
                           3: (['surv_sentinel'], ['sentinel', 'tripwire'], 'Lính gác máy của trại địch quét bãi bẫy: nhìn vào tia sáng để biết lúc nào an toàn đi qua.')}},
    'surv-04': {'stages': {4: (['surv_helicopter_wreck'], ['wreck', 'letter'], 'Mật thư nhòe nước nằm trong trực thăng rơi: đọc câu hỏi trên bảng điều khiển để lấy nó.')}},
    'surv-05': {'stages': {1: (['char_generic_female_2'], ['ferry', 'guide'], 'Cô lái đò giải thích luật cù lao cho cả hai đội trước khi cho lên bến.'),
                           2: (['surv_pen_wall_stone'], ['stone wall', 'pen'], 'Tường đá và gỗ quanh giếng làm Chuồng Gỗ của cù lao: tìm chỗ hở để giải cứu.'),
                           5: (['surv_net_launcher_b'], ['launcher', 'net'], 'Nỏ lưới kiểu hoạt hình đặt cạnh thuyền neo: cướp được khi đọc đúng tên ba bộ phận.')}},
}


def _merge(more):
    for sid, p in more.items():
        cur = PATCH.setdefault(sid, {})
        if p.get('setting'):
            cur['setting'] = (cur.get('setting', '') + ' ' + p['setting']).strip()
        stages = cur.setdefault('stages', {})
        for n, (assets, vocab, beat) in p.get('stages', {}).items():
            if n in stages:
                a0, v0, b0 = stages[n]
                b0 = b0 if isinstance(b0, list) else [b0]
                stages[n] = (a0 + assets, v0 + vocab, b0 + [beat])
            else:
                stages[n] = (assets, vocab, [beat])


_merge(_MORE)

_MORE2 = {
    # ---------------- Multiverse: nhân vật có xương (26/10, đợt 2)
    'mv-01': {'stages': {1: (['mv_npc_druid_elf'], ['healer', 'herb'], 'Thầy Thuốc Lục, nữ tiên rừng cầm trượng, trao thảo dược hồi máu: đọc đúng tên thảo dược để nhận.'),
                         3: (['mv_minion_shadow'], ['mist', 'guard'], 'Lính Sương lờ mờ hiện ra trong sương: đọc đúng chữ trên khiên mờ để xua chúng đi.'),
                         6: (['char_kid_dancer'], ['princess', 'book'], 'Công Chúa Ngôn nhảy mừng khi Cuốn Sách Ngôn Từ trở lại đủ trang.')}},
    'mv-03': {'stages': {4: (['mv_npc_druid_elf'], ['oasis', 'heal'], 'Thầy Thuốc Lục pha nước thảo dược ở ốc đảo: mỗi câu đúng là một bình hồi sức cho tổ đội.')}},
    'mv-04': {'stages': {3: (['mv_minion_shadow'], ['shadow', 'bridge'], 'Lính Sương canh cầu ánh sáng: trả lời đúng để chúng tan thành sương.')}},
    'mv-05': {'stages': {4: (['mv_npc_druid_elf'], ['heal', 'team'], 'Thầy Thuốc Lục hồi sức cho cả tổ trước trận cuối.'),
                         6: (['char_kid_dancer'], ['award', 'celebrate'], 'Công Chúa Ngôn nhảy mừng khi Cuốn Sách Ngôn Từ trao danh hiệu cho cả lớp.')}},
}
_merge(_MORE2)

# Đợt 3: model Meshy mới tạo (26/10) cho Trại Hè và Câu Cá.
_MORE3 = {
    'camp-01': {'stages': {3: (['camp_fire_starter'], ['fire starter', 'flint'], 'Bộ đánh lửa gồm thanh thép, đá lửa và mồi khô nằm trên bàn gỗ: gọi đúng tên từng món để được đánh lửa.'),
                         4: (['camp_skewer_meat', 'camp_skewer_veg'], ['skewer', 'vegetable'], 'Xiên thịt và xiên rau chờ nướng: đọc đúng tên nguyên liệu trước khi xếp lên vỉ.')}},
    'camp-02': {'stages': {5: (['camp_skewer_fish', 'camp_skewer_veg'], ['grilled fish', 'turn over'], 'Xiên cá nướng vàng và xiên rau: lật đúng lúc, đọc đúng tên món để Chef Marco chấm điểm.')}},
    'fish-01': {'stages': {1: (['fish_rod_holder', 'fish_boat_chair'], ['rod holder', 'boat chair'], 'Giá gác cần và ghế gấp trên thuyền: gọi đúng tên đồ nghề để ngồi vào chỗ.')}},
    'fish-02': {'stages': {2: (['fish_floating_dock'], ['floating dock', 'rope'], 'Bến nổi trên thùng phuy xanh là nơi xếp hàng vòng loại: đọc đúng luật thi trước khi bước lên.'),
                         3: (['fish_rod_fiberglass'], ['fiberglass rod', 'reel'], 'Cần sợi thủy tinh của vòng bán kết: mỗi câu đúng giúp đổi đúng mồi.'),
                         4: (['fish_rod_carbon'], ['carbon rod', 'challenge'], 'Captain Ray thách bằng cần carbon đen: đọc đúng các bộ phận của cần để nhận thách đấu.'),
                         6: (['fish_rod_gold'], ['gold rod', 'trophy'], 'Chiếc cần vàng là phần thưởng của nhà vô địch, đặt cạnh chiếc cúp.')}},
    'fish-04': {'stages': {1: (['fish_dock_lamp'], ['lamp', 'night'], 'Đèn trụ bến sáng ấm: thắp đèn mũi thuyền bằng cách đọc đúng tên từng bộ phận của đèn.')}},
}
_merge(_MORE3)

# Model 3D có xương cho nhân vật Multiverse: ghi ở đầu clothing_text dạng [asset_id] (cùng quy ước với game khủng long).
MV_MODELS = {
    'Scarlet': 'mv_hero_scarlet',
    'Chúa Tể Vết Nứt': 'mv_boss',
    'Chúa Tể Hợp Thể': 'mv_boss_verdant',
    'Thầy Thuốc Lục': 'mv_npc_druid_elf',
    'Công Chúa Ngôn': 'char_kid_dancer',
    'Lính Sương': 'mv_minion_shadow',
}


def apply(scn):
    """Gắn asset, từ vựng và nhịp truyện thêm vào kịch bản (idempotent)."""
    if scn.get('game') == 'multiverse_portal':
        for c in scn['characters']:
            mid = MV_MODELS.get(c['name'])
            if mid and not str(c['clothing_text']).startswith('['):
                c['clothing_text'] = f"[{mid}] {c['clothing_text']}"
    p = PATCH.get(scn['id'])
    if not p:
        return
    if p.get('setting') and p['setting'] not in scn['setting']:
        scn['setting'] = scn['setting'].rstrip() + ' ' + p['setting']
    by_n = {st['n']: st for st in scn['stages']}
    for n, (assets, vocab, beat) in p.get('stages', {}).items():
        st = by_n[n]
        beats = beat if isinstance(beat, list) else [beat]
        for a in assets:
            if a not in st['assets']:
                st['assets'].append(a)
        for v in vocab:
            if v not in st['vocab']:
                st['vocab'].append(v)
        for b in beats:
            if b not in st['beats']:
                st['beats'].append(b)
