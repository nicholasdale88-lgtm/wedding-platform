-- A second mobile on an invitation (each of a couple): texts go to both, each number's STOP counts on its own,
-- and a reply from either is that household's. A new nullable column only; nothing existing changes.
ALTER TABLE invitation ADD COLUMN phone2 TEXT;
