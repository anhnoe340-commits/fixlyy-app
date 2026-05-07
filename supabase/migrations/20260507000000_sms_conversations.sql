-- Historique des conversations SMS par client/artisan
CREATE TABLE IF NOT EXISTS sms_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_phone text NOT NULL,
  messages   jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(artisan_id, client_phone)
);

ALTER TABLE sms_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "artisan_own_sms_conv" ON sms_conversations
  FOR ALL USING (artisan_id = auth.uid());

-- Index pour retrouver rapidement les convs d'un artisan
CREATE INDEX IF NOT EXISTS sms_conversations_artisan_idx ON sms_conversations(artisan_id);
