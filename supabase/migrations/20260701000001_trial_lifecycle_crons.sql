-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : trial_lifecycle_crons
-- Date      : 2026-07-01
-- Objectif  : Créer les 3 crons trial manquants après suppression de
--             trial-lifecycle-hourly (20260606000002_remove_duplicate_cron_jobs.sql)
--             Les 3 crons appellent trial-lifecycle/index.ts avec x-cron-secret
--             et un body { action: 'remind' | 'expire' | 'cleanup' }
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. trial-reminder — J+5 : SMS + email aux essais actifs sans CB
SELECT cron.unschedule('trial-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trial-reminder');

SELECT cron.schedule(
  'trial-reminder',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/trial-lifecycle',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  current_setting('app.cron_secret', true),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{"action":"remind"}'::jsonb
  );
  $$
);

-- 2. trial-expire — J+7 : expiration si pas de CB
SELECT cron.unschedule('trial-expire')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trial-expire');

SELECT cron.schedule(
  'trial-expire',
  '5 9 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/trial-lifecycle',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  current_setting('app.cron_secret', true),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{"action":"expire"}'::jsonb
  );
  $$
);

-- 3. trial-cleanup — J+14 : libère le numéro dans le pool
SELECT cron.unschedule('trial-cleanup')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trial-cleanup');

SELECT cron.schedule(
  'trial-cleanup',
  '10 9 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/trial-lifecycle',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  current_setting('app.cron_secret', true),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{"action":"cleanup"}'::jsonb
  );
  $$
);

-- Vérification post-migration
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname IN ('trial-reminder','trial-expire','trial-cleanup');
