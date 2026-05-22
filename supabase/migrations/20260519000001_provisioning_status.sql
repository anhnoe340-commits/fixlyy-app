-- Ajoute provisioning_status pour tracer l'état du provisioning artisan
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS provisioning_status text DEFAULT 'pending';

-- Marque comme 'done' les artisans déjà provisionnés
UPDATE profiles SET provisioning_status = 'done'
WHERE vapi_assistant_id IS NOT NULL AND twilio_number IS NOT NULL;

-- Ajoute le numéro orphelin +33939245471 (acheté directement via buyTwilioNumber, hors pool)
INSERT INTO phone_numbers_pool (phone_number, status, assigned_to_user_id, assigned_at, notes)
VALUES (
  '+33939245471',
  'assigned',
  '84cb4b27-e554-4e17-b620-5c2d7efe1960',
  now(),
  'Acheté directement via buyTwilioNumber() — hors pool initial'
)
ON CONFLICT (phone_number) DO NOTHING;
