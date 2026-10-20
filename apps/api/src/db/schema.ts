/**
 * Drizzle mirror of migrations/0001_init.sql (the source of truth).
 * test/schema.test.ts fails if a table or column here drifts from the migration.
 */
import { blob, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const id = () => text('id').primaryKey();
const version = () => integer('version').notNull().default(1);

export const user = sqliteTable('user', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name'),
  passHash: text('pass_hash'),
  createdAt: text('created_at').notNull(),
  // migration 0024: the customer's details, for their account page and a CRM later
  firstName: text('first_name'),
  lastName: text('last_name'),
  mobile: text('mobile'),
  state: text('state'),
  postcode: text('postcode'),
  heardFrom: text('heard_from'),
  marketingOptIn: integer('marketing_opt_in', { mode: 'boolean' }).notNull().default(false),
  marketingOptInAt: text('marketing_opt_in_at'),
  lastLoginAt: text('last_login_at'),
  updatedAt: text('updated_at'),
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
  sides: integer('sides').notNull().default(2),
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
  tableId: text('table_id'), // no longer used: seats are per event (seat, migration 0011)
  partyRole: text('party_role').notNull().default(''), // migration 0012: bridesmaid, best man, MC…
  version: version(),
  deletedAt: text('deleted_at'),
});

// migration 0011: one seat per person per event
export const seat = sqliteTable(
  'seat',
  { personId: text('person_id').notNull(), eventId: text('event_id').notNull(), tableId: text('table_id').notNull() },
  (t) => ({ pk: primaryKey({ columns: [t.personId, t.eventId] }) }),
);

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
  currentVersion: text('current_version'),
});

export const media = sqliteTable('media', {
  rawOf: text('raw_of'), // migration 0027: the framed photo this is the original of
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
  sha: text('sha'), // migration 0010: content hash (the same photo is kept once)
});

// migration 0010: linked photo storage (the couple's own Google Drive, Google Photos, Dropbox, OneDrive)
export const photoLink = sqliteTable('photo_link', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  provider: text('provider', { enum: ['gdrive', 'gphotos', 'dropbox', 'onedrive'] }).notNull(),
  account: text('account').notNull().default(''),
  refreshEnc: text('refresh_enc').notNull(),
  folders: text('folders').notNull().default('{}'),
  status: text('status', { enum: ['ok', 'error'] }).notNull().default('ok'),
  lastError: text('last_error'),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const photoCopy = sqliteTable(
  'photo_copy',
  {
    mediaId: text('media_id').notNull(),
    linkId: text('link_id').notNull(),
    status: text('status', { enum: ['pending', 'done', 'failed'] }).notNull().default('pending'),
    remoteId: text('remote_id'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.mediaId, t.linkId] }) }),
);

export const oauthState = sqliteTable('oauth_state', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  createdAt: text('created_at').notNull(),
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

// migration 0009: the message board (a public wall on guests' pages)
export const boardPost = sqliteTable('board_post', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  invitationId: text('invitation_id'),
  author: text('author').notNull(),
  body: text('body').notNull(),
  parentId: text('parent_id'),
  status: text('status', { enum: ['shown', 'pending', 'hidden'] }).notNull().default('shown'),
  pinned: integer('pinned').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const boardLike = sqliteTable(
  'board_like',
  { postId: text('post_id').notNull(), invitationId: text('invitation_id').notNull(), createdAt: text('created_at').notNull() },
  (t) => ({ pk: primaryKey({ columns: [t.postId, t.invitationId] }) }),
);

// migration 0012: the couple's planning documents (JSON with a version)
export const plannerDoc = sqliteTable(
  'planner_doc',
  {
    weddingId: text('wedding_id').notNull(),
    kind: text('kind').notNull(),
    scope: text('scope').notNull().default(''),
    data: text('data').notNull().default('{}'),
    version: integer('version').notNull().default(1),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.weddingId, t.kind, t.scope] }) }),
);

// migration 0015: shuttle seats guests book
export const shuttleBooking = sqliteTable(
  'shuttle_booking',
  {
    weddingId: text('wedding_id').notNull(),
    shuttleId: text('shuttle_id').notNull(),
    invitationId: text('invitation_id').notNull(),
    seats: integer('seats').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.shuttleId, t.invitationId] }) }),
);

// migration 0018: emails to the event's own address
export const inboxEmail = sqliteTable('inbox_email', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  messageId: text('message_id'),
  fromAddr: text('from_addr').notNull(),
  fromName: text('from_name').notNull().default(''),
  subject: text('subject').notNull().default(''),
  body: text('body').notNull().default(''),
  kind: text('kind', { enum: ['guest', 'vendor', 'other'] }).notNull().default('other'),
  invitationId: text('invitation_id'),
  vendorId: text('vendor_id'),
  files: text('files').notNull().default('[]'),
  filed: text('filed').notNull().default(''),
  receivedAt: text('received_at').notNull(),
  readAt: text('read_at'),
  archivedAt: text('archived_at'),
});

