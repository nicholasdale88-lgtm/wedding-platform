-- Song requests: guests ask for songs from their own page; the couple marks each one for the DJ
-- (must play / maybe / don't play) and adds their own.
CREATE TABLE song_request (
  id            TEXT PRIMARY KEY,
  wedding_id    TEXT NOT NULL,
  invitation_id TEXT,                 -- NULL: added by the couple
  title         TEXT NOT NULL,
  artist        TEXT NOT NULL DEFAULT '',
  note          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'must', 'maybe', 'no')),
  created_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX song_request_wedding ON song_request (wedding_id);
