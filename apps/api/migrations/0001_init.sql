-- 0001: initial schema. Source of truth; src/db/schema.ts mirrors it (checked by test/schema.test.ts).
-- ids: text. Times: text, UTC ISO 8601. Soft delete: deleted_at. Mutable rows carry version for optimistic concurrency.
-- Changes from docs/03 are marked "M1.2".

CREATE TABLE user (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  pass_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE wedding (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name1 TEXT NOT NULL,
  name2 TEXT NOT NULL,
  monogram TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  theme TEXT NOT NULL DEFAULT 'Cream & Sage',
  theme_overrides TEXT,
  content TEXT NOT NULL DEFAULT '{}',
  guide TEXT NOT NULL DEFAULT '{}',
  music_key TEXT,
  hero_key TEXT,
  park_video_key TEXT,
  park_video_url TEXT,
  sms_sender TEXT,
  admin_mobile TEXT,
  sms_rate_cents_x100 INTEGER NOT NULL DEFAULT 176,
  wallet_credits INTEGER,                                  -- NULL = unlimited
  sms_paused INTEGER NOT NULL DEFAULT 0,                   -- M1.2: "Pause all texts"
  sms_daily_cap INTEGER NOT NULL DEFAULT 500,              -- M1.2
  sms_optout_footer TEXT NOT NULL DEFAULT 'Reply STOP to opt out', -- M1.2: Spam Act
  sms_replies TEXT NOT NULL DEFAULT '{}',                  -- M1.2: {yes,no,multi} auto-reply wording
  plan TEXT NOT NULL DEFAULT 'trial',
  quiet_start INTEGER NOT NULL DEFAULT 8,
  quiet_end INTEGER NOT NULL DEFAULT 20,
  photo_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE membership (
  wedding_id TEXT NOT NULL REFERENCES wedding(id),
  user_id TEXT NOT NULL REFERENCES user(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (wedding_id, user_id)
);

CREATE TABLE event (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES wedding(id),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  pending_label TEXT NOT NULL,                             -- M1.2: how {pending} names it ("the wedding")
  starts_at TEXT NOT NULL,
  venue TEXT,
  address TEXT,
  map_url TEXT,
  catered INTEGER NOT NULL DEFAULT 1,
  has_seating INTEGER NOT NULL DEFAULT 0,
  questions TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  UNIQUE (wedding_id, key)
);

CREATE TABLE invitation (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES wedding(id),
  token TEXT NOT NULL UNIQUE,
  phone TEXT,                                              -- E.164
  seats_held INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  sms_optout INTEGER NOT NULL DEFAULT 0,
  consent INTEGER NOT NULL DEFAULT 1,
  opened_at TEXT,                                          -- M1.2: first opened the invitation
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);
CREATE INDEX invitation_wedding ON invitation (wedding_id);
CREATE INDEX invitation_phone ON invitation (phone);

CREATE TABLE seat_table (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES event(id),
  name TEXT NOT NULL,
  shape TEXT NOT NULL DEFAULT 'round' CHECK (shape IN ('round', 'long')),
  dir TEXT NOT NULL DEFAULT 'h',
  length_pct INTEGER NOT NULL DEFAULT 40,
  x REAL NOT NULL,
  y REAL NOT NULL,
  seats INTEGER NOT NULL DEFAULT 10,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE person (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL REFERENCES invitation(id),
  idx INTEGER NOT NULL,                                    -- 0 = main contact
  name TEXT NOT NULL,
  diet TEXT NOT NULL DEFAULT '',
  meal_entree TEXT NOT NULL DEFAULT '',
  meal_main TEXT NOT NULL DEFAULT '',
  meal_dessert TEXT NOT NULL DEFAULT '',
  table_id TEXT REFERENCES seat_table(id),
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  UNIQUE (invitation_id, idx)
);

CREATE TABLE invite_event (
  invitation_id TEXT NOT NULL REFERENCES invitation(id),
  event_id TEXT NOT NULL REFERENCES event(id),
  PRIMARY KEY (invitation_id, event_id)
);

CREATE TABLE rsvp (
  invitation_id TEXT NOT NULL REFERENCES invitation(id),
  event_id TEXT NOT NULL REFERENCES event(id),
  attending INTEGER,                                       -- NULL awaiting, 1 yes, 0 no
  count INTEGER NOT NULL DEFAULT 1,
  answers TEXT NOT NULL DEFAULT '{}',
  message TEXT NOT NULL DEFAULT '',
  via TEXT NOT NULL DEFAULT 'invitation',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (invitation_id, event_id)
);

CREATE TABLE campaign (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL REFERENCES wedding(id),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'dates', 'manual')),
  enabled INTEGER NOT NULL DEFAULT 0,
  trigger TEXT CHECK (trigger IN ('invitation_created', 'rsvp_changed')),
  audience TEXT NOT NULL,
  excluded TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  UNIQUE (wedding_id, key)
);

CREATE TABLE campaign_slot (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaign(id),
  send_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'done', 'failed', 'cancelled')),
  claimed_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX slot_due ON campaign_slot (status, send_at);

-- Every outbound text. UNIQUE dedupe_key is what makes sends idempotent.
CREATE TABLE sms_out (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  invitation_id TEXT,
  campaign_id TEXT,
  dedupe_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'campaign' CHECK (kind IN ('campaign', 'reply', 'forward', 'test')), -- M1.2
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  parts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'blocked', 'cancelled')),
  provider_id TEXT,
  error TEXT,
  batch_key TEXT,                                          -- M1.2: Idempotency-Key of the first attempt
  attempted_at TEXT,                                       -- M1.2
  claimed_at TEXT,                                         -- M1.2: when a flush took it
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX sms_out_inv ON sms_out (invitation_id);
CREATE INDEX sms_out_queue ON sms_out (wedding_id, status, created_at);
CREATE INDEX sms_out_provider ON sms_out (provider_id);
CREATE INDEX sms_out_to ON sms_out (wedding_id, to_phone);

