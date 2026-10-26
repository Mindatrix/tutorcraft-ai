-- Plan 2026-10-26: 5 worlds (kayak_rush, multiverse_portal, summer_camp, river_fishing, river_survival),
-- 5 excellent scenarios each. Old 50 scenarios (boat/bug/chess/penalty/treasure) are archived, not deleted.
-- Applied to project zzkwcjakdoprxurtapen on 2026-10-26.

update public.game_scenarios set active = false where game in ('boat','bug','chess','penalty','treasure');

alter table public.game_scenarios drop constraint game_scenarios_game_check;
alter table public.game_scenarios add constraint game_scenarios_game_check
  check (game = any (array['chess','bug','penalty','treasure','boat',
                           'kayak_rush','multiverse_portal','summer_camp','river_fishing','river_survival']));

alter table public.game_scenarios drop constraint game_scenarios_character_count_check;
alter table public.game_scenarios add constraint game_scenarios_character_count_check
  check (character_count between 2 and 12);

alter table public.game_scenarios
  add column if not exists setting text,
  add column if not exists stages jsonb not null default '[]'::jsonb,
  add column if not exists class_plan jsonb not null default '{}'::jsonb,
  add column if not exists asset_ids text[] not null default '{}',
  add column if not exists plan_version smallint not null default 1;

comment on column public.game_scenarios.setting is 'Bối cảnh (place, time of day, weather, mood).';
comment on column public.game_scenarios.stages is 'Ordered stages: [{n, title, minutes, optional, goal, beats[], question_hook, assets[]}]. 6 core x 5 min + 2 optional.';
comment on column public.game_scenarios.class_plan is 'How a class of 1-50 is split into squads/teams and roles.';
comment on column public.game_scenarios.asset_ids is 'Asset catalog ids this scenario needs (see src/config/assetCatalog).';
comment on column public.game_scenarios.plan_version is '1 = old 2026-10-24 set, 2 = river lineup 2026-10-26.';

alter table public.scenario_characters drop constraint scenario_characters_slot_check;
alter table public.scenario_characters add constraint scenario_characters_slot_check check (slot between 1 and 12);

alter table public.scenario_characters
  add column if not exists role text,
  add column if not exists team text;
alter table public.scenario_characters add constraint scenario_characters_team_check
  check (team is null or team = any (array['escapers','pursuers','campers','anglers','racers','heroes','npc']));
