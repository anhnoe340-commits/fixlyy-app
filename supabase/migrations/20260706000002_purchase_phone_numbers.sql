-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : purchase_phone_numbers
-- Date      : 2026-07-06
-- Objectif  :
--   1. Ajouter 'national' à phone_number_type (numéros 09 FR)
--   2. Ajouter 'error' à phone_number_status (numéro acheté mais mal configuré)
--   3. Remplacer le cron replenish-pool-6h (ancienne fonction Local/05)
--      par purchase-phone-pool-6h (nouvelle fonction National/09)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Étendre l'enum phone_number_type
ALTER TYPE phone_number_type ADD VALUE IF NOT EXISTS 'national';

-- 2. Étendre l'enum phone_number_status
ALTER TYPE phone_number_status ADD VALUE IF NOT EXISTS 'error';

-- 3. Supprimer l'ancien cron replenish-pool-6h (achetait des Local 01-05, incorrect)
SELECT cron.unschedule('replenish-pool-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'replenish-pool-6h');

-- 4. Créer le nouveau cron purchase-phone-pool-6h
--    Décalé à 15 */6 pour ne pas chevaucher alert-low-pool-6h (0 */6)
SELECT cron.unschedule('purchase-phone-pool-6h')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purchase-phone-pool-6h');

SELECT cron.schedule(
  'purchase-phone-pool-6h',
  '15 */6 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/purchase-phone-numbers',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_service_role_key')
    ),
    body    := '{"dry_run":false}'::jsonb
  );
  $$
);

-- Vérification post-migration :
-- SELECT jobid, jobname, schedule, active FROM cron.job
-- WHERE jobname IN ('alert-low-pool-6h', 'purchase-phone-pool-6h', 'replenish-pool-6h');
