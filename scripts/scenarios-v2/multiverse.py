from common import C, S, cast

GAME = 'multiverse_portal'

HOOK = 'Câu hỏi hiện thành ấn phép trên lưỡi kiếm của Scarlet; trả lời đúng là một đòn chém (đúng nhanh = chí mạng), sai thì Boss phản đòn nhẹ. Boss yếu đi 50% thì vết nứt không gian mở sang thế giới mới.'


def plan(extra=None):
    p = {
        'sizes': {
            '1-5': 'Mỗi em một Scarlet riêng đánh Boss của mình (bài tập về nhà), hoặc cả nhóm chung một Boss.',
            '6-20': 'Tổ đội 4-5 người chung một Boss (Co-op Raid), Boss có máu theo số người.',
            '21-50': '10 tổ đội × 5 người, mỗi tổ đội một Boss riêng chạy song song; bảng xếp hạng tổ đội chung. Cuối trận, 10 tổ đội hợp sức đánh "Boss Hợp Thể" 2 phút.',
        },
        'roles': ['Kiếm sĩ (gây sát thương)', 'Pháp sư Khiên (đỡ đòn)', 'Thầy Thuốc (hồi máu)', 'Trinh sát Cổng (tìm điểm yếu)'],
        'scoring': 'Sát thương + chí mạng + chuỗi đúng. Máy chủ chấm đáp án và máu Boss.',
        'avatars': 'Học sinh điều khiển phiên bản Scarlet của riêng mình (màu áo choàng và vũ khí lấy từ hồ sơ diện mạo).',
        'style': 'Giữ phong cách giả tưởng cách điệu (không dùng gói sông).',
    }
    if extra:
        p.update(extra)
    return p


SCENARIOS = []

