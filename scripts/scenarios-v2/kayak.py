from common import C, S, cast

GAME = 'kayak_rush'

HOOK = 'Câu hỏi hiện trên cổng phao phía trước; trả lời đúng trước khi tới cổng thì kayak bật Nitro lướt qua, sai thì kayak chậm lại và lắc nhẹ, không lật.'


def plan(extra=None):
    p = {
        'sizes': {
            '1-5': 'Mỗi em một kayak đua cùng 2-3 kayak máy (độ khó theo bậc của lớp).',
            '6-20': 'Đội 2-4 kayak cùng màu. Mỗi màn hình hiện kayak của mình + 4 đối thủ gần nhất; bảng xếp hạng cả lớp ở góc.',
            '21-50': '10 đội × 5 kayak, đua theo 2 lượt xuất phát (25 kayak/lượt) trên cùng đường sông; điểm đội = tổng thứ hạng. Mỗi máy chỉ vẽ 8 kayak gần nhất để nhẹ.',
        },
        'roles': ['Đội trưởng (chọn đường tắt)', 'Tay chèo Nitro', 'Hoa tiêu (đọc biển báo)', 'Người cứu hộ (giúp kayak lật)'],
        'scoring': 'Thứ hạng + số Nitro + đường tắt mở được. Đúng 3 câu liền = Siêu Nitro.',
        'avatars': 'Mỗi học sinh ngồi kayak bằng nhân vật riêng ghép từ hồ sơ diện mạo, áo phao màu đội, mũ ngộ nghĩnh tự chọn.',
        'style': 'Nâng cấp theo gói thế giới sông bán thực (như 3 game mới); chướng ngại: khúc gỗ xoay, đá ngầm, xoáy nước, ghềnh, cây trôi.',
    }
    if extra:
        p.update(extra)
    return p


SCENARIOS = []

