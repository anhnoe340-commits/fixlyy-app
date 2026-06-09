-- Table de référence couleurs (265 entrées Pantone/Crayola) — aucune donnée sensible.
-- Lecture publique autorisée pour tous les rôles.
ALTER TABLE public.colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture publique colors"
  ON public.colors FOR SELECT
  USING (true);
