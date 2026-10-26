from common import C, S, cast

GAME = 'river_fishing'

HOOK = 'Cá cắn câu thì thanh căng dây hiện ra; các đáp án là những vùng màu trên thanh, kéo cần về đúng vùng đáp án để thu dây. Đúng: kéo cá lên, hiện cân nặng và chiều dài. Sai: dây chùng, cá thoát, mồi vẫn còn.'

RULES = {
    'score': 'Điểm một con cá = cân nặng (kg) × 100 × hệ số độ hiếm (Thường 1, Khá 1,5, Hiếm 2,5, Cực hiếm 5). Trả lời nhanh cộng tới 20% điểm.',
    'upgrade': 'Mỗi 3 câu đúng: nâng một cấp cần (gỗ → sợi thủy tinh → carbon → vàng) hoặc chọn mồi mới. Cần cấp cao kéo nhanh hơn và giữ được cá to.',
    'rarity': 'Câu khó hơn (bậc cao hơn trong 5 bậc của gia sư) có tỉ lệ ra cá hiếm cao hơn. Cá Cực hiếm chỉ cắn khi đã có cần vàng.',
    'release': 'Cá được thả lại sông sau khi cân và chụp ảnh (thông điệp bảo vệ thiên nhiên).',
}


def plan(extra=None):
    p = {
        'sizes': {
            '1-5': 'Một thuyền nhôm chung (2-4 người) hoặc mỗi em một thuyền nhỏ cạnh bến; bảng kỷ lục cá nhân.',
            '6-20': 'Thuyền 3-4 người, mỗi em một cần riêng. 2-5 thuyền neo ở 2 khúc sông; bảng kỷ lục theo thuyền và cá nhân.',
            '21-50': 'Thuyền 4 người (50 em = 13 thuyền) rải trên 3 khúc sông: bến gỗ, giữa hồ, chân thác. Mỗi khúc sông tối đa 5 thuyền để không chật màn hình; ai cũng thấy bảng kỷ lục chung.',
        },
        'roles': ['Thuyền trưởng (chọn chỗ neo)', 'Thợ câu', 'Người giữ vợt', 'Người ghi kỷ lục'],
        'rules': RULES,
        'avatars': 'Mỗi học sinh đứng trên thuyền bằng nhân vật riêng ghép từ hồ sơ diện mạo, mặc áo phao màu thuyền. 12 nhân vật dưới đây là người dẫn chuyện và bạn câu trong phim.',
        'safety': 'Mọi nhân vật luôn mặc áo phao trên thuyền.',
    }
    if extra:
        p.update(extra)
    return p


SCENARIOS = []

