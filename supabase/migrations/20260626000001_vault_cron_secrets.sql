-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : vault_cron_secrets
-- Date      : 2026-06-26
-- Objectif  : Migrer les clés pg_cron vers vault.secrets
--             La clé est extraite depuis outbound-scheduler (qui a la clé active).
--             Aucun secret n'est codé en dur dans ce fichier.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Extraire la clé active depuis outbound-scheduler et la stocker dans vault
DO $$
DECLARE
  v_existing uuid;
  v_cmd      text;
  v_matches  text[];
  v_key      text;
BEGIN
  -- Vérifier si le secret vault existe déjà
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'cron_service_role_key' LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE NOTICE 'vault.cron_service_role_key déjà présent (id: %) — skip', v_existing;
  ELSE
    -- Extraire la clé depuis la commande du cron outbound-scheduler
    SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'outbound-scheduler';

    IF v_cmd IS NOT NULL THEN
      -- Capturer le JWT après 'Bearer '
      v_matches := regexp_matches(v_cmd, 'Bearer ([A-Za-z0-9_\-\.]+)');
      IF v_matches IS NOT NULL THEN
        v_key := v_matches[1];
      END IF;
    END IF;

    IF v_key IS NOT NULL AND length(v_key) > 50 THEN
      PERFORM vault.create_secret(
        v_key,
        'cron_service_role_key',
        'Service role JWT pour les crons pg_cron (outbound-scheduler, rgpd-purge, weekly-report, monthly-report, alert-low-pool)'
      );
      RAISE NOTICE 'vault.cron_service_role_key créé (longueur: %)', length(v_key);
    ELSE
      RAISE WARNING 'Impossible d''extraire la clé depuis outbound-scheduler — vérifier manuellement';
    END IF;
  END IF;
END $$;

-- 2. Migrer outbound-scheduler → vault
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
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 3. Migrer alert-low-pool-6h → vault
SELECT cron.unschedule('alert-low-pool-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alert-low-pool-6h');

SELECT cron.schedule(
  'alert-low-pool-6h',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/alert-low-pool',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 4. Migrer rgpd-purge-weekly → vault
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
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 5. Migrer monthly-report-first → vault
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
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 6. Migrer weekly-report-monday → vault
SELECT cron.unschedule('weekly-report-monday')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-report-monday');

SELECT cron.schedule(
  'weekly-report-monday',
  '0 7 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/weekly-report',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  current_setting('app.cron_secret', true),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Vérification post-migration
-- SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobname;
-- SELECT name, description FROM vault.secrets WHERE name = 'cron_service_role_key';
