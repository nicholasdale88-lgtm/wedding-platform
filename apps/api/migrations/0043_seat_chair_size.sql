-- A guest's own chair at their table (1 = the first chair round it; NULL = the next free chair), and a table's
-- real size in metres (its diameter, or its length; NULL = the usual size for its shape). New nullable columns
-- only; nothing existing changes.
ALTER TABLE seat ADD COLUMN chair INTEGER;
ALTER TABLE seat_table ADD COLUMN size_m REAL;
