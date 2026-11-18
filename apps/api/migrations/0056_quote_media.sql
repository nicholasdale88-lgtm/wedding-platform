-- Vendors' virtual samples on a quote: small photos (and the frames of a spin view) a vendor adds from their
-- quote link. Kept apart from the couple's planning files so they don't fill that list. New table only.
CREATE TABLE quote_media (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL,
  rfq_key     TEXT NOT NULL,
  type        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  data        BLOB NOT NULL,
  created_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX quote_media_key ON quote_media (wedding_id, rfq_key);
