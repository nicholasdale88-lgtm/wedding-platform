-- Who each invitation is to the couple, for seating: whose side they're on ('p1', 'p2', 'both' or ''),
-- how they know the couple (family, uni friend, ex-work colleague…) and their circles (who knows who:
-- "Uni crew,Acme work"). New columns with defaults only; nothing existing changes.
ALTER TABLE invitation ADD COLUMN side TEXT NOT NULL DEFAULT '';
ALTER TABLE invitation ADD COLUMN relation TEXT NOT NULL DEFAULT '';
ALTER TABLE invitation ADD COLUMN circles TEXT NOT NULL DEFAULT '';