sid = 'kayak-01'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=1,
    title='Giải Đua Sông Ngọc',
    inspiration='File mục I.1 (đua lách gỗ xoay, quái cây, tăng tốc khi trả lời đúng) + gói thế giới sông chung.',
    setting='Sông xanh ngọc uốn qua rừng thông và bãi sỏi, nắng sáng, cờ đua hai bên bờ, khán giả đứng trên cầu gỗ. Nước trong thấy đá cuội.',
    story=('Giải Đua Kayak Sông Ngọc mùa hè khai mạc, cô bình luận viên Vân Anh giới thiệu từng đội trên loa. '
           'Đường đua dài sáu chặng: bến xuất phát, khúc gỗ xoay, rừng lau, ghềnh đá, cầu treo và đích đến dưới cổng hoa. '
           'Mỗi cổng phao mang một câu hỏi, đội trả lời đúng sẽ bật Nitro lướt như bay. '
           'Giữa chặng, khúc gỗ khổng lồ trôi xoay chặn ngang sông, chỉ đội đọc đúng biển báo mới tìm ra lạch tắt. '
           'Về đích, đội vô địch nhận Mái Chèo Vàng và được chèo vòng danh dự quanh hồ.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Bến xuất phát', 'Khởi động, nhận kayak và mái chèo; xuất phát.',
          ['Đèn xuất phát đỏ - vàng - xanh.', 'Câu đúng trước đèn xanh = xuất phát sớm 1 giây.'],
          HOOK, 'Nitro đầu tiên.', ['ready', 'start', 'paddle', 'go'],
          ['kayak_boat', 'kayak_paddle', 'kayak_lifejacket', 'river_dock', 'camp_bunting']),
        S(2, 'Khúc gỗ xoay', 'Lách qua khúc gỗ xoay giữa dòng.',
          ['Gỗ xoay theo nhịp; Nitro đúng lúc thì lướt qua.'],
          HOOK, 'Qua chặng không mất tốc.', ['log', 'spin', 'dodge', 'left', 'right'],
          ['kayak_log_spinning', 'river_driftwood', 'river_log_fallen']),
        S(3, 'Rừng lau', 'Đi qua rừng lau rậm, tìm lạch tắt theo biển báo.',
          ['Biển báo tiếng Anh chỉ lạch tắt.', 'Đi sai lạch: vòng xa thêm 5 giây.'],
          'Câu hỏi trên biển báo lạch; câu hướng đi.', 'Lạch tắt.', ['shortcut', 'sign', 'reed', 'narrow'],
          ['river_reed', 'river_sign', 'river_lilypad']),
        S(4, 'Ghềnh đá', 'Vượt ghềnh nước trắng, tránh đá ngầm.',
          ['Đá ngầm hiện vệt bọt trắng.', 'Sai 2 câu liền: kayak xoay một vòng.'],
          HOOK + ' Câu ngắn 8 giây vì nước chảy nhanh.', 'Siêu Nitro nếu đúng 3 câu liền.', ['rapids', 'rock', 'splash', 'careful'],
          ['river_rock_large', 'river_rock_medium', 'water_foam']),
        S(5, 'Cầu treo', 'Lướt dưới cầu treo, khán giả cổ vũ.',
          ['Khán giả ném hoa xuống nước khi đội trả lời đúng.'],
          HOOK, 'Nitro cổ vũ.', ['bridge', 'cheer', 'crowd', 'faster'],
          ['river_bridge', 'river_birds', 'camp_bunting']),
        S(6, 'Cổng hoa về đích', 'Nước rút cuối, về đích dưới cổng hoa.',
          ['100 m cuối: mọi câu đúng là Nitro gấp đôi.', 'Trao Mái Chèo Vàng, MVP là người nhiều Nitro nhất.'],
          HOOK, 'Mái Chèo Vàng.', ['finish', 'win', 'champion', 'medal'],
          ['kayak_finish_arch', 'river_dock', 'anim_cheer']),
        S(7, 'Chặng phụ: Vòng danh dự', 'Kéo dài: chèo vòng danh dự quanh hồ.',
          ['Câu ôn nhanh.'], 'Sao đôi.', 'Sao đôi.', ['lap', 'honor'],
          ['kayak_boat'], optional=True),
        S(8, 'Chặng phụ: Phỏng vấn sau đua', 'Trả lời phỏng vấn tiếng Anh của cô Vân Anh.',
          ['Câu trả lời hay phát trên loa.'], 'Câu nói/viết, không tính thua.', 'Huy hiệu "Tay Chèo Sông Ngọc".', ['feel', 'happy', 'thanks'],
          ['river_sign'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 3, [
        C('Vân Anh', 'Bình luận viên giải đua, nói rất nhanh', 'adult', 'f', 'casual', 'yellow', 'Áo vàng, tai nghe', 'Bình luận viên', 'npc', 'instrument', ['headband']),
        C('Thầy Hùng', 'Trọng tài, thổi còi xuất phát', 'adult', 'm', 'life_jacket_sailing', 'red', 'Áo phao đỏ, mũ lưỡi trai', 'Trọng tài', 'npc', None, ['whistle', 'hat']),
        C('Đạt Nitro', 'Tay chèo nhanh nhất trại', 'teen', 'm', 'life_jacket_sailing', 'orange', 'Áo phao cam, mũ chong chóng', 'Đội trưởng Đội Cam', 'racers', None, ['hat']),
        C('Linh Lướt', 'Lách gỗ xoay cực khéo', 'teen', 'f', 'life_jacket_sailing', 'teal', 'Áo phao xanh ngọc, mũ phù thủy', 'Tay chèo Nitro', 'racers', None, ['hat']),
        C('Max', 'Bạn Đức, đọc biển báo lạch tắt', 'child', 'm', 'life_jacket_sailing', 'blue', 'Áo phao xanh, mũ bảo hộ vàng', 'Hoa tiêu', 'racers', None, ['hat', 'freckles']),
        C('Nhung', 'Luôn quay lại giúp bạn bị lật', 'child', 'f', 'life_jacket_sailing', 'pink', 'Áo phao hồng, mũ chú hề', 'Người cứu hộ', 'racers', None, ['hat']),
        C('Khôi Nguyên', 'Đội trưởng Đội Xanh, chiến thuật gia', 'teen', 'm', 'life_jacket_sailing', 'green', 'Áo phao xanh lá', 'Đội trưởng Đội Xanh', 'racers', None, ['watch']),
        C('Aria', 'Bạn Philippines, chèo đều như máy', 'child', 'f', 'life_jacket_sailing', 'purple', 'Áo phao tím', 'Tay chèo Nitro', 'racers', None, ['bracelet']),
        C('Bé Su', 'Nhỏ nhất giải, cổ vũ to nhất', 'child', 'f', 'life_jacket_sailing', 'yellow', 'Áo phao vàng', 'Tay chèo', 'racers', None, ['flower']),
        C('Bot Sóng Bạc', 'Kayak máy đối thủ, tốc độ theo bậc khó', 'adult', 'n', 'fantasy_scifi', 'silver', 'Kayak bạc có đèn xanh', 'Đối thủ máy', 'npc', None, ['cybernetic']),
        C('Bà Tư Hoa', 'Kết cổng hoa ở đích', 'elder', 'f', 'vn_traditional', 'red', 'Áo bà ba đỏ, giỏ hoa', 'Người trao hoa', 'npc', None, ['flower']),
        C('Cá Heo Sông Nhí', 'Nhảy lên khỏi nước khi có Siêu Nitro', 'child', 'n', 'casual', 'gray', 'Da xám hồng', 'Linh vật đường đua', 'npc', None, ['pet_or_toy']),
    ]),
))

