-- ─────────────────────────────────────────────────────────────────────────────
-- Ajoute la préférence email post-appel sur profiles
-- Default true : tous les artisans existants reçoivent les emails
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled
    boolean NOT NULL DEFAULT true;
