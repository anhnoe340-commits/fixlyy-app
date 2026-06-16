-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : calls_transferred
-- Date      : 2026-06-17
-- Objectif  : Colonnes pour tracer le transfert d'appel urgent (plan Max)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS transferred_to   TEXT,
  ADD COLUMN IF NOT EXISTS transferred_at   TIMESTAMPTZ;
