from common import C, S, cast

GAME = 'river_survival'

# One rulebook shared by the 5 scenarios (server-authoritative; see plan tasks 45-47).
RULES = {
    'teams': 'Đội Chạy Trốn (vest xanh) và Đội Săn Tìm (vest cam). Tỉ lệ 60/40, làm tròn, ít nhất 1 người mỗi đội.',
    'match': 'Một trận liền mạch 30 phút, không chia hiệp. 2 chặng phụ chỉ mở khi gia sư bấm "Kéo dài".',
    'win': 'Hết giờ: nếu số Chạy Trốn còn tự do > số bị bắt thì Đội Chạy Trốn thắng; nếu Đội Săn Tìm bắt được hơn 50% thì Đội Săn Tìm thắng; hòa (đúng 50%) thì đội có tổng sao cao hơn thắng.',
    'stars': 'Mỗi nhiệm vụ cho 1-3 sao theo độ chính xác và tốc độ. Điểm = sao × 100 + điểm hành động (bắt, giải cứu, cướp lưới).',
    'mvp': 'MVP đội thắng (điểm cao nhất) nhận thêm 20% tổng điểm của toàn đội thua. Người điểm cao nhất đội thua nhận danh hiệu "Gương Mặt Quật Cường".',
    'capture': 'Đội Săn Tìm chạm Lưới Gắn Thẻ vào người Chạy Trốn = bắt. Người bị bắt về Chuồng Gỗ, không bị loại: tiếp tục giải mật thư hỗ trợ đội và có thể được giải cứu.',
    'snatch': 'Người Chạy Trốn lẻn sát sau lưng người Săn Tìm (2 m, không bị nhìn thấy) sẽ hiện nút "Cướp lưới": một câu hỏi 8 giây. Đúng: cướp được Lưới, người Săn Tìm mất lưới 45 giây. Sai: vị trí người Chạy Trốn hiện trên bản đồ đội Săn Tìm 5 giây.',
    'net_power': 'Lưới cướp được dùng 3 lần hoặc 60 giây: chạm người Săn Tìm làm họ đứng yên 10 giây (đuổi ngược), hoặc mở Chuồng Gỗ giải cứu 2 đồng đội. Hết lượt, lưới tự về trại Săn Tìm. Người Săn Tìm lấy lại lưới bằng cách chạm người đang cầm.',
    'pursuer_skills': 'Đội Săn Tìm cũng học: mỗi câu đúng nạp một kỹ năng: Quét dấu chân (hiện dấu trong bán kính 15 m, 8 giây), Ống nhòm (soi một bụi cây), Chạy nhanh (5 giây).',
    'escaper_skills': 'Đội Chạy Trốn: câu đúng nạp Xóa dấu (xóa dấu chân 10 giây), Ẩn nấp sâu (không bị Ống nhòm thấy 15 giây), Mồi nhử (tạo dấu chân giả).',
    'dodge': 'Khi bị chạm lưới, người Chạy Trốn có một câu "Né lưới" 6 giây, mỗi chặng dùng được 1 lần. Đúng thì thoát.',
    'safety': 'Không có cảnh đau, máu hay vũ khí thật. "Bị bắt" = bị gắn thẻ, nhân vật giơ tay cười. Dây thừng chỉ quấn cổng chuồng và ba lô, không trói người.',
    'no_idle': 'Không ai phải ngồi chờ: người bị bắt giải mật thư, người Săn Tìm trả lời để nạp kỹ năng.',
}


def plan(extra):
    base = {
        'sizes': {
            '1-5': 'Tất cả học sinh vào Đội Chạy Trốn; Đội Săn Tìm là 2-3 người máy chạy chậm do máy chủ điều khiển, độ khó theo mức của lớp.',
            '6-20': 'Chia 60/40 (ví dụ 12 Chạy Trốn, 8 Săn Tìm). Nhóm 3-4 người cùng màu dây đeo, mỗi nhóm một Đội trưởng.',
            '21-50': 'Chia 60/40 (50 em = 30 Chạy Trốn, 20 Săn Tìm). Tiểu đội 5 người; bản đồ mở rộng 3 khu, mỗi khu một Chuồng Gỗ để không dồn 50 người một chỗ.',
        },
        'roles': {
            'escapers': ['Đội trưởng (giữ bản đồ, chọn đường)', 'Trinh sát (dò bụi cây an toàn)', 'Thợ giải mã (mật thư)', 'Người tìm nước', 'Người xóa dấu'],
            'pursuers': ['Đội trưởng Săn Tìm (chia khu)', 'Người dò dấu chân', 'Người canh ống nhòm', 'Người chạy nhanh', 'Người giữ Chuồng Gỗ'],
        },
        'avatars': '12 nhân vật dưới đây là người dẫn chuyện và vai mẫu trong đoạn phim. Mỗi học sinh có nhân vật riêng ghép từ hồ sơ diện mạo (không trùng trong lớp) và mặc vest màu đội.',
        'rules': RULES,
    }
    base.update(extra)
    return base


HOOK_TASK = 'Bảng Nhiệm vụ góc trái: mỗi câu đúng hiện một chữ cái của mật mã nhiệm vụ; đủ chữ thì nhiệm vụ xong (1-3 sao).'

SCENARIOS = []

