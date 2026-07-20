-- Etend demo_leads avec les colonnes de qualification + score + intent
-- Deduplication prealable avant la contrainte unique sur phone

ALTER TABLE public.demo_leads
  ADD COLUMN IF NOT EXISTS calls_per_day            INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missed_calls_per_day     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_intervention_price_eur INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_score               INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_intent              TEXT;

-- Supprimer les doublons sur phone : garder la ligne la plus recente (id MAX approximatif via created_at)
DELETE FROM public.demo_leads
WHERE id NOT IN (
  SELECT DISTINCT ON (phone) id
  FROM public.demo_leads
  ORDER BY phone, created_at DESC
);

-- Contrainte unique sur phone pour l'upsert dedup dans demo-call
CREATE UNIQUE INDEX IF NOT EXISTS demo_leads_phone_unique ON public.demo_leads (phone);
