-- Autoriser la lecture anon sur demo_leads pour le dashboard admin
-- (le dashboard utilise la clé apikey directement sans session authentifiée)
CREATE POLICY "anon_read" ON public.demo_leads
  FOR SELECT
  TO anon
  USING (true);
