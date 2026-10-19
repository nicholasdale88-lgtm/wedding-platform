/**
 * Drizzle mirror of migrations/0001_init.sql (the source of truth).
 * test/schema.test.ts fails if a table or column here drifts from the migration.
 */
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const id = () => text('id').primaryKey();
const version = () => integer('version').notNull().default(1);

export const user = sqliteTable('user', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passHash: text('pass_hash'),
  createdAt: text('created_at').notNull(),
});

export const session = sqliteTable('session', {
  id: id(),
  userId: text('user_id').notNull(),
  expiresAt: text('expires_at').notNull(),
});

export const wedding = sqliteTable('wedding', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name1: text('name1').notNull(),
  name2: text('name2').notNull(),
  monogram: text('monogram').notNull().default(''),
  timezone: text('timezone').notNull().default('Australia/Sydney'),
  theme: text('theme').notNull().default('Cream & Sage'),
  themeOverrides: text('theme_overrides'),
  content: text('content').notNull().default('{}'),
  guide: text('guide').notNull().default('{}'),
  musicKey: text('music_key'),
  heroKey: text('hero_key'),
  parkVideoKey: text('park_video_key'),
  parkVideoUrl: text('park_video_url'),
  smsSender: text('sms_sender'),
  adminMobile: text('admin_mobile'),
  smsRateCentsX100: integer('sms_rate_cents_x100').notNull().default(176),
  walletCredits: integer('wallet_credits'),
  smsPaused: integer('sms_paused', { mode: 'boolean' }).notNull().default(false),
  smsDailyCap: integer('sms_daily_cap').notNull().default(500),
  smsOptoutFooter: text('sms_optout_footer').notNull().default('Reply STOP to opt out'),
  smsReplies: text('sms_replies').notNull().default('{}'),
  plan: text('plan').notNull().default('trial'),
  quietStart: integer('quiet_start').notNull().default(8),
  quietEnd: integer('quiet_end').notNull().default(20),
  photoRetentionDays: integer('photo_retention_days').notNull().default(365),
  invitesFrom: text('invites_from'), // migration 0006: when invitations start (empty = 8 months before)
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  version: version(),
  deletedAt: text('deleted_at'),
});

export const membership = sqliteTable(
  'membership',
  {
    weddingId: text('wedding_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.weddingId, t.userId] }) }),
);

export const event = sqliteTable('event', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  pendingLabel: text('pending_label').notNull(),
  startsAt: text('starts_at').notNull(),
  venue: text('venue'),
  address: text('address'),
  mapUrl: text('map_url'),
  catered: integer('catered', { mode: 'boolean' }).notNull().default(true),
  hasSeating: integer('has_seating', { mode: 'boolean' }).notNull().default(false),
  questions: text('questions').notNull().default('[]'),
  sort: integer('sort').notNull().default(0),
  version: version(),
  deletedAt: text('deleted_at'),
});

export const invitation = sqliteTable('invitation', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  token: text('token').notNull().unique(),
  phone: text('phone'),
  seatsHeld: integer('seats_held').notNull().default(1),
  party: text('party').notNull().default(''), // migration 0005: guest group
  notes: text('notes'),
  smsOptout: integer('sms_optout', { mode: 'boolean' }).notNull().default(false),
  consent: integer('consent', { mode: 'boolean' }).notNull().default(true),
  openedAt: text('opened_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  version: version(),
  deletedAt: text('deleted_at'),
});

export const seatTable = sqliteTable('seat_table', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  eventId: text('event_id').notNull(),
  name: text('name').notNull(),
  shape: text('shape', { enum: ['round', 'long'] }).notNull().default('round'),
  dir: text('dir').notNull().default('h'),
  lengthPct: integer('length_pct').notNull().default(40),
  x: real('x').notNull(),
  y: real('y').notNull(),
  seats: integer('seats').notNull().default(10),
  version: version(),
  deletedAt: text('deleted_at'),
});

export const person = sqliteTable('person', {
  id: id(),
  invitationId: text('invitation_id').notNull(),
  idx: integer('idx').notNull(),
  name: text('name').notNull(),
  diet: text('diet').notNull().default(''),
  mealEntree: text('meal_entree').notNull().default(''),
  mealMain: text('meal_main').notNull().default(''),
  mealDessert: text('meal_dessert').notNull().default(''),
  tableId: text('table_id'),
  version: version(),
  deletedAt: text('deleted_at'),
});

export const inviteEvent = sqliteTable(
  'invite_event',
  { invitationId: text('invitation_id').notNull(), eventId: text('event_id').notNull() },
  (t) => ({ pk: primaryKey({ columns: [t.invitationId, t.eventId] }) }),
);

export const rsvp = sqliteTable(
  'rsvp',
  {
    invitationId: text('invitation_id').notNull(),
    eventId: text('event_id').notNull(),
    attending: integer('attending', { mode: 'boolean' }),
    count: integer('count').notNull().default(1),
    answers: text('answers').notNull().default('{}'),
    message: text('message').notNull().default(''),
    via: text('via').notNull().default('invitation'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.invitationId, t.eventId] }) }),
);

