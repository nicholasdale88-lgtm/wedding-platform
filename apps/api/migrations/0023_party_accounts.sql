-- The wedding party portal: a sign-in for each member (email and password), what they can see and do,
-- and their sessions. Invite and reset links are stored only as hashes.
CREATE TABLE party_account (
  id              TEXT PRIMARY KEY,
  wedding_id      TEXT NOT NULL REFERENCES wedding(id),
  person_id       TEXT NOT NULL,
  email           TEXT,
  pass_hash       TEXT,
  perms           TEXT NOT NULL DEFAULT '{}',
  invite_hash     TEXT,
  invite_expires  TEXT,
  reset_hash      TEXT,
  reset_expires   TEXT,
  failed          INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT
);
CREATE UNIQUE INDEX party_account_person ON party_account (wedding_id, person_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX party_account_email ON party_account (wedding_id, email) WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE TABLE party_session (
  id          TEXT PRIMARY KEY,
  account_id  TEXT NOT NULL REFERENCES party_account(id),
  wedding_id  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX party_session_account ON party_session (account_id);
