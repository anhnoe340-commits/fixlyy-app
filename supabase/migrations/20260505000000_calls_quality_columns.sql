-- Ajout des colonnes de qualité conversationnelle sur la table calls
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS client_tone text,                  -- "calme" | "stressé" | "agressif" | "confus"
  ADD COLUMN IF NOT EXISTS ai_tone_used text,                 -- "efficace" | "empathique" | "rassurante"
  ADD COLUMN IF NOT EXISTS conversation_quality_score int,    -- 0 à 10
  ADD COLUMN IF NOT EXISTS conversation_quality_notes text;   -- Note 1 phrase générée par Vapi
