-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : monthly_report_cron
-- Date      : 2026-06-16
-- Objectif  : Planifier le rapport mensuel Max le 1er de chaque mois à 8h UTC
-- ─────────────────────────────────────────────────────────────────────────────

SELECT cron.unschedule('monthly-report-first')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-report-first');

SELECT cron.schedule(
  'monthly-report-first',
  '0 8 1 * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/monthly-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || private.get_app_secret('service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Vérification : SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'monthly-report-first';
