-- Emails to the event's own address (Cloudflare Email Routing sends them to the Worker): kept here and
-- shown in Account → Messages → Email, sorted into guests, vendors and other. A vendor's quote that comes
-- as an attachment is filed under that vendor (the file itself is in planner_file).
CREATE TABLE inbox_email (
  id            TEXT PRIMARY KEY,
  wedding_id    TEXT NOT NULL,
  message_id    TEXT,
  from_addr     TEXT NOT NULL,
  from_name     TEXT NOT NULL DEFAULT '',
  subject       TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('guest', 'vendor', 'other')),
  invitation_id TEXT,
  vendor_id     TEXT,
  files         TEXT NOT NULL DEFAULT '[]', -- [{ id, name, type }] (planner_file ids)
  filed         TEXT NOT NULL DEFAULT '',   -- the vendor a quote was filed under
  received_at   TEXT NOT NULL,
  read_at       TEXT,
  archived_at   TEXT
);
CREATE INDEX inbox_wedding ON inbox_email (wedding_id, received_at);
CREATE UNIQUE INDEX inbox_message ON inbox_email (wedding_id, message_id);
