-- A seat per person per event: a guest can sit at the reception and at the birthday dinner. Until now
-- person.table_id held one seat for every event, so saving one event's plan could clear another's.
CREATE TABLE seat (
  person_id TEXT NOT NULL,
  event_id  TEXT NOT NULL,
  table_id  TEXT NOT NULL,
  PRIMARY KEY (person_id, event_id)
);
CREATE INDEX seat_table_idx ON seat (table_id);
CREATE INDEX seat_event_idx ON seat (event_id);

-- Bring the existing seats across (person.table_id is no longer used).
INSERT OR IGNORE INTO seat (person_id, event_id, table_id)
SELECT p.id, t.event_id, p.table_id FROM person p JOIN seat_table t ON t.id = p.table_id WHERE p.table_id IS NOT NULL AND p.deleted_at IS NULL AND t.deleted_at IS NULL;
