-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : create_key_rotations
-- Date      : 2026-06-06
-- Objectif  : Suivi des renouvellements de clés API critiques
--             Accessible uniquement à l'admin Fixlyy (user Noé)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.key_rotations (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name     text        NOT NULL,
  key_name         text        NOT NULL,
  last_rotated_at  timestamptz,
  next_rotation_at timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Index pour tri par prochaine rotation
CREATE INDEX idx_key_rotations_next ON public.key_rotations (next_rotation_at ASC);

-- RLS : lecture et écriture réservées à l'admin uniquement
ALTER TABLE public.key_rotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_key_rotations"
  ON public.key_rotations
  FOR ALL
  USING (auth.uid() = 'e537e7ab-5f0e-489f-8acc-7faae4dbe0d7'::uuid)
  WITH CHECK (auth.uid() = 'e537e7ab-5f0e-489f-8acc-7faae4dbe0d7'::uuid);

-- Trigger updated_at automatique
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_key_rotations_updated_at
  BEFORE UPDATE ON public.key_rotations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Données initiales : clés à rotation recommandée tous les 90 jours
INSERT INTO public.key_rotations (service_name, key_name, last_rotated_at, next_rotation_at)
VALUES
  ('Vapi AI',     'VAPI_API_KEY',        now(), now() + interval '90 days'),
  ('Twilio',      'TWILIO_AUTH_TOKEN',   now(), now() + interval '90 days'),
  ('ElevenLabs',  'ELEVEN_API_KEY',      now(), now() + interval '90 days'),
  ('Anthropic',   'ANTHROPIC_API_KEY',   now(), now() + interval '90 days'),
  ('Resend',      'RESEND_API_KEY',      now(), now() + interval '90 days');
