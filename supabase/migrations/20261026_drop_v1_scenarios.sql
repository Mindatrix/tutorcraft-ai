-- Founder asked (2026-10-26) to delete the 50 archived v1 scenarios (boat/bug/chess/penalty/treasure).
-- Their 268 characters go with them (FK on delete cascade). The v1 data stays in git history only.
-- Applied to project zzkwcjakdoprxurtapen on 2026-10-26.
delete from public.game_scenarios where plan_version = 1 or game in ('chess','bug','penalty','treasure','boat');

alter table public.game_scenarios drop constraint game_scenarios_game_check;
alter table public.game_scenarios add constraint game_scenarios_game_check
  check (game = any (array['kayak_rush','multiverse_portal','summer_camp','river_fishing','river_survival']));
alter table public.game_scenarios alter column plan_version set default 2;
