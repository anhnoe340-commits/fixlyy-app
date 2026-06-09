-- Table des prestations / tarifs par artisan
CREATE TABLE IF NOT EXISTS service_pricing (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        TEXT         NOT NULL,
  price_type   TEXT         NOT NULL CHECK (price_type IN ('fixed', 'from', 'quote')),
  price_amount INTEGER,
  position     INTEGER      NOT NULL DEFAULT 0,
  is_default   BOOLEAN      DEFAULT false,
  created_at   TIMESTAMPTZ  DEFAULT now()
);

ALTER TABLE service_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accès propriétaire service_pricing"
  ON service_pricing
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Colonnes profil pour la config tarifs / intervention
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS intervention_hours    TEXT    DEFAULT 'Lundi-Vendredi 8h-18h',
  ADD COLUMN IF NOT EXISTS intervention_zone     TEXT    DEFAULT 'Paris et Île-de-France',
  ADD COLUMN IF NOT EXISTS intervention_delay    TEXT    DEFAULT 'Sous 48h, urgences sous 4h',
  ADD COLUMN IF NOT EXISTS travel_fee            TEXT    DEFAULT '50',
  ADD COLUMN IF NOT EXISTS pricing_display       TEXT    NOT NULL DEFAULT 'explicit'
    CHECK (pricing_display IN ('explicit', 'quote_only')),
  ADD COLUMN IF NOT EXISTS pricing_tax           TEXT    NOT NULL DEFAULT 'ttc'
    CHECK (pricing_tax IN ('ttc', 'ht')),
  ADD COLUMN IF NOT EXISTS pricing_configured    BOOLEAN NOT NULL DEFAULT false;