sid = 'mv-01'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=1,
    title='Lâu Đài Sương Mù',
    inspiration='File mục I.2 (nữ chiến binh 3D, diệt Boss mở cổng Stencil Portal); thế giới lâu đài sương mù đã có.',
    setting='Lâu đài gothic đổ nát trên đảo bay, sương tím phủ lối đá, cửa sổ kính màu vỡ, đèn ma trơi xanh. Tiếng chuông xa vọng lại.',
    story=('Chúa Tể Vết Nứt đã đánh cắp Cuốn Sách Ngôn Từ, khiến chữ nghĩa trong vương quốc bắt đầu biến mất. '
           'Nữ chiến binh Scarlet cùng các bạn lần theo hắn vào Lâu Đài Sương Mù. '
           'Mỗi đòn đánh trúng làm rơi một trang sách, và mỗi trang mang một từ được cứu lại. '
           'Khi Chúa Tể yếu đi, hắn xé rách không gian và bỏ chạy qua vết nứt sang một thế giới khác. '
           'Scarlet phải lấy lại đủ trang sách trước khi chuông lâu đài điểm 12 tiếng.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Cổng lâu đài', 'Vào lâu đài, gặp lính canh sương.', ['Lính canh làm bằng sương, tan khi trúng đòn.'], HOOK, 'Mở cổng.', ['castle', 'gate', 'fog'],
          ['mv_world_castle', 'mv_hero_scarlet']),
        S(2, 'Hành lang kính màu', 'Đánh bóng ma trên hành lang.', ['Mỗi trang sách rơi ra một từ.'], HOOK, 'Trang sách 1-3.', ['page', 'word', 'save'],
          ['mv_world_castle']),
        S(3, 'Chúa Tể xuất hiện', 'Đối đầu Chúa Tể Vết Nứt pha 1.', ['Thanh máu Boss lớn.'], HOOK, 'Chí mạng mở Kỹ năng.', ['boss', 'attack', 'shield'],
          ['mv_boss']),
        S(4, 'Pha 2: Cơn thịnh nộ', 'Boss dưới 50%: đổi dạng, đánh mạnh hơn.', ['Sai 3 câu liền: Boss nổi giận, gợi ý sâu hơn.'], HOOK, 'Kỹ năng Mắt Sự Thật.', ['angry', 'phase', 'strong'],
          ['mv_boss', 'fx_spark']),
        S(5, 'Vết nứt mở', 'Boss xé không gian bỏ chạy: Scarlet nhảy theo qua cổng.', ['Hiệu ứng cổng Stencil.'], HOOK, 'Thế giới mới hé lộ.', ['portal', 'jump', 'chase'],
          ['mv_world_cyberpunk']),
        S(6, 'Chuông 12 tiếng', 'Đánh bại Boss, lấy lại Cuốn Sách Ngôn Từ.', ['Chữ nghĩa trở lại vương quốc.'], HOOK, 'Danh hiệu "Người Giữ Sách".', ['victory', 'book', 'return'],
          ['mv_world_castle', 'anim_cheer']),
        S(7, 'Chặng phụ: Thư viện tầng hầm', 'Kéo dài: đánh lính sương trong thư viện.', ['Câu nhanh.'], 'Sao đôi.', 'Sao đôi.', ['library', 'shelf'],
          ['mv_world_castle'], optional=True),
        S(8, 'Chặng phụ: Viết lại trang sách', 'Viết lại một trang sách bằng câu của mình.', ['Trang sách in vào hồ sơ học viên.'], 'Câu viết, không tính thua.', 'Huy hiệu "Nhà Văn Lâu Đài".', ['once upon a time', 'hero'],
          ['mv_world_castle'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 4, [
        C('Scarlet', 'Nữ chiến binh cầm kiếm mảnh và chiến kỳ', 'teen', 'f', 'fantasy_scifi', 'red', 'Giáp đỏ, áo choàng dài', 'Nhân vật chính', 'heroes', 'toy_bow_sword', ['headband'], hair=('ponytail', 'long'), hair_color='red', dyed=True),
        C('Chúa Tể Vết Nứt', 'Kẻ xé không gian, mũ sừng mắt tím', 'adult', 'm', 'fantasy_scifi', 'purple', 'Giáp đen viền tím', 'Boss', 'npc', 'staff_cane', ['cybernetic'], covered=True),
        C('Pháp Sư Lam', 'Bậc thầy khiên phép', 'elder', 'f', 'fantasy_scifi', 'blue', 'Áo choàng xanh sao bạc', 'Người hướng dẫn', 'npc', 'staff_cane', ['necklace']),
        C('Kỵ Sĩ Thép', 'Bạn đồng hành mạnh mẽ', 'adult', 'm', 'fantasy_scifi', 'silver', 'Giáp bạc', 'Đồng đội', 'heroes', 'shield', []),
        C('Tiểu Tiên Mây', 'Bay quanh nhắc gợi ý', 'child', 'f', 'fantasy_scifi', 'pink', 'Cánh hồng trong suốt', 'Trợ lý gợi ý', 'npc', None, ['flower']),
        C('Thầy Thuốc Lục', 'Hồi máu cho tổ đội', 'adult', 'f', 'fantasy_scifi', 'green', 'Áo choàng xanh lá', 'Thầy thuốc', 'heroes', None, ['bag']),
        C('Trinh Sát Bóng', 'Tìm điểm yếu của Boss', 'teen', 'm', 'fantasy_scifi', 'black', 'Áo choàng đen mũ trùm', 'Trinh sát', 'heroes', None, ['map_or_notebook'], covered=True),
        C('Lính Sương', 'Lính canh làm bằng sương', 'adult', 'n', 'fantasy_scifi', 'gray', 'Thân sương xám', 'Quái nhỏ', 'npc', None, []),
        C('Vua Áo Trắng', 'Vua của vương quốc mất chữ', 'elder', 'm', 'fantasy_scifi', 'white', 'Áo bào trắng, vương miện', 'Người giao nhiệm vụ', 'npc', None, ['beard']),
        C('Công Chúa Ngôn', 'Giữ cuốn sách trước khi bị trộm', 'teen', 'f', 'fantasy_scifi', 'yellow', 'Váy vàng thêu chữ', 'Nhân vật cần giúp', 'npc', None, ['necklace']),
        C('Quạ Tím', 'Gián điệp của Chúa Tể', 'child', 'n', 'fantasy_scifi', 'purple', 'Lông tím', 'Quái nhỏ', 'npc', None, ['pet_or_toy']),
        C('Rồng Con Bông', 'Rồng nhỏ của Scarlet, phun lửa khi chí mạng', 'child', 'n', 'fantasy_scifi', 'orange', 'Vảy cam', 'Linh thú', 'heroes', None, ['pet_or_toy']),
    ]),
))

