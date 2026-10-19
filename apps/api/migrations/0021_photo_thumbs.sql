-- A small copy of each photo (and a video's first frame), made on the guest's phone, for album and admin
-- grids: about 25 KB each, so a 3,000-photo album opens quickly and costs nothing to store.
CREATE TABLE photo_thumb (
  media_id   TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL
);
