CREATE TABLE IF NOT EXISTS user_webhooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artisan_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url         text NOT NULL,
  events      text[] NOT NULL DEFAULT '{}',
  active      boolean NOT NULL DEFAULT true,
  secret      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_webhooks_artisan_idx ON user_webhooks(artisan_id);

ALTER TABLE user_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON user_webhooks
  FOR ALL USING (auth.uid() = artisan_id);
