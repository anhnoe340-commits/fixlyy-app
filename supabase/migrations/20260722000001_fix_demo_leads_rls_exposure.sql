-- Fix faille RLS critique : demo_leads et feature_ideas étaient lisibles
-- par n'importe qui via la clé anon publique (policies "anon_read" /
-- "authenticated_read" en USING (true)), exposant transcripts d'appels,
-- emails et téléphones de tous les leads démo.
--
-- Les deux edge functions qui écrivent dans ces tables (demo-call,
-- capture-demo-lead) utilisent déjà FIXLYY_SERVICE_ROLE_KEY côté serveur,
-- qui bypass RLS nativement. Les policies anon_insert/anon_read/
-- authenticated_read n'ont donc jamais été nécessaires au fonctionnement.
--
-- Tout accès dashboard/admin doit désormais passer par une edge function
-- authentifiée (service_role côté serveur), jamais par une requête directe
-- du navigateur avec la clé anon.

DROP POLICY IF EXISTS "anon_read" ON public.demo_leads;
DROP POLICY IF EXISTS "authenticated_read" ON public.demo_leads;
DROP POLICY IF EXISTS "anon_insert" ON public.demo_leads;

DROP POLICY IF EXISTS "anon_read" ON public.feature_ideas;
DROP POLICY IF EXISTS "authenticated_read" ON public.feature_ideas;
DROP POLICY IF EXISTS "anon_insert" ON public.feature_ideas;

-- "service_role_all" (déjà présente sur les deux tables) reste seule policy :
-- seul service_role peut lire/écrire, donc uniquement via edge functions.
