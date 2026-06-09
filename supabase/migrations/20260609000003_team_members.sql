-- Membres d'équipe ayant accès au dashboard (distinct de team_invitations = artisans terrain)
CREATE TABLE team_members (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  email                 TEXT        NOT NULL,
  role                  TEXT        NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member')),
  status                TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'removed')),
  receive_sms_recap     BOOLEAN     DEFAULT false,
  invited_at            TIMESTAMPTZ DEFAULT now(),
  joined_at             TIMESTAMPTZ,
  invitation_token      UUID        DEFAULT gen_random_uuid(),
  invitation_expires_at TIMESTAMPTZ DEFAULT now() + interval '7 days',
  UNIQUE(owner_user_id, email)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accès propriétaire team_members"
  ON team_members
  USING (auth.uid() = owner_user_id OR auth.uid() = member_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- Journal des actions des membres
CREATE TABLE team_activity_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_email    TEXT        NOT NULL,
  action          TEXT        NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE team_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accès propriétaire activity_log"
  ON team_activity_log
  USING (auth.uid() = owner_user_id);
