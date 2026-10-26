import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import re
import common, camp, fishing, survival, kayak, multiverse, dino, patch_assets

ALL = []
for m in (kayak, multiverse, camp, fishing, survival, dino):
    for s in m.SCENARIOS:
        common.validate(s)
        patch_assets.apply(s)
        # Model 3D của nhân vật (ghi ở đầu clothing_text dạng [asset_id]) cũng phải nằm trong danh sách tải.
        tagged = {m.group(1) for c in s['characters'] for m in [re.match(r'\[(\w+)\]', str(c['clothing_text']))] if m}
        s['asset_ids'] = sorted({a for st in s['stages'] for a in st['assets']} | tagged)
        ALL.append(s)

# Scenario tags drive the random-event planner (src/engine/runEvents.ts):
# night = night-time scenario, weather_locked = the story fixes its own weather, others = place / world.
TAGS = {
    'kayak-01': [], 'kayak-02': ['rapids'], 'kayak-03': ['dusk', 'canyon'], 'kayak-04': ['village'], 'kayak-05': ['night', 'festival'],
    'mv-01': ['castle'], 'mv-02': ['cyberpunk', 'weather_locked'], 'mv-03': ['desert'], 'mv-04': ['castle', 'cyberpunk'],
    'mv-05': ['castle', 'cyberpunk', 'desert'],
    'camp-01': [], 'camp-02': [], 'camp-03': ['weather_locked', 'storm'], 'camp-04': ['night'], 'camp-05': ['hike'],
    'fish-01': ['dawn'], 'fish-02': ['tournament'], 'fish-03': ['waterfall', 'rapids'], 'fish-04': ['night'], 'fish-05': ['sunset'],
    'dino-01': ['dawn'], 'dino-02': [], 'dino-03': ['plateau', 'drought'], 'dino-04': ['night', 'storm', 'weather_locked'], 'dino-05': ['dusk', 'lake'],
    'surv-01': ['dusk'], 'surv-02': ['waterfall'], 'surv-03': ['night'], 'surv-04': ['weather_locked', 'rain'], 'surv-05': ['island'],
}
# Optional stages reuse the world's own question mechanic, so the bonus time feels like the same game.
OPT7 = {'kayak_rush': 'Câu hỏi hiện trên cổng phao như chặng chính; đúng là Nitro.',
        'multiverse_portal': 'Câu hỏi hiện thành ấn phép trên kiếm của Scarlet như trận chính.',
        'summer_camp': 'Câu hỏi hiện ngay trên vật thể phát sáng như các chặng chính.',
        'river_fishing': 'Thanh căng dây như các chặng chính: kéo cần về đúng vùng đáp án.',
        'river_survival': 'Câu hỏi hiện trên Bảng Nhiệm vụ và trên Chuồng Gỗ như trận chính.',
        'dino_journey': 'Câu hỏi hiện trên vật thể phát sáng trên đồng cỏ như các chặng chính.'}
OPT8 = {'kayak_rush': 'Mỗi em viết hoặc chọn câu tiếng Anh của mình trên tấm biển ở bến.',
        'multiverse_portal': 'Mỗi em viết hoặc chọn câu tiếng Anh của mình trên trang sách phép.',
        'summer_camp': 'Mỗi em viết hoặc chọn câu tiếng Anh của mình trên tấm bảng gỗ của trại.',
        'river_fishing': 'Mỗi em viết hoặc chọn câu tiếng Anh của mình vào Sổ Câu Cá.',
        'river_survival': 'Mỗi em viết hoặc chọn câu tiếng Anh của mình trên tấm bảng bên lửa trại.',
        'dino_journey': 'Mỗi em viết hoặc chọn câu tiếng Anh của mình khắc lên tảng đá của bầy.'}
