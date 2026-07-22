-- Fix faille critique : insert_contact et insert_quote acceptaient p_artisan_id
-- fourni par l'appelant sans aucune vérification. N'importe qui (anon inclus,
-- ces fonctions n'ont jamais eu de REVOKE) pouvait insérer un faux contact ou
-- un faux devis dans le compte de n'importe quel artisan.
--
-- insert_contact est appelée par le frontend (Dashboard.tsx) SANS jamais passer
-- p_artisan_id (il reste à sa valeur par défaut NULL, le COALESCE tombe sur
-- auth.uid()) — le paramètre n'a donc aucun usage légitime connu, seulement
-- exploitable. insert_quote n'a aucun appelant du tout dans ce repo (feature
-- devis abandonnée). Les deux gardent leur signature pour rester compatibles
-- avec un éventuel appelant externe non tracké ici, mais p_artisan_id ne peut
-- plus jamais désigner quelqu'un d'autre que l'appelant authentifié.

CREATE OR REPLACE FUNCTION public.insert_contact(
  p_name       text,
  p_phone      text DEFAULT NULL::text,
  p_email      text DEFAULT NULL::text,
  p_address    text DEFAULT NULL::text,
  p_artisan_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
  DECLARE
    v_target_id uuid;
    v_result json;
  BEGIN
    v_target_id := COALESCE(p_artisan_id, auth.uid());

    IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR auth.uid() <> v_target_id) THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;

    INSERT INTO public.contacts (user_id, name, phone, email, address)
    VALUES (v_target_id, p_name, p_phone, p_email, p_address)
    RETURNING row_to_json(contacts.*) INTO v_result;
    RETURN v_result;
  END;
  $function$;

REVOKE ALL ON FUNCTION public.insert_contact(text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_contact(text, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.insert_quote(
  p_artisan_id    uuid,
  p_number        text,
  p_client_name   text,
  p_client_email  text DEFAULT NULL::text,
  p_object        text DEFAULT NULL::text,
  p_total_ht      numeric DEFAULT 0,
  p_total_ttc     numeric DEFAULT 0,
  p_status        text DEFAULT 'draft'::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
  DECLARE
    v_target_id uuid;
    v_id uuid;
  BEGIN
    v_target_id := COALESCE(p_artisan_id, auth.uid());

    IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR auth.uid() <> v_target_id) THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;

    INSERT INTO public.quotes (user_id, number, client_name, client_email, object, total_ht,
  total_ttc, status)
    VALUES (v_target_id, p_number, p_client_name, p_client_email, p_object, p_total_ht,
  p_total_ttc, p_status)
    RETURNING id INTO v_id;
    RETURN v_id;
  END;
  $function$;

REVOKE ALL ON FUNCTION public.insert_quote(uuid, text, text, text, text, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_quote(uuid, text, text, text, text, numeric, numeric, text) TO authenticated;
