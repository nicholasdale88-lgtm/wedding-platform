-- Retried saves are applied once (YL-19): an Idempotency-Key and the result of the request that first used it,
-- kept 24 hours. status NULL = still running. scope = a hash of who sent it (their session or address).
CREATE TABLE idempotency (
  scope         TEXT NOT NULL,
  key           TEXT NOT NULL,
  method        TEXT NOT NULL,
  path          TEXT NOT NULL,
  status        INTEGER,
  body          TEXT,
  content_type  TEXT,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (scope, key)
);
CREATE INDEX idempotency_created ON idempotency (created_at);
