-- Colonnes pour stocker l'ID du SIP trunk et dispatch rule LiveKit Cloud par artisan
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS livekit_trunk_id TEXT,
  ADD COLUMN IF NOT EXISTS livekit_dispatch_rule_id TEXT;
