-- TutorCraft AI — Supabase schema + Row Level Security.
-- Run in the Supabase SQL editor. Safe to re-run.
-- Server routes write results with SUPABASE_SERVICE_ROLE_KEY (bypasses RLS);
-- browsers (anon key) can only READ battles. Gems/EXP can't be written from DevTools.

create extension if not exists pgcrypto;

-- Battles -------------------------------------------------------------------
create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  theme text,
  raw_input text,
  teaching_notes text,
  questions jsonb not null default '[]'::jsonb
);
alter table public.battles add column if not exists config jsonb;

alter table public.battles enable row level security;

drop policy if exists "battles readable by anyone with the link" on public.battles;
create policy "battles readable by anyone with the link"
  on public.battles for select to anon, authenticated using (true);
-- No anon insert/update/delete: battles are created only by /api/generate-battle.

-- Battle results (authoritative Gems / EXP, computed server-side) -------------
create table if not exists public.battle_results (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  class_code text not null default 'default',
  student_key text not null,
  nickname text not null,
  avatar text not null,
  variant_code int,
  correct int not null,
  answered int not null,
  accuracy real not null,
  gems int not null check (gems >= 0 and gems <= 5000),
  exp int not null check (exp >= 0 and exp <= 5000),
  damage int not null default 0,
  boss_defeated boolean not null default false,
  topics jsonb not null default '[]'::jsonb
);
create index if not exists battle_results_battle_idx on public.battle_results (battle_id, gems desc);

alter table public.battle_results enable row level security;
-- No anon policies: only the service role (server) may read or write.

-- Weak knowledge matrix (SM-2 spaced repetition: Day 1 -> 3 -> 7 -> 14) -----
create table if not exists public.weak_knowledge_matrix (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  class_code text not null default 'default',
  student_key text not null,
  topic text not null,
  skill_tag text not null default 'other',
  question text,
  repetition int not null default 0,
  ease real not null default 2.5,
  interval_days int not null default 1,
  due_at timestamptz not null,
  unique (class_code, student_key, topic)
);
create index if not exists weak_matrix_due_idx on public.weak_knowledge_matrix (class_code, due_at);

alter table public.weak_knowledge_matrix enable row level security;
-- No anon policies: server only.

-- Tutor rewards catalogue ------------------------------------------------------
create table if not exists public.rewards_catalog (
  id uuid primary key default gen_random_uuid(),
  class_code text not null default 'default',
  name text not null,
  emoji text not null default '🎁',
  gem_cost int not null check (gem_cost > 0),
  rule text,
  active boolean not null default true
);
alter table public.rewards_catalog enable row level security;
drop policy if exists "rewards readable" on public.rewards_catalog;
create policy "rewards readable" on public.rewards_catalog for select to anon, authenticated using (active);
