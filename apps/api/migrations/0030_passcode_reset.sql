-- Forgot your passcode: a one-hour link emailed to the account's address. Only the link's hash is kept;
-- it works once.
CREATE TABLE passcode_reset (
  hash        TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX passcode_reset_user ON passcode_reset (user_id);
