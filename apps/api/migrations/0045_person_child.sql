-- A guest can be a child (for the caterer's numbers and seating); everyone is an adult unless marked.
-- A new column with a default only; nothing existing changes.
ALTER TABLE person ADD COLUMN child INTEGER NOT NULL DEFAULT 0;
