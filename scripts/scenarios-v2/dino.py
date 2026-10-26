"""Game 6: Hành trình khủng long (dino_journey) - 5 chapters of one saga (plan 2026-10-26).

Same structure as the other five games: 5 scenarios, each 6 core stages x 5 min + 2 optional stages,
12 story characters, a class plan for 1-50 students, a question hook, scenario tags for runEvents.
Extra for this game: every stage carries `subtitles` (Vietnamese -> English by level, see sub()).

Story arc: 1 hatching and first steps (Intro) -> 2 hunting lessons -> 3 the long walk to the lake ->
4 storm night -> 5 the old father is bullied, the cub stands up and rescues him (End).

Characters are dinosaurs and animals. The human-appearance columns of scenario_characters are kept
valid but inert; the 3D model of each character is written at the start of clothing_text as [asset_id].
"""
import re
from common import C, S, cast

GAME = 'dino_journey'

HOOK = ('Chạm vào vật thể đang phát sáng trên đồng cỏ (dấu chân, vũng nước, bụi cỏ, quả trứng...) để mở câu hỏi nhỏ ngay cạnh nó; '
        'đúng thì khủng long con làm được việc đó (ngửi, vồ, uống, trốn, gầm), sai thì cha nhắc lại sau 5 giây, không trừ điểm nặng.')

SPECIES = {
    'trex': 'dino_trex_brown', 'raptor': 'dino_raptor_rider', 'triceratops': 'dino_triceratops',
    'stegosaurus': 'dino_stegosaurus', 'diplodocus': 'dino_diplodocus', 'sauropod': 'dino_sauropod_grey',
}

_TERM = re.compile(r'\{([^|{}]+)\|([^|{}]+)\|([0-5])\}')


def sub(markup, en):
    """One subtitle line. markup: Vietnamese with {english|tiếng Việt|band} terms, band 0..5.
    Rule (level L = 0 Beginner .. 5 C1): L == 5 shows `en` in full; otherwise a term shows English iff band < L,
    every other word stays Vietnamese. So Beginner is all Vietnamese, A1 shows only band-0 words in English, etc."""
    parts, pos = [], 0
    for m in _TERM.finditer(markup):
        if m.start() > pos:
            parts.append(markup[pos:m.start()])
        parts.append([m.group(1), m.group(2), int(m.group(3))])
        pos = m.end()
    if pos < len(markup):
        parts.append(markup[pos:])
    vi = ''.join(p if isinstance(p, str) else p[1] for p in parts)
    assert any(not isinstance(p, str) for p in parts), markup
    return {'en': en, 'vi': vi, 'parts': parts}


def ST(n, title, goal, beats, hook, reward, vocab, assets, lines, optional=False):
    st = S(n, title, goal, beats, hook, reward, vocab, assets, optional=optional)
    st['subtitles'] = lines
    return st


def plan(extra=None):
    p = {
        'sizes': {
            '1-5': 'Chơi một mình: em đóng chính chú khủng long con Mốc (tự đặt tên, chọn loài và màu); cha Gruk và cả bầy do máy điều khiển. '
                   'Có 2-5 bạn thì mỗi bạn là một khủng long con trong bầy của em.',
            '6-20': 'Mỗi em là một khủng long con trong bầy: chọn loài và màu. Bầy chia 3-4 nhóm (4-5 em/nhóm), mỗi nhóm đi sau một khủng long lớn do máy dẫn đường; '
                    'nhóm trả lời đúng nhiều thì cả bầy đi nhanh hơn và chọn được lối tắt.',
            '21-50': 'Bầy lớn: 8-10 nhóm 5 em cùng đi trên một đường mòn nhưng chia 2 bãi cỏ cạnh nhau để không đông; thanh "Dũng cảm cả bầy" dùng chung. '
                     'Mỗi máy chỉ vẽ 8 khủng long gần nhất và tên bạn trong nhóm để máy yếu vẫn mượt.',
        },
        'roles': ['Khủng long con đi đầu (đọc dấu chân)', 'Người canh gió (báo nguy hiểm)', 'Người tìm nước',
                  'Người giữ trứng và tổ', 'Chim đưa tin của bầy (báo tin cho cả nhóm)'],
        'scoring': 'Mỗi việc đúng = 1-3 sao theo độ chính xác và tốc độ. Thanh "Dũng cảm cả bầy" là thanh Boss chung: cả lớp cùng lấp đầy; '
                   'nhóm nhiều sao nhất được cha khen và đi đầu đàn ở chặng sau.',
        'avatars': 'Chế độ một mình: nhân vật là chú khủng long con Mốc. Chế độ lớp: mỗi học sinh một khủng long con, chọn loài '
                   '(T-rex, Raptor, Triceratops, Stegosaurus, Diplodocus, Sauropod) và màu; trùng loài được, khác màu. '
                   '12 nhân vật dưới đây là cha, người lớn, bạn nhỏ và muông thú trong câu chuyện.',
        'species': SPECIES,
        'safety': 'Không máu, không cảnh đau. Cảnh bắt nạt chỉ là xô đẩy, gầm gừ và chặn đường; ai "ngã" chỉ ngồi xuống, đứng dậy được. '
                  'Săn mồi dùng hoạt ảnh vồ mồi rồi cắt cảnh; thú nhỏ luôn chạy thoát hoặc "ngủ" một lát, không bị làm hại.',
        'subtitle_rule': 'Mức Beginner: toàn tiếng Việt. Mức A1 đến B2: từ có bậc thấp hơn mức đang chọn hiện tiếng Anh, từ còn lại tiếng Việt. Mức C1: toàn tiếng Anh.',
    }
    if extra:
        p.update(extra)
    return p


def D(name, feature, age, gender, color, model, look, role, team='npc', acc=(), hair=None):
    return C(name, feature, age, gender, 'casual', color, f'[{model}] {look}', role, team, None, list(acc),
             hair=hair or ('messy', 'short'))


# the six characters every chapter shares
def core(father_age='adult', father_feature='Cha của Mốc, săn giỏi, ít nói, luôn đi trước chắn gió'):
    return [
        D('Mốc', 'Khủng long con tò mò, nhân vật chính (khi chơi một mình)', 'child', 'm', 'orange', 'dino_trex_brown',
          'Khủng long con nhỏ, da nâu cam, bụng sáng, vết sọc trên đuôi', 'Khủng long con, người kể chuyện', 'heroes', ['flower']),
        D('Bố Gruk', father_feature, father_age, 'm', 'brown', 'dino_trex_brown',
          'T-rex trưởng thành da nâu sẫm, sẹo nhỏ trên mõm' + (', bước chậm, lưng còng hơn' if father_age == 'elder' else ''),
          'Cha, người dạy Mốc', 'npc', ['bandage'] if father_age == 'elder' else []),
        D('Cô Đuôi Dài', 'Khủng long cổ dài hiền, trông cả bầy nhỏ', 'adult', 'f', 'green', 'dino_diplodocus',
          'Diplodocus xanh lá, đốm nâu dọc cổ', 'Cô giáo của bầy', 'npc'),
        D('Ông Cổ Dài', 'Cụ già của bầy, nhớ mọi đường nước', 'elder', 'm', 'gray', 'dino_sauropod_grey',
          'Sauropod xám, da nhăn như đá', 'Người kể truyện xưa, chỉ đường nước', 'npc', ['necklace']),
        D('Tia Chớp', 'Raptor đeo túi, đưa tin nhanh nhất bầy', 'teen', 'f', 'yellow', 'dino_raptor_rider',
          'Raptor nâu nhạt, yên và túi vải nhỏ trên lưng', 'Chim đưa tin của bầy', 'heroes', ['bag']),
        D('Lông Xù', 'Sói xám lang thang, hay đi nhặt thức ăn thừa', 'adult', 'm', 'gray', 'dino_wolf_a',
          'Sói xám lông rối, mắt vàng', 'Kẻ nhặt xác, canh me', 'npc'),
    ]


