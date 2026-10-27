-- Class mute (plan C3.2), applied 27/10/2026 as migration 20261026231746 "class_matches_class_mute".
alter table public.matches add column if not exists muted boolean not null default false;
comment on column public.matches.muted is 'Gia sư tắt tiếng cả lớp (C3.2): mọi máy trong trận tắt âm thanh.';
comment on column public.match_players.species is 'Mẫu avatar (C2.1): loài khủng long, hoặc nhân vật hành trình ở các game khác. Cùng color là duy nhất trong trận.';
