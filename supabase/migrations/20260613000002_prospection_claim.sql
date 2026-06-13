-- /setup flow : profil orphelin créé par stripe-webhook lors d'un Payment Link (sans supabase_uid)
-- claim_prospection_profile() transfère le profil vers l'auth user après vérification OTP.
-- Atomique : SELECT FOR UPDATE empêche un double-claim concurrent.

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
BEGIN
  SELECT stripe_customer_id
  INTO   v_stripe_customer_id
  FROM   public.profiles
  WHERE  id = p_orphan_id
    AND  source = 'prospection'
    AND  provisioning_status = 'pending_claim'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found_or_already_claimed';
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
