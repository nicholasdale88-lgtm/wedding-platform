-- Customer accounts: the people who run a wedding, kept the way a CRM will want them later (HubSpot or
-- similar can sync from here without reshaping anything). user.id is the stable customer id.
ALTER TABLE user ADD COLUMN first_name TEXT;
ALTER TABLE user ADD COLUMN last_name TEXT;
ALTER TABLE user ADD COLUMN mobile TEXT;              -- E.164
ALTER TABLE user ADD COLUMN state TEXT;               -- Australian state or territory, or 'Overseas'
ALTER TABLE user ADD COLUMN postcode TEXT;
ALTER TABLE user ADD COLUMN heard_from TEXT;          -- how they found us
ALTER TABLE user ADD COLUMN marketing_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user ADD COLUMN marketing_opt_in_at TEXT; -- when the current choice was made
ALTER TABLE user ADD COLUMN last_login_at TEXT;
ALTER TABLE user ADD COLUMN updated_at TEXT;

-- Every consent choice, as made (the Spam Act wants proof of opt-in): never updated, only added to.
CREATE TABLE consent_log (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES user(id),
  kind      TEXT NOT NULL,     -- 'marketing'
  granted   INTEGER NOT NULL,
  source    TEXT NOT NULL,     -- where it was given: 'profile', 'invite'
  at        TEXT NOT NULL
);
CREATE INDEX consent_log_user ON consent_log (user_id);

-- Inviting someone to help run the wedding (a partner, a planner, a viewer). The link's token is stored
-- only as a hash; it works once, for 14 days.
CREATE TABLE member_invite (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL REFERENCES wedding(id),
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  token_hash  TEXT NOT NULL UNIQUE,
  invited_by  TEXT NOT NULL REFERENCES user(id),
  expires_at  TEXT NOT NULL,
  accepted_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX member_invite_wedding ON member_invite (wedding_id);
