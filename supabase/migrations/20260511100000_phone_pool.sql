-- Tâche 10 : Pool de numéros de téléphone + logs

-- Enum statuts numéros
DO $$ BEGIN
  CREATE TYPE phone_number_status AS ENUM ('available', 'reserved', 'assigned', 'expired', 'released');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE phone_number_type AS ENUM ('local', 'mobile', 'tollfree');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pool de numéros Twilio
CREATE TABLE IF NOT EXISTS phone_numbers_pool (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  twilio_sid          text          NOT NULL UNIQUE,
  phone_number        text          NOT NULL UNIQUE,
  type                phone_number_type NOT NULL DEFAULT 'local',
  status              phone_number_status NOT NULL DEFAULT 'available',
  assigned_to_user_id uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at         timestamptz   DEFAULT NULL,
  reserved_at         timestamptz   DEFAULT NULL,
  vapi_phone_number_id text         DEFAULT NULL,
  purchased_at        timestamptz   NOT NULL DEFAULT now(),
  released_at         timestamptz   DEFAULT NULL,
  monthly_cost_eur    numeric(6,2)  DEFAULT 1.00,
  notes               text          DEFAULT NULL,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- Log des achats de numéros
CREATE TABLE IF NOT EXISTS phone_purchase_log (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number    text          NOT NULL,
  twilio_sid      text          NOT NULL,
  action          text          NOT NULL, -- 'purchased', 'released', 'seeded'
  triggered_by    text          NOT NULL, -- 'seed_script', 'replenish_cron', 'manual'
  cost_eur        numeric(6,2)  DEFAULT NULL,
  meta            jsonb         DEFAULT '{}',
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- Log générique des edge functions
CREATE TABLE IF NOT EXISTS edge_function_logs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name   text          NOT NULL,
  status          text          NOT NULL, -- 'success', 'error', 'skipped'
  duration_ms     int           DEFAULT NULL,
  input_meta      jsonb         DEFAULT '{}',
  output_meta     jsonb         DEFAULT '{}',
  error_message   text          DEFAULT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- Alertes critiques (pool vide, etc.)
CREATE TABLE IF NOT EXISTS critical_alerts (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type      text          NOT NULL, -- 'pool_empty', 'pool_low', 'trial_expired_unpaid'
  severity        text          NOT NULL DEFAULT 'high', -- 'low', 'medium', 'high', 'critical'
  message         text          NOT NULL,
  resolved_at     timestamptz   DEFAULT NULL,
  meta            jsonb         DEFAULT '{}',
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- RLS : admin seulement (service_role bypass automatiquement)
ALTER TABLE phone_numbers_pool   ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_purchase_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_function_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_alerts      ENABLE ROW LEVEL SECURITY;

-- Aucun accès utilisateur (tout passe par service_role dans les edge functions)
CREATE POLICY "no_user_access_pool"     ON phone_numbers_pool   FOR ALL USING (false);
CREATE POLICY "no_user_access_log"      ON phone_purchase_log   FOR ALL USING (false);
CREATE POLICY "no_user_access_ef_logs"  ON edge_function_logs   FOR ALL USING (false);
CREATE POLICY "no_user_access_alerts"   ON critical_alerts      FOR ALL USING (false);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pool_status        ON phone_numbers_pool(status);
CREATE INDEX IF NOT EXISTS idx_pool_user          ON phone_numbers_pool(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_pool_reserved_at   ON phone_numbers_pool(reserved_at) WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS idx_ef_logs_fn         ON edge_function_logs(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type        ON critical_alerts(alert_type, created_at DESC);

-- Trigger updated_at sur phone_numbers_pool
CREATE OR REPLACE FUNCTION update_phone_pool_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pool_updated_at ON phone_numbers_pool;
CREATE TRIGGER trg_pool_updated_at
  BEFORE UPDATE ON phone_numbers_pool
  FOR EACH ROW EXECUTE FUNCTION update_phone_pool_updated_at();

-- Procédure d'assignation atomique avec SELECT FOR UPDATE SKIP LOCKED
CREATE OR REPLACE FUNCTION assign_phone_number_to_user(p_user_id uuid)
RETURNS TABLE(
  phone_number_id   uuid,
  twilio_sid        text,
  phone_number      text,
  vapi_phone_number_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row phone_numbers_pool%ROWTYPE;
BEGIN
  -- Vérifie si l'utilisateur a déjà un numéro assigné
  SELECT * INTO v_row
  FROM phone_numbers_pool
  WHERE assigned_to_user_id = p_user_id
    AND status = 'assigned'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_row.id, v_row.twilio_sid, v_row.phone_number, v_row.vapi_phone_number_id;
    RETURN;
  END IF;

  -- Cherche un numéro disponible, verrouille pour éviter la race condition
  SELECT * INTO v_row
  FROM phone_numbers_pool
  WHERE status = 'available'
  ORDER BY purchased_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_number_available';
  END IF;

  -- Réserve le numéro
  UPDATE phone_numbers_pool
  SET status = 'reserved',
      reserved_at = now(),
      assigned_to_user_id = p_user_id
  WHERE id = v_row.id;

  RETURN QUERY SELECT v_row.id, v_row.twilio_sid, v_row.phone_number, v_row.vapi_phone_number_id;
END;
$$;

-- Procédure de nettoyage des réservations expirées (>30 min sans activation)
CREATE OR REPLACE FUNCTION cleanup_stale_reservations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE phone_numbers_pool
  SET status = 'available',
      reserved_at = NULL,
      assigned_to_user_id = NULL
  WHERE status = 'reserved'
    AND reserved_at < now() - interval '30 minutes';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Colonne reminder_sent_at pour le cron J+5
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz DEFAULT NULL;
