-- One row per game world: shared class plan (1-50 students), roles, rules and the default question hook.
-- Scenario rows keep only what differs (game_scenarios.class_plan = overrides).
-- Applied to project zzkwcjakdoprxurtapen on 2026-10-26. Data: supabase/seed/scenarios_v2/ or scripts/seed-scenarios-v2.mjs.
create table if not exists public.game_worlds (
  game text primary key check (game = any (array['kayak_rush','multiverse_portal','summer_camp','river_fishing','river_survival'])),
  name text not null,
  question_hook text not null,
  class_plan jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.game_worlds enable row level security;
create policy "game worlds are readable" on public.game_worlds for select to anon, authenticated using (true);
comment on table public.game_worlds is 'Plan 2026-10-26: shared rules per world; merge with game_scenarios.class_plan (overrides).';
