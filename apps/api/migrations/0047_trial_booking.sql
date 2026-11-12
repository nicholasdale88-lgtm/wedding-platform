-- Free trial bookings from the front page (/try): who asked to try the app. New table only.
CREATE TABLE trial_booking (
  id           TEXT PRIMARY KEY,
  at           TEXT NOT NULL,
  name1        TEXT NOT NULL,
  name2        TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL,
  wedding_date TEXT NOT NULL DEFAULT '',
  news         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX trial_booking_at ON trial_booking (at);
