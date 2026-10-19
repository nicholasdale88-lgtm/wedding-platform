-- Files the couple keeps with their planning (quotes from vendors, contracts): small PDFs and photos,
-- kept in the database so they work without extra storage (1.5 MB each).
CREATE TABLE planner_file (
  id         TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX planner_file_wedding ON planner_file (wedding_id);
