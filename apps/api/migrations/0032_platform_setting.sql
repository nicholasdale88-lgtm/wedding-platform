-- The company's own settings (the platform owner's portal): social links, the front-page banner, the
-- "Made with" link on guest pages, and promo codes. One JSON value per key ('site', 'promos').
CREATE TABLE platform_setting (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
