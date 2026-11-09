-- Traffic and errors for the company portal (Traffic & errors). New tables only; nothing existing changes.
-- Page views per day and page (no addresses, no cookies).
CREATE TABLE site_day (
  day   TEXT NOT NULL,
  page  TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page)
);
-- Visitors per day: a one-way fingerprint that changes every day (a visitor can't be followed across days).
CREATE TABLE site_visitor (
  day  TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (day, hash)
);
-- Errors: from the server, and from visitors' browsers.
CREATE TABLE error_log (
  id      TEXT PRIMARY KEY,
  at      TEXT NOT NULL,
  source  TEXT NOT NULL,
  path    TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  detail  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX error_log_at ON error_log (at);
