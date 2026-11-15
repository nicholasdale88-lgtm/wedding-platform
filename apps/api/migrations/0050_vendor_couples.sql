-- Vendors' couples: a listed vendor is linked to a wedding when the couple signs up through the vendor's link
-- or adds the vendor to their planner. The couple can end it ('ended'). Messages between the vendor and the
-- couple, in the app (each side sees the thread; an email says a new one is waiting). New tables only.
CREATE TABLE vendor_couple (
  listing_id  TEXT NOT NULL,
  wedding_id  TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'added',
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TEXT NOT NULL,
  PRIMARY KEY (listing_id, wedding_id)
);
CREATE INDEX vendor_couple_wedding ON vendor_couple (wedding_id);

CREATE TABLE vendor_message (
  id           TEXT PRIMARY KEY,
  listing_id   TEXT NOT NULL,
  wedding_id   TEXT NOT NULL,
  from_vendor  INTEGER NOT NULL,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  read_at      TEXT
);
CREATE INDEX vendor_message_thread ON vendor_message (listing_id, wedding_id, created_at);
