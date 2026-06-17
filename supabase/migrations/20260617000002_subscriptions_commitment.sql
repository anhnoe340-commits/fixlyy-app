ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS commitment_end TIMESTAMPTZ;
