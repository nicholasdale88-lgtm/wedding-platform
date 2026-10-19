-- Seating is drafted in the admin and published to guests: the guides and the night-before text read
-- the published plan, so half-finished changes never reach a guest. Re-publish any time.
CREATE TABLE seat_publish (
  event_id TEXT PRIMARY KEY REFERENCES event(id),
  snapshot TEXT NOT NULL,          -- {aspect, tables:[...], areas:[...], seats:{personId: tableId}}
  published_at TEXT NOT NULL,
  published_by TEXT
);
