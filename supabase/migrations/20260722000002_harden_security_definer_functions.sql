-- Fix faille critique : 3 fonctions SECURITY DEFINER acceptaient un p_user_id
-- arbitraire sans jamais vérifier que l'appelant y correspond, alors qu'elles
-- sont exécutables par anon/authenticated (grant PUBLIC par défaut, jamais révoqué).
--
-- Toutes trois sont appelées en production exclusivement par des edge functions
-- via le client service_role (assign-number-from-pool, get-usage,
-- claim-prospection-profile) — ces edge functions ont déjà vérifié l'identité
-- de l'appelant (JWT) AVANT d'appeler le RPC avec le bon p_user_id. Le check
-- `auth.role() = 'service_role' OR auth.uid() = p_user_id` laisse donc ce flux
-- légitime intact tout en bloquant un appel RPC direct (anon ou authenticated
-- essayant d'agir pour un autre user_id que le sien).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. claim_prospection_profile — vol possible d'un profil payé (Stripe)
-- ═══════════════════════════════════════════════════════════════════════════
-- Défense en profondeur : en plus du gate rôle/uid, on revérifie que le
-- téléphone OU l'email du compte réclamant correspond bien à celui du profil
-- orphelin (même logique que l'edge function claim-prospection-profile qui
-- retrouve l'orphelin par phone/email de l'utilisateur authentifié — ici on
-- s'assure que ce lien ne peut pas être contourné par un appel RPC direct).
CREATE OR REPLACE FUNCTION public.claim_prospection_profile(
  p_orphan_id uuid,
  p_user_id   uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_customer_id text;
  v_caller_phone        text;
  v_caller_email        text;
  v_orphan_phone        text;
  v_orphan_email        text;
BEGIN
  -- NB: auth.uid() = p_user_id vaut NULL (pas false) quand auth.uid() est NULL
  -- (appel anon) — écrit ainsi pour ne jamais laisser passer un NULL comme "non bloqué".
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Identité de l'appelant : téléphone ou email confirmé côté Supabase Auth
  -- (i.e. déjà passé par un OTP vérifié pour obtenir ce compte).
  SELECT phone, email
  INTO   v_caller_phone, v_caller_email
  FROM   auth.users
  WHERE  id = p_user_id
    AND  (phone_confirmed_at IS NOT NULL OR email_confirmed_at IS NOT NULL);

  IF v_caller_phone IS NULL AND v_caller_email IS NULL THEN
    RAISE EXCEPTION 'identity_not_verified';
  END IF;

  SELECT stripe_customer_id, phone, email
  INTO   v_stripe_customer_id, v_orphan_phone, v_orphan_email
  FROM   public.profiles
  WHERE  id = p_orphan_id
    AND  source = 'prospection'
    AND  provisioning_status = 'pending_claim'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found_or_already_claimed';
  END IF;

  -- Le profil orphelin doit correspondre au téléphone (normalisé, sans espaces)
  -- ou à l'email (insensible à la casse) de l'appelant vérifié.
  IF NOT (
    (v_caller_phone IS NOT NULL
      AND regexp_replace(v_caller_phone, '\s', '', 'g') = regexp_replace(coalesce(v_orphan_phone, ''), '\s', '', 'g'))
    OR (v_caller_email IS NOT NULL
      AND lower(v_caller_email) = lower(coalesce(v_orphan_email, '')))
  ) THEN
    RAISE EXCEPTION 'identity_mismatch';
  END IF;

  UPDATE public.profiles
  SET    id = p_user_id,
         provisioning_status = 'pending'
  WHERE  id = p_orphan_id;

  RETURN json_build_object(
    'ok',                  true,
    'stripe_customer_id',  v_stripe_customer_id,
    'user_id',             p_user_id::text
  );
END;
$$;

-- Supabase accorde EXECUTE à anon/authenticated via ALTER DEFAULT PRIVILEGES au
-- niveau du schéma à la création de la fonction : un REVOKE ... FROM PUBLIC seul
-- ne suffit pas, il faut révoquer explicitement le rôle anon.
REVOKE ALL ON FUNCTION public.claim_prospection_profile(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_prospection_profile(uuid, uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. assign_phone_number_to_user — DoS possible sur le pool de numéros (9 dispo)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION assign_phone_number_to_user(p_user_id uuid)
RETURNS TABLE(
  phone_number_id   uuid,
  twilio_sid        text,
  phone_number      text,
  vapi_phone_number_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row phone_numbers_pool%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Vérifie si l'utilisateur a déjà un numéro assigné
  SELECT * INTO v_row
  FROM phone_numbers_pool
  WHERE assigned_to_user_id = p_user_id
    AND status = 'assigned'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT v_row.id, v_row.twilio_sid, v_row.phone_number, v_row.vapi_phone_number_id;
    RETURN;
  END IF;

  -- Cherche un numéro disponible, verrouille pour éviter la race condition
  SELECT * INTO v_row
  FROM phone_numbers_pool
  WHERE status = 'available'
  ORDER BY purchased_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_number_available';
  END IF;

  -- Réserve le numéro
  UPDATE phone_numbers_pool
  SET status = 'reserved',
      reserved_at = now(),
      assigned_to_user_id = p_user_id
  WHERE id = v_row.id;

  RETURN QUERY SELECT v_row.id, v_row.twilio_sid, v_row.phone_number, v_row.vapi_phone_number_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_phone_number_to_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_phone_number_to_user(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. get_monthly_minutes — fuite du volume d'usage mensuel de n'importe quel artisan
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_monthly_minutes(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_minutes integer;
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT CEIL(COALESCE(SUM(duration_seconds), 0)::numeric / 60)::integer
  INTO   v_minutes
  FROM public.calls
  WHERE artisan_id = p_user_id
    AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Europe/Paris')
    AND created_at <  DATE_TRUNC('month', NOW() AT TIME ZONE 'Europe/Paris') + INTERVAL '1 month';

  RETURN v_minutes;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_minutes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_minutes(uuid) TO service_role, authenticated;
