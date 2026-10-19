-- M2.2: live forecast for the night-before guides (Open-Meteo), cached per event for an hour.
CREATE TABLE weather_cache (
  event_id TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
