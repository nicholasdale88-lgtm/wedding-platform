-- The vendor directory: wedding suppliers by area, shared by every wedding. Filled from OpenStreetMap the
-- first time an area is searched (then kept for 30 days), and by couples' own booked vendors. How often each
-- is added or booked, and what couples paid (shown only as a range once three weddings have prices), come
-- from vendor_use.
CREATE TABLE vendor_directory (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  category    TEXT NOT NULL,
  name        TEXT NOT NULL,
  lat         REAL NOT NULL,
  lon         REAL NOT NULL,
  cell        TEXT NOT NULL,
  address     TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  website     TEXT NOT NULL DEFAULT '',
  hidden      INTEGER NOT NULL DEFAULT 0,
  first_seen  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX vendor_directory_area ON vendor_directory (category, lat, lon);

CREATE TABLE vendor_area_search (
  category     TEXT NOT NULL,
  cell         TEXT NOT NULL,
  searched_at  TEXT NOT NULL,
  PRIMARY KEY (category, cell)
);

CREATE TABLE vendor_use (
  wedding_id  TEXT NOT NULL,
  dir_id      TEXT NOT NULL,
  booked      INTEGER NOT NULL DEFAULT 0,
  amount      REAL NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (wedding_id, dir_id)
);
CREATE INDEX vendor_use_dir ON vendor_use (dir_id);
