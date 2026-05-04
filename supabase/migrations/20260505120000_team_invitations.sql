-- Table des invitations d'équipe
CREATE TABLE IF NOT EXISTS team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  phone text NOT NULL,
  suggested_skills text[] DEFAULT '{}',
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  status text CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')) DEFAULT 'pending',
  -- Complété par le membre lors de son onboarding
  last_name text,
  email text,
  hours_json jsonb,
  is_active boolean DEFAULT false,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_owner ON team_invitations(owner_id);

-- RLS : le patron voit et gère ses propres invitations
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_manage_invitations" ON team_invitations
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Activer le realtime pour les mises à jour en direct dans le dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE team_invitations;