# ---------------------------------------------------------------- 1
sid = 'fish-01'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=1,
    title='Bình Minh Trên Hồ Ngọc',
    inspiration='Video đứng trên thuyền nhôm câu cá giữa hồ xanh ngọc, nước trong nhìn thấy đáy; file mục II.2.',
    setting='Hồ xanh ngọc dưới chân núi lúc bình minh, sương mỏng trên mặt nước, rừng thông soi bóng. Mặt hồ phẳng lặng, nhìn thấy đá cuội và đàn cá nhỏ dưới đáy.',
    story=('Sáng sớm, bác Năm ngư dân dẫn cả lớp ra bến gỗ, chia mỗi nhóm một thuyền nhôm nhỏ và một cây cần gỗ cũ. '
           'Bác kể rằng hồ Ngọc có sáu loài cá thường gặp và một truyền thuyết: Cá Hồi Hoàng Gia chỉ ngoi lên khi mặt trời vừa ló khỏi đỉnh núi. '
           'Các thuyền phải học cách quăng cần, chờ phao chìm và giữ thanh căng dây, rồi điền vào Sổ Câu Cá đủ các loài cá của hồ. '
           'Câu đúng giúp nâng cần, đổi mồi, và cá lớn sẽ tìm đến. '
           'Khi ánh nắng đầu tiên chạm mặt hồ, thuyền nào có cần vàng sẽ có cơ hội gặp Cá Hồi Hoàng Gia.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Ra bến, lên thuyền', 'Nhận thuyền, áo phao, cần gỗ; chèo ra giữa hồ.',
          ['Bác Năm dạy 3 bước: quăng, chờ, kéo.', 'Mỗi câu đúng là một nhịp chèo ra vị trí neo.'],
          'Câu hỏi trên mái chèo; câu đúng đưa thuyền ra khu cá nhiều hơn.', 'Cần gỗ + mồi giun.', ['boat', 'paddle', 'life jacket', 'rod'],
          ['river_dock', 'river_boat_aluminium', 'kayak_lifejacket', 'fish_rod', 'fish_bait', 'hdri_dawn']),
        S(2, 'Cú quăng đầu tiên', 'Học quăng cần bằng Thanh lực quăng, bắt con cá đầu tiên.',
          ['Thanh lực quăng: dừng đúng vùng xanh để phao rơi xa.', 'Cá rô phi và cá rô đồng cắn câu nhiều.'],
          HOOK, 'Cá đầu tiên vào Sổ Câu Cá.', ['cast', 'float', 'bite', 'pull'],
          ['fish_bobber', 'fish_reel', 'fish_hook', 'fish_tilapia', 'fish_climbing_perch', 'anim_cast']),
        S(3, 'Đổi mồi, đổi chỗ', 'Thử mồi tôm và mồi cá nhỏ để bắt cá chép, cá diếc.',
          ['Mồi khác nhau gọi loài khác nhau.', 'Sau 3 câu đúng: nâng cần sợi thủy tinh.'],
          HOOK, 'Cần sợi thủy tinh.', ['bait', 'worm', 'shrimp', 'change'],
          ['fish_bait', 'fish_carp', 'fish_crucian', 'fish_tackle_box']),
        S(4, 'Khúc sâu gần bãi đá', 'Neo thuyền gần bãi đá, săn cá trắm và cá lóc.',
          ['Cá lớn kéo mạnh, thanh căng dây rung nhiều.', 'Vợt cần người thứ hai trên thuyền trả lời đúng.'],
          HOOK + ' Cá to cần 2 câu đúng liên tiếp.', 'Vợt + cần carbon.', ['deep', 'strong', 'net', 'heavy'],
          ['fish_grass_carp', 'fish_snakehead', 'fish_net', 'river_rock_large']),
        S(5, 'Cân và ghi kỷ lục', 'Về bến cân cá, ghi Sổ Câu Cá, thả cá lại hồ.',
          ['Bảng kỷ lục xếp hạng theo điểm.', 'Câu đúng mở khóa "sự thật về loài cá".'],
          'Câu hỏi hiện trên bảng cân; đúng thì cân chính xác và cộng điểm thưởng.', 'Cần vàng cho 3 thuyền dẫn đầu và mọi em đủ 9 câu đúng.', ['weigh', 'record', 'release', 'kilogram'],
          ['fish_scale', 'fish_record_board', 'fish_bucket', 'river_dock']),
        S(6, 'Mặt trời ló núi', 'Cơ hội gặp Cá Hồi Hoàng Gia cho ai có cần vàng.',
          ['Nắng đầu tiên chạm mặt hồ, cá hồi lấp lánh bên dưới.', 'Cá Cực hiếm cần 3 câu đúng liên tiếp, câu cuối khó nhất.'],
          HOOK, 'Danh hiệu "Ngư Phủ Bình Minh"; người bắt cá to nhất là MVP.', ['sunrise', 'legend', 'rare', 'shine'],
          ['fish_king_salmon', 'fish_rod', 'hdri_noon', 'anim_pull_fish', 'anim_cheer']),
        S(7, 'Chặng phụ: Cá trê dưới bến', 'Kéo dài: câu cá trê lẩn dưới bến gỗ.',
          ['Cá trê chỉ cắn mồi giun sát đáy.'], 'Sao đôi.', 'Sao đôi.', ['catfish', 'under', 'bottom'],
          ['fish_walking_catfish', 'river_dock'], optional=True),
        S(8, 'Chặng phụ: Sổ tay loài cá', 'Viết một câu mô tả mỗi loài cá đã bắt.',
          ['Sổ tay in ra gửi phụ huynh.'], 'Câu viết ngắn, không tính thua.', 'Huy hiệu "Nhà Sinh Vật Nhí".', ['scale', 'fin', 'color', 'long'],
          ['fish_record_board'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 2, [
        C('Bác Năm', 'Ngư dân hiền lành, biết từng góc hồ', 'elder', 'm', 'vn_traditional', 'brown', 'Áo bà ba nâu, nón lá, áo phao cũ', 'Người hướng dẫn câu', 'npc', 'staff_cane', ['hat', 'beard'], covered=True),
        C('Cô Thủy', 'Nhà sinh vật học, ghi chép loài cá', 'adult', 'f', 'explorer', 'teal', 'Áo xanh ngọc, mũ rộng vành', 'Người giữ Sổ Câu Cá', 'npc', None, ['map_or_notebook', 'glasses']),
        C('Hưng', 'Quăng cần xa nhất lớp', 'teen', 'm', 'life_jacket_sailing', 'orange', 'Áo phao cam', 'Thuyền trưởng', 'anglers', None, ['hat']),
        C('Thanh Hà', 'Kiên nhẫn chờ phao chìm', 'child', 'f', 'life_jacket_sailing', 'yellow', 'Áo phao vàng, mũ tai bèo', 'Thợ câu', 'anglers', None, ['hat']),
        C('Ben', 'Bạn Anh, cầm vợt rất khéo', 'teen', 'm', 'life_jacket_sailing', 'blue', 'Áo phao xanh', 'Người giữ vợt', 'anglers', 'swatter_net', ['freckles']),
        C('Minh Châu', 'Nhớ tên mọi loài cá', 'child', 'f', 'life_jacket_sailing', 'pink', 'Áo phao hồng', 'Người ghi kỷ lục', 'anglers', 'rolled_paper', ['map_or_notebook']),
        C('Tài', 'Chèo thuyền khỏe', 'teen', 'm', 'life_jacket_sailing', 'green', 'Áo phao xanh lá', 'Thuyền trưởng', 'anglers', None, []),
        C('Yuna', 'Bạn Hàn, thích mồi giả xoay', 'child', 'f', 'life_jacket_sailing', 'purple', 'Áo phao tím', 'Thợ câu', 'anglers', None, ['bracelet']),
        C('Kofi', 'Bạn Ghana, kể chuyện cá vui', 'teen', 'm', 'life_jacket_sailing', 'red', 'Áo phao đỏ', 'Thợ câu', 'anglers', None, ['watch']),
        C('Út Mít', 'Con gái bác Năm, chỉ chỗ cá', 'child', 'f', 'vn_traditional', 'green', 'Áo bà ba xanh, áo phao nhỏ', 'Bạn chỉ đường', 'npc', None, ['flower']),
        C('Chú Khôi', 'Giữ bến và cân cá', 'adult', 'm', 'casual', 'navy', 'Áo xanh navy, ủng cao su', 'Người giữ bến', 'npc', None, ['whistle']),
        C('Vịt Xám', 'Bơi theo thuyền, kêu khi cá cắn câu', 'child', 'n', 'casual', 'gray', 'Lông xám', 'Linh vật hồ', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 2
sid = 'fish-02'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=2,
    title='Giải Câu Cá Mùa Hè Bến Gỗ',
    inspiration='Video bến cầu gỗ đưa ra nước; file: tính điểm theo kích thước và độ hiếm.',
    setting='Bến gỗ dài đưa ra sông, cờ giải đấu tung bay, bảng điểm lớn trên bờ, khán giả cổ vũ. Nắng sáng rực rỡ, nước sông xanh trong, gió nhẹ.',
    story=('Trại tổ chức Giải Câu Cá Mùa Hè, phát thanh viên vui tính Bé Bự bình luận trực tiếp qua loa. '
           'Mỗi thuyền có 30 phút qua ba vòng: vòng loại ở bến, vòng bán kết giữa sông, vòng chung kết ở khúc sâu. '
           'Luật giải rất rõ: điểm theo cân nặng và độ hiếm, thả cá lại sau khi cân, và thuyền nào câu được loài mới sẽ có điểm thưởng. '
           'Giữa giải, đội vô địch năm ngoái của Captain Ray tuyên bố sẽ bảo vệ ngôi vương. '
           'Chung kết là cuộc săn cá lăng, loài cá hiếm của khúc sông sâu, và ai bắt được sẽ được khắc tên lên cúp gỗ.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Khai mạc', 'Đăng ký thuyền, nhận số áo, chọn cần và mồi xuất phát.',
          ['Bé Bự giới thiệu từng thuyền.', 'Mỗi câu đúng chọn thêm một món đồ nghề.'],
          'Câu hỏi trên bảng đăng ký.', 'Bộ đồ nghề xuất phát.', ['contest', 'team', 'start', 'number'],
          ['river_dock', 'river_sign', 'fish_tackle_box', 'fish_rod', 'camp_bunting']),
        S(2, 'Vòng loại ở bến', 'Câu cá thường ở bến, đạt 300 điểm để vào vòng sau.',
          ['Cá rô phi, cá chép, cá diếc nhiều.', 'Bảng điểm cập nhật trực tiếp.'],
          HOOK, 'Vé bán kết.', ['qualify', 'points', 'score', 'catch'],
          ['fish_tilapia', 'fish_carp', 'fish_crucian', 'fish_record_board']),
        S(3, 'Bán kết giữa sông', 'Chèo ra giữa sông, săn cá basa và cá tra.',
          ['Dòng chảy đẩy thuyền: câu đúng giữ thuyền đứng yên.', 'Nâng cần sợi thủy tinh sau 3 câu đúng.'],
          HOOK, 'Cần sợi thủy tinh, vé chung kết.', ['current', 'middle', 'basa', 'steady'],
          ['fish_basa', 'fish_tra', 'river_boat_aluminium', 'river_buoy']),
        S(4, 'Thách đấu Captain Ray', 'Đối đầu trực tiếp với thuyền vô địch năm ngoái (thuyền máy điều khiển).',
          ['Ai bắt nhiều điểm hơn trong 5 phút thắng.', 'Captain Ray câu nhanh theo mức độ khó của lớp.'],
          HOOK + ' Mỗi câu đúng trước Captain Ray cướp được một con cá khỏi lưỡi của ông.', 'Cần carbon.', ['challenge', 'faster', 'beat', 'champion'],
          ['fish_snakehead', 'fish_rainbow_trout', 'river_boat_aluminium']),
        S(5, 'Chung kết khúc sâu', 'Săn cá lăng ở khúc sông sâu.',
          ['Cá lăng hiếm, kéo rất mạnh.', 'Cả thuyền cùng trả lời để giữ dây.'],
          HOOK + ' Cá hiếm cần 2 câu đúng liên tiếp.', 'Cá lăng vào bảng kỷ lục.', ['final', 'rare', 'deep', 'hold'],
          ['fish_hemibagrus', 'fish_net', 'fish_rod', 'anim_pull_fish']),
        S(6, 'Lễ trao cúp', 'Cân cá cuối, công bố thuyền vô địch và MVP.',
          ['Tên người thắng khắc lên cúp gỗ.', 'Cá được thả lại sông.'],
          'Câu hỏi trên bục trao giải (phỏng vấn ngắn).', 'Cúp gỗ + danh hiệu "Vua Bến Gỗ".', ['winner', 'trophy', 'congratulations', 'release'],
          ['fish_scale', 'fish_record_board', 'river_dock', 'anim_cheer']),
        S(7, 'Chặng phụ: Giải phụ cá nhỏ nhất', 'Kéo dài: giải vui cho con cá nhỏ nhất.',
          ['Cá nhỏ nhất cũng được thưởng.'], 'Sao đôi.', 'Sao đôi.', ['small', 'tiny', 'funny'],
          ['fish_climbing_perch'], optional=True),
        S(8, 'Chặng phụ: Phỏng vấn nhà vô địch', 'Mỗi thuyền trả lời phỏng vấn tiếng Anh của Bé Bự.',
          ['Câu trả lời hay phát lại trên loa.'], 'Câu nói/viết ngắn, không tính thua.', 'Huy hiệu "Ngôi Sao Giải Đấu".', ['proud', 'teamwork', 'next year'],
          ['river_sign'], optional=True),
    ],
    class_plan=plan({'note': 'Captain Ray là thuyền máy do máy chủ điều khiển, độ khó theo bậc của lớp.'}),
    characters=cast(sid, 5, [
        C('Bé Bự', 'Phát thanh viên vui tính, nói qua loa', 'adult', 'm', 'casual', 'yellow', 'Áo hoa vàng, kính râm', 'Bình luận viên', 'npc', 'instrument', ['glasses']),
        C('Captain Ray', 'Nhà vô địch năm ngoái, tự tin nhưng tử tế', 'adult', 'm', 'life_jacket_sailing', 'navy', 'Áo phao navy, mũ thuyền trưởng', 'Đối thủ thử thách', 'npc', None, ['hat', 'beard']),
        C('Cô Duyên', 'Trọng tài giải, giữ cân', 'adult', 'f', 'formal_smart', 'white', 'Áo trắng, thẻ trọng tài', 'Trọng tài', 'npc', None, ['whistle', 'watch']),
        C('Phong Vũ', 'Thuyền trưởng nhanh nhẹn', 'teen', 'm', 'life_jacket_sailing', 'red', 'Áo phao đỏ số 7', 'Thuyền trưởng', 'anglers', None, []),
        C('Ngân Hà', 'Quăng cần chính xác', 'teen', 'f', 'life_jacket_sailing', 'teal', 'Áo phao xanh ngọc số 3', 'Thợ câu', 'anglers', None, ['headband']),
        C('Lucas M.', 'Bạn Pháp, chuyên vợt cá', 'child', 'm', 'life_jacket_sailing', 'blue', 'Áo phao xanh số 11', 'Người giữ vợt', 'anglers', 'swatter_net', ['freckles']),
        C('Hạnh', 'Tính điểm nhanh', 'child', 'f', 'life_jacket_sailing', 'pink', 'Áo phao hồng số 5', 'Người ghi kỷ lục', 'anglers', 'rolled_paper', ['glasses']),
        C('Đông', 'Câu cá lăng giỏi nhất trại', 'teen', 'm', 'life_jacket_sailing', 'green', 'Áo phao xanh lá số 9', 'Thợ câu', 'anglers', None, ['watch']),
        C('Leila', 'Bạn Iran, cổ vũ cả thuyền', 'child', 'f', 'life_jacket_sailing', 'purple', 'Áo phao tím số 2', 'Thợ câu', 'anglers', None, ['bracelet'], covered=True),
        C('Rin', 'Bạn Thái, mồi ruồi tự làm', 'child', 'n', 'life_jacket_sailing', 'orange', 'Áo phao cam số 4', 'Thợ câu', 'anglers', None, []),
        C('Ông Chín', 'Người làm cúp gỗ khắc tên', 'elder', 'm', 'vn_traditional', 'brown', 'Áo bà ba, tạp dề thợ mộc', 'Khách mời trao cúp', 'npc', 'axe_hammer_tool', ['glasses']),
        C('Bói Cá Xanh', 'Chim bói cá đậu trên cột bến, lao xuống chỗ cá to', 'child', 'n', 'casual', 'blue', 'Lông xanh biếc', 'Linh vật bến', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 3
sid = 'fish-03'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=3,
    title='Chân Thác Và Cá Lăng Sông Sâu',
    inspiration='File: đoạn sông ngọc chảy qua chân núi; video nước trong và vách đá.',
    setting='Khúc sông dưới chân thác lớn, nước xoáy trắng bọt rồi chảy chậm thành vùng sâu xanh thẫm. Vách đá cao hai bên, chim én bay quanh thác, bụi nước lấp lánh.',
    story=('Thầy Quang, huấn luyện viên câu cá thể thao, đưa nhóm câu giỏi nhất trại lên chân thác lớn. '
           'Ở đây nước chảy mạnh, cá khỏe, chỉ người giữ được thanh căng dây thật vững mới thắng được. '
           'Thầy giao một thử thách: bắt đủ ba loài cá sông sâu (cá lăng, cá nheo, cá chình) để được vào "Câu lạc bộ Chân Thác". '
           'Nhưng dòng nước thay đổi theo giờ, và thuyền phải di chuyển giữa ba vũng nước khác nhau theo bản đồ dòng chảy. '
           'Cuối buổi, cả nhóm sẽ thả một con cá lăng thật lớn trở lại vũng sâu, như lời hứa giữ gìn dòng sông.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Bản đồ dòng chảy', 'Đọc bản đồ dòng chảy, chọn vũng nước đầu tiên.',
          ['Ba vũng: Vũng Bọt, Vũng Xanh, Vũng Đá.', 'Chọn sai thì nước xoáy đẩy thuyền ra.'],
          'Câu hỏi trên bản đồ dòng chảy.', 'Vị trí neo an toàn.', ['current', 'fast', 'slow', 'pool'],
          ['surv_map', 'river_boat_aluminium', 'water_foam', 'river_cliff']),
        S(2, 'Neo thuyền trong nước xiết', 'Thả neo và giữ thuyền ổn định.',
          ['Thanh cân bằng thuyền: câu đúng giữ thuyền không xoay.'],
          'Câu hỏi trên sợi dây neo; đúng thì neo bám đá.', 'Thuyền đứng vững.', ['anchor', 'stay', 'balance', 'rope'],
          ['camp_rope', 'river_rock_large', 'river_buoy']),
        S(3, 'Vũng Bọt: cá nheo', 'Câu cá nheo trong vũng nước trắng bọt.',
          ['Cá nheo kéo ngang, thanh căng dây lắc trái phải.'],
          HOOK, 'Cá nheo + cần carbon.', ['pull', 'side', 'strong', 'whiskers'],
          ['fish_sheatfish', 'fish_rod', 'anim_pull_fish']),
        S(4, 'Vũng Xanh: cá lăng', 'Câu cá lăng trong vùng sâu xanh thẫm.',
          ['Cá lăng hiếm, cần 2 câu đúng liên tiếp.'],
          HOOK, 'Cá lăng.', ['deep', 'patient', 'rare', 'wait'],
          ['fish_hemibagrus', 'fish_bait', 'water_normal']),
        S(5, 'Vũng Đá: cá chình', 'Câu cá chình ẩn trong khe đá.',
          ['Cá chình chui vào khe: phải kéo đúng lúc.'],
          HOOK + ' Câu dạng sắp xếp: xếp đúng các bước kéo cá ra khỏi khe.', 'Cá chình.', ['eel', 'hide', 'rock', 'slippery'],
          ['fish_eel', 'river_rock_medium', 'fish_net']),
        S(6, 'Câu lạc bộ Chân Thác', 'Đủ ba loài: vào câu lạc bộ, thả cá lăng lớn về vũng sâu.',
          ['Lễ thả cá dưới cầu vồng thác.', 'MVP: người có tổng cân cao nhất.'],
          'Câu lời hứa bảo vệ dòng sông (chọn câu đúng ngữ pháp).', 'Huy hiệu "Câu Lạc Bộ Chân Thác".', ['protect', 'promise', 'river', 'nature'],
          ['fish_hemibagrus', 'hdri_noon', 'anim_cheer']),
        S(7, 'Chặng phụ: Cá hồi vân', 'Kéo dài: cá hồi vân bơi ngược thác.',
          ['Cá nhảy khỏi mặt nước.'], 'Sao đôi.', 'Sao đôi.', ['jump', 'upstream'],
          ['fish_rainbow_trout'], optional=True),
        S(8, 'Chặng phụ: Biển báo bảo vệ', 'Viết biển báo tiếng Anh bảo vệ dòng sông.',
          ['Biển báo cắm ở chân thác.'], 'Câu viết, không tính thua.', 'Huy hiệu "Người Giữ Sông".', ['do not', 'please', 'keep clean'],
          ['river_sign'], optional=True),
    ],
    class_plan=plan({'note': 'Ba vũng nước = ba khu; thuyền xoay vòng khu mỗi 5 phút để lớp đông không chen một vũng.'}),
    characters=cast(sid, 8, [
        C('Thầy Quang', 'Huấn luyện viên câu cá thể thao, nghiêm mà vui', 'adult', 'm', 'life_jacket_sailing', 'navy', 'Áo phao navy, kính râm', 'Huấn luyện viên', 'npc', None, ['glasses', 'watch']),
        C('Chị Ngọc Lan', 'Nhân viên cứu hộ ở thác', 'adult', 'f', 'diving', 'red', 'Đồ cứu hộ đỏ', 'Cứu hộ', 'npc', 'rope_climb', ['whistle']),
        C('Kiệt', 'Giữ thuyền vững nhất', 'teen', 'm', 'life_jacket_sailing', 'orange', 'Áo phao cam', 'Thuyền trưởng', 'anglers', None, []),
        C('Phương Anh', 'Không sợ nước xiết', 'teen', 'f', 'life_jacket_sailing', 'yellow', 'Áo phao vàng, mũ lưỡi trai', 'Thợ câu', 'anglers', None, ['hat']),
        C('Gabriel', 'Bạn Brazil, kéo cá nheo giỏi', 'teen', 'm', 'life_jacket_sailing', 'green', 'Áo phao xanh lá', 'Thợ câu', 'anglers', None, ['bracelet']),
        C('Bích', 'Cầm vợt bắt cá chình', 'child', 'f', 'life_jacket_sailing', 'teal', 'Áo phao xanh ngọc', 'Người giữ vợt', 'anglers', 'swatter_net', []),
        C('Thắng', 'Đọc bản đồ dòng chảy', 'child', 'm', 'life_jacket_sailing', 'blue', 'Áo phao xanh', 'Hoa tiêu', 'anglers', 'rolled_paper', ['map_or_notebook']),
        C('Anya', 'Bạn Nga, ghi chép cân nặng', 'teen', 'f', 'life_jacket_sailing', 'purple', 'Áo phao tím', 'Người ghi kỷ lục', 'anglers', None, ['glasses']),
        C('Tuệ', 'Nhỏ tuổi nhất, may mắn nhất', 'child', 'm', 'life_jacket_sailing', 'pink', 'Áo phao hồng', 'Thợ câu', 'anglers', None, ['pet_or_toy']),
        C('Già Làng A Pếch', 'Người dân tộc sống gần thác, kể chuyện cá thần', 'elder', 'm', 'regional_traditional', 'navy', 'Áo chàm thêu, khăn đội đầu', 'Người kể chuyện', 'npc', 'staff_cane', ['necklace'], covered=True),
        C('Hoa Ban', 'Cháu già làng, chỉ vũng cá', 'child', 'f', 'regional_traditional', 'red', 'Váy thổ cẩm đỏ', 'Bạn chỉ đường', 'npc', None, ['flower']),
        C('Én Nhỏ', 'Chim én bay vòng nơi nước yên', 'child', 'n', 'casual', 'black', 'Lông đen bụng trắng', 'Linh vật thác', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 4
sid = 'fish-04'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=4,
    title='Đêm Trăng Câu Cá Tra',
    inspiration='Video hồ và rừng thông; ý tưởng câu cá đêm với đèn lồng, phao phát sáng.',
    setting='Sông rộng về đêm, trăng tròn, đèn lồng treo trên mũi thuyền, phao phát sáng xanh lá trên mặt nước. Tiếng ếch nhái, gió mát, đom đóm ven bờ.',
    story=('Đêm trăng tròn, chú Tâm mở chuyến "Câu đêm Trăng Rằm" vì cá tra và cá basa chỉ ăn mồi nhiều vào ban đêm. '
           'Mỗi thuyền được phát một đèn lồng và những chiếc phao phát sáng, cá cắn câu thì phao lóe sáng. '
           'Nhưng giữa đêm, một đám sương dày trôi qua che mất trăng, đèn lồng của vài thuyền tắt. '
           'Các thuyền phải giúp nhau thắp lại đèn, đọc dấu sao để tìm đường về các bãi cá. '
           'Gần nửa đêm, mặt sông sáng lên vì đàn cá tra lớn bơi qua, đó là lúc tranh tài cuối cùng.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Thắp đèn mũi thuyền', 'Thắp đèn lồng, buộc phao phát sáng.',
          ['Mỗi câu đúng thắp sáng một phao.'],
          'Câu hỏi trên chiếc đèn lồng.', 'Đèn + phao sáng.', ['lantern', 'glow', 'moon', 'night'],
          ['camp_lantern', 'fish_bobber', 'river_boat_aluminium', 'hdri_night']),
        S(2, 'Cá đêm đầu tiên', 'Câu cá basa dưới ánh trăng.',
          ['Phao lóe sáng khi cá cắn.'],
          HOOK, 'Cá basa.', ['bite', 'flash', 'quiet', 'basa'],
          ['fish_basa', 'fish_reel', 'anim_cast']),
        S(3, 'Mồi đêm', 'Đổi mồi phù hợp cá đêm (mồi tôm, mồi cám).',
          ['Nâng cần sau 3 câu đúng.'],
          HOOK, 'Cần sợi thủy tinh + mồi tôm.', ['shrimp', 'smell', 'choose'],
          ['fish_bait', 'fish_tackle_box']),
        S(4, 'Sương che trăng', 'Đèn tắt: giúp thuyền bên cạnh thắp lại, dựa vào sao tìm bãi cá.',
          ['Câu đúng của thuyền này thắp đèn cho thuyền kia.', 'Sao Bắc Đẩu chỉ hướng bãi cá.'],
          'Câu hỏi trên ngọn đèn của thuyền bạn; hợp câu hướng (north, east).', 'Cả lớp sáng đèn lại.', ['fog', 'help', 'star', 'direction'],
          ['camp_lantern', 'hdri_night', 'surv_compass']),
        S(5, 'Cá trê và cá lóc ven bờ', 'Câu sát bờ lau, cá trê và cá lóc ra kiếm ăn.',
          ['Lau sậy rung khi cá đến.'],
          HOOK, 'Cần carbon.', ['shore', 'reed', 'snakehead', 'catfish'],
          ['fish_walking_catfish', 'fish_snakehead', 'river_reed']),
        S(6, 'Đàn cá tra nửa đêm', 'Mặt sông sáng lên, tranh tài câu cá tra lớn.',
          ['Cá tra lớn cần 2 câu đúng liên tiếp.', 'MVP: cá nặng nhất đêm.'],
          HOOK, 'Danh hiệu "Ngư Phủ Trăng Rằm".', ['midnight', 'big', 'school of fish', 'win'],
          ['fish_tra', 'fish_net', 'anim_pull_fish', 'anim_cheer']),
        S(7, 'Chặng phụ: Cá chình đêm', 'Kéo dài: cá chình ra khỏi hang ban đêm.',
          ['Rất trơn, khó giữ.'], 'Sao đôi.', 'Sao đôi.', ['eel', 'slippery'],
          ['fish_eel'], optional=True),
        S(8, 'Chặng phụ: Thơ trăng', 'Viết hai câu thơ tiếng Anh về trăng và sông.',
          ['Thơ hay đọc trên loa trại.'], 'Câu viết, không tính thua.', 'Huy hiệu "Thi Sĩ Sông Trăng".', ['moonlight', 'silver', 'calm'],
          ['hdri_night'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 11, [
        C('Chú Tâm', 'Người tổ chức câu đêm, giọng ấm', 'adult', 'm', 'casual', 'navy', 'Áo khoác navy, đèn đeo trán', 'Người dẫn chuyến', 'npc', 'flashlight', ['watch']),
        C('Bà Năm Rằm', 'Bà cụ bán chè trên thuyền, kể chuyện trăng', 'elder', 'f', 'vn_traditional', 'purple', 'Áo bà ba tím, khăn rằn', 'Người kể chuyện', 'npc', 'ladle', ['necklace']),
        C('Hiền', 'Thắp đèn nhanh, giúp thuyền khác', 'teen', 'f', 'life_jacket_sailing', 'yellow', 'Áo phao vàng', 'Thuyền trưởng', 'anglers', None, []),
        C('Lâm', 'Nhìn sao tìm hướng', 'teen', 'm', 'life_jacket_sailing', 'navy', 'Áo phao navy', 'Hoa tiêu', 'anglers', None, ['map_or_notebook']),
        C('Elif', 'Bạn Thổ Nhĩ Kỳ, phao luôn sáng nhất', 'child', 'f', 'life_jacket_sailing', 'teal', 'Áo phao xanh ngọc', 'Thợ câu', 'anglers', None, ['bracelet']),
        C('Cường', 'Khỏe, kéo cá tra lớn', 'teen', 'm', 'life_jacket_sailing', 'green', 'Áo phao xanh lá', 'Thợ câu', 'anglers', None, []),
        C('Mai Chi', 'Cầm vợt trong đêm', 'child', 'f', 'life_jacket_sailing', 'pink', 'Áo phao hồng', 'Người giữ vợt', 'anglers', 'swatter_net', ['headband']),
        C('Jack', 'Bạn Úc, ghi kỷ lục bằng đèn pin', 'child', 'm', 'life_jacket_sailing', 'orange', 'Áo phao cam', 'Người ghi kỷ lục', 'anglers', 'flashlight', ['freckles']),
        C('Trâm', 'Không sợ bóng tối', 'child', 'f', 'life_jacket_sailing', 'purple', 'Áo phao tím', 'Thợ câu', 'anglers', None, []),
        C('Nam Anh', 'Chèo thuyền êm không tiếng động', 'teen', 'n', 'life_jacket_sailing', 'blue', 'Áo phao xanh', 'Người chèo', 'anglers', None, ['watch']),
        C('Anh Sơn', 'Cứu hộ đêm, đi thuyền máy nhỏ', 'adult', 'm', 'diving', 'red', 'Áo cứu hộ đỏ phản quang', 'Cứu hộ', 'npc', 'flashlight', ['whistle']),
        C('Ếch Ộp', 'Kêu to khi đàn cá tra tới', 'child', 'n', 'casual', 'green', 'Da xanh đốm', 'Linh vật đêm', 'npc', None, ['pet_or_toy']),
    ]),
))

# ---------------------------------------------------------------- 5
sid = 'fish-05'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=5,
    title='Truyền Thuyết Vua Cá Hồi',
    inspiration='File: Cá Hồi Hoàng Gia (cá MVP), nâng cấp cần và mồi để săn cá khổng lồ; video câu cá trên thuyền.',
    setting='Ba khúc sông nối nhau: bến gỗ làng chài, hồ rộng giữa núi và cửa hang nơi sông chảy ra từ lòng núi. Từ trưa đến hoàng hôn, nắng vàng rồi đỏ rực.',
    story=('Ông Chài Tư giữ một cuốn sổ cũ ghi về Vua Cá Hồi, con cá hồi hoàng gia khổng lồ chưa ai bắt được trong 30 năm. '
           'Sổ chép ba manh mối bằng tiếng Anh từ một nhà thám hiểm xưa: loại mồi Vua Cá thích, nơi nó nghỉ trưa và giờ nó ra khỏi hang. '
           'Mỗi thuyền phải đi qua ba khúc sông, bắt các loài cá chỉ đường và giải từng manh mối để mở khóa cần vàng. '
           'Nhưng một thuyền đối thủ do Bà Mũi Nhọn dẫn đầu cũng đang săn Vua Cá, muốn đem nó lên chợ. '
           'Lúc hoàng hôn, Vua Cá ra khỏi hang; thuyền bắt được sẽ cân, chụp ảnh và thả nó về sông như lời hứa với ông Chài Tư.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Cuốn sổ của ông Chài Tư', 'Đọc trang đầu cuốn sổ, nhận nhiệm vụ.',
          ['Phim ngắn: bóng cá khổng lồ dưới nước.', 'Mỗi câu đúng mở một trang sổ.'],
          'Cuốn sổ cũ; câu đọc hiểu ngắn mở từng trang.', 'Manh mối 1: loại mồi.', ['legend', 'giant', 'clue', 'old'],
          ['surv_letter', 'river_dock', 'river_cabin', 'fish_king_salmon']),
        S(2, 'Bến làng chài', 'Bắt cá rô phi, cá trắm để đổi lấy mồi ruồi đặc biệt.',
          ['Ngư dân làng đổi mồi lấy cá.'],
          HOOK, 'Mồi ruồi đặc biệt.', ['trade', 'fly', 'village'],
          ['fish_tilapia', 'fish_grass_carp', 'fish_bait', 'fish_bucket']),
        S(3, 'Hồ giữa núi', 'Câu cá hồi vân để biết nơi Vua Cá nghỉ trưa (manh mối 2).',
          ['Cá hồi vân bơi về hướng Vua Cá.', 'Nâng cần carbon sau 3 câu đúng.'],
          HOOK, 'Manh mối 2 + cần carbon.', ['lake', 'rest', 'follow', 'trout'],
          ['fish_rainbow_trout', 'river_boat_aluminium', 'hdri_noon']),
        S(4, 'Cuộc đua với Bà Mũi Nhọn', 'Thuyền đối thủ chặn đường: vượt lên trước bằng câu trả lời đúng.',
          ['Thuyền đối thủ do máy chủ điều khiển.', 'Câu đúng = tăng tốc chèo.'],
          'Câu hỏi trên mái chèo; mỗi câu đúng vượt lên một đoạn.', 'Đến cửa hang trước.', ['race', 'ahead', 'rival', 'fast'],
          ['river_boat_row', 'kayak_paddle', 'river_cliff']),
        S(5, 'Cửa hang', 'Giải manh mối 3 (giờ Vua Cá ra), nâng cần vàng.',
          ['Manh mối là câu đố giờ giấc bằng tiếng Anh.', 'Cần vàng cho thuyền giải xong.'],
          'Câu đố hiện trên vách hang; câu dạng điền từ.', 'Cần vàng.', ['cave', 'time', 'o\'clock', 'gold'],
          ['river_cave', 'fish_rod', 'surv_letter']),
        S(6, 'Hoàng hôn: Vua Cá Hồi', 'Vua Cá ra khỏi hang: săn, cân, chụp ảnh, thả về sông.',
          ['Vua Cá cần 3 câu đúng liên tiếp, câu cuối khó nhất.', 'Cả lớp cổ vũ; MVP là người kéo được Vua Cá hoặc cá nặng nhất.'],
          HOOK, 'Danh hiệu "Người Gặp Vua Cá"; ảnh lưu vào sổ ông Chài Tư.', ['king', 'catch', 'photo', 'let go'],
          ['fish_king_salmon', 'fish_scale', 'hdri_sunset', 'anim_pull_fish', 'anim_cheer']),
        S(7, 'Chặng phụ: Con của Vua Cá', 'Kéo dài: đàn cá hồi nhỏ theo sau Vua Cá.',
          ['Bắt và thả đàn cá nhỏ.'], 'Sao đôi.', 'Sao đôi.', ['baby', 'family'],
          ['fish_rainbow_trout'], optional=True),
        S(8, 'Chặng phụ: Trang sổ mới', 'Viết trang sổ mới kể lại cuộc săn.',
          ['Trang sổ được ông Chài Tư dán vào sổ cũ.'], 'Câu viết, không tính thua.', 'Huy hiệu "Thợ Săn Truyền Thuyết".', ['finally', 'amazing', 'we'],
          ['surv_letter'], optional=True),
    ],
    class_plan=plan({'note': 'Ba khúc sông = ba khu; thuyền đi theo thứ tự, lớp đông thì xuất phát so le 30 giây.'}),
    characters=cast(sid, 0, [
        C('Ông Chài Tư', 'Giữ cuốn sổ Vua Cá 30 năm', 'elder', 'm', 'vn_traditional', 'brown', 'Áo bà ba bạc màu, nón lá', 'Người giao nhiệm vụ', 'npc', 'staff_cane', ['hat', 'beard', 'map_or_notebook'], covered=True),
        C('Bà Mũi Nhọn', 'Đối thủ tham lam nhưng cuối cùng biết sai', 'adult', 'f', 'casual', 'black', 'Áo khoác đen, khăn đỏ', 'Đối thủ', 'npc', None, ['earring']),
        C('Cô Hướng Dương', 'Nhiếp ảnh gia thiên nhiên', 'adult', 'f', 'explorer', 'yellow', 'Áo vàng, máy ảnh lớn', 'Người chụp ảnh Vua Cá', 'npc', None, ['camera', 'hat']),
        C('Nhân', 'Quyết tâm gặp Vua Cá', 'teen', 'm', 'life_jacket_sailing', 'red', 'Áo phao đỏ', 'Thuyền trưởng', 'anglers', None, []),
        C('Thảo Vy', 'Giải câu đố giờ giấc', 'teen', 'f', 'life_jacket_sailing', 'teal', 'Áo phao xanh ngọc', 'Thợ giải mã', 'anglers', None, ['glasses']),
        C('Kai', 'Bạn Hawaii, giỏi mồi ruồi', 'teen', 'm', 'life_jacket_sailing', 'orange', 'Áo phao cam', 'Thợ câu', 'anglers', None, ['necklace']),
        C('Bông Sen', 'Chèo nhanh nhất', 'child', 'f', 'life_jacket_sailing', 'pink', 'Áo phao hồng', 'Người chèo', 'anglers', None, ['headband']),
        C('Hậu', 'Cầm vợt to', 'child', 'm', 'life_jacket_sailing', 'green', 'Áo phao xanh lá', 'Người giữ vợt', 'anglers', 'swatter_net', []),
        C('Sara', 'Bạn Thụy Điển, ghi lại mọi manh mối', 'child', 'f', 'life_jacket_sailing', 'blue', 'Áo phao xanh', 'Người ghi chép', 'anglers', 'rolled_paper', ['freckles']),
        C('Ông Ba Lưới', 'Ngư dân làng chài, đổi mồi', 'elder', 'm', 'vn_traditional', 'navy', 'Áo bà ba xanh, lưới vắt vai', 'Người đổi mồi', 'npc', None, ['hat']),
        C('Tý', 'Cháu ông Chài Tư, thuộc đường sông', 'child', 'm', 'vn_traditional', 'yellow', 'Áo vàng, quần xắn', 'Bạn dẫn đường', 'npc', None, ['bag']),
        C('Vua Cá Hồi', 'Cá hồi hoàng gia khổng lồ, vảy ánh vàng', 'elder', 'n', 'casual', 'red', 'Vảy đỏ cam ánh vàng', 'Cá MVP huyền thoại', 'npc', None, []),
    ]),
))
