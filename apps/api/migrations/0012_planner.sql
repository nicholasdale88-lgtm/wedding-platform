-- The planner side. Wedding party roles on people (bridesmaid, best man, MC…), and the couple's planning
-- documents, each one JSON with a version: the wedding party's run sheet per event, the bride's and
-- groom's on-the-day checklists, and later the budget and vendors.
ALTER TABLE person ADD COLUMN party_role TEXT NOT NULL DEFAULT '';

CREATE TABLE planner_doc (
  wedding_id TEXT NOT NULL,
  kind       TEXT NOT NULL,             -- 'party-runsheet' | 'day-checklist' | 'budget' | 'vendors' …
  scope      TEXT NOT NULL DEFAULT '',  -- an event key, or '' for the whole wedding
  data       TEXT NOT NULL DEFAULT '{}',
  version    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (wedding_id, kind, scope)
);
