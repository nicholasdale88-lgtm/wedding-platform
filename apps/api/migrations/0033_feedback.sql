-- What couples tell the company (Help → Tell us): an idea, a problem, or something they love. The company
-- portal triages it (new → planned → done, or not now) with a short note; planned ones are the roadmap.
CREATE TABLE feedback (
  id          TEXT PRIMARY KEY,
  wedding_id  TEXT REFERENCES wedding(id),
  user_id     TEXT REFERENCES user(id),
  kind        TEXT NOT NULL DEFAULT 'idea',
  text        TEXT NOT NULL,
  page        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'new',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX feedback_status ON feedback (status, created_at);
