// Nạp 25 kịch bản v2 (5 game × 5) + 300 nhân vật + luật chung từng game vào Supabase.
// Chạy trên máy bạn (cần mạng):  node --env-file=.env.local scripts/seed-scenarios-v2.mjs
// An toàn khi chạy lại (upsert). Không xoá kịch bản cũ (đã lưu trữ active=false).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong .env.local');
const db = createClient(url, key, { auth: { persistSession: false } });

const worlds = JSON.parse(readFileSync('content/game_worlds_v2.json', 'utf8'));
const scenarios = JSON.parse(readFileSync('content/scenarios_v2.json', 'utf8'));
const base = Object.fromEntries(worlds.map((w) => [w.game, w.class_plan]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function run(label, p) {
  const { error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
}

await run('game_worlds', db.from('game_worlds').upsert(worlds.map((w) => ({ ...w, updated_at: new Date().toISOString() }))));
for (const s of scenarios) {
  const override = Object.fromEntries(Object.entries(s.class_plan).filter(([k, v]) => !same(base[s.game]?.[k], v)));
  await run(s.id, db.from('game_scenarios').upsert({
    id: s.id, game: s.game, seq: s.seq, title: s.title, inspiration: s.inspiration, story: s.story, setting: s.setting,
    stages: s.stages, class_plan: override, asset_ids: s.asset_ids, tags: s.tags ?? [], rounds: 6, minutes_per_round: 5,
    character_count: s.characters.length, active: true, plan_version: 2,
  }));
  await run(`${s.id} xoá nhân vật cũ`, db.from('scenario_characters').delete().eq('scenario_id', s.id));
  await run(`${s.id} nhân vật`, db.from('scenario_characters').insert(s.characters));
  console.log('✓', s.id, s.title);
}
console.log(`Xong: ${scenarios.length} kịch bản, ${scenarios.reduce((n, s) => n + s.characters.length, 0)} nhân vật.`);
