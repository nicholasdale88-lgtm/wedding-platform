-- Long banquet and head tables can seat people on one side only (facing the room or the stage):
-- 2 = both sides, 1 = the top (or left) side, -1 = the bottom (or right) side.
ALTER TABLE seat_table ADD COLUMN sides INTEGER NOT NULL DEFAULT 2;
