-- The people who run the app (the company portal) and their roles; the address in SUPER_ADMINS is
-- always an owner on top of these. Invitations are one-use links (only their hash is stored).
CREATE TABLE staff (
  user_id     TEXT PRIMARY KEY REFERENCES user(id),
  role        TEXT NOT NULL,
  added_by    TEXT,
  created_at  TEXT NOT NULL
);
CREATE TABLE staff_invite (
  id          TEXT PRIMARY KEY,
  hash        TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL,
  invited_by  TEXT,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
-- Who's on a piece of feedback (a staff member's user id), and who last changed it.
ALTER TABLE feedback ADD COLUMN assignee TEXT;
ALTER TABLE feedback ADD COLUMN updated_by TEXT;