// migration 0014: song requests for the DJ
export const songRequest = sqliteTable('song_request', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  invitationId: text('invitation_id'),
  title: text('title').notNull(),
  artist: text('artist').notNull().default(''),
  note: text('note').notNull().default(''),
  status: text('status', { enum: ['new', 'must', 'maybe', 'no'] }).notNull().default('new'),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
});

// migration 0013: files kept with the planning (quotes, contracts)
export const plannerFile = sqliteTable('planner_file', {
  id: id(),
  weddingId: text('wedding_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  bytes: integer('bytes').notNull(),
  data: blob('data').notNull(),
  createdAt: text('created_at').notNull(),
  deletedAt: text('deleted_at'),
  remote: text('remote'),
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

// migration 0021: small copies of photos for the grids
export const photoThumb = sqliteTable('photo_thumb', {
  mediaId: text('media_id').primaryKey(),
  weddingId: text('wedding_id').notNull(),
  data: blob('data').notNull(),
  createdAt: text('created_at').notNull(),
});

// migration 0023: the wedding party portal's sign-ins and sessions
export const partyAccount = sqliteTable('party_account', {
  id: text('id').primaryKey(),
  weddingId: text('wedding_id').notNull(),
  personId: text('person_id').notNull(),
  email: text('email'),
  passHash: text('pass_hash'),
  perms: text('perms').notNull(),
  inviteHash: text('invite_hash'),
  inviteExpires: text('invite_expires'),
  resetHash: text('reset_hash'),
  resetExpires: text('reset_expires'),
  failed: integer('failed').notNull(),
  lockedUntil: text('locked_until'),
  lastLogin: text('last_login'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
});

export const partySession = sqliteTable('party_session', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  weddingId: text('wedding_id').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

/** migration 0024: every consent choice as it was made (never changed). */
export const consentLog = sqliteTable('consent_log', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  kind: text('kind').notNull(),
  granted: integer('granted', { mode: 'boolean' }).notNull(),
  source: text('source').notNull(),
  at: text('at').notNull(),
});

/** migration 0024: an invitation to help run a wedding (the link's token stored only as a hash). */
export const memberInvite = sqliteTable('member_invite', {
  id: text('id').primaryKey(),
  weddingId: text('wedding_id').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: text('invited_by').notNull(),
  expiresAt: text('expires_at').notNull(),
  acceptedAt: text('accepted_at'),
  createdAt: text('created_at').notNull(),
});

// migration 0025: the shared vendor directory, the areas searched, and each wedding's use of it
export const vendorDirectory = sqliteTable('vendor_directory', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  lat: real('lat').notNull(),
  lon: real('lon').notNull(),
  cell: text('cell').notNull(),
  address: text('address').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  website: text('website').notNull(),
  hidden: integer('hidden').notNull(),
  firstSeen: text('first_seen').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const vendorAreaSearch = sqliteTable(
  'vendor_area_search',
  { category: text('category').notNull(), cell: text('cell').notNull(), searchedAt: text('searched_at').notNull() },
  (t) => ({ pk: primaryKey({ columns: [t.category, t.cell] }) }),
);

export const vendorUse = sqliteTable(
  'vendor_use',
  {
    weddingId: text('wedding_id').notNull(),
    dirId: text('dir_id').notNull(),
    booked: integer('booked').notNull(),
    amount: real('amount').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.weddingId, t.dirId] }) }),
);

// migration 0026: named versions of an event's seating
export const seatVersion = sqliteTable('seat_version', {
  id: text('id').primaryKey(),
  weddingId: text('wedding_id').notNull(),
  eventId: text('event_id').notNull(),
  name: text('name').notNull(),
  snapshot: text('snapshot').notNull(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by'),
});

// migration 0028: vendors' own listings in the directory, and couples' enquiries to them
export const vendorListing = sqliteTable('vendor_listing', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  region: text('region').notNull(),
  regions: text('regions').notNull(),
  contactName: text('contact_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  website: text('website').notNull(),
  instagram: text('instagram').notNull(),
  about: text('about').notNull(),
  priceFrom: integer('price_from').notNull(),
  photos: text('photos').notNull(),
  hidden: integer('hidden').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const vendorEnquiry = sqliteTable('vendor_enquiry', {
  id: text('id').primaryKey(),
  listingId: text('listing_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  date: text('date').notNull(),
  guests: integer('guests').notNull(),
  message: text('message').notNull(),
  read: integer('read').notNull(),
  createdAt: text('created_at').notNull(),
});

/** migration 0029: a person's meal at one event (a special menu by id, and courses changed just for them). */
export const mealChoice = sqliteTable(
  'meal_choice',
  {
    personId: text('person_id').notNull(),
    eventId: text('event_id').notNull(),
    menuId: text('menu_id').notNull().default(''),
    entree: text('entree').notNull().default(''),
    main: text('main').notNull().default(''),
    dessert: text('dessert').notNull().default(''),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.personId, t.eventId] }) }),
);
