-- Ajoute le statut d'abonnement Stripe directement dans profiles
-- subscription_status : trialing | active | canceled | past_due | unpaid
-- subscription_trial_end : date de fin d'essai (vient de Stripe)
-- subscription_plan : nom du plan (Solo, Pro, Équipe)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_status     text             DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_trial_end  timestamptz      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS subscription_plan       text             DEFAULT NULL;
