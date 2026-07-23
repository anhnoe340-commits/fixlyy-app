-- Le rate limiting en mémoire (Map au niveau module dans _shared/rateLimit.ts)
-- ne persiste pas de façon fiable entre invocations d'edge functions Supabase
-- (pas d'affinité d'instance garantie) — confirmé en testant capture-demo-lead
-- en prod : 8 requêtes rapides passent toutes malgré une limite de 5/60s.
--
-- Remplace par un store Postgres partagé : compteur par clé (ip:fonction),
-- upsert atomique via ON CONFLICT (le lock de ligne Postgres garantit qu'un
-- compteur concurrent ne perd aucune requête, contrairement au Map en mémoire
-- qui n'existe même pas de façon partagée entre invocations).

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          text PRIMARY KEY,
  count        integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- Aucune policy anon/authenticated : accès uniquement via check_rate_limit()
-- (SECURITY DEFINER, EXECUTE réservé à service_role).

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key             text,
  p_max             integer,
  p_window_seconds  integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.rate_limits AS rl (key, count, window_start)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE SET
    count        = CASE WHEN rl.window_start <= now() - make_interval(secs => p_window_seconds)
                         THEN 1 ELSE rl.count + 1 END,
    window_start = CASE WHEN rl.window_start <= now() - make_interval(secs => p_window_seconds)
                         THEN now() ELSE rl.window_start END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- Purge quotidienne des entrées mortes (évite la croissance illimitée de la table).
SELECT cron.unschedule('rate-limits-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rate-limits-cleanup');

SELECT cron.schedule(
  'rate-limits-cleanup',
  '0 4 * * *',
  $$ DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day' $$
);
