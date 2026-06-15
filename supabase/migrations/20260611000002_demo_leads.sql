-- Table pour les leads démo générés depuis fixlyy.fr
create table if not exists public.demo_leads (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null,
  email         text not null,
  metier        text not null default 'autre',
  ip            text,
  vapi_call_id  text,
  created_at    timestamptz not null default now()
);

-- Index pour éviter les doublons récents (même phone + email dans les 24h)
create index if not exists demo_leads_phone_idx on public.demo_leads(phone, created_at desc);
create index if not exists demo_leads_email_idx on public.demo_leads(email, created_at desc);

-- RLS : lecture uniquement via service role (pas d'accès public aux leads)
alter table public.demo_leads enable row level security;

-- Aucune policy SELECT/UPDATE pour les utilisateurs authentifiés
-- Seul le service role (edge functions) peut lire/écrire
