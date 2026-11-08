-- The same messages as the texts, by email from the wedding's own address (free): invitations,
-- save-the-dates, reminders, the night-before guide and "send now". Each guest's channel: '' (text when
-- they have a mobile, otherwise email), 'text', 'email' or 'both'. Emails waiting for tomorrow (the day's
-- free allowance used up) stay queued here; nothing is sent twice (one row per wedding and dedupe key).
ALTER TABLE invitation ADD COLUMN channel TEXT NOT NULL DEFAULT '';
CREATE TABLE email_out (
  id            TEXT PRIMARY KEY,
  wedding_id    TEXT NOT NULL,
  invitation_id TEXT,
  campaign_id   TEXT,
  dedupe_key    TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'campaign', -- campaign | reply
  to_addr       TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'queued',   -- queued | sent | failed | cancelled
  error         TEXT,
  created_at    TEXT NOT NULL,
  sent_at       TEXT
);
CREATE UNIQUE INDEX email_out_dedupe ON email_out (wedding_id, dedupe_key);
CREATE INDEX email_out_queue ON email_out (wedding_id, status, created_at);
