-- Phase C4.16–C4.19: coins (xu), the coin ledger, the character inventory, monthly seasons.
--   Two currencies, kept apart on purpose:
--     - ranking points (season_scores.points, from stars): decide the ranking, never bought;
--     - coins (coin_wallets / coin_ledger): earned only by playing, spent on hints (later on
--       characters), never sold for real money.
--   No function, view or policy turns coins into points: coin_apply never touches season_scores and
--   season_add_points never touches the coin tables (tests/coins.test.ts reads this file to check).
--   Students are not database users: every write goes through our API with the service role. Tutors
--   (authenticated) may only READ the coins / scores of students who played in their own matches.

-- ---------------------------------------------------------------------------------------------
-- C4.17 wallet: one row per student (student_key = the device key used to join matches).
create table if not exists public.coin_wallets (
  student_key text primary key check (char_length(student_key) between 1 and 64),
  balance integer not null default 0 check (balance >= 0),
  earned_total integer not null default 0 check (earned_total >= 0),
  spent_total integer not null default 0 check (spent_total >= 0),
  updated_at timestamptz not null default now()
);
comment on table public.coin_wallets is 'Ví xu của học sinh (C4.17). Chỉ đổi qua coin_apply cùng một dòng sổ cái. Xu không bán bằng tiền thật, không đổi được thành điểm xếp hạng.';

-- One row per event; (student, reason, ref) unique = an event is paid once, retries are no-ops.
create table if not exists public.coin_ledger (
  id bigint generated always as identity primary key,
  student_key text not null references public.coin_wallets(student_key) on delete cascade,
  delta integer not null check (delta between -1000 and 1000),
  reason text not null check (reason in ('answer', 'chot', 'stage', 'golden_accept', 'hint', 'box', 'rescue')),
  ref text not null check (char_length(ref) between 1 and 200),
  -- No foreign key on purpose: the ledger is an audit log that outlives matches, and an FK would
  -- need an index that only the match-cap sum uses (it already narrows by student_key first).
  match_id uuid,
  session_id uuid,
  meta jsonb not null default '{}'::jsonb,
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  constraint coin_ledger_once unique (student_key, reason, ref)
);
comment on table public.coin_ledger is 'Sổ cái xu (C4.17): mỗi dòng một sự kiện (đúng, chốt chặng, gợi ý, hộp quà, cứu hộ, nhận thử thách vàng). Sai không bao giờ trừ xu.';

-- C4.17 characters a student owns (the shop itself comes later; unlocks by long streaks / top places).
create table if not exists public.character_inventory (
  student_key text not null check (char_length(student_key) between 1 and 64),
  character_id text not null check (char_length(character_id) between 1 and 80),
  variant text not null default 'base' check (variant in ('base', 'gold', 'ice', 'neon')),
  source text not null check (source in ('streak', 'top', 'shop', 'gift')),
  acquired_at timestamptz not null default now(),
  primary key (student_key, character_id, variant)
);
comment on table public.character_inventory is 'Kho nhân vật của học sinh (C4.17). Bậc thường 300, hiếm 800, sử thi 2000, huyền thoại 5000 xu khi có cửa hàng.';

