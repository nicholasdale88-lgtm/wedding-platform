-- Help's walkthrough narration, made once by Workers AI text to speech and kept: one row per line spoken.
-- The key is a hash of the model, the voice and the words, so an edited line is simply a new row.
CREATE TABLE help_audio (
  key         TEXT PRIMARY KEY,
  model       TEXT NOT NULL,
  speaker     TEXT NOT NULL,
  chars       INTEGER NOT NULL,
  mime        TEXT NOT NULL,
  audio       BLOB NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX help_audio_created ON help_audio (created_at);
