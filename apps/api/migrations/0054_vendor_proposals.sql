-- Fee proposals: a listed vendor sends a priced proposal to one of their couples or to an enquiry. The couple
-- opens it by its link (the token) and accepts, declines or asks for changes; the vendor answers a request
-- with a revision. The columns hold the latest revision; earlier ones are kept in versions (JSON), and the
-- couple's requests for changes in requests (JSON). New table only.
CREATE TABLE vendor_proposal (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT NOT NULL,
  wedding_id   TEXT,
  enquiry_id   TEXT,
  token        TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  lines        TEXT NOT NULL DEFAULT '[]',
  deposit      INTEGER NOT NULL DEFAULT 0,
  valid_until  TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'sent',
  revision     INTEGER NOT NULL DEFAULT 1,
  versions     TEXT NOT NULL DEFAULT '[]',
  requests     TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL,
  revised_at   TEXT,
  answered_at  TEXT
);
CREATE INDEX vendor_proposal_listing ON vendor_proposal (listing_id, created_at);
