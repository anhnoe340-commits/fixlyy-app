ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS has_launch_discount BOOLEAN DEFAULT false;
