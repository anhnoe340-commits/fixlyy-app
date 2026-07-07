-- Fix RLS demo_leads : la migration précédente activait RLS sans aucune policy
-- ce qui bloque les lectures anon/authenticated même depuis le dashboard admin.
-- Solution : policy explicite service_role (bypass RLS) + grant pour le dashboard.

-- Lecture autorisée pour service_role (admin dashboard)
CREATE POLICY "service_role_all" ON public.demo_leads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- INSERT autorisé pour anon (edge function demo-call sans JWT user)
CREATE POLICY "anon_insert" ON public.demo_leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- SELECT autorisé pour authenticated (au cas où l'admin utilise un JWT user)
CREATE POLICY "authenticated_read" ON public.demo_leads
  FOR SELECT
  TO authenticated
  USING (true);