sid = 'kayak-02'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=2,
    title='Vượt Ghềnh Thác Đá',
    inspiration='Đua lách chướng ngại; gói sông chung với ghềnh đá và thác.',
    setting='Sông núi dốc, nhiều ghềnh trắng xóa, vách đá rêu xanh, thác nhỏ ba bậc. Trời nắng, bụi nước tạo cầu vồng.',
    story=('Huấn luyện viên Mạnh chọn đội kayak giỏi nhất trại cho chặng đua "Ghềnh Thác Đá", đường đua khó nhất vùng. '
           'Ba bậc thác nhỏ, những khúc ghềnh xoáy và hang đá thấp đòi hỏi tay chèo phải phản xạ thật nhanh. '
           'Mỗi khúc ghềnh có cổng an toàn đánh dấu bằng phao, trả lời đúng mới mở được cổng. '
           'Giữa đường, một cây thông đổ chắn ngang sông, các đội phải hợp sức đẩy cây sang bên. '
           'Đội về đích đầy đủ và an toàn nhất sẽ nhận Huy hiệu Thác Đá.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Kiểm tra an toàn', 'Kiểm tra mũ, áo phao, mái chèo trước khi xuống ghềnh.',
          ['Mỗi món an toàn là một câu hỏi.'], HOOK, 'Bộ đồ an toàn đầy đủ.', ['helmet', 'safety', 'check', 'ready'],
          ['kayak_lifejacket', 'kayak_paddle', 'kayak_boat']),
        S(2, 'Ghềnh thứ nhất', 'Xuống ghềnh nhẹ đầu tiên.',
          ['Sóng đẩy kayak lên xuống.'], HOOK, 'Nitro.', ['wave', 'down', 'hold on'],
          ['water_foam', 'river_rock_medium']),
        S(3, 'Thác ba bậc', 'Trượt qua ba bậc thác nhỏ.',
          ['Mỗi bậc thác một câu 8 giây.'], HOOK, 'Siêu Nitro nếu đúng cả 3 bậc.', ['waterfall', 'drop', 'step', 'brave'],
          ['river_cliff', 'water_foam']),
        S(4, 'Cây thông đổ', 'Cả lớp hợp sức đẩy cây thông chắn sông.',
          ['Thanh sức đẩy chung: mọi câu đúng của lớp đều cộng.'], 'Câu hỏi trên thân cây; câu đúng đẩy cây đi một chút.', 'Mở đường cho cả lớp.', ['push', 'together', 'tree', 'block'],
          ['river_log_fallen', 'river_tree_pine']),
        S(5, 'Hang đá thấp', 'Cúi thấp lướt qua hang đá.',
          ['Đèn hang chỉ sáng khi trả lời đúng.'], HOOK, 'Đường tắt hang.', ['cave', 'low', 'duck', 'dark'],
          ['river_cave', 'camp_lantern']),
        S(6, 'Về đích Thác Đá', 'Khúc ghềnh cuối và vạch đích.',
          ['Huy hiệu cho đội an toàn nhất, MVP nhiều Nitro nhất.'], HOOK, 'Huy hiệu Thác Đá.', ['finish', 'safe', 'proud'],
          ['kayak_finish_arch', 'anim_cheer']),
        S(7, 'Chặng phụ: Xoáy nước', 'Kéo dài: thoát xoáy nước.', ['Câu nhanh.'], 'Sao đôi.', 'Sao đôi.', ['whirlpool', 'escape'],
          ['water_foam'], optional=True),
        S(8, 'Chặng phụ: Luật an toàn', 'Viết 3 luật an toàn khi chèo kayak.', ['Luật dán ở bến.'], 'Câu viết, không tính thua.', 'Huy hiệu "Tay Chèo An Toàn".', ['always', 'never', 'wear'],
          ['river_sign'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 6, [
        C('HLV Mạnh', 'Huấn luyện viên kayak, rất coi trọng an toàn', 'adult', 'm', 'life_jacket_sailing', 'red', 'Áo phao đỏ, mũ bảo hiểm', 'Huấn luyện viên', 'npc', None, ['whistle', 'watch']),
        C('Chị Hoa Cứu Hộ', 'Đứng trên đá đợi giúp kayak lật', 'adult', 'f', 'diving', 'orange', 'Đồ cứu hộ cam', 'Cứu hộ', 'npc', 'rope_climb', ['whistle']),
        C('Vĩnh', 'Không sợ thác', 'teen', 'm', 'life_jacket_sailing', 'blue', 'Áo phao xanh', 'Đội trưởng', 'racers', None, ['hat']),
        C('Thu Hà', 'Phản xạ nhanh nhất', 'teen', 'f', 'life_jacket_sailing', 'green', 'Áo phao xanh lá', 'Tay chèo Nitro', 'racers', None, ['headband']),
        C('Oliver', 'Bạn Canada, đọc dòng nước', 'teen', 'm', 'life_jacket_sailing', 'yellow', 'Áo phao vàng', 'Hoa tiêu', 'racers', None, ['freckles']),
        C('Mỹ Duyên', 'Luôn giúp bạn bị kẹt', 'child', 'f', 'life_jacket_sailing', 'pink', 'Áo phao hồng', 'Người cứu hộ nhí', 'racers', None, []),
        C('Lực', 'Khỏe nhất, đẩy cây thông', 'teen', 'm', 'life_jacket_sailing', 'olive', 'Áo phao ô liu', 'Tay chèo', 'racers', None, []),
        C('Sakura', 'Bạn Nhật, chèo êm như lá', 'child', 'f', 'life_jacket_sailing', 'white', 'Áo phao trắng hồng', 'Tay chèo', 'racers', None, ['flower']),
        C('Ken', 'Đội trưởng đối thủ, thân thiện', 'teen', 'm', 'life_jacket_sailing', 'navy', 'Áo phao navy', 'Đội trưởng đội bạn', 'racers', None, ['watch']),
        C('Bot Đá Xám', 'Kayak máy đối thủ', 'adult', 'n', 'fantasy_scifi', 'gray', 'Kayak xám', 'Đối thủ máy', 'npc', None, ['cybernetic']),
        C('Ông Đá', 'Người gác thác, kể chuyện sông', 'elder', 'm', 'regional_traditional', 'brown', 'Áo chàm, gậy tre', 'Người gác thác', 'npc', 'staff_cane', ['beard']),
        C('Rái Cá Ướt', 'Bơi trước dẫn đường an toàn', 'child', 'n', 'casual', 'brown', 'Lông nâu bóng', 'Linh vật', 'npc', None, ['pet_or_toy']),
    ]),
))

