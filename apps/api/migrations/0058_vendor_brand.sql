-- A vendor's own look for their account: their logo (kept apart, so listing reads stay small), when it last
-- changed (for the image address), and their colours and menu choices (JSON).
ALTER TABLE vendor_listing ADD COLUMN look TEXT NOT NULL DEFAULT '{}';
ALTER TABLE vendor_listing ADD COLUMN logo_at TEXT;
CREATE TABLE vendor_logo (
  listing_id  TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  data        BLOB NOT NULL,
  updated_at  TEXT NOT NULL
);
