-- Ajoute la colonne sms_body (accroche courte ≤80 chars) à côté de summary (résumé 3 phrases)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS sms_body text;
