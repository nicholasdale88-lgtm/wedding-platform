-- Bots that help run the company (Grok, say): each has its own sign-in user (so the Activity log shows its
-- name), a company role like a person's, and a secret key it sends as "Authorization: Bearer ...".
-- Only the key's hash is kept; revoking a bot stops the key at once.
CREATE TABLE bot_key (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES user(id),
  name        TEXT NOT NULL,
  hash        TEXT NOT NULL UNIQUE,
  created_by  TEXT,
  created_at  TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at  TEXT
);
