-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : add_pg_cron_jobs
-- Date      : 2026-06-06
-- Objectif  : Planifier les 3 jobs récurrents Fixlyy via pg_cron
-- ─────────────────────────────────────────────────────────────────────────────
-- PRÉREQUIS AVANT db push :
--   Après le push, insérer la clé dans la table créée par cette migration :
--   UPDATE private.app_secrets
--   SET value = '<FIXLYY_SERVICE_ROLE_KEY>'
--   WHERE name = 'service_role_key';
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Schéma privé — inaccessible via l'API Supabase (anon/authenticated) ──────
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

-- ── Table de secrets internes (pg_cron tourne en postgres, a accès) ───────────
CREATE TABLE IF NOT EXISTS private.app_secrets (
  name  text PRIMARY KEY,
  value text NOT NULL
);

-- Placeholder — à remplacer via le Dashboard après le push
INSERT INTO private.app_secrets (name, value)
VALUES ('service_role_key', 'REPLACE_WITH_FIXLYY_SERVICE_ROLE_KEY')
ON CONFLICT (name) DO NOTHING;

-- ── Extension pg_cron ────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Fonction helper (SECURITY DEFINER — tourne comme postgres) ───────────────
CREATE OR REPLACE FUNCTION private.get_app_secret(secret_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = private
AS $$
  SELECT value FROM private.app_secrets WHERE name = secret_name;
$$;

-- ── JOB 1 — trial-lifecycle (toutes les heures) ──────────────────────────────
SELECT cron.unschedule('trial-lifecycle-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'trial-lifecycle-hourly');

SELECT cron.schedule(
  'trial-lifecycle-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://hxkpmmekaotwmzgqxafp.supabase.co/functions/v1/trial-lifecycle',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || private.get_app_secret('service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── JOB 2 — weekly-report (lundi 7h UTC = 8h Paris heure d'été, 8h hiver) ────
-- pg_cron tourne en UTC fixe — aucun ajustement DST automatique.
SELECT cron.unschedule('weekly-report-monday')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-report-monday');

SELECT cron.schedule(
  'weekly-report-monday',
  '0 7 * * 1',
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

-- ── JOB 3 — alert-low-pool (toutes les 6 heures) ────────────────────────────
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
      'Authorization', 'Bearer ' || private.get_app_secret('service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── Vérification après déploiement ───────────────────────────────────────────
-- SELECT jobid, jobname, schedule, active FROM cron.job;
-- Résultat attendu : 3 jobs actifs
--   trial-lifecycle-hourly  | 0 * * * *   | true
--   weekly-report-monday    | 0 7 * * 1   | true
--   alert-low-pool-6h       | 0 */6 * * * | true
