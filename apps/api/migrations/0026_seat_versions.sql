-- Named versions of an event's seating ("Draft with family", "Final"): each is a snapshot of the saved plan
-- (tables, areas and who sits where). One of them can be nominated as the current arrangement: that copies
-- it into the working plan, and seat_plan.current_version remembers which it was.
CREATE TABLE seat_version (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  snapshot    TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  created_by  TEXT
);
CREATE INDEX seat_version_event ON seat_version (event_id, created_at);
ALTER TABLE seat_plan ADD COLUMN current_version TEXT;