CREATE TABLE sms_in (
  id TEXT PRIMARY KEY,
  wedding_id TEXT,
  invitation_id TEXT,
  provider_id TEXT NOT NULL UNIQUE,                        -- hash of the payload (Mobile Message sends no id)
  type TEXT NOT NULL DEFAULT 'inbound',                    -- M1.2: 'inbound' | 'unsubscribe'
  from_phone TEXT NOT NULL,
  to_phone TEXT,                                           -- M1.2
  body TEXT NOT NULL,
  action TEXT NOT NULL,                                    -- 'Received' -> 'Processing' -> outcome
  claimed_at TEXT,                                         -- M1.2: when processing started
  handled INTEGER NOT NULL DEFAULT 0,
  received_at TEXT NOT NULL
);
CREATE INDEX sms_in_wedding ON sms_in (wedding_id, received_at);

-- M1.2: platform-wide STOP list (Spam Act). Checked before every send, every wedding.
CREATE TABLE opt_out (
  phone TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE seat_area (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  label TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  w REAL NOT NULL,
  h REAL NOT NULL,
  deleted_at TEXT
);

CREATE TABLE seat_plan (
  event_id TEXT PRIMARY KEY,
  image_key TEXT,
  aspect TEXT NOT NULL DEFAULT '4 / 3'
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  wedding_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'music', 'hero', 'plan')),
  key TEXT NOT NULL,
  thumb_key TEXT,
  content_type TEXT,
  bytes INTEGER,
  uploaded_by TEXT,
  invitation_id TEXT,
  original_key TEXT,
  edit TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX media_wedding ON media (wedding_id, kind);

CREATE TABLE audit (
  id TEXT PRIMARY KEY,
  wedding_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  at TEXT NOT NULL
);

CREATE TABLE rate_limit (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);
