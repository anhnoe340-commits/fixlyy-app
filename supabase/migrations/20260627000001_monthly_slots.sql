-- Table pour le compteur marketing "places limitées"
CREATE TABLE IF NOT EXISTS public.monthly_slots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month           TEXT        NOT NULL UNIQUE,
  slots_displayed INTEGER     NOT NULL DEFAULT 10,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_slots ENABLE ROW LEVEL SECURITY;

-- Lecture publique (edge function sans JWT)
CREATE POLICY "monthly_slots_public_read" ON public.monthly_slots
  FOR SELECT USING (true);

-- Seul service_role peut écrire
CREATE POLICY "monthly_slots_service_write" ON public.monthly_slots
  FOR ALL USING (auth.role() = 'service_role');

-- Insérer le mois courant
INSERT INTO public.monthly_slots (month, slots_displayed)
VALUES (TO_CHAR(NOW(), 'YYYY-MM'), 10)
ON CONFLICT (month) DO NOTHING;

-- Cron : reset à 10 le 1er de chaque mois à minuit
SELECT cron.schedule(
  'monthly-slots-reset',
  '0 0 1 * *',
  $$
  INSERT INTO public.monthly_slots (month, slots_displayed)
  VALUES (TO_CHAR(NOW(), 'YYYY-MM'), 10)
  ON CONFLICT (month) DO UPDATE SET slots_displayed = 10;
  $$
);
