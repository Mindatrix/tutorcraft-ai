-- Covering indexes for foreign keys flagged by the Supabase performance advisor.
create index if not exists activity_logs_battle_id_idx on public.activity_logs (battle_id);
create index if not exists activity_logs_student_id_idx on public.activity_logs (student_id);
create index if not exists battles_tutor_id_idx on public.battles (tutor_id);
create index if not exists multiplayer_rooms_battle_id_idx on public.multiplayer_rooms (battle_id);
