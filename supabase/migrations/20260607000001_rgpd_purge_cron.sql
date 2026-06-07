-- Migration : rgpd_purge_cron
-- Date      : 2026-06-07
-- Objectif  : Cron hebdomadaire de purge des données RGPD
--             Rétentions : trial_fingerprints (90j), calls (12m), sms_conversations (12m)

SELECT cron.unschedule('rgpd-purge-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rgpd-purge-weekly');

SELECT cron.schedule(
  'rgpd-purge-weekly',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/rgpd-purge',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || private.get_app_secret('service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Vérification : SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'rgpd-purge-weekly';
