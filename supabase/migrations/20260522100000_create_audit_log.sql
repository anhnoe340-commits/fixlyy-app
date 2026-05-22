-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : create_audit_log
-- Date      : 2026-05-22
-- Table append-only pour la traçabilité des événements critiques.
-- Accessible uniquement par service_role. Aucun UPDATE/DELETE possible.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.audit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  event_type    text        NOT NULL,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resource_type text,
  resource_id   text,
  metadata      jsonb,
  severity      text        NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info', 'warning', 'critical'))
);

-- Index pour les requêtes les plus fréquentes (filtrer par type + tri chronologique)
CREATE INDEX idx_audit_log_event_type ON public.audit_log (event_type, created_at DESC);
CREATE INDEX idx_audit_log_user_id    ON public.audit_log (user_id, created_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- INSERT : service_role uniquement
CREATE POLICY "audit_log_insert_service_role"
  ON public.audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- SELECT : service_role uniquement
CREATE POLICY "audit_log_select_service_role"
  ON public.audit_log
  FOR SELECT
  TO service_role
  USING (true);

-- Pas de policy UPDATE ni DELETE → deny-all implicite pour ces opérations.

-- ─── Trigger append-only ─────────────────────────────────────────────────────
-- Garantit qu'aucune ligne ne peut être modifiée ou supprimée, même par
-- service_role ou un superuser passant par une transaction directe.

CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log est append-only : UPDATE et DELETE sont interdits';
END;
$$;

CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

CREATE TRIGGER trg_audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();
