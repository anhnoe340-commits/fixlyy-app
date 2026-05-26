-- ─────────────────────────────────────────────────────────────────────────────
-- Table des raisons d'appel activées par chaque artisan
-- Créée from scratch avec toutes les colonnes finales
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE inbound_reasons (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason_id          uuid        REFERENCES reasons_catalog(id) ON DELETE SET NULL,
  label              text        NOT NULL,   -- copié depuis catalog à l'activation (rétrocompat)
  description        text,                   -- copié depuis catalog à l'activation
  is_active          boolean     NOT NULL DEFAULT true,
  emergency_behavior text        CHECK (emergency_behavior IN ('transfer', 'priority_message', 'both')),
  sort_order         int         NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_reasons_user      ON inbound_reasons (user_id, is_active);
CREATE INDEX idx_inbound_reasons_reason_id ON inbound_reasons (reason_id);

-- Contrainte unicité : un user ne peut cocher 2 fois la même raison catalogue
CREATE UNIQUE INDEX idx_inbound_reasons_user_catalog
  ON inbound_reasons (user_id, reason_id)
  WHERE reason_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_inbound_reasons_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inbound_reasons_updated_at
  BEFORE UPDATE ON inbound_reasons
  FOR EACH ROW EXECUTE FUNCTION update_inbound_reasons_updated_at();

-- RLS : chaque artisan ne voit et ne modifie que ses propres raisons
ALTER TABLE inbound_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inbound_reasons_user_own" ON inbound_reasons
  FOR ALL USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Extension de profiles
--   emergency_transfer_number : numéro dédié urgences (ex: portable perso artisan)
--                               fallback sur transfer_phone si NULL
--   default_emergency_behavior : comportement par défaut si non configuré par raison
--   last_vapi_sync_at          : timestamp de la dernière sync Mia réussie
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS emergency_transfer_number  text,
  ADD COLUMN IF NOT EXISTS default_emergency_behavior text
    CHECK (default_emergency_behavior IN ('transfer', 'priority_message', 'both')),
  ADD COLUMN IF NOT EXISTS last_vapi_sync_at          timestamptz;