def cast12(sid, offset, extra6, father_age='adult', father_feature=None):
    c = core(father_age, father_feature) if father_feature else core(father_age)
    assert len(extra6) == 6, sid
    return cast(sid, offset, c + extra6)


SCENARIOS = []

# ---------------------------------------------------------------- 1 Intro
sid = 'dino-01'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=1,
    title='Quả Trứng Trên Đồng Cỏ',
    inspiration='Mở đầu saga: khủng long con nở ra, tập đi, học nhận biết đồng cỏ cùng cha (phim hoạt hình sinh tồn nhẹ nhàng, không bạo lực).',
    setting='Đồng cỏ xanh trải dài lúc rạng đông, sương còn đọng trên ngọn cỏ cao. Quả trứng nằm trong tổ lót lá bên túp da cổ, quanh đó là hồ nước nhỏ, hàng cọ và những tảng đá phủ rêu. Xa xa là cao nguyên đỏ.',
    story=('Sáng nay, quả trứng cuối cùng của bầy bắt đầu nứt. Bố Gruk đứng canh bên tổ, cô Đuôi Dài và cả bầy nín thở chờ. '
           'Chú khủng long con Mốc chui ra, ngơ ngác nhìn đồng cỏ lần đầu tiên. Mỗi chặng, Mốc học một điều để sống: đứng vững, nhận ra cha, gọi tên bạn cùng bầy, uống nước an toàn, '
           'biết tiếng gầm nào là báo động. Mỗi vật phát sáng trên đồng cỏ chứa một câu hỏi, đúng thì Mốc làm được việc đó. '
           'Hoàng hôn xuống, Mốc phải chạy một mình về tổ trước khi trời tối. Cha đứng ở cuối đường, và đó là lần đầu Mốc nghe cha gọi tên mình.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        ST(1, 'Quả trứng nứt', 'Giúp Mốc phá vỏ trứng và chui ra khỏi tổ.',
           ['Mỗi câu đúng làm vỏ trứng nứt thêm một đường.', 'Bố Gruk đỡ nhẹ vỏ trứng, bầy đứng quanh nhìn.'],
           HOOK + ' Quả trứng sáng lên mỗi khi bạn đứng cạnh.', 'Mốc nở ra và có tên.', ['egg', 'crack', 'baby', 'nest', 'shell'],
           ['dino_nest_shelter', 'tree_nursery_pot', 'wood_plank_a', 'ground_grass_patch', 'mushrooms', 'hdri_dawn'],
           [sub('Có tiếng nứt! {egg|quả trứng|0} đang {crack|nứt ra|1}.', 'The egg is starting to crack.'),
            sub('Chào {baby|bé con|0}! Mẹ thiên nhiên cho con một {nest|tổ|1} ấm.', 'Welcome, little one! You have a warm nest.')]),
        ST(2, 'Bước chân đầu tiên', 'Tập đứng, tập đi, theo dấu chân cha trên cỏ.',
           ['Mốc loạng choạng, mỗi câu đúng đi vững thêm một bước.', 'Bố Gruk bước chậm để dấu chân cha in rõ cho con theo.'],
           HOOK + ' Dấu chân cha sáng dần lên, chạm đúng dấu kế tiếp.', 'Mốc đi vững.', ['walk', 'follow', 'step', 'dad', 'grass'],
           ['dino_trex_brown', 'ground_grass_tuft', 'ground_grass_block', 'river_grass_tall', 'river_butterfly', 'anim_wave'],
           [sub('{Dad|Bố|0} bước chậm, Mốc {follow|bước theo|1} từng {step|bước chân|1}.', 'Dad walks slowly and Moc follows every step.'),
            sub('Đừng sợ! Cỏ cao chỉ {grass|cỏ|0} thôi.', 'Do not be afraid! It is only grass.')]),
        ST(3, 'Gặp bầy nhỏ', 'Gọi tên các bạn cùng bầy: Sừng, Gai, Chân Dài.',
           ['Mỗi bạn có một đặc điểm; gọi đúng thì bạn chạy tới chơi cùng.', 'Cô Đuôi Dài dạy cách chào bằng cái chạm mũi.'],
           HOOK + ' Mỗi bạn nhỏ là một thẻ từ: nối đúng tên và đặc điểm.', 'Ba bạn mới.', ['friend', 'horn', 'tail', 'big', 'small'],
           ['dino_triceratops', 'dino_stegosaurus', 'ground_clearing', 'tree_x01', 'tree_x02', 'anim_cheer'],
           [sub('Đây là {friend|bạn|0} mới: cậu ấy có một cái {horn|sừng|2} {big|to|0}.', 'This is a new friend with a big horn.'),
            sub('Cậu kia thì có cái {tail|đuôi|1} đầy gai {small|nhỏ|0}.', 'That one has a small tail full of spikes.')]),
        ST(4, 'Uống nước lần đầu', 'Tới hồ nước, nhận biết nước sạch và nước đục.',
           ['Cô Đuôi Dài chỉ nước trong, nước đục nổi bọt thì tránh.', 'Mốc cúi đầu uống từng ngụm nhỏ, cả bầy canh xung quanh.'],
           HOOK + ' Vũng nước nào đúng thì sáng xanh.', 'Mốc biết chọn nước.', ['water', 'drink', 'clean', 'muddy', 'lake'],
           ['mini_azure_river', 'river_lilypad', 'river_reed', 'palm_a', 'palm_b', 'river_pebbles'],
           [sub('Nước {clean|sạch|1} trong vắt, {drink|uống|0} đi con!', 'The water is clean, drink up, little one!'),
            sub('Còn vũng này {muddy|đục|2} lắm, đừng {drink|uống|0}.', 'This one is muddy, do not drink it.')]),
        ST(5, 'Tiếng gầm báo động', 'Phân biệt tiếng gầm vui, gọi bầy và báo nguy.',
           ['Ba tiếng gầm khác nhau vang lên từ vách đá; nghe đúng thì Mốc phản ứng đúng.', 'Một bóng tối lướt qua trên cao, hóa ra là con chim lớn.'],
           HOOK + ' Mỗi tiếng gầm là một câu nghe, chọn đúng ý nghĩa của nó.', 'Mốc biết nghe báo động.', ['roar', 'danger', 'listen', 'safe', 'run'],
           ['river_cliff', 'river_rock_large', 'river_rock_medium', 'river_birds', 'tree_x03', 'tree_x04'],
           [sub('{Listen|Nghe|1}! Tiếng gầm này nghĩa là {danger|nguy hiểm|2}.', 'Listen! This roar means danger.'),
            sub('Mọi người {run|chạy|0} về chỗ {safe|an toàn|1} nào!', 'Everyone run to a safe place!')]),
        ST(6, 'Chạy về tổ trước hoàng hôn', 'Một mình chạy về tổ qua bãi cỏ khi trời sắp tối.',
           ['Đường chạy thẳng băng, mỗi câu đúng tăng tốc, sai thì vấp nhẹ.', 'Bố Gruk đứng ở cuối đường và gọi tên Mốc lần đầu.'],
           HOOK + ' Ba đoạn đường, mỗi đoạn một câu; đúng cả ba thì về kịp.', 'Tên Mốc và huy hiệu "Bước Chạy Đầu".', ['home', 'night', 'fast', 'name', 'proud'],
           ['ground_strip_6x20', 'ground_grass_iso', 'tree_x05', 'tree_x06_duo', 'dino_nest_shelter', 'hdri_sunset'],
           [sub('Trời sắp tối, chạy {fast|nhanh|1} về {home|nhà|0} thôi!', 'It is getting dark, run home fast!'),
            sub('"{Moc|Mốc|0}!" Cha gọi tên con. Cha thật {proud|tự hào|3}.', '"Moc!" Dad calls his name. He is so proud.')]),
        ST(7, 'Chặng phụ: Đếm sao bên ổ', 'Nằm cạnh cha, đếm sao và học các con số.',
           ['Mỗi câu đúng một ngôi sao hiện lên.'], 'Câu nhanh, sao đôi.', 'Sao đôi.', ['star', 'count', 'sleep'],
           ['tree_pixel', 'hdri_night'], [sub('Một, hai, ba... {star|ngôi sao|0} ơi!', 'One, two, three... what stars!')], optional=True),
        ST(8, 'Chặng phụ: Nhật ký khủng long con', 'Nói hoặc chọn một câu về ngày đầu tiên của em.',
           ['Dòng nhật ký được khắc lên một tảng đá cạnh ổ.'], 'Câu viết ngắn, chấm theo tiêu chí, không tính thua.', 'Huy hiệu "Ngày Đầu Đời".', ['today', 'happy', 'first'],
           ['tree_pixel_stylized'], [sub('Hôm nay con rất {happy|vui|1}.', 'Today I am very happy.')], optional=True),
    ],
    class_plan=plan(),
    characters=cast12(sid, 1, [
        D('Sừng Nhỏ', 'Bạn Triceratops nhỏ, hay húc nhẹ để chào', 'child', 'm', 'olive', 'dino_triceratops', 'Triceratops nhỏ da xanh ô-liu, ba sừng bé xíu', 'Bạn cùng bầy', 'heroes'),
        D('Gai Gai', 'Bạn Stegosaurus ngại ngùng, đuôi đầy gai tròn', 'child', 'f', 'purple', 'dino_stegosaurus', 'Stegosaurus tím, gai lưng bo tròn', 'Bạn cùng bầy', 'heroes', ['flower']),
        D('Thỏ Mắt Tròn', 'Thỏ nhỏ hay chạy ngang đồng cỏ', 'child', 'f', 'white', 'dino_rabbit', 'Thỏ trắng tai dài', 'Bạn của Mốc, chỉ đường', 'npc'),
        D('Chuột Nhắt', 'Chuột đồng tinh nghịch, trốn trong cỏ', 'child', 'm', 'brown', 'dino_rat', 'Chuột nâu, đuôi dài', 'Bạn nhí nhố', 'npc'),
        D('Linh Dương Đốm', 'Linh dương chạy giỏi, dạy Mốc nghe tiếng gió', 'adult', 'f', 'khaki', 'dino_antelope', 'Linh dương nâu đốm trắng', 'Người dạy chạy', 'npc'),
        D('Sói Con', 'Sói nhỏ tò mò, chưa biết sợ ai', 'child', 'n', 'gray', 'dino_wolf_b', 'Sói con lông xám nhạt', 'Bạn lạ gặp ở hồ', 'npc'),
    ])))

