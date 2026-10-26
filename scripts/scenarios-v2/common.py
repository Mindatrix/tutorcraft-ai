"""Shared helpers for the v2 scenario set (plan 2026-10-26).

Every scenario: 6 core stages x 5 min = 30 min, plus 2 optional 5-min stages for
classes that run long. 12 story characters. A class plan for 1-50 students.
Appearance fields are rotated so each scenario's cast is visibly diverse;
story fields (name, feature, role, outfit, prop) are written by hand.
"""

SKINS = ['S3', 'S5', 'S2', 'S7', 'S4', 'S1', 'S6', 'S8', 'S3', 'S9', 'S5', 'S2']
EYES = ['E_brown_dark', 'E_black', 'E_brown', 'E_light_brown', 'E_amber', 'E_green', 'E_blue', 'E_gray',
        'E_brown_dark', 'E_brown', 'E_blue_gray', 'E_black']
HAIR_COLORS = ['black', 'dark_brown', 'black', 'brown', 'black', 'dark_blonde', 'ginger', 'black',
               'dark_brown', 'blonde', 'black', 'brown']
# (style, length) pairs that make sense together
HAIR = {
    'f': [('ponytail', 'long'), ('bob', 'short'), ('braid', 'long'), ('twin_buns', 'shoulder'), ('half_up', 'long'),
          ('pigtails', 'shoulder'), ('bun', 'long'), ('wavy', 'shoulder'), ('curly', 'shoulder'), ('straight', 'long'),
          ('ponytail_low', 'long'), ('afro', 'shoulder')],
    'm': [('short_neat', 'short'), ('spiky', 'short'), ('messy', 'short'), ('buzz', 'buzz'), ('side_part', 'short'),
          ('curly', 'short'), ('topknot', 'shoulder'), ('slicked', 'short'), ('afro', 'short'), ('wavy', 'short'),
          ('straight', 'short'), ('short_neat', 'short')],
    'n': [('messy', 'short'), ('bob', 'short'), ('curly', 'shoulder'), ('straight', 'shoulder')],
}
ELDER_HAIR_COLORS = ['silver', 'white', 'salt_pepper', 'ash_gray']

