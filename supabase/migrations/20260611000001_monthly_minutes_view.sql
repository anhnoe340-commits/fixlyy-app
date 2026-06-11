-- Vue du compteur mensuel de minutes par artisan
-- Utilisée par le dashboard et les alertes de quota plan

CREATE OR REPLACE VIEW public.monthly_minutes AS
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

-- RLS : chaque artisan ne voit que ses propres données
ALTER VIEW public.monthly_minutes OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.get_monthly_minutes(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CEIL(COALESCE(SUM(duration_seconds), 0)::numeric / 60)::integer
  FROM public.calls
  WHERE artisan_id = p_user_id
    AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Europe/Paris')
    AND created_at <  DATE_TRUNC('month', NOW() AT TIME ZONE 'Europe/Paris') + INTERVAL '1 month';
$$;
