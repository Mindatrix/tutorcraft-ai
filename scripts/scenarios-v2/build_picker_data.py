"""Rebuild public/character-picker/data.json (tutor character picker) from content/scenarios_v2.json.
Run: python3 scripts/scenarios-v2/build_picker_data.py
Animals, robots and monsters (gender 'n' mascots) are left out: the picker kit only builds people."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/character-picker/data.json'
old = json.loads(OUT.read_text(encoding='utf-8'))
SKIN = {"S1": "#F6E3D8", "S2": "#F2CDBD", "S3": "#F3D9A8", "S4": "#D9B98A", "S5": "#C99A6B", "S6": "#B07F55", "S7": "#8D5A3B",
        "S8": "#6B4129", "S9": "#3E2418", "X1": "#7FD1C4", "X2": "#BFD9F2"}
EYE = {"E_brown_dark": "#3B2417", "E_brown": "#6B4226", "E_light_brown": "#A0703C", "E_amber": "#C58B2A", "E_green": "#4C8F5A",
       "E_blue": "#3C78C2", "E_ice": "#A9D6F0", "E_gray": "#8A9199", "E_blue_gray": "#6F8CA3", "E_violet": "#7B5CC4",
       "E_yellow": "#E3C84A", "E_black": "#15110F", "E_hetero": "#C58B2A"}
NOT_PEOPLE = ('Linh vật', 'Linh thú', 'Quái', 'Cá MVP', 'Manh mối', 'Người gác', 'Đối thủ máy')


def hat(text):
    t = text.lower()
    if 'nón lá' in t:
        return 'hat_conical'
    if any(k in t for k in ('rộng vành', 'mũ cói', 'mũ rơm', 'tai bèo', 'mũ bucket')):
        return 'hat_wide'
    if any(k in t for k in ('mũ len', 'mũ trùm')):
        return 'hat_beanie'
    return 'hat_cap'


scenarios, chars = [], []
for s in json.loads((ROOT / 'content/scenarios_v2.json').read_text(encoding='utf-8')):
    scenarios.append({'id': s['id'], 'game': s['game'], 'title': s['title']})
    for c in s['characters']:
        if c['gender'] == 'n' and c['role'].startswith(NOT_PEOPLE):
            continue
        chars.append({
            'id': c['id'], 'sc': s['id'], 'name': c['name'], 'feature': c['feature'], 'age': c['age_group'],
            'skin': c['skin_code'], 'skinHex': SKIN[c['skin_code']], 'eyeHex': EYE[c['eye_code']],
            'hair': {'color': c['hair_color'], 'hex': old['hairHex'][c['hair_color']], 'style': c['hair_style'],
                     'len': c['hair_length'], 'covered': c['hair_covered']},
            'outfit': {'theme': c['outfit_theme'], 'color': c['outfit_color'], 'hex': old['outfitHex'][c['outfit_color']],
                       'text': c['clothing_text'], 'skirt': 'váy' in c['clothing_text'].lower()},
            'prop': c['prop_category'], 'propLabel': c['weapon_label'], 'acc': c['accessories'],
            'hat': hat(c['clothing_text']), 'freckles': c['skin_freckles'], 'gender': c['gender'],
            'role': c['role'], 'team': c['team'],
        })
OUT.write_text(json.dumps({'scenarios': scenarios, 'characters': chars, 'hairHex': old['hairHex'], 'outfitHex': old['outfitHex']},
                          ensure_ascii=False), encoding='utf-8')
print(len(scenarios), 'scenarios,', len(chars), 'people')
