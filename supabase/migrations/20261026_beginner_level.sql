-- A1.3: Beginner = level 0 (Pre-A1, all-Vietnamese support). Levels 1..5 keep their numbers,
-- so nothing already saved has to move. Mirrors LEVELS[0] in src/engine/levels.ts.
alter table public.difficulty_levels drop constraint if exists difficulty_levels_level_check;
alter table public.difficulty_levels add constraint difficulty_levels_level_check check (level between 0 and 5);

insert into public.difficulty_levels
  (level, code, name_vi, min_age, description, cefr, time_mult, allowed_wrong, mix_easy, mix_medium, mix_hard, bot_accuracy, bot_pace)
values
  (0, 'beginner', 'Beginner', 5, 'Mới bắt đầu: câu hỏi và gợi ý bằng tiếng Việt, chỉ từ tiếng Anh cơ bản kèm nghĩa; phụ đề toàn tiếng Việt',
   'Pre-A1', 1.7, 0.7, 1.0, 0.0, 0.0, 0.35, 0.9)
on conflict (level) do update set
  code = excluded.code, name_vi = excluded.name_vi, description = excluded.description, cefr = excluded.cefr,
  time_mult = excluded.time_mult, allowed_wrong = excluded.allowed_wrong, mix_easy = excluded.mix_easy,
  mix_medium = excluded.mix_medium, mix_hard = excluded.mix_hard, bot_accuracy = excluded.bot_accuracy, bot_pace = excluded.bot_pace;
