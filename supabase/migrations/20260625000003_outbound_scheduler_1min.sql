-- Passer le scheduler outbound à toutes les minutes (au lieu de */5)
SELECT cron.unschedule('outbound-scheduler')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'outbound-scheduler');

SELECT cron.schedule(
  'outbound-scheduler',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/outbound-scheduler',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || private.get_app_secret('service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);
