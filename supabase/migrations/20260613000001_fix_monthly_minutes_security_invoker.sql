-- Fix Supabase Security Advisor : monthly_minutes était SECURITY DEFINER par défaut
-- ce qui bypasse le RLS de la table calls et expose les minutes de tous les artisans
-- à n'importe quel utilisateur authentifié.
-- SECURITY INVOKER fait respecter le RLS de l'appelant (auth.uid() = artisan_id).

DROP VIEW IF EXISTS public.monthly_minutes;

CREATE VIEW public.monthly_minutes
  WITH (security_invoker = true)
AS
SELECT
  artisan_id                                                        AS user_id,
  DATE_TRUNC('month', created_at AT TIME ZONE 'Europe/Paris')       AS month,
  COALESCE(SUM(duration_seconds), 0)::integer                       AS total_seconds,
  CEIL(COALESCE(SUM(duration_seconds), 0)::numeric / 60)::integer   AS total_minutes,
  COUNT(*)::integer                                                  AS total_calls
FROM public.calls
WHERE artisan_id IS NOT NULL
GROUP BY
  artisan_id,
  DATE_TRUNC('month', created_at AT TIME ZONE 'Europe/Paris');

-- Note : get_monthly_minutes() reste SECURITY DEFINER (correct — elle prend
-- un p_user_id explicite et est appelée uniquement par les edge functions
-- authentifiées avec service_role).
