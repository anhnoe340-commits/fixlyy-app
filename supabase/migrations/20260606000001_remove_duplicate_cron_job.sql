-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : remove_duplicate_cron_job
-- Date      : 2026-06-06
-- Supprime le job alert-low-pool dupliqué (remplacé par alert-low-pool-6h)
-- alert-low-pool      : 30 */6 * * * (ancien, supprimé)
-- alert-low-pool-6h   :  0 */6 * * * (nouveau, conservé)
-- ─────────────────────────────────────────────────────────────────────────────

-- Supprime le job alert-low-pool dupliqué (remplacé par alert-low-pool-6h)
-- WHERE EXISTS rend la migration idempotente si le job a déjà été supprimé manuellement
SELECT cron.unschedule('alert-low-pool')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'alert-low-pool');
