-- Shared fixed-window rate limiter (one row per key). Only the service role can call it.
create table if not exists public.rate_limits (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
alter table public.rate_limits enable row level security;
comment on table public.rate_limits is 'RLS: chỉ service_role truy cập (giới hạn tốc độ dùng chung)';
create index if not exists rate_limits_reset_at_idx on public.rate_limits (reset_at);

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_ms integer)
returns table (ok boolean, retry_after_sec integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
  v_reset timestamptz;
begin
  insert into public.rate_limits as r (key, count, reset_at)
  values (p_key, 1, v_now + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update set
    count = case when r.reset_at <= v_now then 1 else r.count + 1 end,
    reset_at = case when r.reset_at <= v_now then v_now + make_interval(secs => p_window_ms / 1000.0) else r.reset_at end
  returning r.count, r.reset_at into v_count, v_reset;

  if random() < 0.01 then
    delete from public.rate_limits where reset_at < v_now - interval '1 hour';
  end if;

  ok := v_count <= p_limit;
  retry_after_sec := case when ok then 0 else greatest(1, ceil(extract(epoch from (v_reset - v_now)))::integer) end;
  return next;
end;
$$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
