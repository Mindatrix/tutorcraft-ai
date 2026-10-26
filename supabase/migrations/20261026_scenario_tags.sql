-- Tags for the random-event planner (src/engine/runEvents.ts): night, weather_locked, place/world tags.
-- Applied to project zzkwcjakdoprxurtapen on 2026-10-26.
alter table public.game_scenarios add column if not exists tags text[] not null default '{}';
comment on column public.game_scenarios.tags is 'Random-event planner tags: night, dusk, dawn, weather_locked, rapids, waterfall, island, castle, cyberpunk, desert...';
