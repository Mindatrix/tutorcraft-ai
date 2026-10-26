from common import C, S, cast

GAME = 'summer_camp'

HOOK = 'Chạm vào vật thể đang phát sáng để mở câu hỏi nhỏ ngay cạnh nó; đúng thì hành động xảy ra trong thế giới, sai thì thử lại sau 5 giây, không trừ điểm nặng.'


def plan(extra=None):
    p = {
        'sizes': {
            '1-5': 'Một Đội Lều chung; mỗi em làm lần lượt các trạm, máy chủ giao thêm việc cho người làm nhanh.',
            '6-20': '2-4 Đội Lều (4-5 em/đội), mỗi đội một lều riêng và một lá cờ màu. Các đội cùng lấp đầy Bảng Nhiệm vụ trại chung.',
            '21-50': '8-10 Đội Lều (5 em/đội). Trại chia 2 bãi cạnh nhau để không quá đông; mỗi trạm (bếp, lều, nước, củi) nhận tối đa 2 đội cùng lúc, xoay vòng mỗi 5 phút.',
        },
        'roles': ['Đội trưởng Lều (giữ Bảng Nhiệm vụ)', 'Thợ dựng lều', 'Người giữ lửa', 'Đầu bếp', 'Thủ kho (công cụ mở khóa)'],
        'scoring': 'Mỗi hành động xong = 1-3 sao theo độ chính xác và tốc độ. Bảng Nhiệm vụ trại chung là thanh "Boss" của trận: cả lớp cùng lấp đầy. Đội Lều nhiều sao nhất được cắm cờ trên đỉnh trại.',
        'avatars': '12 nhân vật dưới đây là người hướng dẫn và bạn trại trong đoạn phim. Mỗi học sinh có nhân vật riêng ghép từ hồ sơ diện mạo và đeo khăn màu Đội Lều.',
        'safety': 'Lửa, dao, rìu chỉ dùng qua hoạt ảnh có người lớn hướng dẫn; nhân vật luôn đeo găng khi nướng.',
    }
    if extra:
        p.update(extra)
    return p


SCENARIOS = []

