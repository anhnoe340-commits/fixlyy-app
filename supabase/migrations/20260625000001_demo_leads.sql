-- Table de capture des leads démo depuis fixlyy.fr
CREATE TABLE IF NOT EXISTS public.demo_leads (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email       TEXT NOT NULL,
  phone       TEXT,
  source      TEXT DEFAULT 'website_demo',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.demo_leads ENABLE ROW LEVEL SECURITY;
-- Pas de policy publique : seul le service role peut lire/écrire
