-- Supprime la FK profiles.id → auth.users(id) pour permettre les profils orphelins
-- (flow prospection : profil créé par stripe-webhook sans auth.users correspondant,
-- réclamé ensuite via /setup OTP → claim_prospection_profile())
ALTER TABLE public.profiles DROP CONSTRAINT profiles_id_fkey;