sid = 'mv-02'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=2,
    title='Thành Phố Neon Đêm Mưa',
    inspiration='Thế giới cyberpunk neon đã có trong manifest; cổng không gian.',
    setting='Thành phố tương lai đêm mưa, bảng neon hồng xanh, xe bay, mái nhà ướt phản chiếu ánh đèn. Tiếng mưa và nhạc điện tử xa.',
    story=('Chạy qua vết nứt, Chúa Tể Vết Nứt trốn vào Thành Phố Neon và chiếm tháp truyền tin. '
           'Hắn đổi chữ trên mọi bảng hiệu thành mật mã, làm người dân lạc đường. '
           'Scarlet và tổ đội phải nhảy qua mái nhà, sửa bảng hiệu bằng câu trả lời đúng và leo lên tháp. '
           'Trên đỉnh tháp, Chúa Tể triệu hồi robot bảo vệ, rồi lại xé không gian định trốn sang sa mạc. '
           'Lần này Scarlet có Kỹ năng Khóa Cổng, nếu chuỗi đúng đủ dài.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Hẻm neon', 'Đáp xuống hẻm neon, sửa bảng hiệu đầu tiên.', ['Bảng hiệu sáng đúng chữ.'], HOOK, 'Bản đồ thành phố.', ['city', 'sign', 'neon'],
          ['mv_world_cyberpunk', 'mv_hero_scarlet']),
        S(2, 'Mái nhà mưa', 'Nhảy qua mái nhà, tránh drone.', ['Drone soi đèn đỏ.'], HOOK, 'Giày phản lực.', ['jump', 'roof', 'rain'],
          ['mv_world_cyberpunk']),
        S(3, 'Robot bảo vệ', 'Đánh robot bảo vệ tháp.', ['Robot có khiên năng lượng.'], HOOK, 'Phá khiên.', ['robot', 'shield', 'break'],
          ['mv_boss']),
        S(4, 'Đỉnh tháp', 'Đối đầu Chúa Tể pha 1.', ['Mưa tạo sấm khi chí mạng.'], HOOK, 'Chí mạng sấm.', ['tower', 'top', 'thunder'],
          ['mv_boss', 'fx_spark']),
        S(5, 'Pha 2 và Khóa Cổng', 'Boss dưới 50% mở cổng; chuỗi 5 câu đúng khóa cổng 20 giây.', ['Khóa thành công = sát thương gấp đôi.'], HOOK, 'Kỹ năng Khóa Cổng.', ['lock', 'chain', 'combo'],
          ['mv_boss', 'mv_world_desert']),
        S(6, 'Thành phố sáng lại', 'Đánh bại Chúa Tể, mọi bảng hiệu sáng đúng chữ.', ['Pháo hoa neon.'], HOOK, 'Danh hiệu "Anh Hùng Neon".', ['light', 'city', 'saved'],
          ['mv_world_cyberpunk', 'anim_cheer']),
        S(7, 'Chặng phụ: Đường đua xe bay', 'Kéo dài: đuổi Quạ Tím bằng xe bay.', ['Câu nhanh.'], 'Sao đôi.', 'Sao đôi.', ['fly', 'chase'],
          ['mv_world_cyberpunk'], optional=True),
        S(8, 'Chặng phụ: Bảng hiệu của em', 'Thiết kế một bảng hiệu tiếng Anh cho thành phố.', ['Bảng hiệu treo trong game.'], 'Câu viết, không tính thua.', 'Huy hiệu "Nhà Thiết Kế Neon".', ['open', 'welcome', 'shop'],
          ['mv_world_cyberpunk'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 8, [
        C('Scarlet', 'Nữ chiến binh, nay có giày phản lực', 'teen', 'f', 'fantasy_scifi', 'red', 'Giáp đỏ viền neon', 'Nhân vật chính', 'heroes', 'toy_bow_sword', ['headband'], hair=('ponytail', 'long'), hair_color='red', dyed=True),
        C('Chúa Tể Vết Nứt', 'Chiếm tháp truyền tin', 'adult', 'm', 'fantasy_scifi', 'purple', 'Giáp đen neon tím', 'Boss', 'npc', 'staff_cane', ['cybernetic'], covered=True),
        C('Hacker Bit', 'Cô bạn hacker giúp giải mật mã bảng hiệu', 'teen', 'f', 'fantasy_scifi', 'teal', 'Áo khoác xanh ngọc phát sáng', 'Người hướng dẫn', 'npc', 'detector_scanner', ['glasses', 'cybernetic'], hair_color='teal', dyed=True),
        C('Robot Gác Cổng X-9', 'Robot bảo vệ tháp', 'adult', 'n', 'fantasy_scifi', 'silver', 'Thân kim loại', 'Quái lớn', 'npc', 'shield', ['cybernetic']),
        C('Taxi Bay Kim', 'Tài xế xe bay vui tính', 'adult', 'm', 'casual', 'yellow', 'Áo khoác vàng', 'Người chở tổ đội', 'npc', None, ['glasses']),
        C('Kỵ Sĩ Thép', 'Đồng đội', 'adult', 'm', 'fantasy_scifi', 'silver', 'Giáp bạc', 'Đồng đội', 'heroes', 'shield', []),
        C('Thầy Thuốc Lục', 'Hồi máu', 'adult', 'f', 'fantasy_scifi', 'green', 'Áo choàng xanh lá', 'Thầy thuốc', 'heroes', None, ['bag']),
        C('Trinh Sát Bóng', 'Tìm điểm yếu', 'teen', 'm', 'fantasy_scifi', 'black', 'Áo đen', 'Trinh sát', 'heroes', None, [], covered=True),
        C('Bà Bán Mì', 'Bà cụ bán mì đêm, cho tổ đội ăn hồi sức', 'elder', 'f', 'casual', 'red', 'Tạp dề đỏ', 'Người giúp đỡ', 'npc', 'ladle', ['glasses']),
        C('Drone Đỏ', 'Drone tuần tra', 'adult', 'n', 'fantasy_scifi', 'red', 'Đèn đỏ', 'Quái nhỏ', 'npc', None, ['cybernetic']),
        C('Cậu Bé Neon', 'Bị lạc vì bảng hiệu sai', 'child', 'm', 'casual', 'blue', 'Áo mưa xanh', 'Nhân vật cần giúp', 'npc', None, ['pet_or_toy']),
        C('Rồng Con Bông', 'Linh thú của Scarlet', 'child', 'n', 'fantasy_scifi', 'orange', 'Vảy cam', 'Linh thú', 'heroes', None, ['pet_or_toy']),
    ]),
))