# ---------------------------------------------------------------- 1
sid = 'camp-01'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=1,
    title='Ngày Đầu Trại Hè Bên Hồ',
    inspiration='File mục II.1 (dựng lều, nhóm lửa, nướng thịt, lọc nước) + video trại bên hồ, cờ tam giác, chảo trên bếp đá vòng.',
    setting='Bãi cỏ bên hồ xanh ngọc dưới chân núi, nắng sớm xuyên kẽ lá thông, cờ tam giác nhiều màu căng giữa hai cây. Gió mát, mặt hồ lấp lánh, tiếng chim gõ kiến.',
    story=('Chiếc xe buýt trại hè dừng bên hồ Ngọc, anh Trưởng trại Phong giao cho mỗi Đội Lều một khoảng đất trống và một tấm Bảng Nhiệm vụ còn trắng tinh. '
           'Trước khi mặt trời lặn, cả trại phải có lều vững, lửa ấm, bữa tối nướng thơm và nước sạch cho đêm đầu tiên. '
           'Mỗi công cụ (búa cọc, đá đánh lửa, vỉ nướng, bình lọc) bị khóa trong rương gỗ, và chỉ mở khi cả đội trả lời đúng. '
           'Đúng lúc bếp vừa đỏ lửa thì một đàn sóc tinh nghịch tha mất túi xúc xích, kéo cả trại vào cuộc truy tìm nho nhỏ. '
           'Khi trăng lên, nếu Bảng Nhiệm vụ đầy sao, lửa trại sẽ bùng lên thành hình lá cờ của đội giỏi nhất.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Đến trại và mở rương', 'Nhận đất cắm trại, mở rương công cụ đầu tiên.',
          ['Phim ngắn: xe buýt dừng bên hồ, anh Phong phát Bảng Nhiệm vụ.', 'Mỗi Đội Lều mở rương gỗ bằng 3 câu đúng.'],
          HOOK + ' Ổ khóa rương có 3 vòng số, mỗi câu đúng xoay một vòng.', 'Búa đóng cọc + dây thừng.', ['camp', 'tent', 'tool', 'box', 'open'],
          ['camp_backpack', 'camp_rope', 'river_sign', 'camp_bunting', 'river_tree_pine', 'hdri_dawn']),
        S(2, 'Dựng lều 3 bước', 'Đóng cọc, dựng khung, phủ bạt cho lều của đội.',
          ['Lều lên từng giai đoạn: cọc → khung → bạt.', 'Gió thổi mạnh nếu sai 3 câu liền: bạt bay nhẹ, phải giữ lại.'],
          'Dạng nối cặp (matching) hợp nhất: mỗi cặp đúng gắn một cọc vào đúng vị trí. ' + HOOK, 'Lều hoàn chỉnh + túi ngủ.', ['peg', 'pole', 'cover', 'hammer', 'strong'],
          ['camp_tent_stage', 'camp_sleeping_bag', 'camp_tarp', 'anim_kneel_work']),
        S(3, 'Củi khô và đá lửa', 'Nhặt củi khô (tránh củi ướt), xếp bếp đá vòng và đánh lửa.',
          ['Củi ướt bốc khói xám, củi khô bén lửa ngay.', 'Đá lửa tóe tia sáng mỗi câu đúng; đủ 4 tia thì lửa bén.'],
          HOOK + ' Câu hỏi hiện trên từng bó củi.', 'Lửa trại + vỉ nướng.', ['wood', 'dry', 'wet', 'fire', 'spark'],
          ['camp_firepit', 'river_firewood', 'river_woodpile', 'camp_matchbox', 'camp_axe', 'fx_fire']),
        S(4, 'Nướng xiên bữa tối', 'Xiên thịt, cá, rau và nướng đến chín vàng.',
          ['Thanh độ chín: trả lời đúng để lật xiên đúng lúc.', 'Sai thì xiên hơi cháy cạnh, vẫn ăn được.'],
          'Câu hỏi hiện trên xiên đang nướng; đúng = lật xiên đúng lúc. ' + HOOK, 'Bữa tối (hồi năng lượng cả đội).', ['grill', 'turn', 'cook', 'delicious', 'hungry'],
          ['camp_grill', 'camp_skewer', 'food_meat_raw', 'food_meat_cooked', 'food_fish_raw', 'food_fish_cooked', 'camp_table', 'anim_cook']),
        S(5, 'Lọc nước hồ', 'Lấy nước hồ, lọc qua sỏi, cát, than và đun sôi.',
          ['Bình lọc 3 tầng, mỗi câu đúng thêm một tầng.', 'Nước chuyển từ đục sang trong ngay trước mắt.'],
          'Câu dạng sắp xếp (reorder) hợp: xếp đúng thứ tự các tầng lọc. ' + HOOK, 'Nước sạch + cốc trại.', ['filter', 'sand', 'boil', 'clean', 'drink'],
          ['camp_water_filter', 'camp_bucket', 'camp_cup', 'camp_bottle', 'river_pebbles']),
        S(6, 'Truy tìm túi xúc xích', 'Đàn sóc tha mất túi xúc xích: lần theo dấu, lấy lại túi, hoàn thành bữa tối và lửa trại.',
          ['Dấu chân sóc dẫn qua bến gỗ, gốc cây, bụi dương xỉ.', 'Cuối chặng: lửa trại bùng lên hình lá cờ đội nhiều sao nhất.'],
          'Mỗi điểm dấu chân có một câu hỏi; đúng thì sóc lộ ra. ' + HOOK, 'Cờ đỉnh trại cho Đội Lều nhiều sao nhất.', ['squirrel', 'follow', 'find', 'sausage'],
          ['food_sausage', 'river_stump', 'river_dock', 'river_fern', 'camp_lantern', 'hdri_sunset']),
        S(7, 'Chặng phụ: Nướng kẹo dẻo', 'Kéo dài: nướng kẹo dẻo, mỗi câu đúng kẹo phồng to hơn.',
          ['Kẹo vàng đều được 3 sao.'], 'Câu nhanh, sao đôi.', 'Sao đôi.', ['marshmallow', 'sweet', 'soft'],
          ['camp_marshmallow_stick', 'camp_firepit'], optional=True),
        S(8, 'Chặng phụ: Nhật ký trại', 'Viết 3 câu nhật ký ngày đầu bằng tiếng Anh.',
          ['Nhật ký ghim lên bảng gỗ của trại.'], 'Câu viết ngắn, chấm theo tiêu chí, không tính thua.', 'Huy hiệu "Trại Viên Ngày Đầu".', ['today', 'first', 'happy'],
          ['camp_lantern', 'river_sign'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 1, [
        C('Anh Phong', 'Trưởng trại vui tính, giao Bảng Nhiệm vụ', 'adult', 'm', 'explorer', 'green', 'Áo trại xanh lá, khăn quàng đỏ, mũ rộng vành', 'Trưởng trại, người dẫn chuyện', 'npc', 'rolled_paper', ['whistle', 'hat']),
        C('Chị Mây', 'Đầu bếp trại, dạy nướng xiên', 'adult', 'f', 'casual', 'white', 'Tạp dề kẻ caro, khăn buộc tóc', 'Hướng dẫn trạm bếp', 'npc', 'ladle', ['headband']),
        C('Chú Hải', 'Kiểm lâm, dạy lọc nước và giữ an toàn lửa', 'adult', 'm', 'explorer', 'khaki', 'Áo kiểm lâm kaki', 'Hướng dẫn trạm nước và lửa', 'npc', None, ['watch', 'map_or_notebook'], hair=('buzz', 'buzz')),
        C('Bé Na', 'Hay hỏi "tại sao", thích cờ tam giác', 'child', 'f', 'casual', 'pink', 'Áo thun hồng, quần yếm', 'Trại viên, Đội trưởng Lều Hồng', 'campers', None, ['bag', 'flower']),
        C('Tuấn', 'Đóng cọc lều chắc nhất trại', 'child', 'm', 'explorer', 'blue', 'Áo xanh dương, quần short kaki', 'Thợ dựng lều', 'campers', 'axe_hammer_tool', []),
        C('Liam', 'Bạn Ireland, đánh lửa giỏi', 'teen', 'm', 'casual', 'red', 'Áo flannel đỏ', 'Người giữ lửa', 'campers', None, ['freckles', 'watch']),
        C('Hồng Nhung', 'Nướng xiên vàng đều', 'teen', 'f', 'casual', 'yellow', 'Áo vàng, tạp dề nhỏ', 'Đầu bếp', 'campers', 'ladle', ['earring']),
        C('Khang', 'Giữ rương công cụ, nhớ hết mọi món', 'child', 'm', 'casual', 'olive', 'Áo ô liu, túi đeo chéo', 'Thủ kho', 'campers', None, ['bag', 'glasses']),
        C('Fatima', 'Bạn Malaysia, vẽ bản đồ trại', 'teen', 'f', 'casual', 'purple', 'Áo dài tay tím, khăn trùm đầu', 'Đội trưởng Lều Tím', 'campers', 'rolled_paper', ['map_or_notebook'], covered=True),
        C('Bin', 'Nhỏ nhất trại, phát hiện dấu chân sóc', 'child', 'm', 'casual', 'teal', 'Áo xanh ngọc có hình cá', 'Trinh sát nhí', 'campers', None, ['hat']),
        C('Bà Lụa', 'Bà ngoại của Bé Na, đến thăm trại, kể chuyện bên lửa', 'elder', 'f', 'vn_traditional', 'maroon', 'Áo bà ba nâu đỏ', 'Khách thăm trại', 'npc', 'fan', ['necklace']),
        C('Sóc Hạt Dẻ', 'Thủ lĩnh đàn sóc tinh nghịch tha túi xúc xích', 'child', 'n', 'casual', 'brown', 'Lông nâu đuôi xù', 'Linh vật tinh nghịch', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 2
sid = 'camp-02'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=2,
    title='Đại Hội Ẩm Thực Lửa Trại',
    inspiration='Video bảng chế biến món ăn, chảo trên bếp đá + file: nướng thịt, bắt cá.',
    setting='Khu bếp chung ven sông, ba bếp đá vòng xếp hàng, bàn gỗ dài phủ khăn caro, đèn dây treo trên đầu. Buổi chiều nắng vàng, mùi khói gỗ thơm.',
    story=('Trại tổ chức Đại hội Ẩm thực, và giám khảo năm nay là đầu bếp nổi tiếng Chef Marco ghé thăm. '
           'Mỗi Đội Lều nhận một thẻ công thức bằng tiếng Anh: cá nướng lá chuối, bắp nướng bơ, xiên thịt rau củ và bánh mì nướng. '
           'Nguyên liệu phải tự kiếm: bắt cá ở bến, hái rau ở vườn trại, đổi đồ với trại bên cạnh. '
           'Giữa chừng, lửa của ba bếp cùng tắt vì cơn gió lạ, cả trại phải cùng nhau nhóm lại. '
           'Cuối buổi, Chef Marco chấm điểm từng món, món nào được làm đúng công thức sẽ được đặt lên bàn tiệc lớn của trại.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Thẻ công thức', 'Nhận thẻ công thức, đọc nguyên liệu và các bước.',
          ['Chef Marco xuất hiện, chọn món cho từng đội.', 'Đọc đúng thẻ = mở danh sách nguyên liệu.'],
          'Thẻ công thức hiện như tờ giấy cầm tay; câu đọc hiểu hợp nhất. ' + HOOK, 'Danh sách nguyên liệu.', ['recipe', 'ingredient', 'step', 'first'],
          ['camp_table', 'camp_string_lights', 'river_sign']),
        S(2, 'Đi chợ trại', 'Bắt cá ở bến, hái rau, đổi bắp với trại bên.',
          ['Mỗi nguyên liệu là một câu hỏi tại chỗ.', 'Đổi đồ: trả lời đúng thì trại bên đồng ý đổi.'],
          HOOK, 'Giỏ nguyên liệu đầy.', ['fish', 'corn', 'vegetable', 'trade', 'basket'],
          ['food_fish_raw', 'food_corn', 'food_apple', 'river_dock', 'camp_bucket']),
        S(3, 'Sơ chế', 'Rửa, cắt, xiên nguyên liệu đúng thứ tự.',
          ['Dao chỉ cắt qua hoạt ảnh có găng tay.', 'Thứ tự sai thì Chef Marco nhắc nhẹ.'],
          'Câu sắp xếp (reorder) để xếp các bước sơ chế. ' + HOOK, 'Xiên sẵn sàng.', ['wash', 'cut', 'slice', 'mix'],
          ['camp_skewer', 'camp_table', 'food_meat_raw']),
        S(4, 'Gió lạ thổi tắt lửa', 'Cả trại cùng nhóm lại ba bếp đá.',
          ['Thanh lửa chung: mọi Đội Lều trả lời đúng đều làm lửa bùng thêm.', 'Củi khô ở kho, củi ướt ở bờ sông.'],
          HOOK + ' Câu hỏi hiện trên từng bếp đá.', 'Ba bếp đỏ lửa.', ['wind', 'together', 'relight', 'warm'],
          ['camp_firepit', 'river_firewood', 'camp_matchbox', 'fx_fire', 'fx_smoke']),
        S(5, 'Nướng và lật', 'Nướng đúng độ chín theo công thức.',
          ['Thanh độ chín cho mỗi món.', 'Đúng lúc lật = 3 sao.'],
          'Câu hỏi trên món đang nướng; đúng = lật đúng lúc. ' + HOOK, 'Món chín vàng.', ['grill', 'flip', 'golden', 'smell'],
          ['camp_grill', 'camp_pan', 'food_fish_cooked', 'food_meat_cooked', 'food_corn', 'anim_cook']),
        S(6, 'Bàn tiệc của Chef Marco', 'Trình bày món, Chef Marco chấm, bày lên bàn tiệc lớn.',
          ['Mỗi đội giới thiệu món bằng một câu tiếng Anh.', 'Bàn tiệc đầy món = Bảng Nhiệm vụ đầy.'],
          'Câu giới thiệu món (viết ngắn hoặc chọn câu đúng). ' + HOOK, 'Cúp Đầu Bếp Lửa Trại.', ['taste', 'yummy', 'present', 'best'],
          ['camp_table', 'camp_bench', 'food_bread', 'camp_cup', 'hdri_sunset']),
        S(7, 'Chặng phụ: Món tráng miệng', 'Kéo dài: nướng chuối và táo cho bàn tiệc.',
          ['Mỗi câu đúng thêm một phần tráng miệng.'], 'Sao đôi.', 'Sao đôi.', ['dessert', 'banana', 'apple'],
          ['food_apple', 'camp_grill'], optional=True),
        S(8, 'Chặng phụ: Viết thực đơn', 'Viết thực đơn tiếng Anh cho bữa sáng mai.',
          ['Thực đơn được dán ở bếp trại.'], 'Câu viết, không tính thua.', 'Huy hiệu "Đầu Bếp Nhí".', ['breakfast', 'menu', 'tomorrow'],
          ['river_sign'], optional=True),
    ],
    class_plan=plan({'note': 'Mỗi Đội Lều nấu một món khác nhau để các đội không tranh cùng một bếp.'}),
    characters=cast(sid, 4, [
        C('Chef Marco', 'Đầu bếp người Ý, khen rất to', 'adult', 'm', 'formal_smart', 'white', 'Áo đầu bếp trắng, mũ cao', 'Giám khảo', 'npc', 'ladle', ['mustache', 'hat']),
        C('Cô Uyên', 'Quản lý bếp trại, giữ an toàn lửa', 'adult', 'f', 'casual', 'green', 'Tạp dề xanh, găng tay', 'Hướng dẫn bếp', 'npc', None, ['watch']),
        C('Bác Tám', 'Giữ vườn rau trại', 'elder', 'm', 'vn_traditional', 'brown', 'Áo bà ba, nón lá', 'Chủ vườn rau', 'npc', None, ['hat'], covered=True),
        C('Thu Trang', 'Đọc công thức to rõ', 'teen', 'f', 'casual', 'red', 'Tạp dề đỏ, áo trắng', 'Đội trưởng Lều Đỏ', 'campers', 'rolled_paper', []),
        C('Hào', 'Bắt cá ở bến rất nhanh', 'child', 'm', 'casual', 'blue', 'Áo xanh, quần lửng', 'Người kiếm nguyên liệu', 'campers', 'swatter_net', ['hat']),
        C('Chloe', 'Bạn Canada, lật xiên đúng lúc', 'teen', 'f', 'casual', 'yellow', 'Tạp dề vàng', 'Đầu bếp', 'campers', 'ladle', ['freckles']),
        C('Duy', 'Thổi lửa giỏi nhất', 'child', 'm', 'casual', 'orange', 'Áo cam, găng tay', 'Người giữ lửa', 'campers', 'fan', []),
        C('Lam', 'Bày món đẹp như nhà hàng', 'teen', 'n', 'casual', 'teal', 'Áo sơ mi xanh ngọc', 'Người trình bày', 'campers', None, ['glasses']),
        C('Hana', 'Bạn Hàn, giỏi đổi đồ với trại bên', 'child', 'f', 'casual', 'pink', 'Áo hồng, mũ bucket', 'Thủ kho', 'campers', None, ['hat', 'bag']),
        C('Tèo', 'Đội trưởng trại bên, hay mặc cả', 'child', 'm', 'casual', 'green', 'Áo xanh lá, khăn quàng', 'Trại bên (đổi đồ)', 'npc', None, ['bag']),
        C('Ngoại Sen', 'Mang theo công thức bắp nướng bí truyền', 'elder', 'f', 'vn_traditional', 'purple', 'Áo bà ba tím', 'Khách mời', 'npc', 'fan', ['necklace']),
        C('Mèo Mướp', 'Mèo của bếp, luôn rình cá nướng', 'child', 'n', 'casual', 'gray', 'Lông vằn xám', 'Linh vật bếp', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 3
sid = 'camp-03'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=3,
    title='Bão Nhỏ Ghé Trại',
    inspiration='File: dựng lều, tìm củi, lọc nước; tình huống thời tiết thay đổi để tăng kịch tính.',
    setting='Trại bên sông giữa buổi chiều, mây xám kéo về từ đỉnh núi, gió làm cờ tam giác bay phần phật. Mưa lất phất rồi to dần, sau đó tạnh và có cầu vồng.',
    story=('Đài radio của trại báo một cơn bão nhỏ sẽ đi qua trong nửa giờ. '
           'Cô Trưởng trại Linh giao nhiệm vụ: chằng lều thật chắc, che bạt cho bếp, gom củi khô vào kho, đổ đầy nước sạch và treo đèn bão. '
           'Gió càng lúc càng mạnh, lều nào chưa chằng sẽ bị thổi nghiêng, củi ngoài trời sẽ ướt. '
           'Đúng lúc mưa to nhất, mất một ba lô của Bé Tôm, cả trại phải tìm trong mưa. '
           'Khi bão qua, cầu vồng hiện trên sông và cả trại quây quần bên lửa, kể lại cách mình đã giữ trại an toàn.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Bản tin bão', 'Nghe bản tin, lập kế hoạch giữ trại.',
          ['Radio phát bản tin tiếng Anh chậm.', 'Mỗi Đội Lều chọn 3 việc ưu tiên.'],
          'Câu nghe hiểu ngắn hợp nhất ở chặng này. ' + HOOK, 'Kế hoạch giữ trại.', ['storm', 'forecast', 'plan', 'safe'],
          ['camp_lantern', 'camp_table', 'river_sign', 'hdri_cloudy']),
        S(2, 'Chằng lều', 'Thêm cọc, căng dây gió, siết bạt.',
          ['Gió tăng mỗi phút; lều chưa chằng nghiêng dần.', 'Mỗi câu đúng thêm một dây gió.'],
          HOOK + ' Câu hỏi hiện trên từng sợi dây gió.', 'Lều vững trong bão.', ['tie', 'tight', 'strong', 'wind'],
          ['camp_tent_stage', 'camp_rope', 'camp_tarp', 'anim_kneel_work']),
        S(3, 'Che bếp, gom củi', 'Căng bạt che bếp, mang củi khô vào kho trước mưa.',
          ['Củi để ngoài sẽ đổi màu sẫm (ướt).', 'Bạt căng giữa 2 cây thông.'],
          HOOK, 'Kho củi khô.', ['cover', 'carry', 'inside', 'dry'],
          ['camp_tarp', 'river_woodpile', 'river_firewood', 'river_shed']),
        S(4, 'Nước sạch và đèn bão', 'Đổ đầy bình nước sạch, treo đèn bão quanh trại.',
          ['Đèn treo đủ = lối đi sáng khi trời tối sầm.', 'Nước lọc trước khi mưa làm hồ đục.'],
          HOOK, 'Đèn bão + nước dự trữ.', ['lantern', 'light', 'fill', 'storm'],
          ['camp_lantern', 'camp_water_filter', 'camp_bottle', 'camp_bucket']),
        S(5, 'Tìm ba lô trong mưa', 'Mưa to nhất: tìm ba lô của Bé Tôm theo các manh mối.',
          ['Manh mối: chiếc mũ, dấu chân, một con gấu bông.', 'Cả trại cùng tìm, mỗi đội một hướng.'],
          'Mỗi manh mối là một câu hỏi; đúng thì manh mối tiếp theo sáng lên. ' + HOOK, 'Ba lô tìm thấy.', ['lost', 'search', 'where', 'found'],
          ['camp_backpack', 'river_bush', 'river_stump', 'decal_footprint_mud']),
        S(6, 'Cầu vồng sau bão', 'Bão qua: kiểm tra trại, nhóm lửa, kể chuyện.',
          ['Cầu vồng trên sông.', 'Bảng Nhiệm vụ đầy = trại đạt "Trại An Toàn".'],
          HOOK, 'Danh hiệu "Trại An Toàn" + cờ cho Đội Lều giỏi nhất.', ['rainbow', 'after', 'check', 'proud'],
          ['camp_firepit', 'hdri_noon', 'anim_cheer']),
        S(7, 'Chặng phụ: Phơi đồ', 'Kéo dài: phơi túi ngủ, giày ướt quanh lửa.',
          ['Mỗi câu đúng phơi khô một món.'], 'Sao đôi.', 'Sao đôi.', ['wet', 'dry', 'hang'],
          ['camp_sleeping_bag', 'camp_rope'], optional=True),
        S(8, 'Chặng phụ: Bản tin của em', 'Mỗi đội đọc bản tin thời tiết ngày mai bằng tiếng Anh.',
          ['Bản tin hay nhất phát lại trên radio trại.'], 'Câu nói/viết ngắn, không tính thua.', 'Huy hiệu "Người Giữ Trại".', ['sunny', 'cloudy', 'tomorrow'],
          ['camp_lantern'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 7, [
        C('Cô Linh', 'Trưởng trại quyết đoán, giữ radio', 'adult', 'f', 'explorer', 'blue', 'Áo mưa xanh, mũ trùm', 'Trưởng trại', 'npc', None, ['whistle', 'watch'], covered=True),
        C('Chú Bình', 'Thợ mộc của trại, dạy chằng dây', 'adult', 'm', 'explorer', 'brown', 'Áo nâu, găng tay da', 'Hướng dẫn chằng lều', 'npc', 'axe_hammer_tool', ['beard']),
        C('Bé Tôm', 'Làm mất ba lô, rất lo lắng', 'child', 'm', 'casual', 'yellow', 'Áo mưa vàng hình vịt', 'Trại viên cần giúp', 'campers', None, ['pet_or_toy']),
        C('Diễm', 'Bình tĩnh, chia việc cho đội', 'teen', 'f', 'explorer', 'green', 'Áo khoác xanh lá', 'Đội trưởng Lều Xanh', 'campers', 'rolled_paper', ['bag']),
        C('Nguyên', 'Đóng cọc trong gió', 'teen', 'm', 'explorer', 'navy', 'Áo khoác navy', 'Thợ dựng lều', 'campers', 'axe_hammer_tool', []),
        C('Mia', 'Bạn Mỹ, treo đèn bão nhanh', 'child', 'f', 'casual', 'red', 'Áo mưa đỏ', 'Người giữ đèn', 'campers', 'flashlight', ['freckles']),
        C('Thịnh', 'Khiêng củi khỏe', 'child', 'm', 'casual', 'olive', 'Áo ô liu', 'Người gom củi', 'campers', None, ['headband']),
        C('Arjun', 'Bạn Ấn Độ, lọc nước cẩn thận', 'teen', 'm', 'casual', 'white', 'Áo trắng, áo mưa trong', 'Người lo nước', 'campers', None, ['glasses']),
        C('Xuân', 'Tìm manh mối trong mưa', 'child', 'f', 'casual', 'pink', 'Áo mưa hồng', 'Trinh sát', 'campers', None, ['hat']),
        C('Quân', 'Giữ kho đồ', 'teen', 'm', 'casual', 'gray', 'Áo hoodie xám', 'Thủ kho', 'campers', None, ['bag']),
        C('Ông Khải', 'Ông lão bán đồ trại, mang thêm áo mưa', 'elder', 'm', 'casual', 'navy', 'Áo khoác cũ', 'Khách giúp đỡ', 'npc', 'staff_cane', ['hat']),
        C('Gấu Bông Mít', 'Gấu bông của Bé Tôm, rơi làm manh mối', 'child', 'n', 'casual', 'brown', 'Gấu nâu mặc áo đỏ', 'Manh mối', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 4
sid = 'camp-04'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=4,
    title='Đêm Sao Và Lửa Trại Kể Chuyện',
    inspiration='Video lều phát sáng ban đêm, lửa trại khói bốc; file: nhóm lửa trại.',
    setting='Trại bên hồ về đêm, trời đầy sao, lều phát sáng ấm áp, đèn lồng treo dọc lối đi. Mặt hồ phản chiếu ánh trăng, tiếng dế kêu.',
    story=('Đêm thứ ba của trại là đêm Lửa Trại Lớn, và nhà thiên văn Dr. Stella mang kính thiên văn đến trại. '
           'Nhưng để lửa trại bùng lên, mỗi Đội Lều phải góp củi, treo đèn lồng và dựng ghế dài quanh bếp. '
           'Dr. Stella giấu bản đồ sao thành năm mảnh, mỗi mảnh nằm ở một góc trại và chỉ hiện ra khi đèn lồng sáng. '
           'Ghép đủ bản đồ, cả trại sẽ tìm được chòm sao Thuyền Câu và nghe câu chuyện cổ về nó. '
           'Đêm khép lại bằng món kẹo dẻo nướng và bài hát chung của trại.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Thắp đèn lồng', 'Treo và thắp đèn lồng dọc lối đi.',
          ['Mỗi đèn sáng làm lộ một góc trại.', 'Lều phát sáng dần lên.'],
          HOOK + ' Câu hỏi hiện trên từng chiếc đèn lồng.', 'Lối đi sáng.', ['lantern', 'light', 'dark', 'night'],
          ['camp_lantern', 'camp_string_lights', 'camp_tent_stage', 'hdri_night']),
        S(2, 'Góp củi lửa trại lớn', 'Mỗi Đội Lều góp một bó củi cho bếp lớn.',
          ['Đống củi cao dần theo số câu đúng của cả trại.'],
          HOOK, 'Đống lửa trại lớn.', ['wood', 'pile', 'big', 'share'],
          ['river_woodpile', 'river_firewood', 'camp_firepit']),
        S(3, 'Ghế dài quanh lửa', 'Khiêng ghế, xếp vòng tròn quanh bếp.',
          ['Ghế xếp đúng vòng = chỗ ngồi cho cả lớp.'],
          'Câu nối cặp (matching) gắn ghế vào đúng chỗ. ' + HOOK, 'Vòng ghế quanh lửa.', ['bench', 'circle', 'sit', 'around'],
          ['camp_bench', 'camp_chair']),
        S(4, 'Năm mảnh bản đồ sao', 'Tìm 5 mảnh bản đồ sao giấu ở các góc trại.',
          ['Mảnh chỉ hiện khi đèn gần đó đã sáng.', 'Mỗi mảnh = một câu hỏi.'],
          'Câu đọc hiểu ngắn về sao và bầu trời. ' + HOOK, 'Bản đồ sao hoàn chỉnh.', ['star', 'map', 'piece', 'sky'],
          ['surv_map', 'camp_lantern', 'river_stump']),
        S(5, 'Chòm sao Thuyền Câu', 'Ghép bản đồ, tìm chòm sao trên trời qua kính thiên văn.',
          ['Dr. Stella kể câu chuyện cổ về ông lão câu cá trên trời.', 'Câu đúng nối thêm một ngôi sao.'],
          'Câu sắp xếp câu chuyện (reorder). ' + HOOK, 'Câu chuyện chòm sao.', ['constellation', 'shine', 'story', 'telescope'],
          ['hdri_night', 'camp_table']),
        S(6, 'Lửa trại bùng lên', 'Thắp lửa trại lớn, hát bài ca trại.',
          ['Lửa bùng lên cao, tia lửa bay lên trời sao.', 'Cờ Đội Lều giỏi nhất cắm cạnh lửa.'],
          HOOK, 'Danh hiệu "Đêm Sao Rực Rỡ".', ['campfire', 'sing', 'together', 'happy'],
          ['camp_firepit', 'fx_fire', 'fx_spark', 'anim_cheer']),
        S(7, 'Chặng phụ: Kẹo dẻo', 'Kéo dài: nướng kẹo dẻo quanh lửa.',
          ['Kẹo phồng theo câu đúng.'], 'Sao đôi.', 'Sao đôi.', ['marshmallow', 'toast'],
          ['camp_marshmallow_stick'], optional=True),
        S(8, 'Chặng phụ: Điều ước sao băng', 'Viết một điều ước tiếng Anh.',
          ['Điều ước bay lên thành sao băng.'], 'Câu viết ngắn, không tính thua.', 'Huy hiệu "Người Ngắm Sao".', ['wish', 'dream', 'future'],
          ['hdri_night'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 10, [
        C('Dr. Stella', 'Nhà thiên văn, mang kính thiên văn đến trại', 'adult', 'f', 'explorer', 'navy', 'Áo khoác navy đính sao', 'Người kể chuyện chòm sao', 'npc', None, ['glasses', 'necklace']),
        C('Anh Tùng', 'Trưởng trại đêm, chơi đàn guitar', 'adult', 'm', 'casual', 'maroon', 'Áo len đỏ đô', 'Trưởng trại', 'npc', 'instrument', ['instrument']),
        C('Cún Bơ', 'Chó trại, nằm cạnh lửa', 'child', 'n', 'casual', 'yellow', 'Lông vàng bơ', 'Linh vật', 'npc', None, ['pet_or_toy']),
        C('Khánh An', 'Thích sao, nhớ tên chòm sao', 'child', 'f', 'casual', 'purple', 'Áo khoác tím có sao', 'Đội trưởng Lều Tím', 'campers', None, ['headband']),
        C('Đăng', 'Treo đèn lồng cao nhất', 'teen', 'm', 'casual', 'navy', 'Áo hoodie navy', 'Người giữ đèn', 'campers', None, []),
        C('Isabella', 'Bạn Brazil, hát bài trại hay nhất', 'teen', 'f', 'casual', 'yellow', 'Áo len vàng', 'Người dẫn hát', 'campers', None, ['earring'], hair=('curly', 'long')),
        C('Bờm', 'Khiêng ghế khỏe', 'child', 'm', 'casual', 'green', 'Áo xanh lá', 'Thợ dựng', 'campers', None, ['hat']),
        C('Thùy Dương', 'Ghép bản đồ nhanh', 'teen', 'f', 'casual', 'teal', 'Áo khoác xanh ngọc', 'Thợ giải đố', 'campers', 'rolled_paper', ['glasses']),
        C('Yuki', 'Bạn Nhật, giữ lửa nhỏ không tắt', 'child', 'f', 'casual', 'white', 'Áo len trắng', 'Người giữ lửa', 'campers', None, ['flower']),
        C('Phát', 'Kể chuyện ma vui (không đáng sợ)', 'teen', 'm', 'casual', 'black', 'Áo đen in hình trăng', 'Người kể chuyện', 'campers', 'flashlight', []),
        C('Ông Sáu Nhỏ', 'Ông lão làng chài, biết truyện Thuyền Câu', 'elder', 'm', 'vn_traditional', 'brown', 'Áo bà ba, khăn rằn', 'Khách mời kể chuyện', 'npc', 'staff_cane', ['beard']),
        C('Đom Đóm Tí Hon', 'Bay theo ai trả lời đúng', 'child', 'n', 'casual', 'yellow', 'Ánh sáng vàng nhỏ', 'Linh vật dẫn đường', 'npc', None, []),
    ]),
))

# ---------------------------------------------------------------- 5
sid = 'camp-05'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=5,
    title='Chuyến Dã Ngoại Thượng Nguồn',
    inspiration='File: bối cảnh sông núi picnic, tìm thức ăn, lọc nước; video cầu gỗ ra hồ và rừng thông.',
    setting='Đường mòn men theo sông lên thượng nguồn: cầu gỗ, rừng thông, thác nhỏ, và một bãi cỏ phẳng bên hồ trên núi. Trời trong, nắng nhẹ, mây trắng trôi chậm.',
    story=('Cả trại khởi hành từ bến gỗ để lên bãi cắm trại mới ở thượng nguồn, nơi nghe nói có hồ nước trong nhất vùng. '
           'Hướng dẫn viên Leo đưa cho mỗi Đội Lều một bản đồ, một la bàn và một ba lô trống cần chuẩn bị đúng đồ. '
           'Trên đường, cầu gỗ cũ bị gãy một tấm ván, phải sửa mới qua được; rồi đến khúc sông cần lấy nước lọc để uống. '
           'Đến nơi, cả trại dựng lều mới, nhóm bếp, và nấu bữa trưa từ những gì hái được trên đường. '
           'Phần thưởng cuối cùng là chuyến chèo thuyền nhỏ ngắm hồ trên núi lúc hoàng hôn.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Soạn ba lô', 'Chọn đúng đồ cho chuyến đi (nước, áo mưa, đèn pin, hộp cứu thương).',
          ['Ba lô có giới hạn cân nặng: đồ thừa làm đi chậm.'],
          'Câu chọn đồ (trắc nghiệm, nối cặp đồ - công dụng). ' + HOOK, 'Ba lô chuẩn.', ['pack', 'need', 'heavy', 'light'],
          ['camp_backpack', 'camp_firstaid', 'surv_flashlight', 'camp_bottle', 'river_dock']),
        S(2, 'Bản đồ và la bàn', 'Đọc bản đồ, chọn đúng ngã rẽ.',
          ['Ba ngã rẽ, mỗi ngã có biển chỉ đường.', 'Đi sai thì vòng lại 30 giây.'],
          'Câu hướng đi (north, left, across...). ' + HOOK, 'Đường tắt.', ['map', 'compass', 'north', 'turn'],
          ['surv_map', 'surv_compass', 'river_sign', 'river_tree_pine']),
        S(3, 'Sửa cầu gỗ', 'Thay tấm ván gãy để cả trại qua suối.',
          ['Mỗi câu đúng đóng một đinh.', 'Cầu lắc nhẹ khi đông người.'],
          HOOK + ' Câu hỏi hiện trên tấm ván.', 'Cầu qua suối.', ['bridge', 'board', 'fix', 'cross'],
          ['river_bridge', 'camp_axe', 'river_log_fallen']),
        S(4, 'Nước thượng nguồn', 'Lấy nước sông, lọc và đun.',
          ['Nước thượng nguồn trong nhưng vẫn phải lọc.'],
          'Câu sắp xếp các bước lọc. ' + HOOK, 'Bình nước đầy.', ['river', 'filter', 'boil', 'safe'],
          ['camp_water_filter', 'camp_bucket', 'river_rock_medium']),
        S(5, 'Dựng trại mới', 'Dựng lều và bếp ở bãi cỏ bên hồ trên núi.',
          ['Lều 3 giai đoạn như ngày đầu nhưng nhanh hơn.', 'Hái nấm và quả an toàn (có biển nhận biết).'],
          HOOK, 'Trại mới + bữa trưa.', ['new', 'lake', 'pick', 'lunch'],
          ['camp_tent_stage', 'camp_firepit', 'camp_pan', 'food_apple', 'food_bread']),
        S(6, 'Chèo thuyền hoàng hôn', 'Chèo thuyền nhỏ ngắm hồ trên núi.',
          ['Mỗi câu đúng một nhịp chèo; cả đội chèo đồng đều thì thuyền đi thẳng.'],
          HOOK, 'Danh hiệu "Nhà Thám Hiểm Thượng Nguồn".', ['row', 'paddle', 'sunset', 'beautiful'],
          ['river_boat_row', 'river_dock', 'hdri_sunset', 'river_duck']),
        S(7, 'Chặng phụ: Câu cá bên hồ', 'Kéo dài: câu vài con cá cho bữa tối.',
          ['Mỗi câu đúng một lần giật cần.'], 'Sao đôi.', 'Sao đôi.', ['fish', 'catch'],
          ['fish_rod', 'fish_bobber'], optional=True),
        S(8, 'Chặng phụ: Bưu thiếp', 'Viết bưu thiếp tiếng Anh gửi gia đình.',
          ['Bưu thiếp có ảnh hồ trên núi.'], 'Câu viết ngắn, không tính thua.', 'Huy hiệu "Lữ Khách Nhí".', ['dear', 'miss you', 'see you'],
          ['river_sign'], optional=True),
    ],
    class_plan=plan({'note': 'Đường mòn chia 3 làn song song cho lớp đông; các Đội Lều xuất phát cách nhau 20 giây.'}),
    characters=cast(sid, 5, [
        C('Leo', 'Hướng dẫn viên leo núi, luôn mỉm cười', 'adult', 'm', 'explorer', 'orange', 'Áo leo núi cam, ba lô lớn', 'Hướng dẫn viên', 'npc', 'staff_cane', ['hat', 'watch']),
        C('Cô Vân', 'Y tá trại, giữ hộp cứu thương', 'adult', 'f', 'casual', 'white', 'Áo trắng có chữ thập xanh', 'Hướng dẫn an toàn', 'npc', None, ['bag']),
        C('Lộc', 'Đọc bản đồ giỏi', 'teen', 'm', 'explorer', 'green', 'Áo xanh lá, mũ lưỡi trai', 'Đội trưởng Lều Xanh', 'campers', 'rolled_paper', ['map_or_notebook', 'hat']),
        C('Bảo Ngọc', 'Soạn ba lô gọn nhất', 'child', 'f', 'explorer', 'teal', 'Áo xanh ngọc, quần leo núi', 'Thủ kho', 'campers', None, ['bag']),
        C('Sam', 'Bạn New Zealand, sửa cầu giỏi', 'teen', 'm', 'explorer', 'brown', 'Áo nâu, găng tay', 'Thợ dựng', 'campers', 'axe_hammer_tool', ['freckles']),
        C('Ly Ly', 'Biết loại quả nào ăn được', 'child', 'f', 'casual', 'red', 'Áo đỏ, mũ rơm', 'Người hái quả', 'campers', None, ['hat']),
        C('Tín', 'Chèo thuyền đều tay', 'teen', 'm', 'life_jacket_sailing', 'yellow', 'Áo phao vàng', 'Người chèo', 'campers', None, []),
        C('Zara', 'Bạn Kenya, chạy đường mòn không mệt', 'child', 'f', 'football', 'purple', 'Áo thể thao tím', 'Trinh sát', 'campers', None, ['headband'], hair=('afro', 'shoulder')),
        C('Vũ', 'Chụp ảnh suốt chuyến đi', 'teen', 'm', 'casual', 'gray', 'Áo xám, máy ảnh đeo cổ', 'Người ghi hình', 'campers', None, ['camera']),
        C('Tâm Như', 'Lọc nước cẩn thận', 'teen', 'f', 'casual', 'blue', 'Áo xanh dương', 'Người lo nước', 'campers', None, ['glasses']),
        C('Bà Hai', 'Bà cụ sống ở thượng nguồn, chỉ đường tắt', 'elder', 'f', 'regional_traditional', 'navy', 'Áo chàm, khăn đội đầu', 'Người dân bản', 'npc', None, ['bracelet'], covered=True),
        C('Dê Núi Bạc', 'Dê núi đứng trên đá, kêu khi đi sai đường', 'child', 'n', 'casual', 'white', 'Lông trắng, sừng cong', 'Linh vật đường mòn', 'npc', None, ['pet_or_toy']),
    ]),
))
