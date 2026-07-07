-- Étend demo_leads avec les colonnes de qualification + score + intent
-- Ajoute une contrainte unique sur phone pour le dedup

ALTER TABLE public.demo_leads
  ADD COLUMN IF NOT EXISTS calls_per_day            INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missed_calls_per_day     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_intervention_price_eur INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_score               INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_intent              TEXT;

-- Contrainte unique sur phone pour l'upsert dedup dans demo-call
CREATE UNIQUE INDEX IF NOT EXISTS demo_leads_phone_unique ON public.demo_leads (phone);
