-- Shuttle seats: the couple sets up runs per event (in the planner's "shuttles" document); guests book
-- seats from their invitation. One booking per invitation per run.
CREATE TABLE shuttle_booking (
  wedding_id    TEXT NOT NULL,
  shuttle_id    TEXT NOT NULL,
  invitation_id TEXT NOT NULL,
  seats         INTEGER NOT NULL CHECK (seats BETWEEN 1 AND 20),
  created_at    TEXT NOT NULL,
  PRIMARY KEY (shuttle_id, invitation_id)
);
CREATE INDEX shuttle_booking_wedding ON shuttle_booking (wedding_id);
