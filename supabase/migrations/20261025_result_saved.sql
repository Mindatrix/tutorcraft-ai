-- Results that could not be written to battle_results are kept on the session and retried.
alter table public.battle_sessions add column if not exists result_saved boolean;
comment on column public.battle_sessions.result_saved is 'false = trận đã xong nhưng chưa có trong battle_results; máy chủ sẽ tự ghi lại';
update public.battle_sessions s set result_saved = exists (select 1 from public.battle_results r where r.session_id = s.id) where s.status = 'finished' and s.result_saved is null;
create index if not exists battle_sessions_unsaved_idx on public.battle_sessions (updated_at) where result_saved = false;