# ---------------------------------------------------------------- 1
sid = 'surv-01'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=1,
    title='Thoát khỏi Trại Cờ Cam',
    inspiration='File "Thay game mới" mục II.3 (cảnh mở đầu cọc gỗ, Task Panel, 2 đội) + video bờ sông đá sỏi, rừng thông, nhà gỗ cũ trong cỏ cao.',
    setting='Bờ sông đá sỏi lúc chiều tà, rừng thông phía sau, một nhà gỗ cũ giữa bãi cỏ cao. Trại của Đội Săn Tìm cắm cờ cam ở đầu bãi. Trời chuyển từ vàng cam sang tím, sương bắt đầu lên mặt nước.',
    story=('Trò chơi trận giả cuối khóa của Trại Hè Sông Ngọc bắt đầu bằng một bất ngờ: Đội Săn Tìm phục kích từ trưa, dồn cả nhóm bạn vào Chuồng Gỗ và quấn dây thừng chặt quanh cổng. '
           'Minh Khôi phát hiện một tảng đá sắc cạnh hàng rào, cả nhóm thay nhau mài dây và bung cổng thoát ra. '
           'Từ đây phải sống sót đến khi trống trại vang lúc hoàng hôn: tìm nước sạch, nhặt đá và gậy dựng bẫy phòng thủ, giải mật thư của bác Kiểm lâm Sáu để tìm hang trú an toàn, và xóa dấu chân trên cát. '
           'Đội Săn Tìm của Hạ Vy có bản đồ quét dấu vết và quyết bắt hơn một nửa số người. '
           'Nhưng giữa trận, trại cờ cam để quên một thùng Lưới Gắn Thẻ dự phòng; ai lẻn đến được sẽ lật ngược thế cờ, đuổi ngược Đội Săn Tìm và giải cứu đồng đội.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Chuồng Gỗ và sợi dây thừng', 'Mở màn: thoát khỏi Chuồng Gỗ; Đội Săn Tìm nhận bản đồ và chia khu.',
          ['Phim ngắn 20 giây: cổng chuồng quấn dây, Minh Khôi nhìn thấy đá sắc.', 'Mỗi câu đúng là một nhát mài dây; thanh dây đứt dần, cổng bung khi cả nhóm đủ 5 câu.', 'Đội Săn Tìm đứng ở trại cờ cam, đếm ngược 60 giây rồi mới được xuất phát.'],
          'Câu hỏi hiện ngay trên sợi dây thừng; đúng thì dây sờn thêm một đoạn, sai thì dây chỉ rung nhẹ.',
          'Mở khóa đôi giày chạy và bản đồ nhỏ.', ['rope', 'rock', 'escape', 'cut', 'run'],
          ['surv_holding_pen', 'surv_rope', 'surv_rope_cut', 'surv_sharp_rock', 'surv_stake', 'surv_rival_tent', 'surv_flag', 'anim_rope_rub']),
        S(2, 'Nhiệm vụ 1: Nước sạch bên suối', 'Tìm dòng suối trong, lọc nước vào bình trước khi Đội Săn Tìm khép vòng.',
          ['Ba con suối: một đục bùn, một có lá mục, một trong vắt sau khe đá.', 'Đội Săn Tìm mở kỹ năng Quét dấu chân lần đầu.', 'Người Chạy Trốn bị bắt được đưa về Chuồng Gỗ, bắt đầu giải mật thư hỗ trợ.'],
          HOOK_TASK + ' Chọn đúng con suối cũng là một câu trắc nghiệm.',
          '1-3 sao; nhận Bình nước (hồi sức chạy).', ['water', 'stream', 'clean', 'dirty', 'bottle'],
          ['surv_spring', 'surv_stone_basin', 'camp_bottle', 'river_rock_medium', 'river_fern', 'river_moss_rock']),
        S(3, 'Nhiệm vụ 2: Đá nhọn và gậy gỗ', 'Gom 3 gậy và 3 đá nhọn để dựng bẫy dây vấp và hàng rào cành quanh hang trú.',
          ['Bẫy chỉ làm người Săn Tìm vấp ngã ngồi, cười và mất 5 giây.', 'Đội Săn Tìm nhận Ống nhòm, soi được một bụi cây mỗi lần.', 'Bác Sáu thả mật thư đầu tiên trên cành thông.'],
          HOOK_TASK + ' Mỗi câu đúng = nhặt được một món; món hiện viền sáng trong cỏ.',
          'Mở khóa Bẫy dây vấp (đặt được 1 cái/người).', ['stick', 'stone', 'sharp', 'trap', 'build'],
          ['surv_stick', 'surv_pointed_stone', 'surv_tripwire', 'surv_trap_rope', 'river_branch', 'river_rock_small']),
        S(4, 'Nhiệm vụ 3: Mật thư của bác Kiểm lâm', 'Giải mật thư tiếng Anh để biết lối vào Hang Rêu, nơi an toàn nhất bờ sông.',
          ['Mật thư là một đoạn chỉ đường bị xáo chữ.', 'Người ở Chuồng Gỗ giải cùng: mỗi câu họ đúng gửi một chữ cho đội.', 'Đội Săn Tìm đoán được hướng nếu đội Chạy Trốn trả lời sai nhiều.'],
          'Mật thư hiện như tờ giấy cũ; mỗi câu đúng làm hiện một chữ cái bị mờ. Câu dạng sắp xếp từ và điền từ rất hợp ở chặng này.',
          'Mở đường tắt vào Hang Rêu (ẩn nấp sâu 30 giây).', ['north', 'left', 'behind', 'cave', 'across'],
          ['surv_letter', 'surv_map', 'surv_compass', 'river_cave', 'river_moss_rock', 'river_cliff']),
        S(5, 'Nhiệm vụ 4: Xóa dấu và thùng lưới bỏ quên', 'Xóa dấu chân trên cát và bùn; lẻn đến thùng Lưới Gắn Thẻ dự phòng ở trại cờ cam.',
          ['Dấu chân mỗi người để lại mờ dần sau 40 giây; chổi cành xóa ngay.', 'Thùng lưới mở sau 3 câu đúng liên tiếp của cùng một tiểu đội.', 'Lưới cướp được: đuổi ngược (người Săn Tìm đứng yên 10 giây) hoặc mở Chuồng Gỗ cứu 2 bạn.'],
          'Chổi quét dấu: mỗi câu đúng xóa một vệt dấu chân. Nút "Cướp lưới" hiện khi lẻn sát sau lưng người Săn Tìm: một câu 8 giây.',
          'Lưới Gắn Thẻ (3 lần dùng hoặc 60 giây).', ['footprint', 'sand', 'mud', 'sweep', 'hide'],
          ['surv_broom', 'decal_footprint_sand', 'decal_footprint_mud', 'surv_crate', 'surv_capture_net', 'surv_barrel']),
        S(6, 'Trống trại lúc hoàng hôn', 'Phút cuối: giải cứu, đuổi ngược, giữ người. Hết giờ đếm đầu người.',
          ['Mặt trời lặn, đèn pin bật; bụi cây tối hơn nên dễ trốn hơn.', '60 giây cuối: mọi Chuồng Gỗ mở thêm một lượt giải cứu nếu đội trả lời đúng 5 câu liền.', 'Trống vang, màn hình đếm người tự do và người bị bắt, công bố MVP và "Gương Mặt Quật Cường".'],
          'Câu hỏi nhanh 10 giây hiện trên Chuồng Gỗ (giải cứu) và trên đèn pin (Săn Tìm soi khu).',
          'MVP đội thắng nhận thêm 20% tổng điểm đội thua.', ['free', 'caught', 'team', 'win', 'brave'],
          ['surv_holding_pen', 'surv_flashlight', 'hdri_sunset', 'river_birds', 'anim_cheer', 'anim_sad']),
        S(7, 'Chặng phụ: Đêm sương trên sông', 'Khi gia sư kéo dài: sương dày, tầm nhìn 10 m; một vòng giải cứu cuối.',
          ['Đội Săn Tìm mất Quét dấu chân, chỉ còn đèn pin.', 'Người Chạy Trốn bị bắt có thể tự giải cứu bằng 3 câu khó.'],
          'Câu khó hơn một bậc, thưởng gấp đôi sao.', 'Sao đôi.', ['fog', 'quiet', 'careful'],
          ['hdri_night', 'surv_flashlight', 'water_normal'], optional=True),
        S(8, 'Chặng phụ: Lửa trại tổng kết', 'Ôn lại 10 từ của trận quanh lửa trại; mỗi bạn chọn một từ và đặt câu.',
          ['Bác Sáu khen từng tiểu đội.', 'Ảnh kỷ niệm cả lớp với nhân vật của mình.'],
          'Câu ôn tập không tính thua, chỉ cộng sao.', 'Huy hiệu "Thoát khỏi Trại Cờ Cam".', ['camp', 'fire', 'friend', 'remember'],
          ['camp_firepit', 'camp_lantern', 'anim_wave'], optional=True),
    ],
    class_plan=plan({'map_zones': ['Bãi sỏi', 'Rừng thông', 'Nhà gỗ cỏ cao']}),
    characters=cast(sid, 0, [
        C('Bác Sáu', 'Kiểm lâm già, làm trọng tài, giấu mật thư trên cành thông', 'elder', 'm', 'explorer', 'khaki', 'Áo kiểm lâm kaki, mũ rộng vành, khăn quàng xanh', 'Trọng tài trận giả, người viết mật thư', 'npc', 'staff_cane', ['hat', 'whistle', 'map_or_notebook']),
        C('Minh Khôi', 'Bình tĩnh, nhìn thấy đá sắc đầu tiên', 'child', 'm', 'explorer', 'blue', 'Áo thun xanh, quần lửng, ba lô nhỏ', 'Đội trưởng Chạy Trốn', 'escapers', 'rolled_paper', ['bag', 'watch']),
        C('An Nhiên', 'Tai rất thính, nghe tiếng bước chân từ xa', 'child', 'f', 'casual', 'teal', 'Áo khoác gió xanh ngọc, quần dài', 'Trinh sát', 'escapers', None, ['headband']),
        C('Tú Linh', 'Mê giải đố, luôn cầm sổ ghi chép', 'teen', 'f', 'casual', 'yellow', 'Áo hoodie vàng, kính tròn', 'Thợ giải mã', 'escapers', None, ['glasses', 'map_or_notebook']),
        C('Bảo Nam', 'Khỏe, mang bình nước to cho cả đội', 'teen', 'm', 'explorer', 'olive', 'Áo ô liu nhiều túi, quần kaki', 'Người tìm nước', 'escapers', None, ['bag']),
        C('Sophie', 'Bạn trao đổi từ Pháp, nhanh tay xóa dấu chân', 'child', 'f', 'casual', 'pink', 'Áo thun hồng, quần short jeans', 'Người xóa dấu', 'escapers', 'broom_brush', ['freckles', 'bracelet']),
        C('Hạ Vy', 'Chiến thuật gia, vẽ bản đồ rất nhanh', 'teen', 'f', 'explorer', 'orange', 'Vest cam, áo trắng, mũ lưỡi trai', 'Đội trưởng Săn Tìm', 'pursuers', 'rolled_paper', ['hat', 'watch']),
        C('Đức Huy', 'Nhìn dấu chân là biết ai đi qua', 'teen', 'm', 'explorer', 'orange', 'Vest cam, áo dài tay nâu', 'Người dò dấu chân', 'pursuers', 'detector_scanner', []),
        C('Kenji', 'Kiên nhẫn ngồi canh ống nhòm hàng giờ', 'child', 'm', 'casual', 'orange', 'Vest cam, áo thun xám', 'Người canh ống nhòm', 'pursuers', None, ['glasses']),
        C('Thảo My', 'Chạy nhanh nhất trại', 'child', 'f', 'football', 'orange', 'Áo thể thao cam, giày chạy', 'Người chạy nhanh', 'pursuers', None, ['headband']),
        C('Amara', 'Vui tính, giữ Chuồng Gỗ và hay kể chuyện cười', 'teen', 'f', 'casual', 'orange', 'Vest cam, áo hoa', 'Người giữ Chuồng Gỗ', 'pursuers', 'swatter_net', ['earring'], hair=('afro', 'shoulder')),
        C('Cún Mực', 'Chú chó của trại, chạy theo ai trả lời đúng', 'child', 'n', 'casual', 'black', 'Vòng cổ đỏ có chuông', 'Linh vật, chỉ đường bằng cách vẫy đuôi', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 2
sid = 'surv-02'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=2,
    title='Bí mật Thác Ba Tầng',
    inspiration='Rừng sông hẻo lánh trong file + ý tưởng hang sau thác; nước trong nhìn thấy đá đáy như video.',
    setting='Hẻm núi có thác nước ba tầng, bụi nước mờ như sương, vách đá phủ rêu, cầu gỗ treo bắc qua tầng giữa. Buổi chiều nắng xiên qua bụi nước tạo cầu vồng.',
    story=('Đội Săn Tìm năm nay chọn đúng thác Ba Tầng làm sân đấu và nhốt nhóm bạn trong chuồng gỗ dưới chân thác. '
           'Tiếng nước ầm ầm che tiếng mài dây, nên Mai Anh cắt được dây và mở cổng mà không ai nghe thấy. '
           'Truyền thuyết của trại kể rằng sau tầng thác giữa có một hang khô, chỉ ai đọc được ba tấm bia khắc chữ tiếng Anh mới tìm ra lối vào. '
           'Cả đội phải tìm nước suối trong, gom đá và gậy dựng chốt chặn ở cầu treo, giải bia đá, rồi xóa dấu chân ướt trên đá trơn. '
           'Ở tầng cao nhất, Đội Săn Tìm cất kho Lưới Gắn Thẻ trong một thùng gỗ cạnh cầu vồng: ai lấy được sẽ lật ngược trận đấu.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Dưới chân thác', 'Mài dây mở chuồng gỗ dưới tiếng thác; Đội Săn Tìm leo lên tầng giữa đặt chốt.',
          ['Tiếng thác làm mờ âm thanh: Đội Săn Tìm không nghe được bước chạy trong 60 giây đầu.', 'Cổng bung khi đủ số câu đúng của cả nhóm.'],
          'Câu hỏi hiện trên sợi dây ướt; mỗi câu đúng là một nhát mài.', 'Mở khóa giày bám đá.', ['waterfall', 'loud', 'wet', 'climb'],
          ['surv_holding_pen', 'surv_rope', 'surv_sharp_rock', 'river_cliff', 'river_moss_rock', 'water_foam']),
        S(2, 'Nhiệm vụ 1: Giọt nước trong', 'Hứng nước từ khe đá sạch, tránh vũng nước đọng có bọ gậy.',
          ['Ba khe đá, chỉ một khe nước chảy liên tục.', 'Đội Săn Tìm dùng Quét dấu chân trên đá ướt (dấu ướt hiện rõ hơn).'],
          HOOK_TASK, 'Bình nước + 1 lần Ẩn nấp sâu.', ['drop', 'fresh', 'pond', 'insect'],
          ['surv_spring', 'surv_stone_basin', 'camp_bottle', 'river_rock_large']),
        S(3, 'Nhiệm vụ 2: Chốt chặn cầu treo', 'Gom gậy và đá nhọn dựng hàng rào cành ở đầu cầu treo, làm chậm Đội Săn Tìm.',
          ['Hàng rào làm người Săn Tìm phải đi vòng 8 giây.', 'Cầu treo lắc khi có hơn 4 người đứng trên.'],
          HOOK_TASK + ' Mỗi câu đúng gắn thêm một cành vào hàng rào.', 'Hàng rào cành (1 cái/tiểu đội).', ['bridge', 'fence', 'slow', 'branch'],
          ['river_bridge', 'surv_stick', 'surv_pointed_stone', 'river_branch', 'river_fence']),
        S(4, 'Nhiệm vụ 3: Ba tấm bia đá', 'Đọc ba tấm bia để ghép ra lối vào hang sau thác.',
          ['Mỗi bia một câu chỉ đường bị mất chữ.', 'Người ở chuồng gỗ đọc bia qua ống nhòm và gửi chữ cho đội.'],
          'Bia đá phủ rêu; mỗi câu đúng làm rêu tan bớt, lộ một chữ. Hợp với câu điền từ (cloze).', 'Lối vào hang sau thác.', ['stone', 'behind', 'through', 'secret'],
          ['surv_letter', 'river_cave', 'river_cliff', 'river_moss_rock']),
        S(5, 'Nhiệm vụ 4: Dấu chân ướt và thùng lưới cầu vồng', 'Xóa dấu chân ướt trên đá; lẻn lên tầng cao lấy Lưới Gắn Thẻ.',
          ['Dấu chân ướt khô dần sau 30 giây dưới nắng.', 'Thùng lưới cạnh cầu vồng, được Kenzo canh giữ.'],
          'Chổi cành xóa dấu theo câu đúng; nút "Cướp lưới" khi lẻn sau lưng người Săn Tìm.', 'Lưới Gắn Thẻ.', ['rainbow', 'dry', 'sneak', 'top'],
          ['surv_broom', 'decal_footprint_mud', 'surv_crate', 'surv_capture_net']),
        S(6, 'Cầu vồng tắt', 'Nắng tắt, cầu vồng biến mất: phút cuối giải cứu và đếm người.',
          ['Bụi nước dày lên, che bớt tầm nhìn.', 'Công bố kết quả, MVP và Gương Mặt Quật Cường.'],
          'Câu 10 giây trên chuồng gỗ và trên ống nhòm.', 'MVP +20% điểm đội thua.', ['last', 'rescue', 'count', 'winner'],
          ['surv_holding_pen', 'surv_binoculars', 'hdri_sunset', 'anim_cheer']),
        S(7, 'Chặng phụ: Hang sau thác', 'Kéo dài: cả hai đội vào hang tối, chỉ có đèn pin.',
          ['Ai đứng yên trong bóng tối 5 giây thì Ống nhòm không thấy.'], 'Câu khó, sao đôi.', 'Sao đôi.', ['dark', 'echo', 'torch'],
          ['river_cave', 'surv_flashlight'], optional=True),
        S(8, 'Chặng phụ: Kể chuyện bên thác', 'Mỗi tiểu đội kể lại đường thoát của mình bằng 3 câu tiếng Anh.',
          ['Bình chọn câu chuyện hay nhất.'], 'Câu sắp xếp câu kể, không tính thua.', 'Huy hiệu "Người giữ bí mật Thác Ba Tầng".', ['story', 'first', 'then', 'finally'],
          ['camp_firepit', 'anim_wave'], optional=True),
    ],
    class_plan=plan({'map_zones': ['Chân thác', 'Cầu treo tầng giữa', 'Đỉnh thác cầu vồng']}),
    characters=cast(sid, 3, [
        C('Cô Hằng', 'Huấn luyện viên leo núi, trọng tài trận', 'adult', 'f', 'explorer', 'green', 'Áo leo núi xanh lá, dây đai, mũ bảo hiểm', 'Trọng tài, giữ an toàn cầu treo', 'npc', 'rope_climb', ['whistle', 'watch']),
        C('Mai Anh', 'Kiên trì, mài dây không bỏ cuộc', 'child', 'f', 'explorer', 'blue', 'Áo mưa mỏng xanh, ủng cao su', 'Đội trưởng Chạy Trốn', 'escapers', None, ['bag']),
        C('Phúc', 'Leo trèo giỏi, thích đá rêu', 'child', 'm', 'casual', 'green', 'Áo thun xanh lá, quần lửng', 'Trinh sát', 'escapers', None, ['headband']),
        C('Lucas', 'Bạn Úc, thuộc bản đồ hẻm núi', 'teen', 'm', 'explorer', 'navy', 'Áo khoác xanh navy, mũ lưỡi trai', 'Thợ giải mã', 'escapers', 'rolled_paper', ['map_or_notebook', 'freckles']),
        C('Ngọc Hân', 'Biết khe đá nào nước sạch', 'teen', 'f', 'casual', 'white', 'Áo trắng, gile kaki', 'Người tìm nước', 'escapers', None, ['flower']),
        C('Tí Xíu', 'Nhỏ nhất đội, trốn trong khe đá cực giỏi', 'child', 'm', 'casual', 'yellow', 'Áo vàng chanh, mũ tai bèo', 'Người xóa dấu', 'escapers', 'broom_brush', ['hat'], hair=('buzz', 'buzz')),
        C('Kenzo', 'Lạnh lùng, canh thùng lưới cầu vồng', 'teen', 'm', 'explorer', 'orange', 'Vest cam, áo đen dài tay', 'Đội trưởng Săn Tìm', 'pursuers', None, ['watch']),
        C('Lan Chi', 'Đọc dấu chân ướt rất nhanh', 'teen', 'f', 'explorer', 'orange', 'Vest cam, quần leo núi', 'Người dò dấu chân', 'pursuers', 'detector_scanner', ['headband']),
        C('Hoàng', 'Đứng trên cầu treo soi ống nhòm', 'child', 'm', 'casual', 'orange', 'Vest cam, áo xám', 'Người canh ống nhòm', 'pursuers', None, ['glasses']),
        C('Priya', 'Bạn Ấn Độ, chạy trên đá trơn không ngã', 'child', 'f', 'football', 'orange', 'Áo thể thao cam', 'Người chạy nhanh', 'pursuers', None, ['bracelet'], hair=('braid', 'long')),
        C('Đạt', 'Hiền lành, giữ chuồng gỗ dưới thác', 'teen', 'm', 'casual', 'orange', 'Vest cam, áo kẻ caro', 'Người giữ Chuồng Gỗ', 'pursuers', 'swatter_net', []),
        C('Rái Cá Bông', 'Rái cá sống dưới thác, ngoi lên khi đội trả lời đúng 3 câu liền', 'child', 'n', 'casual', 'brown', 'Bộ lông nâu óng', 'Linh vật, chỉ khe nước sạch', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 3
sid = 'surv-03'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=3,
    title='Đêm Đom Đóm Rừng Thông',
    inspiration='Video rừng thông và lều phát sáng ban đêm; file: lẩn trốn bụi cây, đội truy đuổi dùng bản đồ quét.',
    setting='Rừng thông ven sông vào ban đêm, trăng lưỡi liềm, hàng nghìn đom đóm bay trên bãi cỏ. Đèn lồng giấy treo dọc lối mòn; mặt sông lấp lánh ánh trăng.',
    story=('Đêm cuối trại, bác Ba bảo vệ tổ chức trận "Đom Đóm": Đội Săn Tìm cầm đèn pin, Đội Chạy Trốn chỉ có ánh sáng đom đóm. '
           'Mở màn, cả nhóm bị dồn vào chuồng gỗ ở bãi đèn lồng; Gia Bảo mài dây trên một hòn đá sắc dưới ánh trăng và cả nhóm thoát vào rừng. '
           'Đom đóm bay theo người trả lời đúng, vừa soi đường vừa dễ làm lộ chỗ trốn, nên mỗi bước phải tính toán. '
           'Muốn sống sót đến khi tiếng chuông 12 giờ vang, đội phải lấy nước ở suối trăng, làm bẫy dây, giải mật thư viết bằng mực phát sáng và xóa dấu chân trên lá kim. '
           'Đội Săn Tìm cất Lưới Gắn Thẻ dự phòng trong túi treo trên cây thông cổ thụ: ai leo tới được sẽ đổi vai, đuổi ngược đội cầm đèn.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Bãi đèn lồng', 'Thoát chuồng gỗ dưới trăng; Đội Săn Tìm bật đèn pin, chia khu rừng.',
          ['Đèn lồng giấy đung đưa, bóng cây đổ dài.', 'Mỗi câu đúng: một nhát mài dây; đom đóm bay quanh người đúng.'],
          'Câu hỏi hiện trên sợi dây dưới ánh trăng.', 'Mở khóa Đom đóm dẫn đường.', ['night', 'moon', 'lantern', 'firefly'],
          ['surv_holding_pen', 'surv_rope', 'surv_sharp_rock', 'camp_lantern', 'camp_string_lights', 'hdri_night']),
        S(2, 'Nhiệm vụ 1: Suối trăng', 'Tìm khúc suối có trăng soi đáy (nước trong), lấy nước trước khi đèn pin quét tới.',
          ['Nước đục không phản chiếu trăng.', 'Đội Săn Tìm: mỗi câu đúng làm đèn pin sáng xa thêm 3 m.'],
          HOOK_TASK, 'Bình nước.', ['reflect', 'clear', 'shine', 'bright'],
          ['surv_spring', 'camp_bottle', 'water_normal', 'river_reed']),
        S(3, 'Nhiệm vụ 2: Bẫy dây trong bóng tối', 'Gom gậy và đá dựng bẫy dây vấp quanh lối mòn.',
          ['Bẫy chạm vào thì kêu lục lạc và làm người Săn Tìm ngồi bệt 5 giây.', 'Đom đóm né khu có bẫy, nên phải nhớ vị trí.'],
          HOOK_TASK, 'Bẫy dây lục lạc.', ['bell', 'path', 'step', 'careful'],
          ['surv_stick', 'surv_pointed_stone', 'surv_tripwire', 'river_branch', 'river_tree_pine']),
        S(4, 'Nhiệm vụ 3: Mật thư mực phát sáng', 'Đọc mật thư chỉ hiện chữ khi có đom đóm bay qua.',
          ['Mỗi câu đúng gọi một đàn đom đóm tới làm sáng một dòng.', 'Người ở chuồng gỗ đọc tiếp những dòng còn mờ.'],
          'Mật thư mực phát sáng: câu đúng làm từng chữ sáng lên; hợp câu sắp xếp và điền từ.', 'Vị trí cây thông cổ thụ.', ['glow', 'old', 'tree', 'tall'],
          ['surv_letter', 'surv_compass', 'river_tree_pine', 'river_butterfly']),
        S(5, 'Nhiệm vụ 4: Lá kim và túi lưới trên cây', 'Xóa dấu chân trên lá kim; leo cây thông cổ thụ lấy Lưới Gắn Thẻ.',
          ['Dấu trên lá kim mờ nhanh nhưng phát tiếng sột soạt.', 'Leo cây cần 3 câu đúng liên tiếp.'],
          'Chổi lá thông xóa dấu theo câu đúng; nút "Cướp lưới" sau lưng người Săn Tìm.', 'Lưới Gắn Thẻ.', ['leaf', 'needle', 'climb', 'quiet'],
          ['surv_broom', 'decal_footprint_mud', 'surv_capture_net', 'river_tree_pine']),
        S(6, 'Chuông 12 giờ', 'Phút cuối đếm người dưới tiếng chuông.',
          ['Đom đóm tụ lại thành chữ tên đội thắng trên bầu trời.', 'MVP và Gương Mặt Quật Cường.'],
          'Câu 10 giây trên chuồng gỗ và đèn pin.', 'MVP +20% điểm đội thua.', ['midnight', 'bell', 'stars'],
          ['surv_holding_pen', 'surv_flashlight', 'hdri_night', 'anim_cheer']),
        S(7, 'Chặng phụ: Mưa sao băng', 'Kéo dài: mưa sao băng làm sáng rừng 5 phút, cả hai đội cùng lộ.',
          ['Mỗi sao băng = một câu thưởng.'], 'Câu khó, sao đôi.', 'Sao đôi.', ['wish', 'sky', 'shooting star'],
          ['hdri_night'], optional=True),
        S(8, 'Chặng phụ: Lời chúc dưới trăng', 'Viết lời chúc tiếng Anh cho bạn cùng đội.',
          ['Lời chúc hiện trên đèn lồng thả trôi sông.'], 'Câu viết ngắn chấm theo tiêu chí, không tính thua.', 'Huy hiệu "Đom Đóm Dũng Cảm".', ['hope', 'wish', 'kind'],
          ['camp_lantern', 'water_normal'], optional=True),
    ],
    class_plan=plan({'map_zones': ['Bãi đèn lồng', 'Suối trăng', 'Cây thông cổ thụ']}),
    characters=cast(sid, 6, [
        C('Bác Ba', 'Bảo vệ trại, đánh chuông 12 giờ', 'elder', 'm', 'casual', 'navy', 'Áo khoác xanh navy, đèn pin đeo đầu', 'Trọng tài đêm', 'npc', 'flashlight', ['whistle', 'watch']),
        C('Gia Bảo', 'Mắt tinh trong bóng tối', 'child', 'm', 'casual', 'navy', 'Áo khoác mỏng xanh đậm', 'Đội trưởng Chạy Trốn', 'escapers', None, ['bag']),
        C('Diệp', 'Đếm được đom đóm, nhớ đường rất giỏi', 'child', 'f', 'casual', 'purple', 'Áo tím than, quần dài', 'Trinh sát', 'escapers', None, ['bracelet']),
        C('Olivia', 'Bạn Anh, đọc mực phát sáng nhanh nhất', 'teen', 'f', 'casual', 'gray', 'Áo len xám, khăn quàng', 'Thợ giải mã', 'escapers', None, ['glasses', 'freckles']),
        C('Quang Vinh', 'Mang bình giữ nhiệt to', 'teen', 'm', 'explorer', 'brown', 'Áo nâu dài tay, mũ len', 'Người tìm nước', 'escapers', None, ['hat']),
        C('Bông', 'Nhẹ nhàng, đi trên lá kim không tiếng động', 'child', 'f', 'vn_traditional', 'green', 'Áo bà ba xanh lá', 'Người xóa dấu', 'escapers', 'broom_brush', ['flower']),
        C('Trung Kiên', 'Chỉ huy đội đèn pin', 'teen', 'm', 'explorer', 'orange', 'Vest cam phản quang, áo đen', 'Đội trưởng Săn Tìm', 'pursuers', 'flashlight', ['watch']),
        C('Yến Nhi', 'Nghe tiếng lá sột soạt là đoán được hướng', 'teen', 'f', 'explorer', 'orange', 'Vest cam, áo khoác', 'Người dò dấu chân', 'pursuers', 'detector_scanner', []),
        C('Mateo', 'Bạn Tây Ban Nha, soi ống nhòm hồng ngoại', 'child', 'm', 'casual', 'orange', 'Vest cam, mũ len đỏ', 'Người canh ống nhòm', 'pursuers', None, ['hat']),
        C('Khánh Linh', 'Chạy nhanh, đèn pin buộc trán', 'child', 'f', 'football', 'orange', 'Áo thể thao cam', 'Người chạy nhanh', 'pursuers', 'flashlight', ['headband']),
        C('Tuấn Tú', 'Giữ chuồng gỗ, hay hát nhỏ', 'teen', 'm', 'casual', 'orange', 'Vest cam, áo len nâu', 'Người giữ Chuồng Gỗ', 'pursuers', 'swatter_net', ['instrument']),
        C('Cú Mèo Nâu', 'Đậu trên cây thông cổ thụ, kêu khi có người leo', 'child', 'n', 'casual', 'brown', 'Lông nâu đốm trắng', 'Linh vật canh túi lưới', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 4
sid = 'surv-04'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=4,
    title='Cơn Mưa Trên Sông Đá',
    inspiration='File: xóa dấu chân trên cát/bùn để đánh lạc hướng; video bờ đá sỏi và rừng ẩm.',
    setting='Bờ sông đá cuội đầu mùa mưa, mây đen kéo từ thượng nguồn, mưa rào từng đợt. Bùn non dọc bờ, lá chuối rừng to như cái ô, sấm rền xa.',
    story=('Giữa buổi chiều, mây đen kéo về, Đội Săn Tìm tranh thủ nhốt nhóm bạn vào chuồng gỗ dưới mái lá chuối. '
           'Khi tia chớp đầu tiên lóe lên, Thiên Ân mài đứt dây thừng trên tảng đá sắc và cả nhóm lao vào màn mưa. '
           'Mưa là bạn và cũng là thù: mưa xóa dấu chân trên cát nhưng lại in dấu thật sâu trên bùn. '
           'Đội phải hứng nước mưa sạch, dựng mái che bằng gậy và lá chuối, giải mật thư bị nhòe nước, và dụ Đội Săn Tìm theo dấu chân giả. '
           'Khi sấm nổ lớn, Đội Săn Tìm phải chạy về trại cất lưới, đó là lúc đội Chạy Trốn cướp được lưới để giải cứu bạn bè.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Tia chớp đầu tiên', 'Thoát chuồng gỗ khi mưa bắt đầu; Đội Săn Tìm nhận áo mưa cam.',
          ['Mỗi tia chớp làm sáng cả bãi 1 giây: ai đang chạy có thể bị thấy.', 'Đủ câu đúng thì dây đứt.'],
          'Câu hỏi hiện trên sợi dây ướt mưa.', 'Mở khóa Lá chuối (che mưa, giảm dấu chân).', ['rain', 'lightning', 'thunder', 'wet'],
          ['surv_holding_pen', 'surv_rope', 'surv_sharp_rock', 'hdri_cloudy', 'river_bush']),
        S(2, 'Nhiệm vụ 1: Hứng nước mưa', 'Đặt ống tre và chậu đá hứng nước mưa sạch; tránh nước bùn chảy tràn.',
          ['Chậu đặt dưới mái lá thì sạch, đặt trên đất thì đục.', 'Đội Săn Tìm quét dấu trên bùn rõ gấp đôi.'],
          HOOK_TASK, 'Bình nước mưa.', ['collect', 'bowl', 'roof', 'muddy'],
          ['surv_stone_basin', 'camp_bucket', 'camp_bottle', 'tex_mud']),
        S(3, 'Nhiệm vụ 2: Mái che gậy và lá', 'Gom gậy, đá nhọn và lá chuối dựng mái che, nơi Ống nhòm không soi được.',
          ['Mái che chứa tối đa 4 người.', 'Bẫy dây vấp đặt quanh mái che.'],
          HOOK_TASK + ' Câu đúng dựng thêm một cây cột.', 'Mái che lá (ẩn nấp sâu).', ['shelter', 'cover', 'leaf', 'dry'],
          ['surv_stick', 'surv_pointed_stone', 'surv_tripwire', 'camp_tarp', 'river_bush']),
        S(4, 'Nhiệm vụ 3: Mật thư nhòe nước', 'Khôi phục mật thư bị mưa làm nhòe để tìm hang đá khô.',
          ['Chữ nhòe ghép lại bằng các câu đúng.', 'Người ở chuồng gỗ giúp bằng câu ngữ pháp.'],
          'Tờ mật thư nhòe; câu đúng làm khô từng dòng. Hợp câu sửa câu (transform).', 'Lối vào hang đá khô.', ['message', 'smudge', 'dry cave', 'under'],
          ['surv_letter', 'river_cave', 'surv_map']),
        S(5, 'Nhiệm vụ 4: Dấu chân giả', 'Xóa dấu thật trên bùn và in dấu giả dẫn Đội Săn Tìm ra bãi lau.',
          ['Mỗi câu đúng tạo 5 bước dấu giả.', 'Sấm lớn: người Săn Tìm phải về trại cất lưới 20 giây, cơ hội cướp lưới.'],
          'Chổi xóa dấu và Mồi nhử theo câu đúng; nút "Cướp lưới".', 'Lưới Gắn Thẻ.', ['fake', 'trick', 'follow', 'reed'],
          ['surv_broom', 'decal_footprint_mud', 'decal_footprint_sand', 'surv_capture_net', 'river_reed']),
        S(6, 'Tạnh mưa', 'Mưa tạnh, cầu vồng lên: phút cuối giải cứu và đếm người.',
          ['Bùn khô dần, dấu chân mờ đi.', 'Kết quả, MVP, Gương Mặt Quật Cường.'],
          'Câu 10 giây trên chuồng gỗ.', 'MVP +20% điểm đội thua.', ['stop', 'sun', 'rainbow', 'safe'],
          ['surv_holding_pen', 'hdri_noon', 'anim_cheer']),
        S(7, 'Chặng phụ: Lũ nhỏ', 'Kéo dài: nước sông dâng, bãi thu hẹp, hai đội dồn vào giữa.',
          ['Ai đứng ở bãi thấp phải trả lời để leo lên đá cao.'], 'Câu khó, sao đôi.', 'Sao đôi.', ['flood', 'rise', 'high', 'quick'],
          ['river_rock_large', 'water_foam'], optional=True),
        S(8, 'Chặng phụ: Phơi đồ quanh lửa', 'Ôn từ vựng thời tiết quanh đống lửa sưởi.',
          ['Mỗi bạn chọn một từ thời tiết và đặt câu.'], 'Câu ôn, không tính thua.', 'Huy hiệu "Chiến Binh Mưa".', ['weather', 'storm', 'cloud', 'warm'],
          ['camp_firepit', 'river_woodpile'], optional=True),
    ],
    class_plan=plan({'map_zones': ['Bãi đá cuội', 'Rừng chuối', 'Bãi lau sậy']}),
    characters=cast(sid, 9, [
        C('Cô Thu', 'Nhà khí tượng của trại, đoán mưa rất đúng', 'adult', 'f', 'explorer', 'yellow', 'Áo mưa vàng, ủng đen', 'Trọng tài, báo sấm', 'npc', None, ['watch', 'map_or_notebook']),
        C('Thiên Ân', 'Dũng cảm, không sợ sấm', 'child', 'f', 'explorer', 'blue', 'Áo mưa xanh dương', 'Đội trưởng Chạy Trốn', 'escapers', None, ['bag']),
        C('Hữu Phước', 'Biết lá nào che mưa tốt', 'child', 'm', 'vn_traditional', 'brown', 'Áo nâu, nón lá', 'Trinh sát', 'escapers', None, ['hat'], covered=True),
        C('Noah', 'Bạn Mỹ, đọc chữ nhòe giỏi', 'teen', 'm', 'casual', 'gray', 'Áo hoodie xám', 'Thợ giải mã', 'escapers', None, ['glasses']),
        C('Kim Ngân', 'Hứng nước mưa bằng ống tre', 'teen', 'f', 'casual', 'teal', 'Áo khoác xanh ngọc', 'Người tìm nước', 'escapers', None, []),
        C('Su Su', 'Tinh nghịch, chuyên in dấu chân giả', 'child', 'f', 'casual', 'pink', 'Áo mưa hồng có tai thỏ', 'Người xóa dấu', 'escapers', 'broom_brush', ['pet_or_toy'], hair=('pigtails', 'shoulder')),
        C('Quốc Anh', 'Không bao giờ bỏ cuộc dưới mưa', 'teen', 'm', 'explorer', 'orange', 'Áo mưa cam, mũ trùm', 'Đội trưởng Săn Tìm', 'pursuers', None, ['watch'], covered=True),
        C('Hà My', 'Đọc dấu bùn như đọc sách', 'teen', 'f', 'explorer', 'orange', 'Áo mưa cam, ủng xanh', 'Người dò dấu chân', 'pursuers', 'detector_scanner', []),
        C('Aiko', 'Bạn Nhật, kiên nhẫn soi ống nhòm', 'child', 'f', 'casual', 'orange', 'Áo mưa cam trong suốt', 'Người canh ống nhòm', 'pursuers', None, ['headband']),
        C('Long', 'Chạy trên bùn không trượt', 'child', 'm', 'football', 'orange', 'Áo thể thao cam, giày đinh', 'Người chạy nhanh', 'pursuers', None, []),
        C('Thanh Tâm', 'Giữ chuồng gỗ dưới mái lá', 'teen', 'f', 'casual', 'orange', 'Áo mưa cam, khăn quàng', 'Người giữ Chuồng Gỗ', 'pursuers', 'swatter_net', ['necklace']),
        C('Ếch Xanh', 'Kêu "ộp" báo hiệu sắp sấm', 'child', 'n', 'casual', 'green', 'Da xanh bóng', 'Linh vật báo sấm', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 5
sid = 'surv-05'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=5,
    title='Đảo Lau Sậy Giữa Dòng',
    inspiration='File: khu rừng sông dã ngoại hẻo lánh; video thuyền nhôm và mặt nước ngọc.',
    setting='Một cù lao lau sậy giữa sông rộng, nối với bờ bằng bè tre và bến gỗ cũ. Nắng chiều gay gắt rồi dịu dần, sóng vỗ vào thuyền nhôm, chim cò bay ngang.',
    story=('Đội Săn Tìm đưa nhóm bạn ra cù lao bằng thuyền nhôm, nhốt vào chuồng gỗ cạnh bến rồi chèo đi giấu bè. '
           'Quỳnh Như tìm được mảnh đá sắc trong bãi sỏi, mài đứt dây và dẫn cả nhóm vào rừng lau cao quá đầu. '
           'Đảo không có suối, nên phải tìm giếng đá cổ của người đánh cá; phải gom gậy làm bè nhỏ, giải mật thư của ông lái đò Tư để biết bến nào an toàn, và xóa vệt đi trong lau. '
           'Đội Săn Tìm đi tuần bằng thuyền quanh đảo, dùng ống nhòm từ mặt nước. '
           'Lưới Gắn Thẻ dự phòng nằm trên chiếc thuyền neo ở bến cũ; ai bơi bè tới được sẽ đổi vai và giải cứu cả đội.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Bến cũ cù lao', 'Thoát chuồng gỗ ở bến; Đội Săn Tìm lên thuyền đi tuần.',
          ['Tiếng sóng vỗ, thuyền nhôm rời bến.', 'Đủ câu đúng thì dây đứt.'],
          'Câu hỏi trên sợi dây buộc cổng chuồng.', 'Mở khóa đường vào rừng lau.', ['island', 'boat', 'reed', 'shore'],
          ['surv_holding_pen', 'surv_rope', 'surv_sharp_rock', 'river_dock', 'river_boat_aluminium', 'river_reed']),
        S(2, 'Nhiệm vụ 1: Giếng đá người đánh cá', 'Tìm giếng đá cổ có nước ngọt; nước sông mặn phù sa không uống được.',
          ['Ba giếng, một giếng cạn, một giếng có rêu, một giếng nước trong.', 'Thuyền tuần soi ống nhòm vào bờ.'],
          HOOK_TASK, 'Bình nước ngọt.', ['well', 'fresh water', 'deep', 'bucket'],
          ['surv_stone_basin', 'camp_bucket', 'river_rock_medium']),
        S(3, 'Nhiệm vụ 2: Bè gậy', 'Gom gậy và dây làm bè nhỏ để qua lạch nước.',
          ['Bè chở 2 người, đi chậm.', 'Bẫy dây vấp đặt ở bờ lạch.'],
          HOOK_TASK + ' Mỗi câu đúng buộc thêm một thanh gậy vào bè.', 'Bè gậy.', ['raft', 'tie', 'float', 'paddle'],
          ['surv_stick', 'surv_rope', 'surv_tripwire', 'river_driftwood', 'river_boat_row']),
        S(4, 'Nhiệm vụ 3: Mật thư ông lái đò', 'Giải mật thư trong chai trôi dạt để biết bến nào an toàn.',
          ['Chai trôi dạt vào bãi; mật thư ghi giờ thủy triều và hướng bến.', 'Người ở chuồng gỗ đọc tiếp.'],
          'Mật thư trong chai; câu đúng gỡ từng dòng. Hợp câu đọc hiểu ngắn.', 'Bến an toàn.', ['bottle', 'tide', 'east', 'safe'],
          ['surv_letter', 'surv_map', 'surv_compass', 'camp_bottle']),
        S(5, 'Nhiệm vụ 4: Vệt lau và thuyền neo', 'Dựng lại lau bị rẽ để xóa vệt; chèo bè tới thuyền neo lấy Lưới Gắn Thẻ.',
          ['Vệt lau rẽ hiện rõ từ thuyền tuần.', 'Lấy lưới trên thuyền cần 3 câu đúng liên tiếp.'],
          'Mỗi câu đúng dựng lại một khóm lau; nút "Cướp lưới".', 'Lưới Gắn Thẻ.', ['hide', 'trail', 'anchor', 'swim'],
          ['river_reed', 'surv_capture_net', 'river_boat_aluminium', 'decal_footprint_sand']),
        S(6, 'Hoàng hôn trên cù lao', 'Phút cuối giải cứu, đếm người khi mặt trời chạm sông.',
          ['Chim cò bay về tổ.', 'MVP và Gương Mặt Quật Cường.'],
          'Câu 10 giây trên chuồng gỗ và trên thuyền tuần.', 'MVP +20% điểm đội thua.', ['sunset', 'island', 'together'],
          ['surv_holding_pen', 'hdri_sunset', 'river_birds', 'anim_cheer']),
        S(7, 'Chặng phụ: Nước ròng', 'Kéo dài: nước rút lộ bãi cát mới, đường trốn thay đổi.',
          ['Bãi cát mới in dấu chân rất rõ.'], 'Câu khó, sao đôi.', 'Sao đôi.', ['low tide', 'sandbar'],
          ['tex_sand', 'decal_footprint_sand'], optional=True),
        S(8, 'Chặng phụ: Chuyến đò về', 'Cả lớp lên đò về bờ, ông Tư hỏi bài.',
          ['Ai trả lời đúng được cầm lái đò một đoạn.'], 'Câu ôn, không tính thua.', 'Huy hiệu "Thủ Lĩnh Cù Lao".', ['ferry', 'home', 'thank you'],
          ['river_boat_row', 'river_dock'], optional=True),
    ],
    class_plan=plan({'map_zones': ['Bến cũ', 'Rừng lau', 'Bãi giếng đá'], 'note': 'Đội Săn Tìm đi tuần bằng 2 thuyền (tối đa 6 người/thuyền); số còn lại tuần trên bờ.'}),
    characters=cast(sid, 2, [
        C('Ông Tư', 'Lái đò lâu năm, viết mật thư bỏ chai', 'elder', 'm', 'vn_traditional', 'brown', 'Áo bà ba nâu, nón lá', 'Trọng tài, người viết mật thư', 'npc', 'staff_cane', ['hat', 'beard'], covered=True),
        C('Quỳnh Như', 'Bình tĩnh dẫn đường trong lau', 'child', 'f', 'explorer', 'green', 'Áo xanh rêu, quần lửng', 'Đội trưởng Chạy Trốn', 'escapers', None, ['bag']),
        C('Khoa', 'Biết bơi giỏi, thuộc lạch nước', 'teen', 'm', 'life_jacket_sailing', 'yellow', 'Áo phao vàng, quần bơi', 'Trinh sát', 'escapers', None, []),
        C('Emma', 'Bạn Đức, đọc mật thư trong chai', 'teen', 'f', 'casual', 'white', 'Áo sơ mi trắng, mũ cói', 'Thợ giải mã', 'escapers', None, ['hat', 'freckles']),
        C('Nhật Minh', 'Tìm ra giếng đá cổ', 'child', 'm', 'casual', 'teal', 'Áo thun xanh ngọc', 'Người tìm nước', 'escapers', None, ['watch']),
        C('Hoa Mai', 'Dựng lau lại nhanh như gió', 'child', 'f', 'vn_traditional', 'yellow', 'Áo bà ba vàng', 'Người xóa dấu', 'escapers', 'broom_brush', ['flower']),
        C('Bảo Long', 'Cầm lái thuyền tuần', 'teen', 'm', 'life_jacket_sailing', 'orange', 'Áo phao cam', 'Đội trưởng Săn Tìm', 'pursuers', None, ['whistle']),
        C('Minh Thư', 'Nhìn vệt lau là biết hướng đi', 'teen', 'f', 'life_jacket_sailing', 'orange', 'Áo phao cam, kính râm', 'Người dò dấu chân', 'pursuers', 'detector_scanner', ['glasses']),
        C('Omar', 'Bạn Ai Cập, soi ống nhòm từ mũi thuyền', 'child', 'm', 'life_jacket_sailing', 'orange', 'Áo phao cam, mũ lưỡi trai', 'Người canh ống nhòm', 'pursuers', None, ['hat']),
        C('Cẩm Tú', 'Nhảy lên bờ nhanh nhất', 'child', 'f', 'football', 'orange', 'Áo thể thao cam', 'Người chạy nhanh', 'pursuers', None, ['headband']),
        C('Hiếu', 'Giữ chuồng gỗ ở bến', 'teen', 'm', 'casual', 'orange', 'Vest cam, áo trắng', 'Người giữ Chuồng Gỗ', 'pursuers', 'swatter_net', []),
        C('Cò Trắng', 'Bay vòng trên chỗ có người trốn quá lâu', 'child', 'n', 'casual', 'white', 'Lông trắng muốt', 'Linh vật cù lao', 'npc', None, ['pet_or_toy']),
    ]),
))