export const campaign = sqliteTable('campaign', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  body: text('body').notNull(),
  mode: text('mode', { enum: ['auto', 'dates', 'manual'] }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  trigger: text('trigger', { enum: ['invitation_created', 'rsvp_changed'] }),
  audience: text('audience').notNull(),
  excluded: text('excluded').notNull().default('[]'),
  sort: integer('sort').notNull().default(0),
  version: version(),
  deletedAt: text('deleted_at'),
});

export const campaignSlot = sqliteTable('campaign_slot', {
  id: id(),
  campaignId: text('campaign_id').notNull(),
  sendAt: text('send_at').notNull(),
  status: text('status', { enum: ['pending', 'claimed', 'done', 'failed', 'cancelled'] }).notNull().default('pending'),
  claimedAt: text('claimed_at'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const smsOut = sqliteTable('sms_out', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  invitationId: text('invitation_id'),
  campaignId: text('campaign_id'),
  dedupeKey: text('dedupe_key').notNull().unique(),
  kind: text('kind', { enum: ['campaign', 'reply', 'forward', 'test'] }).notNull().default('campaign'),
  toPhone: text('to_phone').notNull(),
  body: text('body').notNull(),
  parts: integer('parts').notNull(),
  status: text('status', { enum: ['queued', 'sending', 'sent', 'delivered', 'failed', 'blocked', 'cancelled'] })
    .notNull()
    .default('queued'),
  providerId: text('provider_id'),
  error: text('error'),
  batchKey: text('batch_key'),
  attemptedAt: text('attempted_at'),
  claimedAt: text('claimed_at'),
  createdAt: text('created_at').notNull(),
  sentAt: text('sent_at'),
});

export const smsIn = sqliteTable('sms_in', {
  id: id(),
  weddingId: text('wedding_id'),
  invitationId: text('invitation_id'),
  providerId: text('provider_id').notNull().unique(),
  type: text('type').notNull().default('inbound'),
  fromPhone: text('from_phone').notNull(),
  toPhone: text('to_phone'),
  body: text('body').notNull(),
  action: text('action').notNull(),
  claimedAt: text('claimed_at'),
  handled: integer('handled', { mode: 'boolean' }).notNull().default(false),
  receivedAt: text('received_at').notNull(),
});

export const optOut = sqliteTable('opt_out', {
  phone: text('phone').primaryKey(),
  source: text('source').notNull(),
  createdAt: text('created_at').notNull(),
});

export const seatArea = sqliteTable('seat_area', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  eventId: text('event_id').notNull(),
  label: text('label').notNull(),
  x: real('x').notNull(),
  y: real('y').notNull(),
  w: real('w').notNull(),
  h: real('h').notNull(),
  deletedAt: text('deleted_at'),
});

export const seatPlan = sqliteTable('seat_plan', {
  eventId: text('event_id').primaryKey(),
  imageKey: text('image_key'),
  aspect: text('aspect').notNull().default('4 / 3'),
});

export const media = sqliteTable('media', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  kind: text('kind', { enum: ['photo', 'video', 'music', 'hero', 'plan'] }).notNull(),
  key: text('key').notNull(),
  thumbKey: text('thumb_key'),
  contentType: text('content_type'),
  bytes: integer('bytes'),
  uploadedBy: text('uploaded_by'),
  invitationId: text('invitation_id'),
  originalKey: text('original_key'),
  edit: text('edit'),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
  eventKey: text('event_key'), // migration 0007: which event's album
});

// migration 0008: messages between guests and the couple (one conversation per invitation)
export const message = sqliteTable('message', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  invitationId: text('invitation_id').notNull(),
  fromGuest: integer('from_guest').notNull(),
  kind: text('kind', { enum: ['message', 'support', 'question'] }).notNull().default('message'),
  body: text('body').notNull(),
  sentSms: integer('sent_sms').notNull().default(0),
  createdAt: text('created_at').notNull(),
  readAt: text('read_at'),
});

export const audit = sqliteTable('audit', {
  id: id(),
  weddingId: text('wedding_id'),
  userId: text('user_id'),
  action: text('action').notNull(),
  target: text('target'),
  detail: text('detail'),
  at: text('at').notNull(),
});

export const rateLimit = sqliteTable('rate_limit', {
  k: text('k').primaryKey(),
  n: integer('n').notNull(),
  resetAt: text('reset_at').notNull(),
});

export const weatherCache = sqliteTable('weather_cache', {
  eventId: text('event_id').primaryKey(),
  json: text('json').notNull(),
  fetchedAt: text('fetched_at').notNull(),
});

export const seatPublish = sqliteTable('seat_publish', {
  eventId: text('event_id').primaryKey(),
  snapshot: text('snapshot').notNull(),
  publishedAt: text('published_at').notNull(),
  publishedBy: text('published_by'),
});
