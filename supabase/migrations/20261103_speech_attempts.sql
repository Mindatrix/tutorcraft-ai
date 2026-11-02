-- Pronunciation layer (blueprint §3.2–3.6, docs/pronunciation_logic_handoff.md), 03/11/2026.
-- Written, NOT applied yet. Apply it to the Supabase project before the voice route can store attempts
-- or pay coins (until then the route still scores, but logs that the insert failed).
--
--   speech_attempts  one row per scored voice / typed attempt on a speech target. Never holds audio:
--                    only the transcript of the target window and the server's score.
--   coin_ledger      new reason 'speech' (check constraint + coin_apply's own list).
--
-- Students are not database users: every write goes through our API with the service role. Tutors
-- (authenticated) may only READ attempts of students who played in their own matches.

-- ---------------------------------------------------------------------------------------------
create table if not exists public.speech_attempts (
  id bigint generated always as identity primary key,
  -- No FK on match_id on purpose, same as coin_ledger: the log outlives matches and demo/solo play has none.
  match_id uuid,
  session_id uuid references public.battle_sessions(id) on delete set null,
  student_key text not null check (char_length(student_key) between 1 and 64),
  target_id text not null check (char_length(target_id) between 1 and 120),
  -- shadow = spoken + scored · dictate = typed · repeat = listen-and-repeat fallback (unscored)
  mode text not null check (mode in ('shadow', 'dictate', 'repeat')),
  -- Only the target window, never free speech.
  transcript text not null default '' check (char_length(transcript) <= 300),
  score smallint not null check (score between 0 and 100),
  passed boolean not null,
  stars smallint not null default 0 check (stars between 0 and 3),
  attempt_no smallint not null check (attempt_no between 1 and 3),
  -- Teaching level used for the pass threshold (0 = Beginner … 5 = C1).
  level smallint not null check (level between 0 and 5),
  engine text not null default 'webspeech' check (engine in ('webspeech', 'typed', 'none')),
  -- {wordScore, phonemeScore, confScore, weakWords[], flags[]}
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- One row per attempt number: a retried request can never add a 4th attempt.
  constraint speech_attempts_once unique (session_id, target_id, attempt_no)
);
comment on table public.speech_attempts is 'Lượt nói / gõ của học sinh trên một mục phát âm (blueprint §3.4). Không lưu âm thanh, chỉ lưu chữ nghe được và điểm do máy chủ chấm.';

create index if not exists speech_attempts_lookup on public.speech_attempts (match_id, student_key, target_id);
create index if not exists speech_attempts_session on public.speech_attempts (session_id, target_id);

alter table public.speech_attempts enable row level security;
revoke insert, update, delete, truncate on public.speech_attempts from anon, authenticated;

drop policy if exists speech_attempts_tutor_read on public.speech_attempts;
create policy speech_attempts_tutor_read on public.speech_attempts for select to authenticated
  using (exists (
    select 1 from public.match_players p join public.matches m on m.id = p.match_id
    where p.student_key = speech_attempts.student_key and m.tutor_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------------------------
-- coin_ledger: allow the 'speech' reason. The inline check from 20261027_coins_seasons.sql has the
-- default name coin_ledger_reason_check.
alter table public.coin_ledger drop constraint if exists coin_ledger_reason_check;
alter table public.coin_ledger add constraint coin_ledger_reason_check
  check (reason in ('answer', 'chot', 'stage', 'golden_accept', 'hint', 'box', 'rescue', 'speech'));

-- coin_apply: identical to 20261027_coins_seasons.sql except the reason list (+ 'speech').
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
     or p_reason not in ('answer', 'chot', 'stage', 'golden_accept', 'hint', 'box', 'rescue', 'speech')
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

-- create or replace keeps existing grants, but restate them so this file is safe on its own.
revoke all on function public.coin_apply(text, integer, text, text, uuid, uuid, jsonb, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.coin_apply(text, integer, text, text, uuid, uuid, jsonb, integer, integer, integer) to service_role;