sid = 'mv-03'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=3,
    title='Tàn Tích Sa Mạc Cát Vàng',
    inspiration='Thế giới sa mạc tàn tích trong manifest; cổng không gian.',
    setting='Sa mạc cát vàng, kim tự tháp đổ nát, tượng đá khổng lồ vùi nửa người trong cát, ốc đảo xanh xa xa. Nắng gắt, bão cát nổi lên từng đợt.',
    story=('Vết nứt cuối cùng đưa Chúa Tể Vết Nứt đến Tàn Tích Sa Mạc, nơi chôn Đá Ngữ Pháp cổ. '
           'Nếu hắn chạm được viên đá, mọi câu văn trong đa vũ trụ sẽ đảo lộn trật tự. '
           'Scarlet phải vượt bão cát, giải câu đố trên các bức tượng đá để mở cửa kim tự tháp trước hắn. '
           'Trong lòng kim tự tháp, những bậc thang chỉ hiện ra khi câu được sắp xếp đúng trật tự. '
           'Trận cuối diễn ra quanh Đá Ngữ Pháp, mỗi đòn đúng làm viên đá sáng lên che chở Scarlet.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Bão cát', 'Vượt bão cát đến tàn tích.', ['Cát che tầm nhìn, câu đúng soi đường.'], HOOK, 'Khăn che cát.', ['desert', 'sand', 'storm'],
          ['mv_world_desert', 'mv_hero_scarlet']),
        S(2, 'Tượng đá', 'Giải câu đố trên tượng đá.', ['Tượng mở mắt khi trả lời đúng.'], 'Câu đố khắc trên tượng; đúng = tượng nhường đường.', 'Chìa khóa kim tự tháp.', ['statue', 'riddle', 'ancient'],
          ['mv_world_desert']),
        S(3, 'Bậc thang trật tự', 'Sắp xếp câu đúng để bậc thang hiện ra.', ['Hợp câu sắp xếp (reorder).'], 'Mỗi câu xếp đúng hiện một bậc thang.', 'Lên tầng trên.', ['order', 'stairs', 'climb'],
          ['mv_world_desert']),
        S(4, 'Chúa Tể pha 1', 'Đối đầu Chúa Tể quanh Đá Ngữ Pháp.', ['Đá sáng lên theo đòn đúng.'], HOOK, 'Khiên Đá Ngữ Pháp.', ['grammar', 'stone', 'glow'],
          ['mv_boss']),
        S(5, 'Pha 2: Bọ cạp cát', 'Boss triệu hồi bọ cạp cát khổng lồ.', ['Bọ cạp chặn đòn; trinh sát tìm điểm yếu.'], HOOK, 'Chí mạng điểm yếu.', ['scorpion', 'weak point'],
          ['mv_boss', 'fx_spark']),
        S(6, 'Ốc đảo', 'Đánh bại Boss, đem Đá Ngữ Pháp về ốc đảo an toàn.', ['Cát lặng, ốc đảo nở hoa.'], HOOK, 'Danh hiệu "Người Giữ Đá Ngữ Pháp".', ['oasis', 'peace', 'win'],
          ['mv_world_desert', 'anim_cheer']),
        S(7, 'Chặng phụ: Lạc đà', 'Kéo dài: cưỡi lạc đà đuổi Quạ Tím.', ['Câu nhanh.'], 'Sao đôi.', 'Sao đôi.', ['camel', 'ride'],
          ['mv_world_desert'], optional=True),
        S(8, 'Chặng phụ: Bia đá mới', 'Khắc một câu đúng ngữ pháp lên bia đá.', ['Bia đá đặt ở ốc đảo.'], 'Câu viết, không tính thua.', 'Huy hiệu "Nhà Khảo Cổ Nhí".', ['carve', 'sentence'],
          ['mv_world_desert'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 10, [
        C('Scarlet', 'Nữ chiến binh, đội khăn che cát', 'teen', 'f', 'fantasy_scifi', 'red', 'Giáp đỏ, khăn cát', 'Nhân vật chính', 'heroes', 'toy_bow_sword', ['headband'], hair=('ponytail', 'long'), hair_color='red', dyed=True),
        C('Chúa Tể Vết Nứt', 'Muốn chiếm Đá Ngữ Pháp', 'adult', 'm', 'fantasy_scifi', 'purple', 'Giáp đen phủ cát', 'Boss', 'npc', 'staff_cane', ['cybernetic'], covered=True),
        C('Nhà Khảo Cổ Amir', 'Biết đọc chữ khắc cổ', 'adult', 'm', 'explorer', 'khaki', 'Áo kaki, mũ cói', 'Người hướng dẫn', 'npc', 'rolled_paper', ['hat', 'glasses', 'map_or_notebook']),
        C('Bọ Cạp Cát', 'Quái khổng lồ do Boss triệu hồi', 'adult', 'n', 'fantasy_scifi', 'yellow', 'Vỏ vàng cát', 'Quái lớn', 'npc', None, []),
        C('Tượng Đá Nhân Sư', 'Ra câu đố chặn đường', 'elder', 'n', 'fantasy_scifi', 'brown', 'Đá nâu', 'Người gác', 'npc', None, []),
        C('Kỵ Sĩ Thép', 'Đồng đội', 'adult', 'm', 'fantasy_scifi', 'silver', 'Giáp bạc', 'Đồng đội', 'heroes', 'shield', []),
        C('Thầy Thuốc Lục', 'Hồi máu', 'adult', 'f', 'fantasy_scifi', 'green', 'Áo choàng xanh lá', 'Thầy thuốc', 'heroes', None, ['bag']),
        C('Trinh Sát Bóng', 'Tìm điểm yếu bọ cạp', 'teen', 'm', 'fantasy_scifi', 'black', 'Áo đen', 'Trinh sát', 'heroes', None, [], covered=True),
        C('Cô Bé Ốc Đảo', 'Dẫn đường tới ốc đảo', 'child', 'f', 'regional_traditional', 'teal', 'Áo dài xanh ngọc, khăn đội', 'Bạn dẫn đường', 'npc', None, ['bracelet'], covered=True),
        C('Thương Nhân Lạc Đà', 'Bán nước và khăn che cát', 'elder', 'm', 'regional_traditional', 'white', 'Áo choàng trắng', 'Người giúp đỡ', 'npc', None, ['beard']),
        C('Quạ Tím', 'Gián điệp của Boss', 'child', 'n', 'fantasy_scifi', 'purple', 'Lông tím', 'Quái nhỏ', 'npc', None, ['pet_or_toy']),
        C('Rồng Con Bông', 'Linh thú của Scarlet', 'child', 'n', 'fantasy_scifi', 'orange', 'Vảy cam', 'Linh thú', 'heroes', None, ['pet_or_toy']),
    ]),
))

