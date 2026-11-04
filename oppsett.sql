-- =====================================================================
--  Familiekalender – databaseoppsett for Supabase
--  Lim inn hele filen i Supabase: SQL Editor → New query → Run
--  Kan trygt kjøres på nytt (lager ikke duplikater).
-- =====================================================================

-- 1) Hvem som får logge inn ------------------------------------------------
--    email     = e-postadressen brukeren logger inn med
--    member_id = hvilken person i kalenderen brukeren er (styrer standardvalg)
--    can_edit  = true: kan legge inn/endre/slette, false: kun lese
create table if not exists public.allowed_users (
  email     text primary key,
  member_id text not null,
  can_edit  boolean not null default true
);

-- 2) Avtaler -----------------------------------------------------------------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  all_day     boolean not null default false,
  members     text[] not null default '{}',     -- f.eks. {kristoffer,vegard}
  location    text,
  notes       text,
  recurrence  text not null default 'none'
              check (recurrence in ('none','daily','weekly','biweekly','monthly','yearly')),
  recur_until date,                              -- siste dato for gjentakelse (tom = for alltid)
  exdates     date[] not null default '{}',      -- enkeltdatoer som er slettet fra en serie
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_at >= start_at)
);

create index if not exists events_start_idx on public.events (start_at);

-- Oppdater updated_at automatisk
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists events_touch on public.events;
create trigger events_touch before update on public.events
  for each row execute function public.touch_updated_at();

-- 3) Hjelpefunksjoner for tilgang -------------------------------------------
create or replace function public.is_family() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.can_edit() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and can_edit
  );
$$;

-- 4) Tilgangsregler (Row Level Security) ------------------------------------
alter table public.allowed_users enable row level security;
alter table public.events        enable row level security;

drop policy if exists "se egen rad" on public.allowed_users;
create policy "se egen rad" on public.allowed_users
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "familien leser"   on public.events;
drop policy if exists "familien legger inn" on public.events;
drop policy if exists "familien endrer"  on public.events;
drop policy if exists "familien sletter" on public.events;

create policy "familien leser" on public.events
  for select to authenticated using (public.is_family());

create policy "familien legger inn" on public.events
  for insert to authenticated with check (public.can_edit());

create policy "familien endrer" on public.events
  for update to authenticated using (public.can_edit()) with check (public.can_edit());

create policy "familien sletter" on public.events
  for delete to authenticated using (public.can_edit());

-- 5) Sanntid: endringer dukker opp hos de andre med en gang --------------------
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;

-- 6) Legg inn familien ---------------------------------------------------------
--    BYTT UT e-postadressene under med de riktige før du kjører.
--    Vegard har ikke innlogging; han finnes bare som person i kalenderen.
insert into public.allowed_users (email, member_id, can_edit) values
  ('kristoffer.sundnes@gmail.com', 'kristoffer', true),
  ('hilde.risstad@outlook.com',      'hilde',      true),
  ('ane.sundnes@icloud.com',        'ane',        true)
on conflict (email) do update
  set member_id = excluded.member_id, can_edit = excluded.can_edit;
