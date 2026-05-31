-- ─────────────────────────────────────────────────────────────────────────────
-- Fix définitif : RETURNS TABLE → RETURNS SETOF inbound_reasons
--
-- Racine du problème : RETURNS TABLE (id uuid, user_id uuid, reason_id uuid, …)
-- déclare TOUS ces noms comme OUT params implicites dans PL/pgSQL.
-- Résultat : chaque référence non-qualifiée à user_id, reason_id, is_active…
-- dans le corps est ambiguë avec la colonne de table homonyme (erreur 42702).
-- Les cas visibles : ON CONFLICT (user_id, reason_id), puis UPDATE SET is_active…
--
-- Solution : RETURNS SETOF inbound_reasons → aucun OUT param, aucune ambiguïté.
-- Le changement de type de retour interdit CREATE OR REPLACE → DROP + CREATE.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS toggle_inbound_reason_from_catalog(uuid, uuid, boolean);

CREATE FUNCTION toggle_inbound_reason_from_catalog(
  p_user_id   uuid,
  p_reason_id uuid,
  p_activate  boolean
)
RETURNS SETOF inbound_reasons
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_catalog reasons_catalog%ROWTYPE;
  v_row     inbound_reasons%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized: caller % != target %', (SELECT auth.uid()), p_user_id;
  END IF;

  IF p_activate THEN
    SELECT * INTO v_catalog FROM reasons_catalog WHERE reasons_catalog.id = p_reason_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reason_not_found: %', p_reason_id;
    END IF;
    IF NOT v_catalog.is_active_in_catalog THEN
      RAISE EXCEPTION 'reason_inactive: %', p_reason_id;
    END IF;

    INSERT INTO inbound_reasons (user_id, reason_id, label, description, is_active, sort_order)
    VALUES (p_user_id, p_reason_id, v_catalog.label, v_catalog.description, true, v_catalog.sort_order)
    ON CONFLICT (user_id, reason_id) WHERE reason_id IS NOT NULL
    DO UPDATE SET is_active = true, updated_at = now()
    RETURNING * INTO v_row;

    RETURN NEXT v_row;

  ELSE
    DELETE FROM inbound_reasons
    WHERE inbound_reasons.user_id = p_user_id
      AND inbound_reasons.reason_id = p_reason_id;
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_inbound_reason_from_catalog(uuid, uuid, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS update_inbound_reason_emergency_behavior(uuid, uuid, text);

CREATE FUNCTION update_inbound_reason_emergency_behavior(
  p_user_id           uuid,
  p_inbound_reason_id uuid,
  p_behavior          text
)
RETURNS SETOF inbound_reasons
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row inbound_reasons%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized: caller % != target %', (SELECT auth.uid()), p_user_id;
  END IF;

  IF p_behavior IS NOT NULL AND p_behavior NOT IN ('transfer', 'priority_message', 'both') THEN
    RAISE EXCEPTION 'invalid_behavior: %. Valeurs acceptées : transfer, priority_message, both, NULL', p_behavior;
  END IF;

  UPDATE inbound_reasons
  SET emergency_behavior = p_behavior, updated_at = now()
  WHERE inbound_reasons.id = p_inbound_reason_id AND inbound_reasons.user_id = p_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: inbound_reason % pour user %', p_inbound_reason_id, p_user_id;
  END IF;

  RETURN NEXT v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION update_inbound_reason_emergency_behavior(uuid, uuid, text) TO authenticated;