sid = 'mv-04'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=4,
    title='Cổng Vỡ Đuổi Bắt',
    inspiration='Cổng Stencil xé không gian; chuyển cảnh mượt giữa lâu đài và thành phố neon.',
    setting='Không gian nứt vỡ: một nửa là lâu đài sương mù, một nửa là thành phố neon, các mảnh thế giới trôi lơ lửng nối nhau bằng cầu ánh sáng.',
    story=('Chúa Tể Vết Nứt học được cách mở nhiều cổng cùng lúc, và hai thế giới lâu đài và thành phố neon bắt đầu va vào nhau. '
           'Scarlet phải đuổi theo hắn qua những mảnh thế giới trôi nổi, mỗi lần nhảy cổng là sang một thế giới khác. '
           'Cổng chỉ đứng yên khi tổ đội trả lời đúng, sai thì cổng rung và đổi chỗ. '
           'Giữa đường, Quạ Tím bày bẫy cổng giả dẫn sang chỗ không lối thoát. '
           'Đóng được cổng cuối, hai thế giới sẽ tách ra và Chúa Tể bị kẹt giữa.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Mảnh lâu đài', 'Bắt đầu ở mảnh lâu đài trôi nổi.', ['Cầu ánh sáng hiện theo câu đúng.'], HOOK, 'Cầu ánh sáng.', ['bridge', 'float', 'light'],
          ['mv_world_castle']),
        S(2, 'Nhảy cổng 1', 'Nhảy sang mảnh thành phố neon.', ['Cổng đứng yên khi đúng.'], 'Câu hỏi trên khung cổng.', 'Sang thế giới mới.', ['portal', 'switch', 'world'],
          ['mv_world_cyberpunk']),
        S(3, 'Cổng giả của Quạ Tím', 'Phân biệt cổng thật và cổng giả.', ['Câu đúng soi ra cổng giả.'], 'Câu trắc nghiệm: chọn cổng thật.', 'Tránh bẫy.', ['true', 'false', 'trap'],
          ['mv_world_castle', 'mv_world_cyberpunk']),
        S(4, 'Chúa Tể giữa hai thế giới', 'Đánh Boss pha 1 trên mảnh vỡ.', ['Mảnh vỡ nghiêng khi Boss tấn công.'], HOOK, 'Chí mạng.', ['boss', 'balance'],
          ['mv_boss']),
        S(5, 'Pha 2: Bão cổng', 'Boss mở hàng loạt cổng nhỏ bắn phép.', ['Pháp sư Khiên đỡ đòn khi đúng.'], HOOK, 'Khiên cổng.', ['shield', 'many', 'dodge'],
          ['mv_boss', 'fx_spark']),
        S(6, 'Đóng cổng cuối', 'Đánh bại Boss, đóng cổng, hai thế giới tách ra.', ['Hiệu ứng hai thế giới trượt về chỗ cũ.'], HOOK, 'Danh hiệu "Người Đóng Cổng".', ['close', 'separate', 'safe'],
          ['mv_world_castle', 'mv_world_cyberpunk', 'anim_cheer']),
        S(7, 'Chặng phụ: Mảnh vỡ lạc', 'Kéo dài: nhặt mảnh vỡ còn sót.', ['Câu nhanh.'], 'Sao đôi.', 'Sao đôi.', ['piece', 'collect'],
          ['mv_world_castle'], optional=True),
        S(8, 'Chặng phụ: Nhật ký cổng', 'Ghi lại các thế giới đã đi qua.', ['Nhật ký lưu vào hồ sơ.'], 'Câu viết, không tính thua.', 'Huy hiệu "Lữ Khách Đa Vũ Trụ".', ['visited', 'saw', 'met'],
          ['mv_world_cyberpunk'], optional=True),
    ],
    class_plan=plan(),
    characters=cast(sid, 2, [
        C('Scarlet', 'Nữ chiến binh', 'teen', 'f', 'fantasy_scifi', 'red', 'Giáp đỏ', 'Nhân vật chính', 'heroes', 'toy_bow_sword', ['headband'], hair=('ponytail', 'long'), hair_color='red', dyed=True),
        C('Chúa Tể Vết Nứt', 'Mở nhiều cổng cùng lúc', 'adult', 'm', 'fantasy_scifi', 'purple', 'Giáp đen nứt sáng', 'Boss', 'npc', 'staff_cane', ['cybernetic'], covered=True),
        C('Pháp Sư Lam', 'Giữ khiên cổng', 'elder', 'f', 'fantasy_scifi', 'blue', 'Áo choàng xanh', 'Người hướng dẫn', 'npc', 'staff_cane', ['necklace']),
        C('Hacker Bit', 'Dò cổng giả', 'teen', 'f', 'fantasy_scifi', 'teal', 'Áo khoác phát sáng', 'Người hỗ trợ', 'npc', 'detector_scanner', ['glasses', 'cybernetic'], hair_color='teal', dyed=True),
        C('Quạ Tím', 'Bày bẫy cổng giả', 'child', 'n', 'fantasy_scifi', 'purple', 'Lông tím', 'Quái nhỏ', 'npc', None, ['pet_or_toy']),
        C('Kỵ Sĩ Thép', 'Đồng đội', 'adult', 'm', 'fantasy_scifi', 'silver', 'Giáp bạc', 'Đồng đội', 'heroes', 'shield', []),
        C('Thầy Thuốc Lục', 'Hồi máu', 'adult', 'f', 'fantasy_scifi', 'green', 'Áo choàng xanh lá', 'Thầy thuốc', 'heroes', None, ['bag']),
        C('Trinh Sát Bóng', 'Tìm điểm yếu', 'teen', 'm', 'fantasy_scifi', 'black', 'Áo đen', 'Trinh sát', 'heroes', None, [], covered=True),
        C('Lính Sương', 'Quái nhỏ lâu đài', 'adult', 'n', 'fantasy_scifi', 'gray', 'Thân sương', 'Quái nhỏ', 'npc', None, []),
        C('Drone Đỏ', 'Quái nhỏ thành phố', 'adult', 'n', 'fantasy_scifi', 'red', 'Đèn đỏ', 'Quái nhỏ', 'npc', None, ['cybernetic']),
        C('Tiểu Tiên Mây', 'Nhắc gợi ý', 'child', 'f', 'fantasy_scifi', 'pink', 'Cánh hồng', 'Trợ lý gợi ý', 'npc', None, ['flower']),
        C('Rồng Con Bông', 'Linh thú của Scarlet', 'child', 'n', 'fantasy_scifi', 'orange', 'Vảy cam', 'Linh thú', 'heroes', None, ['pet_or_toy']),
    ]),
))

