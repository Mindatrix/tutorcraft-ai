// Nạp 30 kịch bản v2 (6 game × 5, gồm Hành trình khủng long) + 360 nhân vật + luật chung từng game
// vào Supabase, kèm phụ đề 6 mức. Nguồn: content/scenarios_v2.json và content/game_worlds_v2.json.
// (supabase/seed/scenarios_v2/*.sql là bản SQL tương đương, chép từ scripts/scenarios-v2/seed.)
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
// A2.6: stage subtitles also go to their own column ({"1": [lines], ...}) so the game can load
// them without the whole stages blob. Lines are {vi, en, parts:["text", [en, vi, band]]}.
const subtitlesOf = (stages) =>
  Object.fromEntries((stages ?? []).filter((st) => Array.isArray(st.subtitles) && st.subtitles.length).map((st) => [String(st.n), st.subtitles]));
let subtitleLines = 0;

async function run(label, p) {
  const { error } = await p;
  if (error) throw new Error(`${label}: ${error.message}`);
}

await run('game_worlds', db.from('game_worlds').upsert(worlds.map((w) => ({ ...w, updated_at: new Date().toISOString() }))));
for (const s of scenarios) {
  const override = Object.fromEntries(Object.entries(s.class_plan).filter(([k, v]) => !same(base[s.game]?.[k], v)));
  await run(s.id, db.from('game_scenarios').upsert({
    id: s.id, game: s.game, seq: s.seq, title: s.title, inspiration: s.inspiration, story: s.story, setting: s.setting,
    stages: s.stages, subtitles: subtitlesOf(s.stages), class_plan: override, asset_ids: s.asset_ids, tags: s.tags ?? [], rounds: 6, minutes_per_round: 5,
    character_count: s.characters.length, active: true, plan_version: 2,
  }));
  await run(`${s.id} xoá nhân vật cũ`, db.from('scenario_characters').delete().eq('scenario_id', s.id));
  await run(`${s.id} nhân vật`, db.from('scenario_characters').insert(s.characters));
  subtitleLines += s.stages.reduce((n, st) => n + (Array.isArray(st.subtitles) ? st.subtitles.length : 0), 0);
  console.log('✓', s.id, s.title);
}
console.log(`Xong: ${scenarios.length} kịch bản, ${scenarios.reduce((n, s) => n + s.characters.length, 0)} nhân vật, ${subtitleLines} dòng phụ đề.`);