# ---------------------------------------------------------------- 2 Hunting lessons
sid = 'dino-02'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=2,
    title='Bài Học Săn Mồi',
    inspiration='Chương 2 của saga: cha dạy con đọc dấu chân, nằm im trong cỏ, theo gió, vồ mồi và chia mồi cho bầy (nhẹ nhàng, không cảnh đau).',
    setting='Đồng cỏ rộng giữa trưa, cỏ cao đến bụng, gió thổi thành từng đợt sóng. Có bãi bùn mềm in dấu chân, lùm cây thưa, vài khối đá lớn làm chỗ nấp.',
    story=('Mốc đã chạy vững, hôm nay Bố Gruk dẫn Mốc ra đồng cỏ xa hơn để học cách tự kiếm ăn. '
           'Cha chỉ cho Mốc đọc dấu chân trên bùn: dấu nào của thỏ, của linh dương, của chuột. Rồi hai cha con nằm im trong cỏ, đổi hướng theo gió để mồi không phát hiện. '
           'Mỗi lần săn, Mốc phải trả lời đúng mới vồ trúng; sai thì mồi chạy thoát và cha chỉ cười. Săn xong, cha dạy Mốc chia mồi cho cả bầy, kể cả Lông Xù đang đói. '
           'Mốc hiểu: săn giỏi không phải để giành phần mình, mà để bầy không ai bị đói.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        ST(1, 'Dấu chân trên bùn', 'Đọc dấu chân và đoán con vật đã đi qua.',
           ['Dấu chân in rõ trên bãi bùn, to nhỏ khác nhau.', 'Bố Gruk chỉ vết ba ngón, vết hai ngón.'],
           HOOK + ' Mỗi dấu chân là một câu nối đúng tên con vật.', 'Mốc đọc được dấu chân.', ['footprint', 'mud', 'rabbit', 'track', 'small'],
           ['ground_soil_patch', 'dino_rabbit', 'river_pebbles', 'river_pebbles__alt1', 'tree_x07_elm', 'hdri_noon'],
           [sub('Nhìn kìa, một {footprint|dấu chân|2} trên {mud|bùn|2}.', 'Look, a footprint in the mud.'),
            sub('Dấu {small|nhỏ|0} thế này là của một con {rabbit|thỏ|1}.', 'A small print like this belongs to a rabbit.')]),
        ST(2, 'Nằm im trong cỏ', 'Ẩn mình trong cỏ cao để mồi không thấy.',
           ['Cỏ cao che kín, mỗi câu đúng làm Mốc nằm im thêm một nhịp.', 'Bố Gruk thì thầm: chỉ thở nhẹ thôi.'],
           HOOK + ' Câu hỏi hiện trong bụi cỏ rung rinh.', 'Mốc nấp giỏi.', ['hide', 'quiet', 'tall grass', 'still', 'breathe'],
           ['river_grass_tall', 'ground_grass_dark', 'dino_antelope', 'river_bush', 'river_fern'],
           [sub('Nằm yên và {hide|nấp|1} trong cỏ cao nhé.', 'Stay still and hide in the tall grass.'),
            sub('Phải thật {quiet|im lặng|1}, đừng {breathe|thở|3} mạnh.', 'You must be quiet, do not breathe hard.')]),
        ST(3, 'Theo hướng gió', 'Đổi hướng tiếp cận ngược gió để mồi không ngửi thấy mùi.',
           ['Cánh bướm và lá bay cho biết hướng gió.', 'Cha đứng đầu hướng gió, con đứng sau.'],
           HOOK + ' Hướng gió là một mũi tên, chọn đúng hướng mới tiến lên.', 'Mốc đi ngược gió.', ['wind', 'left', 'right', 'smell', 'against'],
           ['tree_x08_verdant', 'tree_x09_lone', 'river_butterfly__alt1', 'dino_rat', 'ground_grass_emerald'],
           [sub('{Wind|Gió|1} thổi từ bên {left|trái|0} sang bên {right|phải|0}.', 'The wind blows from left to right.'),
            sub('Mồi sẽ ngửi thấy {smell|mùi|2} của ta nếu đi sai hướng.', 'The prey will smell us if we go the wrong way.')]),
        ST(4, 'Cú vồ đầu tiên', 'Vồ trúng con mồi nhỏ đúng thời điểm.',
           ['Thanh nhịp: bấm đúng lúc câu đúng, cú vồ trúng.', 'Con mồi bị trượt chỉ chạy đi, không có ai đau.'],
           HOOK + ' Câu hỏi hiện ngay trên con mồi trước cú vồ.', 'Bữa ăn đầu tiên Mốc tự kiếm.', ['jump', 'catch', 'quick', 'prey', 'miss'],
           ['dino_rat', 'dino_rabbit', 'ground_grass_iso', 'ground_grass_block', 'tree_x10_ancient_a'],
           [sub('Chờ đã... {jump|nhảy|1} lên! Bắt được rồi hay {miss|trượt|2}?', 'Wait... jump! Did you catch it or miss it?'),
            sub('Con mồi chạy rất {quick|nhanh|1}, phải thật chính xác.', 'The prey is quick, so you must be accurate.')]),
        ST(5, 'Chia mồi cho bầy', 'Mang mồi về và chia công bằng, kể cả cho Lông Xù.',
           ['Cha chia thành các phần đều nhau và dạy Mốc đếm.', 'Lông Xù nhìn từ xa, Mốc đem một phần ra cho nó.'],
           HOOK + ' Câu đếm và chia: mỗi phần đúng thì bầy đủ ăn.', 'Mốc học chia sẻ.', ['share', 'half', 'hungry', 'enough', 'together'],
           ['dino_trex_brown', 'dino_raptor_rider', 'dino_wolf_a', 'river_stump', 'river_log_fallen'],
           [sub('Chúng ta {share|chia sẻ|1} cho mọi người, kể cả bạn đang {hungry|đói|1}.', 'We share with everyone, even those who are hungry.'),
            sub('Chia {half|một nửa|2} cho bạn ấy nhé.', 'Give half to that friend.')]),
        ST(6, 'Về bầy mang thức ăn', 'Mang thức ăn về, cả bầy cùng ăn và kể chuyện bên tổ.',
           ['Bầy quây tròn, cô Đuôi Dài khen Mốc.', 'Cha kể lần đầu tiên cha đi săn khi còn nhỏ.'],
           HOOK + ' Câu hỏi hiện trên bữa ăn chung, đúng là bầy được no.', 'Huy hiệu "Thợ Săn Nhỏ".', ['dinner', 'family', 'story', 'proud', 'full'],
           ['dino_diplodocus', 'dino_sauropod_grey', 'ground_stone_floor', 'tree_x11_ancient_b', 'fx_fire', 'hdri_sunset'],
           [sub('Cả {family|gia đình|1} cùng ăn {dinner|bữa tối|1}.', 'The whole family eats dinner together.'),
            sub('Cha kể một {story|câu chuyện|1} xưa, ai cũng no bụng.', 'Dad tells an old story and everyone is full.')]),
        ST(7, 'Chặng phụ: Nấm lạ', 'Phân biệt nấm ăn được và nấm không ăn.',
           ['Cô Đuôi Dài dạy nhìn màu và mùi, cái gì lạ thì không ăn.'], 'Câu nhanh, sao đôi.', 'Sao đôi.', ['mushroom', 'safe', 'poison'],
           ['mushrooms', 'river_moss_rock'], [sub('Cây {mushroom|nấm|2} đỏ này có thể {poison|độc|4}.', 'This red mushroom may be poisonous.')], optional=True),
        ST(8, 'Chặng phụ: Nhật ký săn', 'Nói hoặc chọn một câu về điều em học được.',
           ['Dòng nhật ký được khắc lên một tảng đá.'], 'Câu viết ngắn, chấm theo tiêu chí, không tính thua.', 'Huy hiệu "Bài Học Đầu Tay".', ['learn', 'today', 'share'],
           ['river_sign'], [sub('Hôm nay con {learn|học được|1} cách chia sẻ.', 'Today I learned how to share.')], optional=True),
    ],
    class_plan=plan(),
    characters=cast12(sid, 2, [
        D('Sừng Nhỏ', 'Bạn Triceratops nhỏ, thích đi cùng tổ săn', 'child', 'm', 'olive', 'dino_triceratops', 'Triceratops nhỏ da xanh ô-liu', 'Bạn đồng hành', 'heroes'),
        D('Gai Gai', 'Bạn Stegosaurus canh gác cẩn thận', 'child', 'f', 'purple', 'dino_stegosaurus', 'Stegosaurus tím, gai lưng bo tròn', 'Người canh gió', 'heroes'),
        D('Thỏ Mắt Tròn', 'Thỏ chạy zig-zag trên đồng cỏ', 'adult', 'f', 'white', 'dino_rabbit', 'Thỏ trắng tai dài', 'Con mồi (chạy thoát)', 'npc'),
        D('Chuột Đồng', 'Chuột đồng giỏi trốn trong cỏ', 'adult', 'm', 'brown', 'dino_rat', 'Chuột nâu', 'Con mồi (chạy thoát)', 'npc'),
        D('Linh Dương Đốm', 'Linh dương dẫn Mốc đi vòng tránh gió', 'adult', 'f', 'khaki', 'dino_antelope', 'Linh dương nâu đốm trắng', 'Bạn dạy chạy', 'npc'),
        D('Sói Xám', 'Sói bạn của Lông Xù, hay đi chung', 'adult', 'm', 'gray', 'dino_wolf_b', 'Sói xám nhạt', 'Kẻ nhặt xác', 'npc'),
    ])))