VALID = {
    'age_group': {'child', 'teen', 'adult', 'elder'},
    'gender': {'f', 'm', 'n'},
    'outfit_theme': {'arctic_winter', 'casual', 'diving', 'explorer', 'fantasy_scifi', 'football', 'formal_smart',
                     'life_jacket_sailing', 'regional_traditional', 'vn_traditional'},
    'outfit_color': {'black', 'blue', 'brown', 'gray', 'green', 'khaki', 'maroon', 'navy', 'neutral', 'olive', 'orange',
                     'pink', 'purple', 'red', 'silver', 'teal', 'white', 'yellow'},
    'prop': {'axe_hammer_tool', 'broom_brush', 'detector_scanner', 'fan', 'flashlight', 'instrument', 'ladle', 'none',
             'rolled_paper', 'rope_climb', 'shield', 'slipper', 'staff_cane', 'swatter_net', 'tape', 'toy_bow_sword',
             'vacuum'},
    'accessory': {'bag', 'bandage', 'beard', 'bracelet', 'camera', 'cybernetic', 'earring', 'flower', 'freckles',
                  'glasses', 'hat', 'headband', 'instrument', 'map_or_notebook', 'mustache', 'necklace', 'pet_or_toy',
                  'tattoo', 'watch', 'whistle'},
    'team': {'escapers', 'pursuers', 'campers', 'anglers', 'racers', 'heroes', 'npc'},
    'skin': {'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'X1', 'X2'},
    'eye': {'E_amber', 'E_black', 'E_blue', 'E_blue_gray', 'E_brown', 'E_brown_dark', 'E_gray', 'E_green', 'E_hetero',
            'E_ice', 'E_light_brown', 'E_violet', 'E_yellow'},
    'hair_color': {'ash_gray', 'black', 'blonde', 'blue', 'brown', 'dark_blonde', 'dark_brown', 'ginger', 'peach', 'pink',
                   'platinum', 'purple', 'red', 'salt_pepper', 'silver', 'silver_purple', 'teal', 'white'},
    'hair_style': {'afro', 'bob', 'braid', 'bun', 'buzz', 'curly', 'half_up', 'messy', 'pigtails', 'ponytail',
                   'ponytail_low', 'short_neat', 'side_part', 'slicked', 'spiky', 'straight', 'topknot', 'twin_buns',
                   'wavy'},
}


def C(name, feature, age, gender, theme, color, clothing, role, team, prop=None, acc=(), weapon=None, hair=None,
      skin=None, hair_color=None, covered=False, freckles=False, dyed=False):
    """One hand-written story character; appearance is filled in by cast()."""
    return dict(name=name, feature=feature, age_group=age, gender=gender, outfit_theme=theme, outfit_color=color,
                clothing_text=clothing, role=role, team=team, prop_category=prop, accessories=list(acc),
                weapon_label=weapon, _hair=hair, _skin=skin, _hair_color=hair_color, hair_covered=covered,
                skin_freckles=freckles, hair_dyed=dyed)


ORIGINS = {
    # skin, eyes, hair colours (adults/children); elders use ELDER_HAIR_COLORS
    'vn': (['S3', 'S2', 'S4', 'S5', 'S3', 'S4'], ['E_brown_dark', 'E_black', 'E_brown'], ['black', 'black', 'dark_brown', 'black']),
    'east_asia': (['S2', 'S3', 'S2'], ['E_brown_dark', 'E_black', 'E_brown'], ['black', 'dark_brown', 'black']),
    'se_asia': (['S4', 'S5', 'S4'], ['E_brown_dark', 'E_black', 'E_brown'], ['black', 'dark_brown']),
    'south_asia': (['S6', 'S7', 'S6'], ['E_brown_dark', 'E_black', 'E_brown'], ['black', 'dark_brown']),
    'europe': (['S1', 'S2', 'S1', 'S2'], ['E_blue', 'E_green', 'E_gray', 'E_light_brown', 'E_blue_gray'], ['blonde', 'brown', 'ginger', 'dark_blonde', 'dark_brown']),
    'latin': (['S4', 'S6', 'S5'], ['E_brown', 'E_light_brown', 'E_amber'], ['dark_brown', 'black', 'brown']),
    'mena': (['S4', 'S5', 'S6'], ['E_brown', 'E_amber', 'E_brown_dark'], ['black', 'dark_brown']),
    'africa': (['S8', 'S9', 'S7'], ['E_brown_dark', 'E_brown', 'E_black'], ['black']),
    'pacific': (['S5', 'S6'], ['E_brown', 'E_brown_dark'], ['black', 'dark_brown']),
    'any': (SKINS, EYES, HAIR_COLORS),
}
COUNTRY = {
    'Pháp': 'europe', 'Anh': 'europe', 'Ireland': 'europe', 'Đức': 'europe', 'Thụy Điển': 'europe', 'Na Uy': 'europe',
    'Nga': 'europe', 'Úc': 'europe', 'Canada': 'europe', 'New Zealand': 'europe', 'Ý': 'europe', 'Mỹ': 'any',
    'Nhật': 'east_asia', 'Hàn': 'east_asia', 'Singapore': 'east_asia', 'Malaysia': 'se_asia', 'Philippines': 'se_asia',
    'Thái': 'se_asia', 'Ấn Độ': 'south_asia', 'Brazil': 'latin', 'Mexico': 'latin', 'Tây Ban Nha': 'latin',
    'Ai Cập': 'mena', 'Iran': 'mena', 'Thổ Nhĩ Kỳ': 'mena', 'Ghana': 'africa', 'Kenya': 'africa', 'Hawaii': 'pacific',
}
NAME_ORIGIN = {
    'Kenji': 'east_asia', 'Kenzo': 'east_asia', 'Ken': 'east_asia', 'Amara': 'africa', 'Chef Marco': 'europe',
    'Captain Ray': 'europe', 'Dr. Stella': 'latin', 'Leo': 'europe', 'Nhà Khảo Cổ Amir': 'mena', 'Thương Nhân Lạc Đà': 'mena',
    'Cô Bé Ốc Đảo': 'mena', 'Liam': 'europe', 'Sophie': 'europe', 'Mateo': 'latin', 'Omar': 'mena', 'Priya': 'south_asia',
    'Fatima': 'se_asia',
}


def origin_of(c):
    if c['name'] in NAME_ORIGIN:
        return NAME_ORIGIN[c['name']]
    for country, o in COUNTRY.items():
        if f'Bạn {country}' in c['feature'] or f'người {country}' in c['feature']:
            return o
    if c['outfit_theme'] == 'fantasy_scifi' or c['gender'] == 'n':
        return 'any'
    return 'vn'


def cast(scenario_id, offset, chars):
    out = []
    counters = {'f': 0, 'm': 0, 'n': 0}
    for i, c in enumerate(chars):
        k = (i + offset) % 12
        g = c['gender']
        style, length = c['_hair'] or HAIR[g][(counters[g] + offset) % len(HAIR[g])]
        counters[g] += 1
        o = origin_of(c)
        skins, eyes, hairs = ORIGINS[o]
        if o == 'africa' and not c['_hair']:
            style, length = [('afro', 'short' if g == 'm' else 'shoulder'), ('braid', 'long'), ('buzz', 'buzz') if g == 'm' else ('twin_buns', 'shoulder')][i % 3]
        if not c['_hair']:
            if style == 'afro' and o not in ('africa', 'any', 'latin'):
                style, length = ('curly', 'shoulder') if g == 'f' else ('short_neat', 'short')
            if c['age_group'] == 'elder':
                style, length = (('bun', 'long') if i % 2 else ('half_up', 'shoulder')) if g == 'f' else (('short_neat', 'short') if i % 2 else ('side_part', 'short'))
        hair_color = c['_hair_color'] or (ELDER_HAIR_COLORS[(i + offset) % 4] if c['age_group'] == 'elder' else hairs[(i + offset) % len(hairs)])
        row = dict(
            id=f'{scenario_id}#{i + 1:02d}', scenario_id=scenario_id, slot=i + 1,
            name=c['name'], feature=c['feature'], age_group=c['age_group'], gender=g,
            skin_code=c['_skin'] or skins[(i + offset) % len(skins)], skin_freckles=c['skin_freckles'] or ('freckles' in c['accessories']),
            eye_code=eyes[(i + offset) % len(eyes)], hair_color=hair_color, hair_style=style, hair_length=length,
            hair_dyed=c['hair_dyed'], hair_covered=c['hair_covered'],
            outfit_theme=c['outfit_theme'], outfit_color=c['outfit_color'], clothing_text=c['clothing_text'],
            prop_category=c['prop_category'], weapon_label=c['weapon_label'], accessories=c['accessories'],
            role=c['role'], team=c['team'],
        )
        out.append(row)
    return out


def S(n, title, goal, beats, hook, reward, vocab, assets, optional=False, minutes=5):
    return dict(n=n, title=title, minutes=minutes, optional=optional, goal=goal, beats=beats,
                question_hook=hook, reward=reward, vocab=vocab, assets=assets)


def validate(scn):
    assert len(scn['stages']) == 8, scn['id']
    core = [s for s in scn['stages'] if not s['optional']]
    assert len(core) == 6 and sum(s['minutes'] for s in core) == 30, scn['id']
    assert [s['n'] for s in scn['stages']] == list(range(1, 9)), scn['id']
    assert len(scn['characters']) == 12, (scn['id'], len(scn['characters']))
    for c in scn['characters']:
        assert c['age_group'] in VALID['age_group'], c
        assert c['gender'] in VALID['gender'], c
        assert c['outfit_theme'] in VALID['outfit_theme'], c
        assert c['outfit_color'] in VALID['outfit_color'], c
        assert c['prop_category'] is None or c['prop_category'] in VALID['prop'], c
        assert all(a in VALID['accessory'] for a in c['accessories']), c
        assert c['team'] in VALID['team'], c
        assert c['skin_code'] in VALID['skin'], c
        assert c['eye_code'] in VALID['eye'], c
        assert c['hair_color'] in VALID['hair_color'], c
        assert c['hair_style'] in VALID['hair_style'], c
        assert c['hair_length'] in {'buzz', 'short', 'shoulder', 'long'}, c
    for k in ('title', 'inspiration', 'setting', 'story'):
        assert scn[k], (scn['id'], k)
    assert scn['class_plan'].get('sizes'), scn['id']
