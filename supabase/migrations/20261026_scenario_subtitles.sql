-- A2.6: level-aware subtitles per scenario, keyed by stage number:
--   { "1": [ {vi, en, parts:[ "text", [english, vietnamese, band] ... ]} ], "2": [...] }
-- Filled by scripts/seed-scenarios-v2.mjs from stages[].subtitles (re-seeding keeps the
-- scenario rows; it only refreshes this column). Rendered by src/engine/subtitles.ts.
alter table public.game_scenarios add column if not exists subtitles jsonb not null default '{}'::jsonb;
comment on column public.game_scenarios.subtitles is 'Phụ đề theo chặng: {"1":[{vi,en,parts}]} — bậc từ 0..5, xem src/engine/subtitles.ts';

update public.game_scenarios g set subtitles = coalesce((
  select jsonb_object_agg(st->>'n', st->'subtitles')
  from jsonb_array_elements(g.stages) st
  where jsonb_typeof(st->'subtitles') = 'array' and jsonb_array_length(st->'subtitles') > 0
), '{}'::jsonb);
