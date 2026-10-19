-- Groups for each invitation (e.g. "Sophie's side", "Wedding party", "Work friends"), used to
-- colour and filter the seating plan and keep groups together when auto-seating.
ALTER TABLE invitation ADD COLUMN party TEXT NOT NULL DEFAULT '';