sid = 'kayak-03'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=3,
    title='Đua Hoàng Hôn Qua Hẻm Núi',
    inspiration='Gói sông chung, HDRI hoàng hôn; đua đội qua hẻm núi.',
    setting='Hẻm núi đá đỏ, sông hẹp uốn khúc, mặt trời lặn nhuộm cam vách đá. Chim bay về tổ, gió mát, bóng đổ dài.',
    story=('Cuộc đua đặc biệt chỉ diễn ra mỗi năm một lần: chèo qua Hẻm Núi Đỏ trước khi mặt trời lặn hẳn. '
           'Cô Ánh Dương đặt sáu đèn hiệu dọc hẻm núi, đội nào thắp đủ đèn khi qua sẽ được tính thời gian ưu tiên. '
           'Hẻm núi có tiếng vọng, và những câu hỏi được hỏi bằng tiếng vọng từ vách đá. '
           'Gần cuối, một đàn dơi bay ra làm tối cả lòng hẻm, các đội phải nhờ đèn hiệu để đi tiếp. '
           'Đội về đích đúng lúc mặt trời chạm núi sẽ được chụp ảnh với hoàng hôn rực rỡ.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Cửa hẻm núi', 'Xuất phát ở cửa hẻm, nhận đèn hiệu.', ['Đèn hiệu đầu tiên thắp bằng câu đúng.'], HOOK, 'Đèn hiệu 1.', ['canyon', 'sunset', 'light'],
          ['kayak_boat', 'river_cliff', 'hdri_sunset']),
        S(2, 'Tiếng vọng', 'Nghe câu hỏi vọng lại từ vách đá.', ['Câu nghe ngắn.'], 'Câu nghe hiểu; trả lời trước khi tiếng vọng tắt.', 'Nitro.', ['echo', 'listen', 'repeat'],
          ['river_cliff']),
        S(3, 'Khúc cua gắt', 'Ôm cua gắt giữa hẻm.', ['Câu hướng trái phải.'], HOOK, 'Nitro cua.', ['turn', 'sharp', 'left', 'right'],
          ['river_rock_large']),
        S(4, 'Đèn hiệu giữa hẻm', 'Thắp 3 đèn hiệu giữa hẻm.', ['Mỗi đèn một câu.'], 'Câu hỏi trên đèn hiệu.', 'Thời gian ưu tiên.', ['beacon', 'fire', 'three'],
          ['camp_lantern', 'fx_fire']),
        S(5, 'Đàn dơi', 'Đàn dơi làm tối lòng hẻm; đi theo ánh đèn hiệu.', ['Đèn đã thắp soi đường.'], HOOK, 'Qua bóng tối.', ['bat', 'dark', 'follow'],
          ['camp_lantern', 'river_birds']),
        S(6, 'Mặt trời chạm núi', 'Nước rút cuối về đích.', ['Ảnh hoàng hôn cho đội về đích.'], HOOK, 'Danh hiệu "Tay Chèo Hoàng Hôn".', ['finish', 'golden', 'photo'],
          ['kayak_finish_arch', 'hdri_sunset', 'anim_cheer']),
        S(7, 'Chặng phụ: Sao đầu tiên', 'Kéo dài: đua dưới ngôi sao đầu tiên.', ['Câu nhanh.'], 'Sao đôi.', 'Sao đôi.', ['first star', 'evening'],
          ['hdri_night'], optional=True),
        S(8, 'Chặng phụ: Tả hoàng hôn', 'Viết 2 câu tả hoàng hôn.', ['Câu hay in lên ảnh.'], 'Câu viết, không tính thua.', 'Huy hiệu "Hẻm Núi Đỏ".', ['orange', 'beautiful', 'sky'],
          ['hdri_sunset'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 9, [
        C('Cô Ánh Dương', 'Người đặt đèn hiệu dọc hẻm', 'adult', 'f', 'explorer', 'orange', 'Áo cam, khăn quàng đỏ', 'Người tổ chức', 'npc', 'flashlight', ['hat']),
        C('Chú Gió', 'Trọng tài, đứng trên mỏm đá', 'adult', 'm', 'explorer', 'khaki', 'Áo kaki, ống nhòm', 'Trọng tài', 'npc', None, ['whistle']),
        C('Hoàng Yến', 'Nghe tiếng vọng rất tinh', 'teen', 'f', 'life_jacket_sailing', 'yellow', 'Áo phao vàng', 'Đội trưởng', 'racers', None, []),
        C('Tùng Lâm', 'Ôm cua giỏi nhất', 'teen', 'm', 'life_jacket_sailing', 'red', 'Áo phao đỏ', 'Tay chèo Nitro', 'racers', None, ['headband']),
        C('Nora', 'Bạn Na Uy, thắp đèn hiệu nhanh', 'child', 'f', 'life_jacket_sailing', 'blue', 'Áo phao xanh', 'Người thắp đèn', 'racers', None, ['freckles']),
        C('Tấn', 'Không sợ dơi', 'child', 'm', 'life_jacket_sailing', 'black', 'Áo phao đen viền cam', 'Hoa tiêu', 'racers', 'flashlight', []),
        C('Uyên Thư', 'Chèo nhịp đều', 'teen', 'f', 'life_jacket_sailing', 'purple', 'Áo phao tím', 'Tay chèo', 'racers', None, ['bracelet']),
        C('Diego', 'Bạn Mexico, cổ vũ cả đội', 'child', 'm', 'life_jacket_sailing', 'green', 'Áo phao xanh lá', 'Tay chèo', 'racers', None, ['hat']),
        C('Ngọc Trâm', 'Chụp ảnh hoàng hôn', 'teen', 'f', 'life_jacket_sailing', 'pink', 'Áo phao hồng', 'Người ghi hình', 'racers', None, ['camera']),
        C('Bot Hoàng Hôn', 'Kayak máy đối thủ', 'adult', 'n', 'fantasy_scifi', 'orange', 'Kayak cam đèn đỏ', 'Đối thủ máy', 'npc', None, ['cybernetic']),
        C('Bà Hẻm', 'Bà cụ sống ở cửa hẻm, bán nước mía', 'elder', 'f', 'vn_traditional', 'green', 'Áo bà ba xanh', 'Người cổ vũ', 'npc', 'fan', ['hat']),
        C('Dơi Bé Tí', 'Một chú dơi nhỏ lạc đàn, bay theo kayak dẫn đầu', 'child', 'n', 'casual', 'purple', 'Cánh tím than', 'Linh vật', 'npc', None, ['pet_or_toy']),
    ]),
))

