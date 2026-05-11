-- Onboarding V2 : trial sans CB, reprise de session, appel test
-- Ne touche pas aux colonnes existantes

-- Enum trial_status
DO $$ BEGIN
  CREATE TYPE trial_status AS ENUM ('active', 'expired', 'converted', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Colonnes onboarding V2 dans profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_ends_at            timestamptz  DEFAULT (now() + interval '7 days'),
  ADD COLUMN IF NOT EXISTS trial_status             text         DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS onboarding_step          int          DEFAULT 1,
  ADD COLUMN IF NOT EXISTS resume_token             text         UNIQUE,
  ADD COLUMN IF NOT EXISTS payment_method_added     boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS forwarding_activated     boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS first_test_call_at       timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS human_help_requested_at  timestamptz  DEFAULT NULL;

-- Table appels test onboarding
CREATE TABLE IF NOT EXISTS onboarding_test_calls (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  initiated_at  timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz DEFAULT NULL,
  success       boolean     DEFAULT false,
  sms_received  boolean     DEFAULT false,
  vapi_call_id  text        DEFAULT NULL,
  error_reason  text        DEFAULT NULL
);

-- RLS onboarding_test_calls
ALTER TABLE onboarding_test_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_test_calls" ON onboarding_test_calls
  FOR ALL USING (auth.uid() = user_id);

-- Index pour les lookups fréquents
CREATE INDEX IF NOT EXISTS idx_profiles_resume_token ON profiles(resume_token);
CREATE INDEX IF NOT EXISTS idx_profiles_trial_status ON profiles(trial_status);
CREATE INDEX IF NOT EXISTS idx_test_calls_user ON onboarding_test_calls(user_id);
