-- Game 6 "Hành trình khủng long" (dino_journey), plan 2026-10-26.
-- Allows the new game id in both tables. Run once in the Supabase SQL editor, then re-run the seed script.
alter table public.game_scenarios drop constraint if exists game_scenarios_game_check;
alter table public.game_scenarios add constraint game_scenarios_game_check
  check (game = any (array['kayak_rush','multiverse_portal','summer_camp','river_fishing','river_survival','dino_journey']));
alter table public.game_worlds drop constraint if exists game_worlds_game_check;
alter table public.game_worlds add constraint game_worlds_game_check
  check (game = any (array['kayak_rush','multiverse_portal','summer_camp','river_fishing','river_survival','dino_journey']));
