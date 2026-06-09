ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS member_limit integer NOT NULL DEFAULT 1;
