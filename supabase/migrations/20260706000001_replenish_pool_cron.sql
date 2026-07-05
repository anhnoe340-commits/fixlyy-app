-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : replenish_pool_cron
-- Date      : 2026-07-06
-- Objectif  : Cron toutes les 6h pour acheter automatiquement des numéros
--             Twilio quand le pool tombe sous REPLENISH_THRESHOLD.
--             Décalé de 30 min par rapport à alert-low-pool-6h (0 */6)
--             pour éviter toute exécution simultanée.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('replenish-pool-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'replenish-pool-6h');

SELECT cron.schedule(
  'replenish-pool-6h',
  '30 */6 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/replenish-phone-pool',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{"dry_run":false}'::jsonb
  );
  $$
);

-- Vérification post-migration :
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname IN ('alert-low-pool-6h', 'replenish-pool-6h');
