-- Fingerprinting IP + téléphone pour détecter les abus d'essai gratuit
CREATE TABLE IF NOT EXISTS trial_fingerprints (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  phone            text,
  ip_address       text,
  user_id          uuid         UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email            text,
  created_at       timestamptz  DEFAULT now(),
  trial_started_at timestamptz,
  trial_ended_at   timestamptz,
  is_suspicious    boolean      DEFAULT false,
  suspicious_reason text
);

CREATE INDEX idx_trial_fingerprints_phone ON trial_fingerprints(phone);
CREATE INDEX idx_trial_fingerprints_ip    ON trial_fingerprints(ip_address);

ALTER TABLE trial_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON trial_fingerprints FOR ALL USING (false);
