-- A photo's original, without the frame or look a guest chose: kept beside the framed photo (raw_of is
-- the framed photo's id) so the couple can download either. Originals aren't listed on their own.
ALTER TABLE media ADD COLUMN raw_of TEXT;
CREATE INDEX media_raw_of ON media (raw_of);
