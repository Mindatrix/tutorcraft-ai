import json, os, sys
sys.path.insert(0, '.')
import build
from build import ALL, CH_COLS, worlds, dump
os.makedirs('per', exist_ok=True)
base = {w[0]: w[3] for w in worlds}
for s in ALL:
    b = base[s['game']]
    override = {k: v for k, v in s['class_plan'].items() if k not in b or b[k] != v}
    row = [s['id'], s['seq'], s['title'], s['inspiration'], s['story'], s['setting'], s['stages'], override, s['asset_ids']]
    chars = [[c['slot']] + [c[k] for k in CH_COLS] for c in s['characters']]
    sid = s['id']
    sql = (
        "insert into public.game_scenarios (id, game, seq, title, inspiration, story, setting, stages, class_plan, asset_ids, rounds, minutes_per_round, character_count, active, plan_version)\n"
        f"select e->>0, '{s['game']}', (e->>1)::smallint, e->>2, e->>3, e->>4, e->>5, e->6, e->7, array(select jsonb_array_elements_text(e->8)), 6, 5, 12, true, 2\n"
        "from (select $j$" + dump(row) + "$j$::jsonb e) x\n"
        "on conflict (id) do update set game=excluded.game, seq=excluded.seq, title=excluded.title, inspiration=excluded.inspiration, story=excluded.story, setting=excluded.setting, stages=excluded.stages, class_plan=excluded.class_plan, asset_ids=excluded.asset_ids, rounds=6, minutes_per_round=5, character_count=12, active=true, plan_version=2;\n"
        f"delete from public.scenario_characters where scenario_id = '{sid}';\n"
        f"insert into public.scenario_characters (id, scenario_id, slot, {', '.join(CH_COLS)})\n"
        f"select '{sid}#' || lpad(e->>0, 2, '0'), '{sid}', (e->>0)::smallint, "
        + ', '.join(f"(e->>{j+1})::boolean" if k in ('skin_freckles','hair_dyed','hair_covered') else f"array(select jsonb_array_elements_text(e->{j+1}))" if k=='accessories' else f"e->>{j+1}" for j,k in enumerate(CH_COLS))
        + "\nfrom jsonb_array_elements($j$" + dump(chars) + "$j$::jsonb) e;\n")
    open(f'per/{sid}.sql', 'w').write(sql)
for f in sorted(os.listdir('per')):
    print(f, os.path.getsize('per/'+f))
