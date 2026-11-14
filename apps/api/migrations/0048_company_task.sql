-- The company portal's inbox (Overview → What needs you): drafts and reports from bots (and people) that
-- wait for a person's yes. An approved task's action runs as the person who approved it. New table only.
CREATE TABLE company_task (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL DEFAULT 'approve',
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'waiting',
  result      TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  decided_at  TEXT,
  decided_by  TEXT
);
CREATE INDEX company_task_status ON company_task (status, created_at);