# ---------------------------------------------------------------- 3 The long walk
sid = 'dino-03'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=3,
    title='Đường Dài Tới Hồ Nước',
    inspiration='Chương 3 của saga: hạn hán, cả bầy đi qua cao nguyên khô và rừng nấm tìm hồ nước thật; cha và cô Đuôi Dài dạy tìm nước, tiết kiệm sức, đi cùng nhau.',
    setting='Cao nguyên đỏ khô cằn, đất nứt nẻ, vài bụi cây gầy. Rồi rừng nấm khổng lồ, thác nước lấp lánh, và cuối đường là hồ xanh có đảo nổi giữa hồ.',
    story=('Mùa khô kéo dài, vũng nước của bầy cạn dần. Ông Cổ Dài nhớ có một hồ lớn sau cao nguyên và dẫn cả bầy đi. '
           'Đường dài, nắng gắt; Mốc học cách đi theo đội hình, nghỉ dưới bóng đá, tìm nước bằng cách nhìn chim bay và nghe tiếng gió. '
           'Qua rừng nấm, thác nước chặn đường, cả bầy phải xếp hàng đi qua từng bậc đá. Cuối cùng hồ nước hiện ra, nhưng cha dặn: uống từng chút, nhường người già và bé nhỏ trước. '
           'Mốc nhìn thấy cha uống sau cùng, dù cha mệt nhất.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        ST(1, 'Cao nguyên khô', 'Nhận ra dấu hiệu hạn hán và quyết định lên đường.',
           ['Đất nứt thành mảng, bụi bay, cỏ vàng úa.', 'Ông Cổ Dài kể về hồ nước xưa.'],
           HOOK + ' Mỗi vết nứt là một câu về thời tiết và nước.', 'Bầy xuất phát.', ['dry', 'hot', 'thirsty', 'plateau', 'leave'],
           ['dino_world_dry_plateau', 'river_cliff__alt1', 'ground_stone_floor', 'dino_sauropod_grey', 'hdri_noon'],
           [sub('Trời {hot|nóng|1} và đất {dry|khô|1} nứt nẻ.', 'The sky is hot and the ground is dry and cracked.'),
            sub('Chúng ta phải {leave|rời đi|2} để tìm nước. Ai cũng đang {thirsty|khát|2}.', 'We must leave to find water. Everyone is thirsty.')]),
        ST(2, 'Đi theo đội hình', 'Cả bầy đi thành hàng: lớn trước, nhỏ giữa, già cuối.',
           ['Mỗi nhóm giữ khoảng cách vừa đủ, không ai bị bỏ lại.', 'Tia Chớp chạy đi chạy lại báo tin cho cả hàng.'],
           HOOK + ' Câu hỏi hiện trên lưng khủng long đi trước; đúng thì hàng gọn.', 'Bầy đi nhanh hơn.', ['line', 'front', 'behind', 'together', 'stay'],
           ['dino_raptor_rider', 'dino_triceratops', 'dino_stegosaurus', 'river_rock_small', 'river_rock_medium'],
           [sub('{Stay|Ở lại|1} trong hàng, đừng tụt lại {behind|phía sau|2}.', 'Stay in line, do not fall behind.'),
            sub('Chúng ta đi {together|cùng nhau|1}.', 'We walk together.')]),
        ST(3, 'Rừng nấm khổng lồ', 'Đi qua rừng nấm, nghỉ dưới bóng râm, tìm lối ra.',
           ['Nấm to che nắng, nhưng đường rẽ nhiều nhánh.', 'Cô Đuôi Dài dạy đánh dấu đường bằng cành cây.'],
           HOOK + ' Mỗi ngã rẽ là một câu hỏi chỉ đường.', 'Cả bầy nghỉ lấy sức.', ['shade', 'rest', 'path', 'turn', 'giant'],
           ['mushrooms', 'tree_x09_lone', 'tree_x10_ancient_a', 'tree_x12_dark_bark', 'river_fern__alt1'],
           [sub('Dưới {shade|bóng râm|3} này ta có thể {rest|nghỉ|1} một chút.', 'We can rest a little in this shade.'),
            sub('Chọn đúng {path|lối đi|2} rồi {turn|rẽ|1} nhé.', 'Choose the right path and turn.')]),
        ST(4, 'Thác nước chắn lối', 'Leo qua từng bậc đá cạnh thác, giúp nhau qua.',
           ['Thác đổ mát lạnh, bậc đá trơn.', 'Khủng long lớn đưa đuôi làm cầu cho bạn nhỏ.'],
           HOOK + ' Mỗi bậc đá là một câu; đúng thì bậc đá chắc.', 'Cả bầy qua thác.', ['waterfall', 'climb', 'slippery', 'help', 'bridge'],
           ['mini_runestone_falls', 'river_waterfall', 'river_waterfall_pool', 'river_moss_rock', 'wood_plank_b'],
           [sub('{Waterfall|Thác nước|2} chảy rất mạnh, đá thì {slippery|trơn|4}.', 'The waterfall is strong and the rocks are slippery.'),
            sub('Hãy {help|giúp|1} nhau {climb|leo|2} qua.', 'Help each other climb across.')]),
        ST(5, 'Hồ nước hiện ra', 'Tìm thấy hồ, canh chừng và uống theo thứ tự.',
           ['Mặt hồ phẳng như gương, có đảo nổi ở giữa.', 'Cha dặn nhường người già và bé nhỏ uống trước.'],
           HOOK + ' Vũng nước nào an toàn thì sáng xanh.', 'Cả bầy có nước.', ['lake', 'drink', 'first', 'old', 'careful'],
           ['mini_jungle_river', 'mini_floating_oasis', 'river_lilypad__alt1', 'palm_a', 'palm_b'],
           [sub('{Lake|Hồ|1} kia rồi! Nhưng hãy cẩn thận khi {drink|uống|0}.', 'There is the lake! But be careful when drinking.'),
            sub('Người già và bé nhỏ uống {first|trước|1}.', 'The old and the little ones drink first.')]),
        ST(6, 'Cha uống sau cùng', 'Cả bầy nghỉ bên hồ; Mốc thấy cha mệt nhưng vẫn nhường.',
           ['Cha ngồi xuống, thở dài, nhìn con cười.', 'Ông Cổ Dài kể: một bầy mạnh khi biết nhường nhau.'],
           HOOK + ' Câu hỏi hiện trên mặt hồ; đúng là sóng lăn tăn.', 'Huy hiệu "Cả Bầy Đến Nơi".', ['tired', 'thank', 'strong', 'family', 'rest'],
           ['dino_trex_brown', 'dino_diplodocus', 'river_driftwood', 'river_birds', 'hdri_sunset'],
           [sub('Cha {tired|mệt|1} lắm, nhưng cha vẫn mỉm cười.', 'Dad is very tired but still smiling.'),
            sub('Cảm ơn cha, {thank|cảm ơn|0} cha rất nhiều.', 'Thank you, Dad, thank you so much.')]),
        ST(7, 'Chặng phụ: Đảo nổi giữa hồ', 'Ngắm đảo nổi và học từ chỉ vị trí.',
           ['Đảo nổi xa xa, bay lơ lửng.'], 'Câu nhanh, sao đôi.', 'Sao đôi.', ['island', 'above', 'near'],
           ['mini_floating_waterfall'], [sub('Hòn {island|đảo|2} kia bay trên mặt {lake|hồ|1}.', 'That island floats above the lake.')], optional=True),
        ST(8, 'Chặng phụ: Nhật ký đường dài', 'Nói hoặc chọn một câu về chuyến đi.',
           ['Dòng nhật ký khắc lên thân gỗ trôi.'], 'Câu viết ngắn, chấm theo tiêu chí, không tính thua.', 'Huy hiệu "Người Đi Xa".', ['long', 'walk', 'tired'],
           ['wood_plank_a'], [sub('Hôm nay con đã {walk|đi bộ|1} rất {long|xa|1}.', 'Today I walked very far.')], optional=True),
    ],
    class_plan=plan(),
    characters=cast12(sid, 3, [
        D('Sừng Nhỏ', 'Bạn Triceratops nhỏ, mang nước cho bạn khác', 'child', 'm', 'olive', 'dino_triceratops', 'Triceratops nhỏ da xanh ô-liu', 'Bạn đồng hành', 'heroes'),
        D('Gai Gai', 'Bạn Stegosaurus hay giúp bạn leo đá', 'child', 'f', 'purple', 'dino_stegosaurus', 'Stegosaurus tím', 'Người giúp leo', 'heroes'),
        D('Bà Vảy Xám', 'Sauropod già đi chậm, cần được đỡ', 'elder', 'f', 'gray', 'dino_sauropod_grey', 'Sauropod xám, vảy mờ', 'Người cần đỡ', 'npc', ['necklace']),
        D('Linh Dương Đốm', 'Linh dương dẫn đường nhờ thính tai', 'adult', 'f', 'khaki', 'dino_antelope', 'Linh dương nâu đốm trắng', 'Người nghe tiếng nước', 'npc'),
        D('Thỏ Mắt Tròn', 'Thỏ đi cùng bầy qua nhiều ngày', 'child', 'f', 'white', 'dino_rabbit', 'Thỏ trắng tai dài', 'Bạn đường', 'npc'),
        D('Sói Xám', 'Sói đói bám theo bầy, sau thành bạn', 'adult', 'm', 'gray', 'dino_wolf_b', 'Sói xám nhạt', 'Kẻ đi theo, dần thân thiện', 'npc'),
    ])))

