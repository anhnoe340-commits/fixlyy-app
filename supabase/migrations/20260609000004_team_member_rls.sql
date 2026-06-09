-- Helper: vérifie si l'utilisateur courant est un membre actif du workspace d'un owner
CREATE OR REPLACE FUNCTION is_team_member_of(owner_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE owner_user_id = owner_id
      AND member_user_id = auth.uid()
      AND status = 'active'
  )
$$;

-- calls : les membres peuvent lire les appels du owner
DROP POLICY IF EXISTS "calls_team_member_read" ON calls;
CREATE POLICY "calls_team_member_read"
  ON calls FOR SELECT
  USING (is_team_member_of(artisan_id));

-- contacts : les membres peuvent lire les contacts du owner
DROP POLICY IF EXISTS "contacts_team_member_read" ON contacts;
CREATE POLICY "contacts_team_member_read"
  ON contacts FOR SELECT
  USING (is_team_member_of(user_id));

-- appointments : les membres peuvent lire les RDV du owner
DROP POLICY IF EXISTS "appointments_team_member_read" ON appointments;
CREATE POLICY "appointments_team_member_read"
  ON appointments FOR SELECT
  USING (is_team_member_of(artisan_id));

-- messages : les membres peuvent lire les messages du owner
DROP POLICY IF EXISTS "messages_team_member_read" ON messages;
CREATE POLICY "messages_team_member_read"
  ON messages FOR SELECT
  USING (is_team_member_of(artisan_id));

-- service_pricing : les membres admin peuvent lire/modifier les tarifs
DROP POLICY IF EXISTS "service_pricing_team_member_read" ON service_pricing;
CREATE POLICY "service_pricing_team_member_read"
  ON service_pricing FOR SELECT
  USING (is_team_member_of(user_id));
