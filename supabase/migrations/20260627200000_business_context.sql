-- business_context JSONB dans profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_context JSONB;

-- Table unavailabilities
CREATE TABLE IF NOT EXISTS public.unavailabilities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  team_member_name TEXT,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.unavailabilities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'unavailabilities'
      AND policyname = 'users_own_unavailabilities'
  ) THEN
    CREATE POLICY "users_own_unavailabilities"
      ON public.unavailabilities
      FOR ALL
      USING (auth.uid() = profile_id);
  END IF;
END$$;

-- Index pour les requêtes de Mia (unavailabilities actives maintenant)
CREATE INDEX IF NOT EXISTS unavailabilities_profile_time_idx
  ON public.unavailabilities (profile_id, start_at, end_at);
