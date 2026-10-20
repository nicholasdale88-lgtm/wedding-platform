-- Vendors who sign up themselves: their own listing in the vendor directory (edited after signing in), and
-- couples' enquiries to them. Each listing is also a row in vendor_directory (id "v:<listing id>", source
-- 'listed', at its home region's centre) so the planner's finder near the venue shows it, and couples who
-- add or book it are counted there (vendor_use).
CREATE TABLE vendor_listing (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL,
  region        TEXT NOT NULL,
  regions       TEXT NOT NULL DEFAULT '[]',
  contact_name  TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  website       TEXT NOT NULL DEFAULT '',
  instagram     TEXT NOT NULL DEFAULT '',
  about         TEXT NOT NULL DEFAULT '',
  price_from    INTEGER NOT NULL DEFAULT 0,
  photos        TEXT NOT NULL DEFAULT '[]',
  hidden        INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX vendor_listing_browse ON vendor_listing (category, region);
CREATE INDEX vendor_listing_user ON vendor_listing (user_id);

CREATE TABLE vendor_enquiry (
  id          TEXT PRIMARY KEY,
  listing_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  date        TEXT NOT NULL DEFAULT '',
  guests      INTEGER NOT NULL DEFAULT 0,
  message     TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
CREATE INDEX vendor_enquiry_listing ON vendor_enquiry (listing_id, created_at);