# ---------------------------------------------------------------- 4 Storm night
sid = 'dino-04'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=4,
    title='Đêm Bão Và Tổ Ấm',
    inspiration='Chương 4 của saga: bão đêm, cả bầy tìm chỗ trú, đối mặt sói đói, sưởi ấm bên nhau; Mốc thấy cha bắt đầu yếu đi.',
    setting='Bờ hồ lúc chạng vạng, mây đen cuồn cuộn, gió giật; có túp da cổ làm chỗ trú, rừng cây cổ thụ và thân gỗ đổ. Sấm chớp xa, mưa rơi từng đợt.',
    story=('Chiều xuống, bầu trời đổi màu; Ông Cổ Dài ngửi thấy mùi bão. Cả bầy phải kịp tìm chỗ trú trước khi trời tối hẳn. '
           'Mốc giúp khuân ván gỗ gia cố túp da cổ, chỉ chỗ gió lùa, đếm đủ cả bầy bên trong. '
           'Đêm xuống, lũ sói đói lảng vảng quanh chỗ trú; cô Đuôi Dài dạy bầy đứng sát nhau, cha đứng chắn cửa. '
           'Sấm sét làm một cây đổ gần lối vào, cả bầy phải làm việc cùng nhau để dọn lối. '
           'Sáng ra, mưa tạnh, Mốc nhận thấy cha đứng chậm hơn trước và hơi thở nặng hơn.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        ST(1, 'Mây đen kéo tới', 'Nhận biết dấu hiệu bão và báo cho cả bầy.',
           ['Gió đổi hướng, chim bay thấp, mây đen dày.', 'Ông Cổ Dài ngửi không khí và lắc đầu.'],
           HOOK + ' Mỗi dấu hiệu là một câu về thời tiết.', 'Cả bầy kịp báo động.', ['storm', 'cloud', 'wind', 'cold', 'warn'],
           ['tree_x11_ancient_b', 'dino_sauropod_grey', 'river_birds', 'hdri_cloudy'],
           [sub('{Storm|Bão|2} sắp tới, {cloud|mây|1} đen kín trời.', 'A storm is coming and clouds cover the sky.'),
            sub('Mọi người hãy {warn|báo|4} cho nhau biết nhé.', 'Let everyone warn each other.')]),
        ST(2, 'Tìm chỗ trú', 'Dẫn cả bầy vào túp da cổ và gia cố mái.',
           ['Ván gỗ ghép thành mái, dây thừng buộc chặt.', 'Mốc đếm đủ cả bầy vào trong.'],
           HOOK + ' Mỗi tấm ván là một câu; đúng thì ván được chèn vào đúng chỗ.', 'Chỗ trú chắc chắn.', ['shelter', 'roof', 'inside', 'strong', 'count'],
           ['dino_nest_shelter', 'wood_plank_b', 'wood_plank_a', 'camp_rope', 'tree_x04', 'anim_kneel_work'],
           [sub('Mau vào {shelter|chỗ trú|2}, trời sắp mưa!', 'Quick, get into the shelter, it is going to rain!'),
            sub('Mái nhà phải thật {strong|chắc|1}. Ta cùng {count|đếm|0} xem đủ chưa.', 'The roof must be strong. Let us count if everyone is here.')]),
        ST(3, 'Sói rình ngoài cửa', 'Giữ bình tĩnh khi sói xuất hiện quanh chỗ trú.',
           ['Những cặp mắt vàng phát sáng ngoài bóng tối.', 'Cô Đuôi Dài dặn cả bầy đứng sát nhau, không ai chạy ra.'],
           HOOK + ' Hành động đúng là sáng lên: đứng im, đứng sát, hay gọi cha.', 'Bầy an toàn.', ['wolf', 'close', 'stay', 'brave', 'dark'],
           ['dino_wolf_a', 'dino_wolf_b', 'ground_grass_dark', 'river_bush__alt2', 'hdri_night'],
           [sub('Có hai con {wolf|sói|1} ngoài kia, trời lại {dark|tối|1}.', 'There are two wolves out there and it is dark.'),
            sub('Hãy {stay|ở yên|1} bên nhau và thật {brave|dũng cảm|3}.', 'Stay together and be brave.')]),
        ST(4, 'Sưởi ấm bên nhau', 'Dựa vào nhau giữ ấm, kể chuyện đợi bão qua.',
           ['Cả bầy xích lại, đứa lớn che đứa nhỏ.', 'Ông Cổ Dài kể chuyện về lần bão lớn xưa.'],
           HOOK + ' Câu hỏi hiện trên đống lửa nhỏ trong chỗ trú.', 'Cả bầy ấm áp.', ['warm', 'together', 'story', 'sleep', 'cold'],
           ['dino_stegosaurus', 'dino_triceratops', 'fx_fire', 'fx_smoke', 'river_woodpile'],
           [sub('Đêm {cold|lạnh|1}, nhưng khi ở bên nhau thì rất {warm|ấm|1}.', 'The night is cold, but together we are warm.'),
            sub('Cụ kể một {story|câu chuyện|1} cho các cháu {sleep|ngủ|0}.', 'Grandpa tells a story so the children can sleep.')]),
        ST(5, 'Sấm sét và cây đổ', 'Cùng nhau dọn cây đổ chắn lối vào.',
           ['Một tia sét đánh gần, thân cây đổ chắn cửa.', 'Khủng long lớn đẩy, khủng long nhỏ kéo dây.'],
           HOOK + ' Mỗi lần đẩy là một câu; đúng cả nhóm thì thân cây nhúc nhích.', 'Lối vào được mở.', ['thunder', 'push', 'pull', 'tree', 'together'],
           ['tree_x12_dark_bark', 'river_driftwood', 'river_log_fallen', 'camp_rope', 'dino_trex_brown'],
           [sub('{Thunder|Sấm|2} đánh một tiếng, cây {tree|cây|0} đổ chắn cửa.', 'Thunder cracked and a tree fell across the door.'),
            sub('Mọi người cùng {push|đẩy|1} và {pull|kéo|1}!', 'Everybody push and pull!')]),
        ST(6, 'Bình minh sau bão', 'Mưa tạnh, cả bầy bước ra; Mốc thấy cha mệt hơn.',
           ['Cầu vồng bắc ngang thác nước.', 'Cha đứng chậm lại, thở nặng nhưng vẫn cười với con.'],
           HOOK + ' Câu hỏi hiện trên cầu vồng; đúng là cầu vồng sáng thêm màu.', 'Huy hiệu "Sống Sót Qua Bão".', ['rainbow', 'morning', 'tired', 'worry', 'hope'],
           ['river_waterfall', 'river_waterfall_pool', 'dino_diplodocus', 'ground_grass_emerald', 'hdri_dawn'],
           [sub('Có một chiếc {rainbow|cầu vồng|2} sau cơn bão!', 'There is a rainbow after the storm!'),
            sub('Cha trông {tired|mệt|1}. Mốc bắt đầu thấy {worry|lo lắng|4}.', 'Dad looks tired. Moc starts to worry.')]),
        ST(7, 'Chặng phụ: Đếm tiếng sấm', 'Đếm giữa chớp và sấm để đoán bão xa hay gần.',
           ['Mỗi tiếng đếm đúng là một vòng nước tỏa ra.'], 'Câu nhanh, sao đôi.', 'Sao đôi.', ['count', 'far', 'near'],
           ['tree_x08_verdant'], [sub('Bão còn {far|xa|1} hay đã {near|gần|1}?', 'Is the storm still far or already near?')], optional=True),
        ST(8, 'Chặng phụ: Nhật ký đêm bão', 'Nói hoặc chọn một câu về đêm bão.',
           ['Dòng nhật ký khắc lên vách túp da.'], 'Câu viết ngắn, chấm theo tiêu chí, không tính thua.', 'Huy hiệu "Đêm Bão".', ['night', 'storm', 'safe'],
           ['river_sign'], [sub('Đêm nay con thấy {safe|an toàn|1} bên bầy.', 'Tonight I feel safe with the herd.')], optional=True),
    ],
    class_plan=plan(),
    characters=cast12(sid, 4, [
        D('Sừng Nhỏ', 'Bạn Triceratops nhỏ, sợ sấm nhưng không bỏ chạy', 'child', 'm', 'olive', 'dino_triceratops', 'Triceratops nhỏ da xanh ô-liu', 'Bạn trong chỗ trú', 'heroes'),
        D('Gai Gai', 'Bạn Stegosaurus kê lưng làm mái cho bạn nhỏ', 'child', 'f', 'purple', 'dino_stegosaurus', 'Stegosaurus tím', 'Người che mưa', 'heroes'),
        D('Sói Xám', 'Sói đói đi vòng quanh chỗ trú', 'adult', 'm', 'gray', 'dino_wolf_b', 'Sói xám nhạt, mắt phát sáng', 'Kẻ rình ngoài cửa', 'npc'),
        D('Thỏ Mắt Tròn', 'Thỏ chạy vào chỗ trú xin ở nhờ', 'child', 'f', 'white', 'dino_rabbit', 'Thỏ trắng ướt sũng', 'Khách nhỏ trú bão', 'npc'),
        D('Chuột Nhắt', 'Chuột nhỏ chui qua kẽ ván báo tin', 'child', 'm', 'brown', 'dino_rat', 'Chuột nâu', 'Người báo kẽ hở mái', 'npc'),
        D('Linh Dương Đốm', 'Linh dương nghe tiếng sấm từ xa', 'adult', 'f', 'khaki', 'dino_antelope', 'Linh dương nâu đốm trắng', 'Người nghe bão', 'npc'),
    ], father_feature='Cha của Mốc, đứng chắn cửa suốt đêm, hơi thở bắt đầu nặng')))

