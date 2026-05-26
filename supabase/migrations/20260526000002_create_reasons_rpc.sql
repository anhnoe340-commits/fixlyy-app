-- ─────────────────────────────────────────────────────────────────────────────
-- RPC helpers pour la gestion des raisons d'appel par catalogue
-- ─────────────────────────────────────────────────────────────────────────────

-- ── A) toggle_inbound_reason_from_catalog ─────────────────────────────────────
-- p_activate = true  : upsert dans inbound_reasons (copie label/desc depuis catalog)
-- p_activate = false : DELETE physique (index unique reste propre pour re-cocher)

CREATE OR REPLACE FUNCTION toggle_inbound_reason_from_catalog(
  p_user_id   uuid,
  p_reason_id uuid,
  p_activate  boolean
)
RETURNS TABLE (
  id                 uuid,
  user_id            uuid,
  reason_id          uuid,
  label              text,
  description        text,
  is_active          boolean,
  emergency_behavior text,
  sort_order         int,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_catalog reasons_catalog%ROWTYPE;
  v_row     inbound_reasons%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized: caller % != target %', auth.uid(), p_user_id;
  END IF;

  IF p_activate THEN
    SELECT * INTO v_catalog FROM reasons_catalog WHERE id = p_reason_id;
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

    RETURN QUERY SELECT
      v_row.id, v_row.user_id, v_row.reason_id, v_row.label, v_row.description,
      v_row.is_active, v_row.emergency_behavior, v_row.sort_order,
      v_row.created_at, v_row.updated_at;

  ELSE
    DELETE FROM inbound_reasons
    WHERE inbound_reasons.user_id = p_user_id
      AND inbound_reasons.reason_id = p_reason_id;
    -- Retourne 0 lignes → frontend interprète comme suppression confirmée
    RETURN;
  END IF;
END;
$$;

-- ── B) update_inbound_reason_emergency_behavior ───────────────────────────────
-- p_behavior = 'transfer' | 'priority_message' | 'both' | NULL (reset → default compte)

CREATE OR REPLACE FUNCTION update_inbound_reason_emergency_behavior(
  p_user_id           uuid,
  p_inbound_reason_id uuid,
  p_behavior          text
)
RETURNS TABLE (
  id                 uuid,
  emergency_behavior text,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row inbound_reasons%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized: caller % != target %', auth.uid(), p_user_id;
  END IF;

  IF p_behavior IS NOT NULL AND p_behavior NOT IN ('transfer', 'priority_message', 'both') THEN
    RAISE EXCEPTION 'invalid_behavior: %. Valeurs acceptées : transfer, priority_message, both, NULL', p_behavior;
  END IF;

  UPDATE inbound_reasons
  SET emergency_behavior = p_behavior, updated_at = now()
  WHERE id = p_inbound_reason_id AND inbound_reasons.user_id = p_user_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: inbound_reason % pour user %', p_inbound_reason_id, p_user_id;
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.emergency_behavior, v_row.updated_at;
END;
$$;

-- Expose aux utilisateurs authentifiés (contrôle d'accès interne via auth.uid())
GRANT EXECUTE ON FUNCTION toggle_inbound_reason_from_catalog(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION update_inbound_reason_emergency_behavior(uuid, uuid, text) TO authenticated;