for s in ALL:
    s['tags'] = TAGS[s['id']]
    for st in s['stages']:
        if st['optional'] and len(st['question_hook']) < 40:
            tail = 'Câu khó hơn một bậc, sao nhân đôi.' if st['n'] == 7 else st['question_hook']
            st['question_hook'] = f"{(OPT7 if st['n'] == 7 else OPT8)[s['game']]} {tail}"
ids = [s['id'] for s in ALL]
assert len(ids) == len(set(ids)) == 30

def q(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, int):
        return str(v)
    if isinstance(v, (list,)) and all(isinstance(x, str) for x in v):
        return "array[" + ",".join(q(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    if isinstance(v, (dict, list)):
        return q(json.dumps(v, ensure_ascii=False)) + '::jsonb'
    return "'" + str(v).replace("'", "''") + "'"

out = ['-- v2 scenario set (plan 2026-10-26): 6 worlds x 5 scenarios, 12 characters each.',
       '-- Generated from scripts/scenarios-v2 data; safe to re-run (upsert).', 'begin;']
for s in ALL:
    cols = dict(id=s['id'], game=s['game'], seq=s['seq'], title=s['title'], inspiration=s['inspiration'], story=s['story'],
                rounds=s['rounds'], minutes_per_round=s['minutes_per_round'], total_minutes=s['total_minutes'],
                character_count=len(s['characters']), active=True, setting=s['setting'], stages=s['stages'],
                class_plan=s['class_plan'], asset_ids=s['asset_ids'], plan_version=2)
    names = ', '.join(cols)
    vals = ', '.join(q(v) for v in cols.values())
    upd = ', '.join(f'{k} = excluded.{k}' for k in cols if k != 'id')
    out.append(f'insert into public.game_scenarios ({names}) values ({vals}) on conflict (id) do update set {upd};')
    out.append(f"delete from public.scenario_characters where scenario_id = {q(s['id'])};")
    for c in s['characters']:
        cn = ', '.join(c)
        cv = ', '.join(q(v) for v in c.values())
        out.append(f'insert into public.scenario_characters ({cn}) values ({cv});')
out.append('commit;')

here = os.path.dirname(__file__)
open(os.path.join(here, 'scenarios_v2.sql'), 'w').write('\n'.join(out) + '\n')
json.dump(ALL, open(os.path.join(here, 'scenarios_v2.json'), 'w'), ensure_ascii=False, indent=1)

assets = {}
for s in ALL:
    for a in s['asset_ids']:
        assets.setdefault(a, []).append(s['id'])
json.dump(assets, open(os.path.join(here, 'asset_usage.json'), 'w'), ensure_ascii=False, indent=1)
print(len(ALL), 'scenarios;', sum(len(s['characters']) for s in ALL), 'characters;', len(assets), 'asset ids')

# ---------------------------------------------------------------- compact seed (one file per game)
NAMES = {'kayak_rush': 'Kayak Rush 3D', 'multiverse_portal': 'Multiverse Portal RPG', 'summer_camp': 'Summer Camp Quests',
         'river_fishing': 'River Fishing Challenge', 'river_survival': 'River Survival: Escape & Pursuit', 'dino_journey': 'Hành trình khủng long'}
MODS = {'kayak_rush': kayak, 'multiverse_portal': multiverse, 'summer_camp': camp, 'river_fishing': fishing, 'river_survival': survival, 'dino_journey': dino}
HOOKS = {'kayak_rush': kayak.HOOK, 'multiverse_portal': multiverse.HOOK, 'summer_camp': camp.HOOK, 'river_fishing': fishing.HOOK,
         'river_survival': survival.HOOK_TASK, 'dino_journey': dino.HOOK}
SHARED_KEYS = None
dump = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
os.makedirs(os.path.join(here, 'seed'), exist_ok=True)
worlds = []
for game, mod in MODS.items():
    base = mod.plan() if game not in ('river_survival',) else mod.plan({})
    worlds.append([game, NAMES[game], HOOKS[game], base])
open(os.path.join(here, 'seed', '00_game_worlds.sql'), 'w').write(
    "insert into public.game_worlds (game, name, question_hook, class_plan)\n"
    "select e->>0, e->>1, e->>2, e->3 from jsonb_array_elements($j$" + dump(worlds) + "$j$::jsonb) e\n"
    "on conflict (game) do update set name = excluded.name, question_hook = excluded.question_hook, class_plan = excluded.class_plan, updated_at = now();\n")
CH_COLS = ['name', 'feature', 'age_group', 'gender', 'skin_code', 'skin_freckles', 'eye_code', 'hair_color', 'hair_style',
           'hair_length', 'hair_dyed', 'hair_covered', 'outfit_theme', 'outfit_color', 'clothing_text', 'prop_category',
           'weapon_label', 'accessories', 'role', 'team']
for i, (game, mod) in enumerate(MODS.items(), 1):
    base = worlds[i - 1][3]
    rows, chars = [], []
    for s in [x for x in ALL if x['game'] == game]:
        override = {k: v for k, v in s['class_plan'].items() if k not in base or base[k] != v}
        rows.append([s['id'], s['seq'], s['title'], s['inspiration'], s['story'], s['setting'], s['stages'], override, s['asset_ids']])
        for c in s['characters']:
            chars.append([s['id'], c['slot']] + [c[k] for k in CH_COLS])
    sql = (
        f"-- {NAMES[game]}: 5 scenarios + 60 characters (plan 2026-10-26)\n"
        "insert into public.game_scenarios (id, game, seq, title, inspiration, story, setting, stages, class_plan, asset_ids,\n"
        "  rounds, minutes_per_round, character_count, active, plan_version)\n"
        f"select e->>0, '{game}', (e->>1)::smallint, e->>2, e->>3, e->>4, e->>5, e->6, e->7,\n"
        "  array(select jsonb_array_elements_text(e->8)), 6, 5, 12, true, 2\n"
        "from jsonb_array_elements($j$" + dump(rows) + "$j$::jsonb) e\n"
        "on conflict (id) do update set game = excluded.game, seq = excluded.seq, title = excluded.title, inspiration = excluded.inspiration,\n"
        "  story = excluded.story, setting = excluded.setting, stages = excluded.stages, class_plan = excluded.class_plan,\n"
        "  asset_ids = excluded.asset_ids, rounds = excluded.rounds, minutes_per_round = excluded.minutes_per_round,"
        " character_count = excluded.character_count, active = true, plan_version = 2;\n"
        f"delete from public.scenario_characters where scenario_id like '{rows[0][0].split('-')[0]}-%';\n"
        "insert into public.scenario_characters (id, scenario_id, slot, " + ', '.join(CH_COLS) + ")\n"
        "select (e->>0) || '#' || lpad(e->>1, 2, '0'), e->>0, (e->>1)::smallint,\n  "
        + ', '.join(
            f"(e->>{j + 2})::boolean" if k in ('skin_freckles', 'hair_dyed', 'hair_covered') else
            f"array(select jsonb_array_elements_text(e->{j + 2}))" if k == 'accessories' else f"e->>{j + 2}"
            for j, k in enumerate(CH_COLS)) +
        "\nfrom jsonb_array_elements($j$" + dump(chars) + "$j$::jsonb) e;\n")
    open(os.path.join(here, 'seed', f'{i:02d}_{game}.sql'), 'w').write(sql)
print('seed files:', sorted(os.listdir(os.path.join(here, 'seed'))))

# ---------------------------------------------------------------- content/ for scripts/seed-scenarios-v2.mjs
root = os.path.abspath(os.path.join(here, '..', '..', 'content'))
json.dump([{'game': g, 'name': n, 'question_hook': h, 'class_plan': p} for g, n, h, p in worlds], open(os.path.join(root, 'game_worlds_v2.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(ALL, open(os.path.join(root, 'scenarios_v2.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(assets, open(os.path.join(root, 'asset_usage_v2.json'), 'w'), ensure_ascii=False, indent=1)
print('content/ written')
