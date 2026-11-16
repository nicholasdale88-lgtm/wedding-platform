-- A vendor's sales pipeline (each enquiry's stage and a private note) and the dates they're already booked.
ALTER TABLE vendor_enquiry ADD COLUMN stage TEXT NOT NULL DEFAULT 'new';
ALTER TABLE vendor_enquiry ADD COLUMN note TEXT NOT NULL DEFAULT '';
CREATE TABLE vendor_busy (
  listing_id TEXT NOT NULL,
  date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (listing_id, date)
);
