-- ─────────────────────────────────────────────────────────────────────────────
-- Table des raisons d'appel sortantes (rappels manuels artisan)
-- Libres (pas de catalogue) — persistance locale uniquement, pas de sync Vapi (MVP)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE outbound_reasons (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_outbound_reasons_user
  ON outbound_reasons (user_id, sort_order);

-- Trigger updated_at (même pattern que inbound_reasons)
CREATE OR REPLACE FUNCTION update_outbound_reasons_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_outbound_reasons_updated_at
  BEFORE UPDATE ON outbound_reasons
  FOR EACH ROW EXECUTE FUNCTION update_outbound_reasons_updated_at();

-- RLS : chaque artisan ne voit et ne modifie que ses propres raisons
ALTER TABLE outbound_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "outbound_reasons_user_own" ON outbound_reasons
  FOR ALL USING (auth.uid() = user_id);
