-- ============================================================
-- FIXLYY — Supabase Schema
-- Coller dans : Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 1. Table profiles (une ligne par artisan)
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  company_name    text default '',
  company_type    text default 'Plomberie / Chauffage / Climatisation',
  email           text default '',
  phone           text default '',
  address         text default '',
  siret           text default '',
  logo_url        text,
  quote_color     text default '#FF6B35',
  hourly_rate     numeric default 65,
  travel_rate     numeric default 25,
  vat_rate        numeric default 20,
  assistant_name  text default 'Mia',
  assistant_voice text default 'Féminine conviviale',
  greeting_open   text default 'Bonjour, je suis Mia. Comment puis-je vous aider ?',
  greeting_closed text default 'Vous appelez en dehors de nos heures. Laissez un message.',
  twilio_number   text,
  created_at      timestamptz default now()
);

-- 2. Row Level Security — chaque artisan ne voit que ses données
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 3. Table calls (appels reçus via Twilio webhook)
create table if not exists public.calls (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  caller_name text,
  caller_phone text,
  reason      text,
  summary     text,
  status      text default 'new', -- new | pending | done | urgent
  duration    integer, -- secondes
  created_at  timestamptz default now()
);

alter table public.calls enable row level security;

create policy "Users see own calls"
  on public.calls for all
  using (auth.uid() = user_id);

-- 4. Table contacts
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  address     text,
  status      text default 'new',
  notes       text,
  created_at  timestamptz default now()
);

alter table public.contacts enable row level security;

create policy "Users see own contacts"
  on public.contacts for all
  using (auth.uid() = user_id);

-- 5. Table quotes (devis sauvegardés)
create table if not exists public.quotes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.profiles(id) on delete cascade,
  number        text,
  client_name   text,
  client_email  text,
  object        text,
  lines         jsonb,  -- tableau des lignes
  total_ht      numeric,
  total_ttc     numeric,
  status        text default 'draft', -- draft | sent | signed
  created_at    timestamptz default now()
);

alter table public.quotes enable row level security;

create policy "Users see own quotes"
  on public.quotes for all
  using (auth.uid() = user_id);

-- 6. Storage bucket pour les logos
insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
  on conflict do nothing;

create policy "Users can upload own logo"
  on storage.objects for insert
  with check (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Logos are public"
  on storage.objects for select
  using (bucket_id = 'logos');

create policy "Users can update own logo"
  on storage.objects for update
  using (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);
