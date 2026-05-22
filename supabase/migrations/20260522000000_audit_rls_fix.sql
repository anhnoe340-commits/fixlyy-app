-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : audit_rls_fix
-- Date      : 2026-05-22
-- Contexte  : Audit RLS complet — 3 tables avec statuts anormaux détectés
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABLE 'colors' — RLS intentionnellement désactivé
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision : RLS reste OFF. 'colors' est une table de référence statique
-- (palette de couleurs pour les devis). Elle ne contient aucune donnée
-- utilisateur et doit être lisible publiquement. Activer RLS avec une policy
-- SELECT open reviendrait au même résultat mais ajouterait du coût CPU inutile.
-- En revanche, on révoque les droits d'écriture pour anon et authenticated
-- afin qu'aucun utilisateur ne puisse modifier la table de référence.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.colors FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.colors FROM authenticated;

-- SELECT reste ouvert via les grants par défaut de Supabase (public = anon + authenticated).


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TABLE 'subscriptions' — RLS activé, 0 policies → deny-all corrigé
-- ═══════════════════════════════════════════════════════════════════════════
-- La table est écrite exclusivement par le webhook Stripe via service_role
-- (bypass RLS). On ajoute deux policies :
--   a) service_role ALL : pour stripe-webhook et les edge functions
--   b) authenticated SELECT own : si un jour le frontend lit l'abonnement courant

-- La table n'a pas de colonne user_id — elle est liée à Stripe via
-- stripe_customer_id. Pas de policy frontend possible sans jointure profiles.
-- On se limite à service_role pour le stripe-webhook.
CREATE POLICY "service_role_all_subscriptions"
  ON public.subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. TABLE 'users' — vestige V1, jamais utilisée dans le code actuel
-- ═══════════════════════════════════════════════════════════════════════════
-- Vérifié : SELECT count(*) FROM public.users → 0 lignes.
-- Aucune FK externe détectée. Drop sans risque.
DROP TABLE public.users;