sid = 'kayak-04'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=4,
    title='Tiếp Sức Đội Kayak',
    inspiration='Đua đội (teams.ts); gói sông chung với nhiều trạm bến.',
    setting='Sông rộng chảy qua làng chài, bốn trạm bến tiếp sức dọc bờ, mỗi trạm treo cờ màu đội. Buổi sáng mát, nhiều người dân ra xem.',
    story=('Ngày hội làng chài có cuộc đua tiếp sức kayak: mỗi đội chia người chèo các chặng, trao mái chèo tại bến tiếp sức. '
           'Bác trưởng làng Sáu Hòa nói đội mạnh không phải đội có một người giỏi, mà là đội ai cũng góp sức. '
           'Mỗi lần trao mái chèo là một câu hỏi chung của đội, trả lời đúng thì người sau xuất phát với Nitro. '
           'Giữa cuộc đua, chợ nổi chắn ngang sông, các đội phải lách qua những chiếc ghe bán trái cây. '
           'Đội về đích được làng tặng giỏ trái cây và vòng hoa.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Chia chặng', 'Đội chia người cho từng chặng tiếp sức.', ['Mỗi người chọn chặng hợp sức mình.'], 'Câu hỏi chung của đội ở bến.', 'Đội hình.', ['team', 'relay', 'turn'],
          ['river_dock', 'camp_bunting', 'kayak_boat']),
        S(2, 'Chặng 1: Bến làng', 'Người thứ nhất xuất phát.', ['Trao mái chèo ở bến 2.'], HOOK, 'Nitro trao gậy.', ['pass', 'next', 'quick'],
          ['kayak_paddle', 'river_dock']),
        S(3, 'Chặng 2: Chợ nổi', 'Lách qua ghe chợ nổi.', ['Ghe trái cây di chuyển chậm.'], HOOK, 'Đường lách.', ['market', 'boat', 'fruit', 'avoid'],
          ['river_boat_row', 'food_apple']),
        S(4, 'Chặng 3: Cầu làng', 'Lướt dưới cầu làng, dân làng cổ vũ.', ['Câu đúng = tiếng trống cổ vũ, Nitro.'], HOOK, 'Nitro trống.', ['village', 'drum', 'cheer'],
          ['river_bridge']),
        S(5, 'Chặng 4: Đồng sen', 'Đi qua đồng sen, tránh lá sen lớn.', ['Lá sen làm chậm kayak.'], HOOK, 'Lạch sen.', ['lotus', 'leaf', 'pink'],
          ['river_lilypad', 'river_reed']),
        S(6, 'Về đích ngày hội', 'Người cuối về đích, cả đội ăn mừng.', ['Giỏ trái cây và vòng hoa.'], HOOK, 'Cúp Tiếp Sức.', ['together', 'finish', 'celebrate'],
          ['kayak_finish_arch', 'anim_cheer']),
        S(7, 'Chặng phụ: Chặng bù', 'Kéo dài: chặng thêm cho đội muốn gỡ.', ['Câu nhanh.'], 'Sao đôi.', 'Sao đôi.', ['extra', 'chance'],
          ['kayak_boat'], optional=True),
        S(8, 'Chặng phụ: Lời cảm ơn', 'Viết lời cảm ơn đồng đội.', ['Thẻ cảm ơn trao tay.'], 'Câu viết, không tính thua.', 'Huy hiệu "Đồng Đội Vàng".', ['thank you', 'helpful', 'friend'],
          ['river_sign'], optional=True),
    ],
    class_plan=plan({'note': 'Đội 4-5 người, mỗi người 1-2 chặng; ai chờ lượt thì trả lời câu "cổ vũ" để nạp Nitro cho người đang chèo.'}),
    characters=cast(sid, 1, [
        C('Bác Sáu Hòa', 'Trưởng làng, đánh trống khai hội', 'elder', 'm', 'vn_traditional', 'red', 'Áo dài khăn đóng đỏ', 'Trưởng làng', 'npc', 'instrument', ['beard']),
        C('Cô Bảy Chợ', 'Bán trái cây trên ghe chợ nổi', 'adult', 'f', 'vn_traditional', 'yellow', 'Áo bà ba vàng, nón lá', 'Người chợ nổi', 'npc', None, ['hat'], covered=True),
        C('Hải Đăng', 'Đội trưởng Đội Sóng', 'teen', 'm', 'life_jacket_sailing', 'blue', 'Áo phao xanh', 'Đội trưởng', 'racers', None, ['watch']),
        C('Tường Vi', 'Chạy chặng chợ nổi', 'teen', 'f', 'life_jacket_sailing', 'pink', 'Áo phao hồng', 'Tay chèo', 'racers', None, []),
        C('Sơn', 'Chạy chặng cầu làng', 'child', 'm', 'life_jacket_sailing', 'red', 'Áo phao đỏ', 'Tay chèo', 'racers', None, ['headband']),
        C('Hannah', 'Bạn Mỹ, chặng đồng sen', 'child', 'f', 'life_jacket_sailing', 'green', 'Áo phao xanh lá', 'Tay chèo', 'racers', None, ['freckles']),
        C('Thiện', 'Chạy chặng cuối', 'teen', 'm', 'life_jacket_sailing', 'orange', 'Áo phao cam', 'Tay chèo về đích', 'racers', None, []),
        C('Ji-woo', 'Bạn Hàn, giữ nhịp trống cổ vũ', 'child', 'f', 'casual', 'purple', 'Áo tím, trống nhỏ', 'Người cổ vũ', 'racers', 'instrument', ['instrument']),
        C('Lợi', 'Đội trưởng đội bạn, chơi đẹp', 'teen', 'm', 'life_jacket_sailing', 'yellow', 'Áo phao vàng', 'Đội trưởng đội bạn', 'racers', None, []),
        C('Bot Ghe Xanh', 'Kayak máy đối thủ', 'adult', 'n', 'fantasy_scifi', 'teal', 'Kayak xanh ngọc', 'Đối thủ máy', 'npc', None, ['cybernetic']),
        C('Chú Tư Cầu', 'Gác cầu làng', 'adult', 'm', 'casual', 'navy', 'Áo xanh navy', 'Người gác cầu', 'npc', None, ['whistle']),
        C('Trâu Đen', 'Đứng trên bờ, rống lên khi có đội vượt lên', 'child', 'n', 'casual', 'black', 'Da đen bóng, sừng cong', 'Linh vật làng', 'npc', None, ['pet_or_toy']),
    ]),
))

