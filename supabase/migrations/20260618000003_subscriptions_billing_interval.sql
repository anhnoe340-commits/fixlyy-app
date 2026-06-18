ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly'
  CHECK (billing_interval IN ('monthly', 'annual'));
