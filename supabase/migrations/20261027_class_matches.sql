-- Phase B: one shared match for a whole class (up to 50 students).
--   B1.4  game_scenarios.solo_mode / class_mode (Dino Journey: 1 student = the hero, 2+ = a herd)
--   B2.1  matches + match_players, linked to battle_sessions; RLS: tutors manage their own matches.
--         Students never read these tables directly: every read/write goes through our API with the
--         service role, and a student's sealed session token only opens their own match.
--   B2.4  match_answer(): one round trip per answer (counters + "time to broadcast the scores?").

-- ---------------------------------------------------------------------------------------------
-- B1.4 play modes by class size (texts from game_worlds.class_plan.sizes, Dino Journey)
alter table public.game_scenarios
  add column if not exists solo_mode jsonb,
  add column if not exists class_mode jsonb;

update public.game_scenarios s
set solo_mode = jsonb_build_object(
      'max_players', 1,
      'hero', (select c.name from public.scenario_characters c where c.scenario_id = s.id and c.slot = 1),
      'text', w.class_plan -> 'sizes' ->> '1-5'),
    class_mode = jsonb_build_object(
      'min_players', 2,
      'group_size', jsonb_build_object('2-5', 0, '6-20', 4, '21-50', 5),
      'lanes_over', 20,
      'text', jsonb_build_object('6-20', w.class_plan -> 'sizes' ->> '6-20', '21-50', w.class_plan -> 'sizes' ->> '21-50'))
from public.game_worlds w
where w.game = s.game and s.game = 'dino_journey';

comment on column public.game_scenarios.solo_mode is 'Chơi một mình (1 em): em đóng nhân vật chính, bầy/đội kia do máy điều khiển. Trận tự chọn theo số em (src/engine/match.ts playPlanFor).';
comment on column public.game_scenarios.class_mode is 'Chơi cả lớp (2+ em): mỗi em một nhân vật trong bầy, chia nhóm theo cỡ lớp.';

-- ---------------------------------------------------------------------------------------------
-- B2.1 matches
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  tutor_id uuid references public.profiles(id) on delete set null,
  class_code text not null,
  game text,
  scenario_id text references public.game_scenarios(id) on delete set null,
  level smallint not null default 3 check (level between 0 and 5),
  status text not null default 'lobby' check (status in ('lobby', 'running', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  paused_at timestamptz,
  paused_ms bigint not null default 0,
  ended_at timestamptz,
  -- When the clock runs out (started_at + paused_ms + stages × stage_ms); kept by the server on
  -- start / resume / extend so the database itself can refuse answers after time is up.
  ends_at timestamptz,
  stage_ms integer not null default 300000 check (stage_ms between 10000 and 1800000),
  core_stages smallint not null default 6 check (core_stages between 1 and 12),
  extra_stages smallint not null default 2 check (extra_stages between 0 and 4),
  extended boolean not null default false,
  -- planRun() seed: same key → same weather and twists on every device.
  seed_key text not null,
  run_plan jsonb,
  -- PlayPlan chosen at the start from the head count (solo / class / teams, groups, bots).
  play jsonb,
  -- Game-rule state decided by the server (River Survival: nets, pen, dodges…).
  state jsonb not null default '{}'::jsonb,
  state_version integer not null default 0,
  result jsonb,
  -- Every broadcast carries the next seq: devices drop old or replayed messages.
  seq bigint not null default 0,
  last_broadcast_at timestamptz,
  -- Last stage announced with a "stage" message (each stage is announced once).
  announced_stage smallint not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists matches_one_open_per_battle on public.matches (battle_id) where status <> 'ended';
create index if not exists matches_tutor_idx on public.matches (tutor_id, created_at desc);
create index if not exists matches_class_scenario_idx on public.matches (class_code, scenario_id, created_at desc);

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  session_id uuid references public.battle_sessions(id) on delete set null,
  student_key text not null,
  nickname text not null,
  avatar text not null default '🐣',
  team text,
  grp smallint,
  species text,
  color text,
  -- 0..1, recent accuracy of this student in the class (0.6 when unknown): balances the teams.
  skill real not null default 0.6,
  stars integer not null default 0,
  correct integer not null default 0,
  answered integer not null default 0,
  action_points integer not null default 0,
  -- River Survival: a pursuer's net charges (max 3), counted here so no answer is ever lost.
  charge smallint not null default 0,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_correct_at timestamptz,
  -- Latest graded answer: decides open "Né lưới" / "Cướp lưới" windows, durably.
  last_answer_at timestamptz,
  last_answer_correct boolean,
  left_at timestamptz,
  unique (match_id, student_key)
);

create unique index if not exists match_players_session_idx on public.match_players (session_id) where session_id is not null;
-- Dino herd: same species allowed, never the same species AND colour in one class.
create unique index if not exists match_players_look_idx on public.match_players (match_id, species, color) where species is not null and color is not null;
create index if not exists match_players_match_idx on public.match_players (match_id);

alter table public.battle_sessions add column if not exists match_id uuid references public.matches(id) on delete set null;
create index if not exists battle_sessions_match_idx on public.battle_sessions (match_id) where match_id is not null;

alter table public.matches enable row level security;
alter table public.match_players enable row level security;

drop policy if exists matches_tutor_all on public.matches;
create policy matches_tutor_all on public.matches for all to authenticated
  using (tutor_id = (select auth.uid()))
  with check (tutor_id = (select auth.uid()));

drop policy if exists match_players_tutor_all on public.match_players;
create policy match_players_tutor_all on public.match_players for all to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and m.tutor_id = (select auth.uid())))
  with check (exists (select 1 from public.matches m where m.id = match_id and m.tutor_id = (select auth.uid())));

