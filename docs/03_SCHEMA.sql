-- 03: D1 (SQLite) schema. Mirror in apps/api/src/db/schema.ts with Drizzle.
-- All ids: text (ulid). All times: text UTC ISO 8601. Soft delete: deleted_at.
-- Every mutable table has version INTEGER for optimistic concurrency.

CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, pass_hash TEXT, created_at TEXT NOT NULL);
CREATE TABLE session (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id), expires_at TEXT NOT NULL);

CREATE TABLE wedding (
  id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL,
  name1 TEXT NOT NULL, name2 TEXT NOT NULL, monogram TEXT NOT NULL DEFAULT 'S&N',
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  theme TEXT NOT NULL DEFAULT 'Cream & Sage',          -- preset key
  theme_overrides TEXT,                                 -- JSON {paper, ink, accent, seal}
  content TEXT NOT NULL DEFAULT '{}',                   -- JSON: headline, dateLine, rsvpBy, registryUrl, directionsUrl, parkingNote, showParking, rsvpEmail, sections[]
  guide TEXT NOT NULL DEFAULT '{}',                     -- JSON: see README Guide type (runsheet, menu, faq, contacts, parkDirections…)
  music_key TEXT, hero_key TEXT, park_video_key TEXT, park_video_url TEXT,
  sms_sender TEXT,                                      -- dedicated number E.164 or approved alpha sender
  admin_mobile TEXT,                                    -- forward "needs you" replies
  sms_rate_cents_x100 INTEGER NOT NULL DEFAULT 176,     -- 1.76c incl GST, stored ×100
  wallet_credits INTEGER NOT NULL DEFAULT 0,            -- prepaid SMS credits (M5); NULL = unlimited (tenant #1)
  plan TEXT NOT NULL DEFAULT 'trial', quiet_start INTEGER NOT NULL DEFAULT 8, quiet_end INTEGER NOT NULL DEFAULT 20,
  photo_retention_days INTEGER NOT NULL DEFAULT 365,
  created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE membership (wedding_id TEXT NOT NULL REFERENCES wedding(id), user_id TEXT NOT NULL REFERENCES user(id), role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')), PRIMARY KEY (wedding_id, user_id));

CREATE TABLE event (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL REFERENCES wedding(id),
  key TEXT NOT NULL, name TEXT NOT NULL, starts_at TEXT NOT NULL, venue TEXT, address TEXT, map_url TEXT,
  catered INTEGER NOT NULL DEFAULT 1, has_seating INTEGER NOT NULL DEFAULT 0,
  questions TEXT NOT NULL DEFAULT '[]',                 -- JSON [{key,label,type:'text'|'choice'|'yesno',options?}]
  sort INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
  UNIQUE (wedding_id, key)
);

CREATE TABLE invitation (                               -- one per invite; main contact receives SMS
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL REFERENCES wedding(id),
  token TEXT UNIQUE NOT NULL, phone TEXT,               -- E.164
  seats_held INTEGER NOT NULL DEFAULT 1, notes TEXT,
  sms_optout INTEGER NOT NULL DEFAULT 0, consent INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE INDEX invitation_wedding ON invitation(wedding_id);
CREATE INDEX invitation_phone ON invitation(wedding_id, phone);

CREATE TABLE person (                                   -- index 0 = main contact
  id TEXT PRIMARY KEY, invitation_id TEXT NOT NULL REFERENCES invitation(id),
  idx INTEGER NOT NULL, name TEXT NOT NULL, diet TEXT NOT NULL DEFAULT '',
  meal_entree TEXT NOT NULL DEFAULT '', meal_main TEXT NOT NULL DEFAULT '', meal_dessert TEXT NOT NULL DEFAULT '',
  table_id TEXT REFERENCES seat_table(id),
  version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, UNIQUE (invitation_id, idx)
);

CREATE TABLE invite_event (invitation_id TEXT NOT NULL REFERENCES invitation(id), event_id TEXT NOT NULL REFERENCES event(id), PRIMARY KEY (invitation_id, event_id));

CREATE TABLE rsvp (
  invitation_id TEXT NOT NULL REFERENCES invitation(id), event_id TEXT NOT NULL REFERENCES event(id),
  attending INTEGER,                                    -- NULL awaiting, 1 yes, 0 no
  count INTEGER NOT NULL DEFAULT 1, answers TEXT NOT NULL DEFAULT '{}', message TEXT NOT NULL DEFAULT '',
  via TEXT NOT NULL DEFAULT 'invitation', updated_at TEXT NOT NULL,
  PRIMARY KEY (invitation_id, event_id)
);
-- Dietary requirements live on person.diet; the RSVP form writes them per person.

CREATE TABLE campaign (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL REFERENCES wedding(id),
  key TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto','dates','manual')), enabled INTEGER NOT NULL DEFAULT 0,
  trigger TEXT,                                         -- auto: 'invitation_created' | 'rsvp_changed'
  audience TEXT NOT NULL,                               -- JSON rule, see docs/05
  excluded TEXT NOT NULL DEFAULT '[]',                  -- invitation ids
  sort INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT,
  UNIQUE (wedding_id, key)
);
CREATE TABLE campaign_slot (                            -- scheduled send dates for mode='dates'
  id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES campaign(id),
  send_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','done','failed','cancelled')),
  claimed_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
);
CREATE INDEX slot_due ON campaign_slot(status, send_at);

CREATE TABLE sms_out (                                  -- every outbound message; the UNIQUE key makes sends idempotent
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, invitation_id TEXT, campaign_id TEXT,
  dedupe_key TEXT UNIQUE NOT NULL,                      -- e.g. 'slot:<slotId>:<invId>' | 'auto:invite:<invId>' | 'thanks:<invId>:<rsvpUpdatedAt>' | 'manual:<uuid>:<invId>'
  to_phone TEXT NOT NULL, body TEXT NOT NULL, parts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',                -- queued|sent|delivered|failed|blocked
  provider_id TEXT, error TEXT, created_at TEXT NOT NULL, sent_at TEXT
);
CREATE INDEX sms_out_inv ON sms_out(invitation_id);
CREATE INDEX sms_out_queued ON sms_out(status, created_at);

CREATE TABLE sms_in (
  id TEXT PRIMARY KEY, wedding_id TEXT, invitation_id TEXT, provider_id TEXT UNIQUE,
  from_phone TEXT NOT NULL, body TEXT NOT NULL, action TEXT NOT NULL, handled INTEGER NOT NULL DEFAULT 0, received_at TEXT NOT NULL
);

CREATE TABLE seat_table (
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, event_id TEXT NOT NULL REFERENCES event(id),
  name TEXT NOT NULL, shape TEXT NOT NULL DEFAULT 'round' CHECK (shape IN ('round','long')),
  dir TEXT NOT NULL DEFAULT 'h', length_pct INTEGER NOT NULL DEFAULT 40,
  x REAL NOT NULL, y REAL NOT NULL, seats INTEGER NOT NULL DEFAULT 10,
  version INTEGER NOT NULL DEFAULT 1, deleted_at TEXT
);
CREATE TABLE seat_area (id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, event_id TEXT NOT NULL, label TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL, deleted_at TEXT);
CREATE TABLE seat_plan (event_id TEXT PRIMARY KEY, image_key TEXT, aspect TEXT NOT NULL DEFAULT '4 / 3');

CREATE TABLE media (                                    -- photos, videos, music, hero, plan images
  id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('photo','video','music','hero','plan')),
  key TEXT NOT NULL, thumb_key TEXT, content_type TEXT, bytes INTEGER,
  uploaded_by TEXT, invitation_id TEXT, original_key TEXT, edit TEXT,   -- edit = JSON {filter,intensity,frame,crop,rotate}
  created_at TEXT NOT NULL, deleted_at TEXT
);
CREATE INDEX media_wedding ON media(wedding_id, kind);

CREATE TABLE audit (id TEXT PRIMARY KEY, wedding_id TEXT, user_id TEXT, action TEXT NOT NULL, target TEXT, detail TEXT, at TEXT NOT NULL);
CREATE TABLE rate_limit (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset_at TEXT NOT NULL);