-- C4.17 monthly seasons and their ranking points (separate from coins).
create table if not exists public.seasons (
  id text primary key check (id ~ '^[0-9]{4}-[0-9]{2}$'),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
comment on table public.seasons is 'Mùa giải theo tháng (id = YYYY-MM).';

create table if not exists public.season_scores (
  season_id text not null references public.seasons(id) on delete cascade,
  student_key text not null check (char_length(student_key) between 1 and 64),
  class_code text not null,
  nickname text not null default '',
  points integer not null default 0 check (points >= 0),
  matches integer not null default 0 check (matches >= 0),
  updated_at timestamptz not null default now(),
  primary key (season_id, student_key, class_code)
);
-- The class leaderboard index (season_id, class_code, points desc) comes with the leaderboard page.
comment on table public.season_scores is 'Điểm xếp hạng theo mùa (sao trả lời đúng). Tách khỏi xu: không có đường nào đổi xu thành điểm.';

-- Tutors read coins / inventory of students who joined their matches (match_players.student_key).
-- Add an index on match_players (student_key) with the first tutor page that reads these tables.

-- ---------------------------------------------------------------------------------------------
-- RLS: no direct writes from browsers; tutors read their own students; everyone reads seasons.
alter table public.coin_wallets enable row level security;
alter table public.coin_ledger enable row level security;
alter table public.character_inventory enable row level security;
alter table public.seasons enable row level security;
alter table public.season_scores enable row level security;

revoke insert, update, delete, truncate on public.coin_wallets, public.coin_ledger, public.character_inventory, public.seasons, public.season_scores from anon, authenticated;

drop policy if exists coin_wallets_tutor_read on public.coin_wallets;
create policy coin_wallets_tutor_read on public.coin_wallets for select to authenticated
  using (exists (
    select 1 from public.match_players p join public.matches m on m.id = p.match_id
    where p.student_key = coin_wallets.student_key and m.tutor_id = (select auth.uid())
  ));

drop policy if exists coin_ledger_tutor_read on public.coin_ledger;
create policy coin_ledger_tutor_read on public.coin_ledger for select to authenticated
  using (exists (
    select 1 from public.match_players p join public.matches m on m.id = p.match_id
    where p.student_key = coin_ledger.student_key and m.tutor_id = (select auth.uid())
  ));

drop policy if exists character_inventory_tutor_read on public.character_inventory;
create policy character_inventory_tutor_read on public.character_inventory for select to authenticated
  using (exists (
    select 1 from public.match_players p join public.matches m on m.id = p.match_id
    where p.student_key = character_inventory.student_key and m.tutor_id = (select auth.uid())
  ));

drop policy if exists seasons_read on public.seasons;
create policy seasons_read on public.seasons for select to anon, authenticated using (true);

drop policy if exists season_scores_tutor_read on public.season_scores;
create policy season_scores_tutor_read on public.season_scores for select to authenticated
  using (exists (select 1 from public.matches m where m.class_code = season_scores.class_code and m.tutor_id = (select auth.uid())));

-- ---------------------------------------------------------------------------------------------
-- C4.16 the only way coins move: wallet + ledger row together, atomically (row lock on the wallet).
--   duplicate  same (student, reason, ref) already paid      → nothing, current balance
--   rate       too many rows of this reason in the last minute
--   cap        match cap reached (an award is trimmed to what is left) or daily cap (boxes)
--   funds      spending more than the balance
create or replace function public.coin_apply(
  p_key text,
  p_delta integer,
  p_reason text,
  p_ref text,
  p_match uuid default null,
  p_session uuid default null,
  p_meta jsonb default '{}'::jsonb,
  p_per_minute integer default null,
  p_match_cap integer default null,
  p_per_day integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bal integer;
  v_delta integer := p_delta;
  v_n integer;
  v_earned integer;
begin
  if p_key is null or char_length(p_key) not between 1 and 64
     or p_ref is null or char_length(p_ref) not between 1 and 200
     or p_reason not in ('answer', 'chot', 'stage', 'golden_accept', 'hint', 'box', 'rescue')
     or p_delta is null or abs(p_delta) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'applied', 0, 'balance', 0);
  end if;

  insert into public.coin_wallets (student_key) values (p_key) on conflict (student_key) do nothing;
  select w.balance into v_bal from public.coin_wallets w where w.student_key = p_key for update;

  if exists (select 1 from public.coin_ledger l where l.student_key = p_key and l.reason = p_reason and l.ref = p_ref) then
    return jsonb_build_object('ok', false, 'code', 'duplicate', 'applied', 0, 'balance', v_bal);
  end if;

  if p_per_minute is not null then
    select count(*) into v_n from public.coin_ledger l
    where l.student_key = p_key and l.reason = p_reason and l.created_at > now() - interval '1 minute';
    if v_n >= p_per_minute then
      return jsonb_build_object('ok', false, 'code', 'rate', 'applied', 0, 'balance', v_bal);
    end if;
  end if;

  if p_per_day is not null then
    select count(*) into v_n from public.coin_ledger l
    where l.student_key = p_key and l.reason = p_reason
      and l.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
    if v_n >= p_per_day then
      return jsonb_build_object('ok', false, 'code', 'cap', 'applied', 0, 'balance', v_bal);
    end if;
  end if;

  if v_delta > 0 and p_match_cap is not null and p_match is not null then
    select coalesce(sum(l.delta), 0) into v_earned from public.coin_ledger l
    where l.student_key = p_key and l.match_id = p_match and l.delta > 0;
    v_delta := least(v_delta, p_match_cap - v_earned);
    if v_delta <= 0 then
      return jsonb_build_object('ok', false, 'code', 'cap', 'applied', 0, 'balance', v_bal);
    end if;
  end if;

  if v_delta < 0 and v_bal + v_delta < 0 then
    return jsonb_build_object('ok', false, 'code', 'funds', 'applied', 0, 'balance', v_bal);
  end if;

  update public.coin_wallets w
  set balance = w.balance + v_delta,
      earned_total = w.earned_total + greatest(v_delta, 0),
      spent_total = w.spent_total + greatest(-v_delta, 0),
      updated_at = now()
  where w.student_key = p_key
  returning w.balance into v_bal;

  insert into public.coin_ledger (student_key, delta, reason, ref, match_id, session_id, meta, balance_after)
  values (p_key, v_delta, p_reason, p_ref, p_match, p_session, coalesce(p_meta, '{}'::jsonb), v_bal);

  return jsonb_build_object('ok', true, 'code', 'ok', 'applied', v_delta, 'balance', v_bal);
end;
$$;

-- C4.17 ranking points for the month's season (stars only; coins never come in here).
create or replace function public.season_add_points(p_key text, p_class text, p_nickname text, p_points integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_points integer;
begin
  if p_key is null or p_class is null or p_points is null or p_points < 0 or p_points > 1000 then
    return null;
  end if;
  insert into public.seasons (id, title, starts_at, ends_at)
  values (v_id, 'Mùa ' || to_char(now() at time zone 'utc', 'MM/YYYY'), v_start, v_start + interval '1 month')
  on conflict (id) do nothing;
  insert into public.season_scores as s (season_id, student_key, class_code, nickname, points, matches)
  values (v_id, p_key, p_class, coalesce(p_nickname, ''), p_points, 1)
  on conflict (season_id, student_key, class_code) do update
    set points = s.points + excluded.points, matches = s.matches + 1, nickname = excluded.nickname, updated_at = now()
  returning s.points into v_points;
  return v_points;
end;
$$;

revoke all on function public.coin_apply(text, integer, text, text, uuid, uuid, jsonb, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.season_add_points(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.coin_apply(text, integer, text, text, uuid, uuid, jsonb, integer, integer, integer) to service_role;
grant execute on function public.season_add_points(text, text, text, integer) to service_role;
