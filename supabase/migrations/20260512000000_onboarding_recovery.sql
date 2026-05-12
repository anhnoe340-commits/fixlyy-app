-- Onboarding recovery : colonnes de tracking SMS relance

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed   boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS recovery_sms_b_sent_at timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recovery_sms_c_sent_at timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recovery_sms_d_sent_at timestamptz  DEFAULT NULL;

-- Backfill : comptes déjà finalisés avant cette migration
UPDATE profiles
SET onboarding_completed = true
WHERE forwarding_activated = true
  AND first_test_call_at IS NOT NULL
  AND onboarding_completed = false;

-- Index pour le cron recovery (filtre sur completed + dates)
CREATE INDEX IF NOT EXISTS idx_profiles_recovery
  ON profiles(onboarding_completed, created_at)
  WHERE onboarding_completed = false;
