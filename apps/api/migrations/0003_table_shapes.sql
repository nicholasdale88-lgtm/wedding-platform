-- More table shapes: oval, square, head table (one side), sweetheart, alongside round and long.
-- SQLite can't change a CHECK, so the table is rebuilt; foreign keys are checked at the end.
PRAGMA defer_foreign_keys = on;

CREATE TABLE seat_table_new (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES event(id),
  name TEXT NOT NULL,
  shape TEXT NOT NULL DEFAULT 'round' CHECK (shape IN ('round', 'oval', 'square', 'long', 'head', 'sweetheart')),
  dir TEXT NOT NULL DEFAULT 'h' CHECK (dir IN ('h', 'v')),
  length_pct INTEGER NOT NULL DEFAULT 40,
  x REAL NOT NULL,
  y REAL NOT NULL,
  seats INTEGER NOT NULL DEFAULT 10,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
INSERT INTO seat_table_new (id, wedding_id, event_id, name, shape, dir, length_pct, x, y, seats, version, deleted_at)
  SELECT id, wedding_id, event_id, name, shape, CASE WHEN dir = 'v' THEN 'v' ELSE 'h' END, length_pct, x, y, seats, version, deleted_at FROM seat_table;
DROP TABLE seat_table;
ALTER TABLE seat_table_new RENAME TO seat_table;

PRAGMA defer_foreign_keys = off;
