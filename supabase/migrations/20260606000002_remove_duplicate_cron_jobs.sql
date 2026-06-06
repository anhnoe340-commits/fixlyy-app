-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : remove_duplicate_cron_jobs
-- Date      : 2026-06-06
-- Supprime 2 jobs créés par 20260606000000_add_pg_cron_jobs.sql
-- qui se sont révélés doublons ou cassés à l'analyse.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. weekly-report : doublon de weekly-report-monday (même schedule 0 7 * * 1)
--    Les deux appelaient la même fonction weekly-report/index.ts en simultané.
SELECT cron.unschedule('weekly-report');

-- 2. trial-lifecycle-hourly : cassé + redondant
--    Cassé : envoyait Authorization Bearer au lieu de x-cron-secret → 401
--    Cassé : envoyait body {} sans action → 400 unknown_action
--    Redondant : trial-reminder/trial-expire/trial-cleanup couvrent les 3 actions
SELECT cron.unschedule('trial-lifecycle-hourly');