comment on table public.matches is 'Trận chung của cả lớp (giai đoạn B). RLS: gia sư quản lý trận của mình; học sinh chỉ đi qua API (service role) bằng token phiên.';
comment on table public.match_players is 'Học sinh trong trận chung: đội, nhóm, điểm, lần kết nối cuối. RLS như matches.';

-- ---------------------------------------------------------------------------------------------
-- B2.4 one round trip per answer: count it (only while the match clock runs) and tell the caller
-- whether to broadcast the scoreboard now (at most once per p_throttle_ms per match).
drop function if exists public.match_answer(uuid, boolean, integer, integer);
create function public.match_answer(p_session uuid, p_correct boolean, p_stars integer, p_throttle_ms integer default 2000)
returns table (match_id uuid, player_id uuid, broadcast boolean, seq bigint, players jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.match_players%rowtype;
  v_seq bigint;
  v_players jsonb;
begin
  update public.match_players p
  set answered = p.answered + 1,
      correct = p.correct + (case when p_correct then 1 else 0 end),
      stars = p.stars + greatest(0, least(3, coalesce(p_stars, 0))),
      last_seen_at = now(),
      last_correct_at = case when p_correct then now() else p.last_correct_at end,
      last_answer_at = now(),
      last_answer_correct = p_correct,
      -- River Survival: a pursuer's right answer charges the net (max 3 = SURVIVAL.maxCharge).
      charge = case when p.team = 'pursuers' and p_correct then least(3, p.charge + 1) else p.charge end
  where p.session_id = p_session
    and exists (select 1 from public.matches m where m.id = p.match_id and m.status = 'running' and (m.ends_at is null or m.ends_at > now()))
  returning p.* into v_player;
  if not found then
    return;
  end if;

  update public.matches m
  set seq = m.seq + 1, last_broadcast_at = now()
  where m.id = v_player.match_id
    and (m.last_broadcast_at is null or m.last_broadcast_at < now() - make_interval(secs => greatest(p_throttle_ms, 250) / 1000.0))
  returning m.seq into v_seq;

  -- When it is time to broadcast, hand back the scoreboard too (one round trip instead of three).
  if v_seq is not null then
    select jsonb_agg(jsonb_build_object('id', x.id, 'team', x.team, 'stars', x.stars, 'correct', x.correct, 'last_correct_at', x.last_correct_at, 'charge', x.charge) order by x.joined_at)
    into v_players
    from public.match_players x
    where x.match_id = v_player.match_id;
  end if;

  match_id := v_player.match_id;
  player_id := v_player.id;
  broadcast := v_seq is not null;
  seq := coalesce(v_seq, 0);
  players := v_players;
  return next;
end;
$$;

-- Next message number for a match (control messages: start, pause, events, end).
create or replace function public.match_next_seq(p_match uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.matches set seq = seq + 1, last_broadcast_at = now() where id = p_match returning seq;
$$;

-- Spend net charge atomically (false = not enough); refund when the throw is then refused.
create or replace function public.match_use_charge(p_player uuid, p_cost integer default 1)
returns boolean
language sql
security definer
set search_path = public
as $$
  with u as (update public.match_players set charge = charge - p_cost where id = p_player and charge >= p_cost returning 1)
  select exists (select 1 from u);
$$;

create or replace function public.match_refund_charge(p_player uuid, p_cost integer default 1)
returns void
language sql
security definer
set search_path = public
as $$
  update public.match_players set charge = least(3, charge + p_cost) where id = p_player;
$$;

revoke all on function public.match_answer(uuid, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.match_next_seq(uuid) from public, anon, authenticated;
revoke all on function public.match_use_charge(uuid, integer) from public, anon, authenticated;
revoke all on function public.match_refund_charge(uuid, integer) from public, anon, authenticated;
grant execute on function public.match_answer(uuid, boolean, integer, integer) to service_role;
grant execute on function public.match_next_seq(uuid) to service_role;
grant execute on function public.match_use_charge(uuid, integer) to service_role;
grant execute on function public.match_refund_charge(uuid, integer) to service_role;
