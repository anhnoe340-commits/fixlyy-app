-- Onboarding V3 : plan sélectionné + source d'acquisition
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS selected_plan text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source        text DEFAULT 'self_serve';

COMMENT ON COLUMN profiles.selected_plan IS 'Plan choisi par l''utilisateur lors de l''onboarding : solo | pro | max';
COMMENT ON COLUMN profiles.source        IS 'Canal d''acquisition : self_serve | invited | admin';
