-- Linked photo storage: guests' photos also go to the couple's own Google Drive, Google Photos, Dropbox
-- or OneDrive (or only there, when the site's own photo storage is off).

CREATE TABLE photo_link (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL,
  provider    TEXT NOT NULL CHECK (provider IN ('gdrive', 'gphotos', 'dropbox', 'onedrive')),
  account     TEXT NOT NULL DEFAULT '',
  refresh_enc TEXT NOT NULL,              -- the refresh token, sealed (AES-GCM, key from SESSION_SECRET)
  folders     TEXT NOT NULL DEFAULT '{}', -- event key -> the folder or album made for it
  status      TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'error')),
  last_error  TEXT,
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX photo_link_wedding ON photo_link (wedding_id);

-- Each photo's copy to each linked storage (retried by the cron until it lands, up to 6 tries).
CREATE TABLE photo_copy (
  media_id   TEXT NOT NULL,
  link_id    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  remote_id  TEXT,
  attempts   INTEGER NOT NULL DEFAULT 0,
  error      TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (media_id, link_id)
);
CREATE INDEX photo_copy_status ON photo_copy (status);

-- A connect in progress: the provider sends the couple back with this id (valid 15 minutes, used once).
CREATE TABLE oauth_state (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  provider   TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- A photo's content hash: the same photo added twice is kept once, wherever it is stored.
ALTER TABLE media ADD COLUMN sha TEXT;