# ---------------------------------------------------------------- 5 End
sid = 'dino-05'
SCENARIOS.append(dict(
    id=sid, game=GAME, seq=5,
    title='Cha Già Và Ngày Đứng Lên',
    inspiration='Chương cuối của saga: cha đã già, bị các khủng long khác bắt nạt khi đi uống nước; Mốc đã lớn đứng lên, gọi cả bầy cùng giải cứu cha.',
    setting='Hồ nước lúc chiều tà, vầng mặt trời đỏ chạm cao nguyên. Gần hồ là bãi đá và đảo rừng nổi lơ lửng, nơi bầy khủng long lạ hay tụ họp. Cỏ vàng rực trong nắng.',
    story=('Mùa nước đã qua, Mốc đã lớn gần bằng nửa cha. Bố Gruk bây giờ đi chậm, lưng còng, không còn là kẻ săn nhanh nhất. '
           'Một chiều, cha ra hồ uống nước một mình thì bị Răng Vàng và Bóng Đêm chặn đường, xô đẩy và giành chỗ uống. '
           'Tia Chớp chạy về báo tin; Mốc khựng lại, nhớ những bài học: đọc dấu chân, nghe báo động, đứng sát nhau, nhường người già. '
           'Mốc không lao vào một mình. Mốc gọi cả bầy: cô Đuôi Dài, ông Cổ Dài, Sừng Nhỏ, Gai Gai... mỗi người một việc. '
           'Cả bầy đứng thành một hàng chắn, gầm vang cùng lúc; hai kẻ bắt nạt lùi lại, bỏ đi. Cha ngước nhìn con, nói: "Con đã lớn rồi." '
           'Hoàng hôn xuống, cha con cùng uống nước bên nhau, cả bầy đứng quanh.'),
    rounds=6, minutes_per_round=5, total_minutes=30,
    stages=[
        ST(1, 'Cha chậm bước', 'Nhận ra cha đã già: đi chậm, uống chậm, hay nghỉ.',
           ['Mốc đi cạnh cha, chậm lại cho vừa nhịp.', 'Ông Cổ Dài nói: già không phải yếu, chỉ cần người bên cạnh.'],
           HOOK + ' Câu hỏi hiện trên dấu chân cha, mỗi dấu chân nặng hơn trước.', 'Mốc hiểu cha.', ['old', 'slow', 'tired', 'help', 'back'],
           ['dino_trex_brown', 'ground_grass_tuft', 'tree_x01', 'tree_x03', 'ground_grass_patch', 'hdri_noon'],
           [sub('Cha đã {old|già|0}, bước đi {slow|chậm|1} hơn trước.', 'Dad is old and walks more slowly than before.'),
            sub('Mốc nói: "Để con {help|giúp|1} cha."', 'Moc says: "Let me help you, Dad."')]),
        ST(2, 'Hai kẻ bắt nạt', 'Chứng kiến Răng Vàng và Bóng Đêm chặn đường cha ở hồ.',
           ['Hai T-rex lạ gầm gừ, giành chỗ uống, xô cha ngã ngồi.', 'Cha không đánh lại, chỉ lùi lại để tránh va chạm.'],
           HOOK + ' Mỗi hành động của kẻ bắt nạt là một câu mô tả; chọn đúng để hiểu chuyện gì đang xảy ra.', 'Mốc nhìn rõ sự thật.', ['bully', 'push', 'angry', 'unfair', 'lake'],
           ['dino_trex_yellow', 'dino_trex_black', 'dino_wolf_a', 'mini_azure_river', 'river_rock_large'],
           [sub('Hai con khủng long to xác {push|xô đẩy|1} cha ở bờ hồ.', 'Two big dinosaurs push Dad around at the lake.'),
            sub('Họ {bully|bắt nạt|4} người già. Thật {unfair|bất công|4}!', 'They bully an old dinosaur. How unfair!')]),
        ST(3, 'Mốc dừng lại suy nghĩ', 'Nhớ lại các bài học và lên kế hoạch, không lao vào một mình.',
           ['Mốc nhắm mắt: dấu chân, tiếng gầm, đứng sát nhau, nhường người già.', 'Mốc quyết định: cần cả bầy.'],
           HOOK + ' Mỗi bài học là một thẻ nhớ; chọn đúng bài học dùng cho tình huống này.', 'Một kế hoạch.', ['think', 'plan', 'remember', 'alone', 'together'],
           ['mini_logic_island', 'tree_x05', 'tree_x06_duo', 'river_stump', 'hdri_sunset'],
           [sub('Mốc dừng lại để {think|suy nghĩ|1}. Một mình thì không thể.', 'Moc stops to think. He cannot do it alone.'),
            sub('Con phải {remember|nhớ|2} mọi điều cha dạy và có một {plan|kế hoạch|1}.', 'I must remember everything Dad taught me and make a plan.')]),
        ST(4, 'Gọi cả bầy', 'Chạy tới từng thành viên của bầy và kêu gọi họ.',
           ['Tia Chớp chạy trước báo tin; mỗi bạn nhận một việc.', 'Cô Đuôi Dài, ông Cổ Dài, Sừng Nhỏ, Gai Gai đều đồng ý ngay.'],
           HOOK + ' Mỗi lời gọi là một câu; đúng thì người đó tới.', 'Cả bầy có mặt.', ['call', 'herd', 'ask', 'join', 'ready'],
           ['dino_raptor_rider', 'dino_diplodocus', 'dino_sauropod_grey', 'dino_triceratops', 'dino_stegosaurus', 'anim_cheer'],
           [sub('Mốc chạy đi {call|gọi|1} cả {herd|bầy|3}.', 'Moc runs to call the whole herd.'),
            sub('"Các bạn có {ready|sẵn sàng|2} {join|tham gia|3} cùng tôi không?"', '"Are you ready to join me?"')]),
        ST(5, 'Đứng lên', 'Cả bầy xếp hàng tiến về hồ, đứng chắn trước hai kẻ bắt nạt.',
           ['Mốc đứng đầu hàng, cả bầy sát bên.', 'Mốc nói: "Dừng lại. Đây là cha của tôi, và đây là nước của tất cả mọi người."'],
           HOOK + ' Ba lượt câu hỏi: lời nói, đội hình, tiếng gầm chung; đúng cả ba thì bầy chắn thành công.', 'Thanh "Dũng cảm cả bầy" đầy.', ['stand up', 'brave', 'stop', 'roar', 'together'],
           ['dino_trex_brown', 'dino_trex_yellow', 'dino_trex_black', 'ground_strip_6x20', 'ground_grass_iso', 'hdri_sunset'],
           [sub('Mốc {stand up|đứng lên|3} và nói: "{Stop|Dừng lại|1}!"', 'Moc stands up and says: "Stop!"'),
            sub('Cả bầy cùng gầm một tiếng thật {brave|dũng cảm|3}.', 'The whole herd roars bravely together.')]),
        ST(6, 'Giải cứu và hòa bình', 'Hai kẻ bắt nạt lùi lại; cha được đỡ dậy; cả bầy uống nước cùng nhau.',
           ['Răng Vàng và Bóng Đêm nhìn hàng chắn, rồi bỏ đi.', 'Cha ngước nhìn con: "Con đã lớn rồi."'],
           HOOK + ' Câu hỏi cuối hiện trên mặt hồ; đúng thì ánh hoàng hôn phủ vàng cả bầy.', 'Huy hiệu "Người Con Dũng Cảm" cho nhóm đứng đầu và cho cả lớp.', ['rescue', 'proud', 'safe', 'family', 'peace'],
           ['dino_world_floating_jungle', 'mini_floating_waterfall', 'mini_floating_oasis', 'dino_diplodocus', 'dino_trex_brown', 'hdri_sunset'],
           [sub('Cha đã được {rescue|giải cứu|3}. Cả nhà đều {safe|an toàn|1}.', 'Dad is rescued. The whole family is safe.'),
            sub('"Con đã lớn rồi," cha nói, "cha rất {proud|tự hào|3} về con."', '"You have grown up," Dad said, "I am so proud of you."')]),
        ST(7, 'Chặng phụ: Bài học của cha', 'Cha kể lại điều quan trọng nhất cha muốn Mốc nhớ.',
           ['Cha kể bên hồ, cả bầy ngồi nghe.'], 'Câu nhanh, sao đôi.', 'Sao đôi.', ['listen', 'brave', 'kind'],
           ['tree_pixel', 'hdri_dawn'], [sub('Hãy luôn {brave|dũng cảm|3} và {kind|tử tế|2}.', 'Always be brave and kind.')], optional=True),
        ST(8, 'Chặng phụ: Lời thề của bầy', 'Mỗi em nói hoặc chọn một câu lời hứa cho người già và bạn nhỏ.',
           ['Lời hứa được khắc lên tảng đá cạnh hồ.'], 'Câu viết ngắn, chấm theo tiêu chí, không tính thua.', 'Huy hiệu "Cả Bầy Một Lòng".', ['promise', 'help', 'always'],
           ['river_sign'], [sub('Em {promise|hứa|3} sẽ luôn {help|giúp|1} người già.', 'I promise I will always help the old.')], optional=True),
    ],
    class_plan=plan(),
    characters=cast12(sid, 5, [
        D('Răng Vàng', 'T-rex cả bầy sợ, thích giành chỗ uống', 'adult', 'm', 'yellow', 'dino_trex_yellow', 'T-rex vàng to xác, răng sáng', 'Kẻ bắt nạt đầu đàn', 'npc'),
        D('Bóng Đêm', 'T-rex đen im lặng, luôn đi sau Răng Vàng', 'adult', 'm', 'black', 'dino_trex_black', 'T-rex đen, mắt vàng', 'Kẻ bắt nạt phụ', 'npc'),
        D('Sừng Nhỏ', 'Triceratops lớn lên, đứng cạnh Mốc', 'teen', 'm', 'olive', 'dino_triceratops', 'Triceratops da xanh ô-liu, sừng đã dài', 'Bạn chắn hàng', 'heroes'),
        D('Gai Gai', 'Stegosaurus không còn ngại ngùng', 'teen', 'f', 'purple', 'dino_stegosaurus', 'Stegosaurus tím, gai lưng sắc hơn', 'Bạn chắn hàng', 'heroes', ['flower']),
        D('Sói Xám', 'Sói nhỏ đã thành bạn, đứng về phía bầy', 'adult', 'm', 'gray', 'dino_wolf_b', 'Sói xám nhạt', 'Bạn đổi phe', 'npc'),
        D('Linh Dương Đốm', 'Linh dương nhìn cảnh từ xa rồi chạy báo thêm bầy khác', 'adult', 'f', 'khaki', 'dino_antelope', 'Linh dương nâu đốm trắng', 'Người báo tin phụ', 'npc'),
    ], father_age='elder', father_feature='Cha của Mốc đã già, đi chậm, lưng còng, hiền hậu')))
