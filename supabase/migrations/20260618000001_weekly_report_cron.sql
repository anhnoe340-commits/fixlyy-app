-- Unschedule si déjà existant
SELECT cron.unschedule('weekly-report')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-report');

-- Planifier chaque lundi à 8h UTC
SELECT cron.schedule(
  'weekly-report',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || private.get_app_secret('service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Vérification : SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'weekly-report';