sid = 'mv-05'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=5,
    title='Trận Chung Kết Đa Vũ Trụ',
    inspiration='Tổng hợp 3 thế giới; trận cuối nhiều pha, cả lớp hợp sức.',
    setting='Trái tim đa vũ trụ: một vòng cung khổng lồ nối ba cổng lâu đài, thành phố neon và sa mạc, bầu trời đầy sao và mảnh thế giới xoay quanh.',
    story=('Chúa Tể Vết Nứt hợp nhất sức mạnh của cả ba thế giới thành Chúa Tể Hợp Thể, đứng ở trái tim đa vũ trụ. '
           'Scarlet và mọi tổ đội từng chiến đấu được triệu tập cho trận chung kết. '
           'Mỗi pha của Boss mang sức mạnh một thế giới: sương mù lâu đài, sấm neon, bão cát. '
           'Chỉ khi cả lớp cùng góp câu trả lời đúng, ba cổng mới đóng dần và Boss mất sức mạnh. '
           'Chiến thắng sẽ trả lại hòa bình cho đa vũ trụ và trao cho Scarlet danh hiệu Người Giữ Cổng.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        S(1, 'Triệu tập', 'Các tổ đội tập hợp ở trái tim đa vũ trụ.', ['Mỗi tổ đội nhận cờ màu.'], HOOK, 'Buff tổ đội.', ['gather', 'team', 'final'],
          ['mv_hero_scarlet', 'mv_world_castle', 'mv_world_cyberpunk', 'mv_world_desert']),
        S(2, 'Pha sương mù', 'Boss dùng sức mạnh lâu đài.', ['Sương che bớt đáp án (Mắt Sự Thật giúp).'], HOOK, 'Đóng cổng lâu đài.', ['fog', 'see', 'truth'],
          ['mv_boss', 'mv_world_castle']),
        S(3, 'Pha sấm neon', 'Boss dùng sức mạnh thành phố.', ['Sấm đánh khi sai.'], HOOK, 'Đóng cổng thành phố.', ['thunder', 'fast', 'react'],
          ['mv_boss', 'mv_world_cyberpunk']),
        S(4, 'Pha bão cát', 'Boss dùng sức mạnh sa mạc.', ['Câu sắp xếp làm cát lắng.'], HOOK, 'Đóng cổng sa mạc.', ['sand', 'order', 'calm'],
          ['mv_boss', 'mv_world_desert']),
        S(5, 'Boss Hợp Thể', 'Cả lớp hợp sức đánh Boss Hợp Thể (thanh máu chung).', ['Mọi tổ đội cùng một thanh máu Boss.'], HOOK, 'Tuyệt kỹ đồng đội.', ['together', 'ultimate', 'all'],
          ['mv_boss', 'fx_spark']),
        S(6, 'Hòa bình đa vũ trụ', 'Đánh bại Boss, trao danh hiệu.', ['Ba thế giới sáng rực.', 'MVP: sát thương cao nhất.'], HOOK, 'Danh hiệu "Người Giữ Cổng".', ['peace', 'hero', 'forever'],
          ['mv_world_castle', 'anim_cheer']),
        S(7, 'Chặng phụ: Boss phụ Quạ Tím', 'Kéo dài: Quạ Tím biến thành chim khổng lồ.', ['Câu nhanh.'], 'Sao đôi.', 'Sao đôi.', ['giant', 'bird'],
          ['mv_boss'], optional=True),
        S(8, 'Chặng phụ: Lời thề Người Giữ Cổng', 'Viết lời thề bảo vệ ngôn từ.', ['Lời thề khắc vào vòng cung.'], 'Câu viết, không tính thua.', 'Huy hiệu "Huyền Thoại Đa Vũ Trụ".', ['promise', 'protect', 'always'],
          ['mv_world_castle'], optional=True),
    ],
    class_plan=plan({'note': 'Pha 5 dùng thanh máu chung cho cả lớp (mọi tổ đội), các pha khác mỗi tổ đội một Boss.'}),
    characters=cast(sid, 6, [
        C('Scarlet', 'Nữ chiến binh, trận chung kết', 'teen', 'f', 'fantasy_scifi', 'red', 'Giáp đỏ vàng', 'Nhân vật chính', 'heroes', 'toy_bow_sword', ['headband'], hair=('ponytail', 'long'), hair_color='red', dyed=True),
        C('Chúa Tể Hợp Thể', 'Hợp nhất sức mạnh ba thế giới', 'adult', 'm', 'fantasy_scifi', 'purple', 'Giáp ba màu', 'Boss cuối', 'npc', 'staff_cane', ['cybernetic'], covered=True),
        C('Pháp Sư Lam', 'Lâu đài', 'elder', 'f', 'fantasy_scifi', 'blue', 'Áo choàng xanh', 'Người hướng dẫn', 'npc', 'staff_cane', ['necklace']),
        C('Hacker Bit', 'Thành phố neon', 'teen', 'f', 'fantasy_scifi', 'teal', 'Áo khoác phát sáng', 'Người hỗ trợ', 'npc', 'detector_scanner', ['glasses', 'cybernetic'], hair_color='teal', dyed=True),
        C('Nhà Khảo Cổ Amir', 'Sa mạc', 'adult', 'm', 'explorer', 'khaki', 'Áo kaki', 'Người hỗ trợ', 'npc', 'rolled_paper', ['hat', 'glasses']),
        C('Kỵ Sĩ Thép', 'Đồng đội', 'adult', 'm', 'fantasy_scifi', 'silver', 'Giáp bạc', 'Đồng đội', 'heroes', 'shield', []),
        C('Thầy Thuốc Lục', 'Hồi máu', 'adult', 'f', 'fantasy_scifi', 'green', 'Áo choàng xanh lá', 'Thầy thuốc', 'heroes', None, ['bag']),
        C('Trinh Sát Bóng', 'Tìm điểm yếu', 'teen', 'm', 'fantasy_scifi', 'black', 'Áo đen', 'Trinh sát', 'heroes', None, [], covered=True),
        C('Vua Áo Trắng', 'Trao danh hiệu', 'elder', 'm', 'fantasy_scifi', 'white', 'Áo bào trắng', 'Người trao thưởng', 'npc', None, ['beard']),
        C('Công Chúa Ngôn', 'Giữ Cuốn Sách Ngôn Từ', 'teen', 'f', 'fantasy_scifi', 'yellow', 'Váy vàng', 'Đồng minh', 'npc', None, ['necklace']),
        C('Quạ Tím', 'Boss phụ', 'child', 'n', 'fantasy_scifi', 'purple', 'Lông tím', 'Quái', 'npc', None, ['pet_or_toy']),
        C('Rồng Con Bông', 'Đã lớn hơn, phun lửa tuyệt kỹ', 'child', 'n', 'fantasy_scifi', 'orange', 'Vảy cam vàng', 'Linh thú', 'heroes', None, ['pet_or_toy']),
    ]),
))