sid = 'kayak-05'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=5,
    title='Lễ Hội Đua Đèn Lồng Đêm',
    inspiration='Gói sông chung, HDRI đêm, đèn lồng; đua đêm lung linh.',
    setting='Sông đêm trong lễ hội đèn lồng: hàng nghìn đèn lồng thả trôi, pháo hoa trên trời, hai bờ đông người. Ánh đèn phản chiếu lung linh trên mặt nước.',
    story=('Đêm rằm tháng Tám, làng ven sông tổ chức Lễ Hội Đua Đèn Lồng: mỗi kayak gắn một đèn lồng ở mũi. '
           'Chị Hằng Nga trong vai nữ thần trăng đứng trên thuyền rồng làm trọng tài. '
           'Đèn lồng sáng hơn khi tay chèo trả lời đúng, và đèn tắt thì kayak chậm lại trong bóng tối. '
           'Giữa cuộc đua, đèn lồng trôi dày đặc thành "dòng sông ánh sáng", các đội phải lách khéo để không làm đổ đèn. '
           'Về đích, đội có đèn sáng nhất được thả đèn lồng ước nguyện đầu tiên lên trời.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Thắp đèn mũi kayak', 'Thắp đèn lồng gắn mũi kayak.', ['Đèn sáng theo câu đúng.'], 'Câu hỏi trên đèn lồng.', 'Đèn sáng.', ['lantern', 'festival', 'moon'],
          ['camp_lantern', 'kayak_boat', 'hdri_night']),
        S(2, 'Xuất phát dưới pháo hoa', 'Pháo hoa khai hội, xuất phát.', ['Mỗi chùm pháo hoa một câu.'], HOOK, 'Nitro pháo hoa.', ['fireworks', 'start', 'bright'],
          ['kayak_paddle', 'fx_spark']),
        S(3, 'Dòng sông ánh sáng', 'Lách qua đèn lồng trôi dày đặc.', ['Chạm đèn trôi: chậm 1 giây.'], HOOK, 'Không đổ đèn = sao thưởng.', ['float', 'gently', 'careful'],
          ['camp_lantern', 'water_normal']),
        S(4, 'Thuyền rồng', 'Vượt qua thuyền rồng của trọng tài.', ['Chị Hằng Nga đặt câu đố trăng.'], 'Câu đố trên thuyền rồng.', 'Nitro trăng.', ['dragon', 'boat', 'riddle'],
          ['river_boat_row']),
        S(5, 'Cầu đèn', 'Lướt dưới cây cầu treo đầy đèn.', ['Khán giả reo khi đúng.'], HOOK, 'Nitro cầu đèn.', ['bridge', 'lights', 'cheer'],
          ['river_bridge', 'camp_string_lights']),
        S(6, 'Thả đèn ước nguyện', 'Về đích, thả đèn ước nguyện.', ['Đèn của đội thắng bay lên đầu tiên.'], HOOK, 'Danh hiệu "Đèn Lồng Sáng Nhất".', ['wish', 'fly', 'happy'],
          ['kayak_finish_arch', 'camp_lantern', 'anim_cheer']),
        S(7, 'Chặng phụ: Vòng trăng', 'Kéo dài: chèo vòng dưới trăng.', ['Câu nhanh.'], 'Sao đôi.', 'Sao đôi.', ['round', 'full moon'],
          ['hdri_night'], optional=True),
        S(8, 'Chặng phụ: Điều ước', 'Viết điều ước tiếng Anh lên đèn.', ['Đèn thả trôi sông.'], 'Câu viết, không tính thua.', 'Huy hiệu "Đêm Hội Trăng".', ['I wish', 'family', 'future'],
          ['camp_lantern'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 7, [
        C('Chị Hằng Nga', 'Đóng vai nữ thần trăng, trọng tài lễ hội', 'adult', 'f', 'vn_traditional', 'white', 'Áo dài trắng, vương miện trăng', 'Trọng tài', 'npc', 'fan', ['necklace']),
        C('Chú Cuội', 'Kể chuyện cười dưới gốc đa giả', 'adult', 'm', 'vn_traditional', 'brown', 'Áo nâu, khăn rằn', 'Người dẫn chương trình', 'npc', 'staff_cane', ['hat']),
        C('Trúc Linh', 'Đèn lồng luôn sáng nhất', 'teen', 'f', 'life_jacket_sailing', 'red', 'Áo phao đỏ, đèn lồng cá chép', 'Đội trưởng', 'racers', None, []),
        C('Bảo Khang', 'Lách đèn trôi khéo', 'teen', 'm', 'life_jacket_sailing', 'yellow', 'Áo phao vàng, đèn ông sao', 'Tay chèo Nitro', 'racers', None, ['headband']),
        C('Lily', 'Bạn Singapore, giải câu đố trăng', 'child', 'f', 'life_jacket_sailing', 'purple', 'Áo phao tím, đèn thỏ', 'Hoa tiêu', 'racers', None, ['bracelet']),
        C('Nam', 'Chèo khỏe', 'child', 'm', 'life_jacket_sailing', 'blue', 'Áo phao xanh, đèn kéo quân', 'Tay chèo', 'racers', None, []),
        C('Thục Anh', 'Không bao giờ làm đổ đèn', 'teen', 'f', 'life_jacket_sailing', 'pink', 'Áo phao hồng, đèn hoa sen', 'Tay chèo', 'racers', None, ['flower']),
        C('Ethan', 'Bạn Mỹ, lần đầu thấy lễ hội', 'child', 'm', 'life_jacket_sailing', 'green', 'Áo phao xanh lá, đèn cá', 'Tay chèo', 'racers', None, ['freckles', 'camera']),
        C('Bot Trăng Bạc', 'Kayak máy đối thủ', 'adult', 'n', 'fantasy_scifi', 'silver', 'Kayak bạc đèn trắng', 'Đối thủ máy', 'npc', None, ['cybernetic']),
        C('Bà Rằm', 'Làm đèn lồng cho cả làng', 'elder', 'f', 'vn_traditional', 'maroon', 'Áo bà ba nâu đỏ', 'Thợ làm đèn', 'npc', None, ['glasses']),
        C('Ông Pháo', 'Bắn pháo hoa khai hội', 'elder', 'm', 'casual', 'navy', 'Áo khoác navy', 'Người bắn pháo hoa', 'npc', None, ['beard']),
        C('Thỏ Ngọc', 'Chạy trên bờ theo kayak dẫn đầu', 'child', 'n', 'casual', 'white', 'Lông trắng mắt hồng', 'Linh vật trăng', 'npc', None, ['pet_or_toy']),
    ]),
))
