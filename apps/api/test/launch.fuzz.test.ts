import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';
import { FakeProvider } from './support/fakes';

/**
 * Before launch: try to break every route. Hostile, broken and oversized input must never give a 500, and
 * every error must be JSON with error.message. Sessions, roles, tenants, guest links and private keys are
 * checked to never open someone else's data, sign-ins are rate limited, and no response carries a secret.
 * Each sweep collects every problem and fails once, with the whole list.
 */

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Sample = { [k: string]: Json };
/** One route: its method, a real path (ids from the seeded database) and a sensible body to mutate. */
interface Route {
  method: Method;
  path: string;
  sample?: Sample;
  /** Answers errors as plain text by design (the calendar feed). */
  nonJson?: boolean;
}
interface Probe {
  label: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
  nonJson?: boolean;
}
interface Variant {
  label: string;
  body: string | null;
  type?: string;
}

const SLUG = 'sophie-and-nicholas';
const SLUG2 = 'other-wedding';
const PASS = { owner: 'valley-2027', other: 'other-pass-2027', viewer: 'viewer-pass-2027' } as const;
const MISSING = 'no-such-thing';
const TABLE_ID = '00000000-0000-4000-8000-000000000001';

const LONG = 'x'.repeat(100_000);
const HUGE = JSON.stringify({ blob: 'y'.repeat(2 * 1024 * 1024) });
const HOSTILE = {
  unicode: 'Zoë 😀👰🏽‍♀️ 婚礼 ‮evil‬ ﻿ مرحبا',
  html: '<script>alert(1)</script><img src=x onerror=alert(1)>',
  sql: "' OR 1=1 --",
  'null byte': 'a\u0000b',
  'lone surrogate': 'x\uD800y',
} as const;
/** Already URL-encoded. */
const QUERY_VALUES: [string, string][] = [
  ['unicode', encodeURIComponent(HOSTILE.unicode)],
  ['html', encodeURIComponent(HOSTILE.html)],
  ['sql', encodeURIComponent(HOSTILE.sql)],
  ['null byte', '%00'],
  ['bad percent-encoding', '%E0%A4%A'],
  ['lone surrogate', '%ED%A0%80'],
  ['empty', ''],
  ['__proto__', '__proto__'],
  ['constructor', 'constructor'],
  ['100k chars', LONG],
];
const PARAMS = ['g', 'k', 't', 'event', 'share', 'category', 'km', 'archived', 'dry', 'state', 'code', 'error', 'preview'];
const CREDS = new Set(['g', 'k', 't']);
/** Fields that identify who or what (a token, an id): hostile text goes everywhere else, so it reaches the route. */
const KEEP = new Set(['token', 'k', 't', 'personId', 'campaignId', 'event', 'id', 'vendorIds', 'only', 'parent', 'fileId', 'vendorId', 'shuttleId']);
/** For routes that take no body: what a hostile client might send anyway. */
const GENERIC: Sample = { token: 'x', name: 'x', body: 'x', text: 'x', id: 'x', on: true, email: 'a@b.co' };
const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const mapLeaves = (v: Json, f: (leaf: Json) => Json): Json => {
  if (Array.isArray(v)) return v.map((x) => mapLeaves(x, f));
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]): [string, Json] => [k, mapLeaves(x, f)]));
  return f(v);
};
const wrongType = (v: Json): Json =>
  typeof v === 'string' ? 12345 : typeof v === 'number' ? 'not a number' : typeof v === 'boolean' ? 'yes' : v === null ? { x: 1 } : Array.isArray(v) ? 'not a list' : ['not', 'an', 'object'];
const hostile = (s: Sample, h: string): Sample =>
  Object.fromEntries(Object.entries(s).map(([k, v]): [string, Json] => [k, KEEP.has(k) ? v : mapLeaves(v, (leaf) => (typeof leaf === 'string' ? h : leaf))]));
/** The sample with a __proto__ key in the raw JSON (JSON.stringify would drop it). */
const withProto = (s: Sample) => {
  const rest = JSON.stringify(s).slice(1);
  return `{"__proto__":{"polluted":true,"isAdmin":true}${rest === '}' ? '}' : `,${rest}`}`;
};

function bodyVariants(sample: Sample): Variant[] {
  const s = Object.keys(sample).length ? sample : GENERIC;
  const json = (label: string, v: Json): Variant => ({ label, body: JSON.stringify(v) });
  return [
    { label: 'no body', body: null },
    { label: '{}', body: '{}' },
    { label: 'garbage JSON', body: '{"a": tru' },
    { label: 'JSON array', body: '[1,2,3]' },
    { label: 'JSON null', body: 'null' },
    { label: 'JSON string', body: '"hello"' },
    { label: 'form post', body: 'a=1&b=2', type: 'application/x-www-form-urlencoded' },
    { label: '2 MB body', body: HUGE },
    { label: '__proto__', body: withProto(s) },
    json('constructor.prototype', { ...s, constructor: { prototype: { polluted: true } } }),
    json('all null', Object.fromEntries(Object.keys(s).map((k): [string, Json] => [k, null]))),
    json('huge numbers', mapLeaves(s, (v) => (typeof v === 'number' ? 1e308 : v))),
    json('negative fractions', mapLeaves(s, (v) => (typeof v === 'number' ? -1.5 : v))),
    ...Object.entries(HOSTILE).map(([label, h]) => json(label, hostile(s, h))),
    ...Object.keys(s).map((k) => json(`wrong type: ${k}`, { ...s, [k]: wrongType(s[k] ?? null) })),
    ...Object.keys(s)
      .filter((k) => typeof s[k] === 'string')
      .map((k) => json(`100k chars: ${k}`, { ...s, [k]: LONG })),
  ];
}

/** The path as is, without its query, and with every query parameter we know of set to something hostile. */
function queryVariants(path: string): [string, string][] {
  const i = path.indexOf('?');
  const base = i < 0 ? path : path.slice(0, i);
  const own = i < 0 ? '' : path.slice(i + 1);
  const ownKeys = new Set(own.split('&').map((kv) => kv.split('=')[0] ?? '').filter(Boolean));
  const out: [string, string][] = [
    ['as is', path],
    ['no query', base],
  ];
  for (const [label, value] of QUERY_VALUES) {
    // category=constructor is the known bug below (its own test), so the sweep doesn't stop on it.
    const proto = value === '__proto__' || value === 'constructor';
    const keys = label === '100k chars' ? ['g', 'k', 't', 'event'] : PARAMS.filter((k) => !(proto && k === 'category'));
    out.push([`query: ${label}`, `${base}?${keys.map((k) => `${k}=${value}`).join('&')}`]);
    if (own) {
      // Keep the real link (token, key, event) and make everything else hostile, so it gets past the link check.
      const extra = PARAMS.filter((k) => !ownKeys.has(k) && !CREDS.has(k) && !(proto && k === 'category'));
      out.push([`query: ${label}, real ${[...ownKeys].join('+')}`, `${path}&${extra.map((k) => `${k}=${value}`).join('&')}`]);
    }
  }
  return out;
}

const clip = (s: string) => (s.length > 140 ? `${s.slice(0, 140)}…(${s.length} chars)` : s);
const listOf = (failures: string[]) => `${failures.length} problem(s):\n${failures.join('\n')}`;

interface World {
  wid: string;
  wid2: string;
  owner: string;
  viewer: string;
  other: string;
  inv: string;
  pid: string;
  tok: string;
  invDel: string;
  partyPid: string;
  partyTok: string;
  partyPidDel: string;
  eventId: string;
  eventKey: string;
  cid: string;
  postId: string;
  postDel: string;
  postAdminDel: string;
  songId: string;
  songDel: string;
  inv2: string;
  tok2: string;
  partyPid2: string;
  partyTok2: string;
}

/** Every per-wedding admin route (/api/a/w/:wid/...), from src/index.ts and src/routes/*.ts. */
function adminTable(x: World): Route[] {
  const a = `/api/a/w/${x.wid}`;
  const doc = (kind: string, sample: Sample): Route[] => [
    { method: 'GET', path: `${a}/planner/doc/${kind}` },
    { method: 'PUT', path: `${a}/planner/doc/${kind}`, sample },
  ];
  return [
    // auth.ts: the wedding itself
    { method: 'GET', path: a },
    // admin.ts
    { method: 'GET', path: `${a}/overview` },
    { method: 'PUT', path: `${a}/look`, sample: { palette: 'sage', eventColours: true, large: false } },
    { method: 'PUT', path: `${a}/admin-name`, sample: { name: 'Our wedding' } },
    { method: 'GET', path: `${a}/guests` },
    { method: 'GET', path: `${a}/guests/${x.inv}` },
    { method: 'POST', path: `${a}/guests`, sample: { invited: [x.eventKey] } },
    { method: 'POST', path: `${a}/guests/import`, sample: { rows: [{ people: ['Fuzz Person'], phone: '0412000000', seats: 1, party: 'Friends', invited: [x.eventKey] }] } },
    { method: 'PATCH', path: `${a}/guests/${x.inv}`, sample: { people: ['Ivy Scott'], phone: '0412345678', seatsHeld: 1, party: 'Friends', invited: [x.eventKey], table: 'Table 1' } },
    { method: 'PUT', path: `${a}/guests/${x.inv}/rsvp`, sample: { events: { [x.eventKey]: { attending: true, answers: { ride: 'Yes' } } }, count: 1, diet: 'Vegetarian', message: 'See you there' } },
    { method: 'DELETE', path: `${a}/guests/${x.invDel}` },
    { method: 'POST', path: `${a}/guests/${x.invDel}/restore`, sample: {} },
    { method: 'PUT', path: `${a}/people/${x.pid}/meal`, sample: { entree: 'Soup', main: 'Beef', dessert: 'Cake' } },
    { method: 'POST', path: `${a}/guests/${x.inv}/send`, sample: { campaignId: x.cid } },
    // pages.ts
    { method: 'GET', path: `${a}/pages` },
    { method: 'POST', path: `${a}/pages/share`, sample: { on: true } },
    { method: 'PUT', path: `${a}/pages`, sample: { theme: 'Cream & Sage', names: { name1: 'Sophie', name2: 'Nicholas', monogram: 'S&N' }, texts: { 'inv.title': 'Hello' } } },
    // texts.ts
    { method: 'GET', path: `${a}/texts` },
    { method: 'POST', path: `${a}/texts`, sample: { name: 'Fuzz message', audience: { all: true }, body: 'Hi {first}' } },
    { method: 'PATCH', path: `${a}/texts/${x.cid}`, sample: { body: 'Hi {first}', enabled: false, audience: { all: true }, excluded: [], dates: [] } },
    { method: 'DELETE', path: `${a}/texts/${MISSING}` },
    { method: 'PUT', path: `${a}/texts/invites-from`, sample: { date: '2027-01-01T00:00:00.000Z' } },
    { method: 'POST', path: `${a}/texts/${x.cid}/estimate`, sample: { body: 'Hi', audience: { all: true }, excluded: [], only: [x.inv] } },
    { method: 'POST', path: `${a}/texts/${x.cid}/send`, sample: { only: [x.inv] } },
    { method: 'POST', path: `${a}/texts/test`, sample: { body: 'Test' } },
    // messages.ts
    { method: 'GET', path: `${a}/messages` },
    { method: 'GET', path: `${a}/messages/${x.inv}` },
    { method: 'POST', path: `${a}/messages/${x.inv}`, sample: { body: 'Thanks!', sms: false } },
    // inbox.ts
    { method: 'GET', path: `${a}/inbox` },
    { method: 'GET', path: `${a}/inbox/${MISSING}` },
    { method: 'PUT', path: `${a}/inbox/${MISSING}`, sample: { kind: 'vendor', vendorId: 'v1', archived: false, read: true } },
    { method: 'POST', path: `${a}/inbox/${MISSING}/file`, sample: { vendorId: 'v1', fileId: 'f1' } },
    { method: 'PUT', path: `${a}/inbox/settings/address`, sample: { address: 'us@example.com' } },
    // insights.ts
    { method: 'GET', path: `${a}/insights` },
    // coordinator.ts, plannerCalendar.ts, paymentReminders.ts
    { method: 'GET', path: `${a}/coordinator` },
    { method: 'PUT', path: `${a}/coordinator`, sample: { on: true, name: 'Jo', fresh: false } },
    { method: 'GET', path: `${a}/planner-calendar` },
    { method: 'PUT', path: `${a}/planner-calendar`, sample: { on: true } },
    { method: 'GET', path: `${a}/pay-reminders` },
    { method: 'PUT', path: `${a}/pay-reminders`, sample: { on: false, days: 7 } },
    // partyPortal.ts (the couple's side)
    { method: 'GET', path: `${a}/party-accounts` },
    { method: 'PUT', path: `${a}/party-accounts/settings`, sample: { signIn: false } },
    { method: 'POST', path: `${a}/party-accounts/${x.partyPid}/invite`, sample: { email: 'ella@example.com' } },
    { method: 'PUT', path: `${a}/party-accounts/${x.partyPid}/perms`, sample: { perms: { runsheet: true, vendors: false } } },
    { method: 'POST', path: `${a}/party-accounts/${x.partyPid}/reset`, sample: {} },
    { method: 'POST', path: `${a}/party-accounts/${x.partyPid}/signout`, sample: {} },
    { method: 'DELETE', path: `${a}/party-accounts/${x.partyPidDel}` },
    // board.ts
    { method: 'GET', path: `${a}/board` },
    { method: 'PUT', path: `${a}/board/settings`, sample: { on: true, approve: false } },
    { method: 'POST', path: `${a}/board`, sample: { body: 'Thank you all!', parent: x.postId } },
    { method: 'PATCH', path: `${a}/board/${x.postId}`, sample: { status: 'shown', pinned: true } },
    { method: 'DELETE', path: `${a}/board/${x.postAdminDel}` },
    // settings.ts
    { method: 'GET', path: `${a}/settings` },
    {
      method: 'PUT',
      path: `${a}/settings`,
      sample: { sender: '0412345678', adminMobile: '0412345679', paused: true, dailyCap: 100, quietStart: 8, quietEnd: 20, optOutFooter: 'Reply STOP', replies: { yes: 'Thanks' }, rateX100: 500 },
    },
    { method: 'GET', path: `${a}/settings/backup` },
    // seating.ts
    { method: 'GET', path: `${a}/seating?event=${x.eventKey}` },
    {
      method: 'PUT',
      path: `${a}/seating`,
      sample: {
        event: x.eventKey,
        aspect: '4 / 3',
        tables: [{ id: TABLE_ID, name: 'Table 1', shape: 'round', dir: 'h', len: 50, x: 10, y: 10, seats: 8 }],
        areas: [{ label: 'Bar', x: 1, y: 1, w: 10, h: 10 }],
        seats: {},
      },
    },
    { method: 'POST', path: `${a}/seating/publish`, sample: { event: x.eventKey } },
    // photos.ts
    { method: 'GET', path: `${a}/photos/looks` },
    { method: 'PUT', path: `${a}/photos/looks`, sample: { frames: ['gold'], looks: ['film'], def: 'film' } },
    { method: 'PUT', path: `${a}/photos/upload`, sample: {} },
    { method: 'GET', path: `${a}/photos` },
    { method: 'GET', path: `${a}/photos/${MISSING}` },
    { method: 'GET', path: `${a}/photos/${MISSING}/thumb` },
    { method: 'DELETE', path: `${a}/photos/${MISSING}` },
    // photoLinks.ts
    { method: 'GET', path: `${a}/photo-links` },
    { method: 'POST', path: `${a}/photo-links/connect`, sample: { provider: 'gdrive' } },
    { method: 'DELETE', path: `${a}/photo-links/${MISSING}` },
    { method: 'PUT', path: `${a}/photo-links/${MISSING}/docs`, sample: { on: true } },
    { method: 'POST', path: `${a}/photo-links/${MISSING}/copy-all`, sample: {} },
    // planner.ts
    { method: 'GET', path: `${a}/planner/party?event=${x.eventKey}` },
    { method: 'PUT', path: `${a}/planner/people/${x.pid}/role`, sample: { role: 'Usher' } },
    { method: 'GET', path: `${a}/planner/vendors/search?category=florist&km=30` },
    { method: 'GET', path: `${a}/planner/ask` },
    { method: 'POST', path: `${a}/planner/ask`, sample: { question: 'What next?', history: [{ role: 'user', text: 'Hi' }] } },
    { method: 'POST', path: `${a}/planner/files`, sample: { name: 'quote.pdf', type: 'application/pdf', data: btoa('%PDF-1.4 a quote') } },
    { method: 'GET', path: `${a}/planner/files/${MISSING}` },
    { method: 'DELETE', path: `${a}/planner/files/${MISSING}` },
    { method: 'POST', path: `${a}/planner/files/${MISSING}/read`, sample: {} },
    { method: 'POST', path: `${a}/planner/compare`, sample: { vendorIds: ['v1', 'v2'] } },
    ...doc('checklist', { tasks: [{ id: 't1', text: 'Book the celebrant', before: 300 }], helpers: [] }),
    ...doc('budget', { total: 30000, lines: [{ category: 'Cake', estimate: 800 }] }),
    ...doc('vendors', { list: [{ id: 'v1', name: 'Bloom', category: 'Florist' }] }),
    ...doc('party-setup', { p1: 'Bride', p2: 'Groom', signIn: false }),
    ...doc(`party-runsheet/${x.eventKey}`, { items: [{ time: '2pm', title: 'Photos', who: ['party'] }], note: '', packing: [] }),
    ...doc(`day-checklist/${x.eventKey}`, { p1: [{ text: 'Breakfast' }], p2: [] }),
    ...doc('party-runsheet/no-such-event', { items: [] }),
    ...doc('constructor', { x: 1 }),
    ...doc('__proto__', { x: 1 }),
    ...doc('toString/wedding', { x: 1 }),
    // live.ts, songs.ts, shuttles.ts, album.ts
    { method: 'GET', path: `${a}/live` },
    { method: 'PUT', path: `${a}/live`, sample: { on: true } },
    { method: 'GET', path: `${a}/songs` },
    { method: 'POST', path: `${a}/songs`, sample: { title: 'September', artist: 'Earth, Wind & Fire', note: 'First dance', status: 'must' } },
    { method: 'PATCH', path: `${a}/songs/${x.songId}`, sample: { status: 'maybe' } },
    { method: 'DELETE', path: `${a}/songs/${x.songDel}` },
    { method: 'GET', path: `${a}/shuttles` },
    { method: 'GET', path: `${a}/album` },
    { method: 'PUT', path: `${a}/album`, sample: { on: false } },
    // events.ts
    { method: 'GET', path: `${a}/events` },
    {
      method: 'POST',
      path: `${a}/events`,
      sample: {
        name: 'Recovery brunch',
        startsAt: '2027-11-21T00:00:00.000Z',
        venue: 'Cafe',
        address: '1 Main St',
        mapUrl: 'https://maps.example.com',
        catered: true,
        hasSeating: false,
        questions: [{ key: 'diet', label: 'Dietary?', type: 'text' }],
        sort: 3,
        inviteEveryone: false,
      },
    },
    { method: 'PUT', path: `${a}/events/${x.eventId}`, sample: { name: 'The wedding', startsAt: '2027-11-20T05:00:00.000Z', venue: 'Valley', sort: 0 } },
    { method: 'DELETE', path: `${a}/events/${x.eventId}` },
  ];
}

/** The signed-in user's own routes (auth.ts). Logout is left out of sweeps: it would end the session under test. */
const userTable = (): Route[] => [
  { method: 'POST', path: '/api/a/auth/login', sample: { email: 'owner@example.com', passcode: 'wrong-passcode' } },
  { method: 'GET', path: '/api/a/me' },
  { method: 'POST', path: '/api/a/auth/passcode', sample: { current: 'wrong-passcode', next: 'another-passcode-1' } },
];

/** Every guest route (/api/p/:slug/...) and the other public ones (calendar feed, webhooks, OAuth, health). */
function guestTable(x: World): Route[] {
  const p = `/api/p/${SLUG}`;
  const g = `g=${x.tok}`;
  const key = 'k'.repeat(24);
  return [
    // guest.ts
    { method: 'GET', path: `${p}/save-the-date?${g}` },
    { method: 'GET', path: `${p}/invite?${g}` },
    { method: 'GET', path: `${p}/guide?${g}` },
    { method: 'GET', path: `${p}/photos?${g}` },
    { method: 'PUT', path: `${p}/photos?${g}&event=${x.eventKey}`, sample: {} },
    { method: 'PUT', path: `${p}/photos/${MISSING}/thumb?${g}`, sample: {} },
    { method: 'GET', path: `${p}/messages?${g}` },
    { method: 'POST', path: `${p}/messages`, sample: { token: x.tok, body: 'Can we bring a plus one?', kind: 'question' } },
    { method: 'POST', path: `${p}/find`, sample: { name: 'Nobody Here' } },
    { method: 'POST', path: `${p}/rsvp`, sample: { token: x.tok, events: { [x.eventKey]: { attending: true, answers: { ride: 'Yes' } } }, count: 1, diet: 'No nuts', message: 'Yay' } },
    // board.ts
    { method: 'GET', path: `${p}/board?${g}` },
    { method: 'POST', path: `${p}/board`, sample: { token: x.tok, body: 'Congratulations!', parent: x.postId } },
    { method: 'POST', path: `${p}/board/${x.postId}/like`, sample: { token: x.tok } },
    { method: 'DELETE', path: `${p}/board/${x.postDel}`, sample: { token: x.tok } },
    // planner.ts (the wedding party's page)
    { method: 'GET', path: `${p}/party?g=${x.partyTok}` },
    { method: 'POST', path: `${p}/party`, sample: { token: x.partyTok, personId: x.partyPid, action: 'add-task', id: 't1', text: 'Pick up the flowers', done: true } },
    // partyPortal.ts (members)
    { method: 'GET', path: `${p}/portal/me` },
    { method: 'POST', path: `${p}/portal/login`, sample: { email: 'nobody@example.com', password: 'wrong-password' } },
    { method: 'POST', path: `${p}/portal/logout`, sample: {} },
    { method: 'GET', path: `${p}/portal/link?t=${'z'.repeat(43)}` },
    { method: 'POST', path: `${p}/portal/password-link`, sample: { t: 'z'.repeat(43), email: 'ella@example.com', password: 'a-new-password' } },
    { method: 'POST', path: `${p}/portal/forgot`, sample: { email: 'nobody@example.com' } },
    { method: 'POST', path: `${p}/portal/password`, sample: { current: 'wrong-password', next: 'a-new-password' } },
    // manifest, coordinator, tasks, live, songs, calendar, shuttles, album
    { method: 'GET', path: `${p}/manifest?${g}` },
    { method: 'GET', path: `${p}/coordinator?k=${key}` },
    { method: 'POST', path: `${p}/coordinator`, sample: { k: key, action: 'add', text: 'Lost ring', id: 'e1' } },
    { method: 'GET', path: `${p}/tasks?k=${key}` },
    { method: 'POST', path: `${p}/tasks`, sample: { k: key, id: 't1', status: 'done' } },
    { method: 'GET', path: `${p}/live?k=${key}` },
    { method: 'GET', path: `${p}/live/photo/${MISSING}?k=${key}` },
    { method: 'GET', path: `${p}/songs?${g}` },
    { method: 'POST', path: `${p}/songs`, sample: { token: x.tok, title: 'Dancing Queen', artist: 'ABBA', note: 'Please!' } },
    { method: 'GET', path: `${p}/calendar/${x.eventKey}.ics` },
    { method: 'GET', path: `${p}/shuttles?${g}` },
    { method: 'POST', path: `${p}/shuttles`, sample: { token: x.tok, shuttleId: 's1', seats: 2 } },
    { method: 'GET', path: `${p}/album?${g}` },
    { method: 'GET', path: `${p}/album/${MISSING}?${g}` },
    { method: 'GET', path: `${p}/album/${MISSING}/thumb?${g}` },
    // public, outside /p
    { method: 'GET', path: '/api/health' },
    { method: 'GET', path: `/api/cal/${x.wid}/${'c'.repeat(32)}.ics`, nonJson: true },
    { method: 'GET', path: '/api/oauth/callback?state=nope&code=abc' },
    {
      method: 'POST',
      path: '/api/hooks/mm/inbound?k=hook-key',
      sample: { to: '0400000001', message: 'yes', sender: '0412345678', received_at: '2026-10-20 10:00:00', type: 'inbound', original_message_id: '', original_custom_ref: '' },
    },
    { method: 'POST', path: '/api/hooks/mm/inbound?k=wrong', sample: {} },
    { method: 'POST', path: '/api/hooks/mm/status?k=hook-key', sample: { message_id: 'x', status: 'delivered', to: '', message: '', sender: '', received_at: '', custom_ref: '', part_number: 1, total_parts: 1 } },
    { method: 'POST', path: '/api/hooks/texto/inbound?k=hook-key', sample: { message_id: 'm1', from: '+61412345678', to: '+61400000001', body: 'yes', received_at: '2026-10-20T10:00:00Z' } },
    { method: 'POST', path: '/api/hooks/texto/status?k=hook-key', sample: { message: { id: 'x', status: 'delivered' } } },
  ];
}

describe('launch fuzz: try to break every route', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let w: World;
  let waits: Promise<unknown>[] = [];
  let provider = new FakeProvider();
  const hashes = { owner: '', other: '', viewer: '' };
  // Texts go to a fake provider: nothing leaves the test.
  const app = createApp((e) => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: () => new Date(), uuid: () => crypto.randomUUID() }));
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p.catch(() => undefined)), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

  // A new network for each request, so per-IP limits never mix one probe's result into another's.
  let ipSeq = 0;
  const nextIp = () => {
    ipSeq += 1;
    return `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
  };

  const call = (method: string, path: string, opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
    app.request(
      path,
      {
        method,
        headers: { 'content-type': 'application/json', 'CF-Connecting-IP': nextIp(), ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers },
        ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      },
      env,
      ctx,
    );
  const jsonOf = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const statusOf = async (res: Response | Promise<Response>) => {
    const r = await res;
    await r.arrayBuffer();
    return r.status;
  };
  const one = async <T>(sql: string, ...bind: unknown[]): Promise<T> => {
    const row = await t.db.prepare(sql).bind(...bind).first<T>();
    if (!row) throw new Error(`setup: nothing for ${sql}`);
    return row;
  };

  /** One request; a problem as a readable line, or null. */
  const probe = async (p: Probe): Promise<string | null> => {
    const where = `${p.method} ${clip(p.path)} [${p.label}]`;
    let res: Response;
    try {
      res = await app.request(p.path, { method: p.method, headers: p.headers, ...(p.body === null ? {} : { body: p.body }) }, env, ctx);
    } catch (e) {
      return `${where} -> threw ${String(e).slice(0, 160)}`;
    }
    const text = await res.text();
    if (res.status === 500) return `${where} -> 500 ${text.slice(0, 160)}`;
    if (res.status < 400 || p.method === 'HEAD' || p.nonJson) return null;
    try {
      const msg = (JSON.parse(text) as { error?: { message?: unknown } } | null)?.error?.message;
      return typeof msg === 'string' && msg.trim() ? null : `${where} -> ${res.status} JSON error without error.message: ${text.slice(0, 160)}`;
    } catch {
      return `${where} -> ${res.status} error is not JSON: ${text.slice(0, 160)}`;
    }
  };

  /** 25 at a time. */
  const inLanes = async <T>(items: T[], fn: (item: T) => Promise<void>, width = 25) => {
    let next = 0;
    const lane = async () => {
      for (let item = items[next++]; item !== undefined; item = items[next++]) await fn(item);
    };
    await Promise.all(Array.from({ length: width }, lane));
  };

  /** Each queue runs in order (one route's probes never race each other); 25 queues at once. */
  const sweep = async (queues: Probe[][]) => {
    const failures: string[] = [];
    await inLanes(queues, async (q) => {
      for (const p of q) {
        const f = await probe(p);
        if (f) failures.push(f);
      }
    });
    return failures;
  };

  const probesFor = (r: Route, headers: Record<string, string>): Probe[] =>
    r.method === 'GET'
      ? queryVariants(r.path).map(([label, path]) => ({ label, method: 'GET', path, headers: { ...headers, 'CF-Connecting-IP': nextIp() }, body: null, nonJson: r.nonJson }))
      : bodyVariants(r.sample ?? {}).map((v) => ({
          label: v.label,
          method: r.method,
          path: r.path,
          headers: { ...headers, 'CF-Connecting-IP': nextIp(), 'content-type': v.type ?? 'application/json' },
          body: v.body,
          nonJson: r.nonJson,
        }));

  /** Every other method on every path in the table. */
  const wrongMethods = (routes: Route[], headers: Record<string, string>): Probe[][] => {
    const byPath = new Map<string, Set<string>>();
    for (const r of routes) byPath.set(r.path, (byPath.get(r.path) ?? new Set<string>()).add(r.method));
    return [...byPath].map(([path, used]) =>
      METHODS.filter((m) => !used.has(m)).map((m) => ({ label: 'wrong method', method: m, path, headers: { ...headers, 'CF-Connecting-IP': nextIp() }, body: m === 'GET' ? null : '{}' })),
    );
  };

  const expectNoPollution = () => {
    const fresh: Record<string, unknown> = {};
    expect(fresh.polluted, 'Object.prototype was polluted').toBeUndefined();
    expect(fresh.isAdmin, 'Object.prototype was polluted').toBeUndefined();
  };

  /** What a member's sign-in looks like once they've accepted the invite: the portal cookie. */
  const portalAccount = async (cookie: string, wid: string, slug: string, pid: string, email: string, password: string) => {
    const inv = await call('POST', `/api/a/w/${wid}/party-accounts/${pid}/invite`, { cookie, body: { email } });
    expect(inv.status).toBe(200);
    const link = (await inv.json()) as { link: string };
    const set = await call('POST', `/api/p/${slug}/portal/password-link`, { body: { t: new URL(link.link).searchParams.get('t') ?? '', password } });
    expect(set.status).toBe(200);
    return (set.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  };

  /** Everything about wedding 1 that a request from outside it must never change. */
  const fingerprint = async (weddingId: string) => {
    const sqls = [
      `SELECT json_group_array(json_array(id, deleted_at, version, phone, seats_held, party, opened_at)) AS v FROM invitation WHERE wedding_id = ?1`,
      `SELECT json_group_array(json_array(p.id, p.name, p.party_role, p.meal_entree, p.diet, p.deleted_at)) AS v FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ?1`,
      `SELECT json_group_array(json_array(r.invitation_id, r.event_id, r.attending, r.message)) AS v FROM rsvp r JOIN invitation i ON i.id = r.invitation_id WHERE i.wedding_id = ?1`,
      `SELECT json_group_array(json_array(id, name, deleted_at, version)) AS v FROM event WHERE wedding_id = ?1`,
      `SELECT json_group_array(json_array(id, body, enabled, deleted_at, version)) AS v FROM campaign WHERE wedding_id = ?1`,
      `SELECT json_group_array(json_array(id, status, pinned)) AS v FROM board_post WHERE wedding_id = ?1`,
      `SELECT json_group_array(json_array(id, status, deleted_at)) AS v FROM song_request WHERE wedding_id = ?1`,
      `SELECT json_group_array(json_array(id, email, perms, deleted_at)) AS v FROM party_account WHERE wedding_id = ?1`,
      `SELECT COUNT(*) AS v FROM message WHERE invitation_id IN (SELECT id FROM invitation WHERE wedding_id = ?1)`,
      `SELECT COUNT(*) AS v FROM sms_out WHERE invitation_id IN (SELECT id FROM invitation WHERE wedding_id = ?1)`,
      `SELECT COUNT(*) AS v FROM planner_doc WHERE wedding_id = ?1`,
      `SELECT content || '#' || version AS v FROM wedding WHERE id = ?1`,
    ];
    const out: string[] = [];
    for (const sql of sqls) out.push(JSON.stringify((await t.db.prepare(sql).bind(weddingId).first<{ v: unknown }>())?.v ?? null));
    return out;
  };

  beforeAll(async () => {
    hashes.owner = await hashPasscode(PASS.owner);
    hashes.other = await hashPasscode(PASS.other);
    hashes.viewer = await hashPasscode(PASS.viewer);
  });

  beforeEach(async () => {
    t = await testD1();
    waits = [];
    provider = new FakeProvider();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', MM_HOOK_SECRET: 'hook-key' };
    const seed = async (input: unknown, email: string, hash: string) => {
      const stmts = buildSeed(input, { ownerEmail: email, ownerPassHash: hash });
      await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    };
    await seed(seedJson, 'owner@example.com', hashes.owner);
    // A second couple on the same platform (same guest names, different everything else).
    await seed({ ...seedJson, wedding: { ...seedJson.wedding, slug: SLUG2 } }, 'other@example.com', hashes.other);

    const wid = (await one<{ id: string }>(`SELECT id FROM wedding WHERE slug = ?`, SLUG)).id;
    const wid2 = (await one<{ id: string }>(`SELECT id FROM wedding WHERE slug = ?`, SLUG2)).id;
    // A viewer of wedding 1 (membership roles live in membership.role: owner, editor, viewer).
    const viewerId = crypto.randomUUID();
    await t.db.batch([
      t.db.prepare(`INSERT INTO user (id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)`).bind(viewerId, 'viewer@example.com', hashes.viewer, new Date().toISOString()),
      t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES (?, ?, 'viewer')`).bind(wid, viewerId),
    ]);

    const guests = async (weddingId: string) => {
      const { results } = await t.db
        .prepare(
          `SELECT p.id AS pid, i.id AS inv, i.token AS tok FROM person p JOIN invitation i ON i.id = p.invitation_id
            WHERE i.wedding_id = ? AND p.idx = 0 AND p.deleted_at IS NULL ORDER BY p.name LIMIT 4`,
        )
        .bind(weddingId)
        .all<{ pid: string; inv: string; tok: string }>();
      const [a, b, c, d] = results;
      if (!a || !b || !c || !d) throw new Error('setup: the seed needs at least four guests');
      return { a, b, c, d };
    };
    const g1 = await guests(wid);
    const g2 = await guests(wid2);
    // Wedding party members: one with a sign-in later, one whose (absent) sign-in the sweep removes.
    await t.db.prepare(`UPDATE person SET party_role = 'Bridesmaid' WHERE id IN (?, ?, ?)`).bind(g1.c.pid, g1.d.pid, g2.c.pid).run();
    const ev = await one<{ id: string; key: string }>(`SELECT id, key FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`, wid);
    const cid = (await one<{ id: string }>(`SELECT id FROM campaign WHERE wedding_id = ? ORDER BY sort LIMIT 1`, wid)).id;
    const now = new Date().toISOString();
    const post = (id: string, inv: string | null) =>
      t.db.prepare(`INSERT INTO board_post (id, wedding_id, invitation_id, author, body, parent_id, status, created_at) VALUES (?, ?, ?, 'A guest', 'Congratulations!', NULL, 'shown', ?)`).bind(id, wid, inv, now);
    const song = (id: string) => t.db.prepare(`INSERT INTO song_request (id, wedding_id, invitation_id, title, artist, note, created_at) VALUES (?, ?, ?, 'Song', 'Artist', '', ?)`).bind(id, wid, g1.a.inv, now);
    await t.db.batch([post('post-keep', g1.a.inv), post('post-guest-del', g1.a.inv), post('post-admin-del', null), song('song-keep'), song('song-del')]);

    const login = async (email: string, passcode: string) => {
      const res = await call('POST', '/api/a/auth/login', { body: { email, passcode } });
      if (res.status !== 200) throw new Error(`setup: sign-in for ${email} gave ${res.status}`);
      return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    };
    w = {
      wid,
      wid2,
      owner: await login('owner@example.com', PASS.owner),
      viewer: await login('viewer@example.com', PASS.viewer),
      other: await login('other@example.com', PASS.other),
      inv: g1.a.inv,
      pid: g1.a.pid,
      tok: g1.a.tok,
      invDel: g1.b.inv,
      partyPid: g1.c.pid,
      partyTok: g1.c.tok,
      partyPidDel: g1.d.pid,
      eventId: ev.id,
      eventKey: ev.key,
      cid,
      postId: 'post-keep',
      postDel: 'post-guest-del',
      postAdminDel: 'post-admin-del',
      songId: 'song-keep',
      songDel: 'song-del',
      inv2: g2.a.inv,
      tok2: g2.a.tok,
      partyPid2: g2.c.pid,
      partyTok2: g2.c.tok,
    };
    // Nothing reaches the internet (map search, weather, SMS providers).
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'offline in tests' }), { status: 503 }));
  });

  afterEach(async () => {
    await Promise.allSettled(waits);
    vi.unstubAllGlobals();
    await t.dispose();
  });

  // ---------------------------------------------------------------- 1. bad, hostile and oversized input

  it('admin writes: no body, garbage, wrong types, 100k strings, 2 MB, unicode, HTML, SQL, null bytes and __proto__ never give a 500', async () => {
    // The member has a sign-in first, so invite and perms below update it rather than racing to create it.
    expect((await call('POST', `/api/a/w/${w.wid}/party-accounts/${w.partyPid}/invite`, { cookie: w.owner, body: { email: 'ella@example.com' } })).status).toBe(200);
    // If-Match on everything: version-checked saves get past the "reload" check and parse the body, then lose (409).
    const headers = { cookie: w.owner, 'If-Match': '999' };
    const writes = [...adminTable(w), ...userTable()].filter((r) => r.method !== 'GET');
    const failures = await sweep(writes.map((r) => probesFor(r, headers)));
    expect(failures, listOf(failures)).toEqual([]);
    expectNoPollution();
  }, 180_000);

  it('admin reads: hostile query strings never give a 500', async () => {
    const reads = [...adminTable(w), ...userTable()].filter((r) => r.method === 'GET');
    const failures = await sweep(reads.map((r) => probesFor(r, { cookie: w.owner })));
    expect(failures, listOf(failures)).toEqual([]);
  }, 180_000);

  it('guest and public routes: hostile bodies and query strings never give a 500', async () => {
    const failures = await sweep(guestTable(w).map((r) => probesFor(r, {})));
    expect(failures, listOf(failures)).toEqual([]);
    expectNoPollution();
  }, 180_000);

  it('every path with every other method: never a 500, errors are JSON', async () => {
    const failures = [
      ...(await sweep(wrongMethods([...adminTable(w), ...userTable()], { cookie: w.owner, 'content-type': 'application/json', 'If-Match': '999' }))),
      ...(await sweep(wrongMethods(guestTable(w), { 'content-type': 'application/json' }))),
    ];
    expect(failures, listOf(failures)).toEqual([]);
  }, 180_000);

  // Known bug: VENDOR_SEARCH is a plain object, so VENDOR_SEARCH['constructor'] is Object and `cat.tags.map` throws
  // (src/routes/planner.ts, /vendors/search). Fix: Object.hasOwn(VENDOR_SEARCH, category). Then drop `.fails`.
  it('the vendor search never crashes on ?category=constructor / __proto__ / toString', async () => {
    for (const cat of ['constructor', '__proto__', 'toString']) {
      expect(await statusOf(call('GET', `/api/a/w/${w.wid}/planner/vendors/search?category=${cat}`, { cookie: w.owner })), cat).not.toBe(500);
    }
  });

  // ---------------------------------------------------------------- 2. who may do what

  it('every admin route needs a session: none, forged or garbled cookies get 401', async () => {
    const failures: string[] = [];
    const routes = [...adminTable(w), ...userTable().filter((r) => r.path !== '/api/a/auth/login')];
    await inLanes(routes, async (r) => {
      for (const cookie of ['', 'wp_session=forged', `wp_session=${'A'.repeat(43)}`, 'wp_session=%E0%A4%A', 'wp_party=x']) {
        const status = await statusOf(call(r.method, r.path, { cookie, ...(r.method === 'GET' ? {} : { body: r.sample ?? {} }) }));
        if (status !== 401) failures.push(`${r.method} ${r.path} cookie="${cookie}" -> ${status}`);
      }
    });
    expect(failures, listOf(failures)).toEqual([]);
  }, 120_000);

  it('a viewer can read but every write is refused (403), and nothing changes', async () => {
    const before = await fingerprint(w.wid);
    const failures: string[] = [];
    // Estimating a message's count and cost is a read that happens to be a POST (it never sends).
    const writes = adminTable(w).filter((r) => r.method !== 'GET' && !r.path.endsWith('/estimate'));
    await inLanes(writes, async (r) => {
      const status = await statusOf(call(r.method, r.path, { cookie: w.viewer, body: r.sample ?? {}, headers: { 'If-Match': '1' } }));
      if (status !== 403) failures.push(`${r.method} ${r.path} as viewer -> ${status}`);
    });
    // The full backup is for owners only.
    const backup = await statusOf(call('GET', `/api/a/w/${w.wid}/settings/backup`, { cookie: w.viewer }));
    if (backup !== 403) failures.push(`GET settings/backup as viewer -> ${backup}`);
    expect(failures, listOf(failures)).toEqual([]);
    expect(await statusOf(call('GET', `/api/a/w/${w.wid}/overview`, { cookie: w.viewer }))).toBe(200);
    expect(await fingerprint(w.wid)).toEqual(before);
  }, 120_000);

  it("a user from another wedding can't read or write this one (403/404), even with their own wedding id in the path", async () => {
    const before = await fingerprint(w.wid);
    const failures: string[] = [];
    await inLanes(adminTable(w), async (r) => {
      const status = await statusOf(call(r.method, r.path, { cookie: w.other, headers: { 'If-Match': '1' }, ...(r.method === 'GET' ? {} : { body: r.sample ?? {} }) }));
      if (status !== 403 && status !== 404) failures.push(`${r.method} ${r.path} as another wedding's owner -> ${status}`);
    });
    // Their own wedding in the path, this wedding's guests, people, events and posts as the object.
    const b = `/api/a/w/${w.wid2}`;
    const cross: { method: Method; path: string; body?: unknown; okIfNoOp?: boolean }[] = [
      { method: 'GET', path: `${b}/guests/${w.inv}` },
      { method: 'PATCH', path: `${b}/guests/${w.inv}`, body: { people: ['Hacked'] } },
      { method: 'PUT', path: `${b}/guests/${w.inv}/rsvp`, body: { events: { [w.eventKey]: { attending: false } }, message: 'Hacked' } },
      { method: 'DELETE', path: `${b}/guests/${w.inv}` },
      { method: 'POST', path: `${b}/guests/${w.invDel}/restore`, body: {} },
      { method: 'PUT', path: `${b}/people/${w.pid}/meal`, body: { entree: 'Hacked', main: 'Hacked', dessert: 'Hacked' } },
      { method: 'POST', path: `${b}/guests/${w.inv}/send`, body: { campaignId: w.cid } },
      { method: 'GET', path: `${b}/messages/${w.inv}` },
      { method: 'POST', path: `${b}/messages/${w.inv}`, body: { body: 'Hacked' } },
      { method: 'PUT', path: `${b}/planner/people/${w.pid}/role`, body: { role: 'Hacked' } },
      { method: 'POST', path: `${b}/party-accounts/${w.partyPid}/invite`, body: { email: 'hacker@example.com' } },
      { method: 'PUT', path: `${b}/party-accounts/${w.partyPid}/perms`, body: { perms: { vendors: true } } },
      { method: 'POST', path: `${b}/party-accounts/${w.partyPid}/reset`, body: {} },
      { method: 'POST', path: `${b}/party-accounts/${w.partyPid}/signout`, body: {}, okIfNoOp: true },
      { method: 'DELETE', path: `${b}/party-accounts/${w.partyPid}`, okIfNoOp: true },
      { method: 'PUT', path: `${b}/events/${w.eventId}`, body: { name: 'Hacked' } },
      { method: 'DELETE', path: `${b}/events/${w.eventId}` },
      { method: 'PATCH', path: `${b}/texts/${w.cid}`, body: { body: 'Hacked' } },
      { method: 'DELETE', path: `${b}/texts/${w.cid}` },
      { method: 'POST', path: `${b}/texts/${w.cid}/estimate`, body: {} },
      { method: 'POST', path: `${b}/texts/${w.cid}/send`, body: {} },
      { method: 'POST', path: `${b}/board`, body: { body: 'Hacked', parent: w.postId } },
      { method: 'PATCH', path: `${b}/board/${w.postId}`, body: { status: 'hidden' } },
      { method: 'DELETE', path: `${b}/board/${w.postId}` },
      { method: 'PATCH', path: `${b}/songs/${w.songId}`, body: { status: 'no' } },
      { method: 'DELETE', path: `${b}/songs/${w.songId}`, okIfNoOp: true },
    ];
    for (const c of cross) {
      const res = await call(c.method, c.path, { cookie: w.other, headers: { 'If-Match': '1' }, ...(c.body === undefined ? {} : { body: c.body }) });
      const text = await res.text();
      if (res.status === 500 || (!c.okIfNoOp && res.status < 300)) failures.push(`${c.method} ${c.path} (wedding 1's object) -> ${res.status}`);
      if (text.includes(w.tok)) failures.push(`${c.method} ${c.path} leaked a wedding 1 guest link`);
    }
    // Their admin session doesn't make them "the couple" on wedding 1's guest pages either.
    const preview = await statusOf(call('GET', `/api/p/${SLUG}/guide?preview=1`, { cookie: w.other }));
    if (preview !== 404) failures.push(`GET /p/${SLUG}/guide?preview=1 with another wedding's session -> ${preview}`);
    expect(failures, listOf(failures)).toEqual([]);
    expect(await fingerprint(w.wid)).toEqual(before);
  }, 120_000);

  // ---------------------------------------------------------------- 3. guest links and private keys

  it("guest pages: a bad link, or another wedding's, gets nothing (404) and changes nothing", async () => {
    const before = await fingerprint(w.wid);
    const opened2 = await one<{ o: string | null }>(`SELECT opened_at AS o FROM invitation WHERE id = ?`, w.inv2);
    const failures: string[] = [];
    const check = async (slug: string, g: string, own: string) => {
      const p = `/api/p/${slug}`;
      const q = encodeURIComponent(g);
      // A bad link still shows the public invitation, never someone's own.
      const inv = await jsonOf<{ invitation: unknown }>(call('GET', `${p}/invite?g=${q}`));
      if (inv.invitation !== null) failures.push(`${slug} invite?g=${g} returned an invitation`);
      const std = await jsonOf<{ guest: string }>(call('GET', `${p}/save-the-date?g=${q}`));
      if (std.guest) failures.push(`${slug} save-the-date?g=${g} named a guest`);
      const ph = await jsonOf<{ linked: boolean; name: string }>(call('GET', `${p}/photos?g=${q}`));
      if (ph.linked || ph.name) failures.push(`${slug} photos?g=${g} recognised the link`);
      for (const page of ['guide', 'messages', 'board', 'songs', 'shuttles', 'album', 'party']) {
        const res = await call('GET', `${p}/${page}?g=${q}`);
        const text = await res.text();
        if (res.status !== 404) failures.push(`${slug} GET ${page}?g=${g} -> ${res.status}`);
        if (own && text.includes(own)) failures.push(`${slug} GET ${page} echoed a guest link`);
      }
      const writes: [string, string, unknown][] = [
        ['POST', 'rsvp', { token: g, events: { [w.eventKey]: { attending: false } }, message: 'Hacked' }],
        ['POST', 'messages', { token: g, body: 'Hacked' }],
        ['POST', 'board', { token: g, body: 'Hacked' }],
        ['POST', `board/${w.postId}/like`, { token: g }],
        ['DELETE', `board/${w.postDel}`, { token: g }],
        ['POST', 'songs', { token: g, title: 'Hacked' }],
        ['POST', 'shuttles', { token: g, shuttleId: 's1', seats: 1 }],
        ['POST', 'party', { token: g, personId: w.partyPid, action: 'add-task', text: 'Hacked' }],
      ];
      for (const [method, path, body] of writes) {
        const status = await statusOf(call(method, `${p}/${path}`, { body }));
        if (status !== 400 && status !== 404) failures.push(`${slug} ${method} ${path} token=${g} -> ${status}`);
      }
    };
    for (const g of ['', 'garbage', 'x'.repeat(22), `${w.tok}x`, w.tok2, w.partyTok2]) await check(SLUG, g, g.length >= 22 ? g : '');
    // And this wedding's links on the other wedding's slug.
    for (const g of [w.tok, w.partyTok]) await check(SLUG2, g, g);
    expect(failures, listOf(failures)).toEqual([]);
    expect(await fingerprint(w.wid)).toEqual(before);
    expect((await one<{ o: string | null }>(`SELECT opened_at AS o FROM invitation WHERE id = ?`, w.inv2)).o).toBe(opened2.o);
  }, 120_000);

  it("the party portal: one wedding's sign-in and invite links don't work on another's", async () => {
    const jar2 = await portalAccount(w.other, w.wid2, SLUG2, w.partyPid2, 'ella2@example.com', 'bridesmaid-2027');
    expect((await jsonOf<{ signedIn: boolean }>(call('GET', `/api/p/${SLUG2}/portal/me`, { cookie: jar2 }))).signedIn).toBe(true);
    // The cookie is scoped to its slug's path, but a client can send it anyway.
    expect((await jsonOf<{ signedIn: boolean }>(call('GET', `/api/p/${SLUG}/portal/me`, { cookie: jar2 }))).signedIn).toBe(false);
    expect(await statusOf(call('GET', `/api/p/${SLUG}/party`, { cookie: jar2 }))).toBe(404);
    expect(await statusOf(call('POST', `/api/p/${SLUG}/party`, { cookie: jar2, body: { personId: w.partyPid, action: 'add-task', text: 'Hacked' } }))).toBe(404);
    expect(await statusOf(call('POST', `/api/p/${SLUG}/portal/password`, { cookie: jar2, body: { current: 'bridesmaid-2027', next: 'hacked-password' } }))).toBe(401);
    expect(await statusOf(call('POST', `/api/p/${SLUG}/portal/login`, { body: { email: 'ella2@example.com', password: 'bridesmaid-2027' } }))).toBe(401);
    // Wedding 1's invite link on wedding 2's slug.
    const inv = await jsonOf<{ link: string }>(call('POST', `/api/a/w/${w.wid}/party-accounts/${w.partyPid}/invite`, { cookie: w.owner, body: { email: 'ella@example.com' } }));
    const tk = new URL(inv.link).searchParams.get('t') ?? '';
    expect(tk.length).toBeGreaterThanOrEqual(20);
    expect(await statusOf(call('GET', `/api/p/${SLUG2}/portal/link?t=${tk}`))).toBe(404);
    expect(await statusOf(call('POST', `/api/p/${SLUG2}/portal/password-link`, { body: { t: tk, password: 'hijacked-pass' } }))).toBe(404);
    // Short and wrong links.
    for (const t2 of ['', tk.slice(0, 19), `${tk}x`, 'z'.repeat(43)]) expect(await statusOf(call('GET', `/api/p/${SLUG}/portal/link?t=${t2}`)), t2).toBe(404);
    // Still good where it belongs.
    expect(await statusOf(call('GET', `/api/p/${SLUG}/portal/link?t=${tk}`))).toBe(200);
  }, 60_000);

  it('private keys (task lists, coordinator, calendar feed, live wall) open only with the right key for the right wedding', async () => {
    const on = async (cookie: string, wid: string) => {
      const coord = await jsonOf<{ url: string }>(call('PUT', `/api/a/w/${wid}/coordinator`, { cookie, body: { on: true, name: 'Jo' } }));
      const cal = await jsonOf<{ url: string }>(call('PUT', `/api/a/w/${wid}/planner-calendar`, { cookie, body: { on: true } }));
      const live = await jsonOf<{ code: string | null }>(call('PUT', `/api/a/w/${wid}/live`, { cookie, body: { on: true } }));
      return {
        coord: new URL(coord.url).searchParams.get('k') ?? '',
        cal: (new URL(cal.url).pathname.split('/').pop() ?? '').replace(/\.ics$/, ''),
        live: live.code ?? '',
      };
    };
    const k1 = await on(w.owner, w.wid);
    const k2 = await on(w.other, w.wid2);
    for (const k of [k1.coord, k1.cal, k1.live, k2.coord, k2.cal, k2.live]) expect(k.length).toBeGreaterThanOrEqual(16);
    const helper1 = 'helper-key-one-aaaaaaaaaa';
    const helper2 = 'helper-key-two-bbbbbbbbbb';
    const shortHelper = 'short-key-12';
    const checklist = (key: string) => ({ tasks: [{ id: 't1', text: 'Book the cake', before: 100, helper: 'h1' }], helpers: [{ id: 'h1', name: 'Mum', key }, { id: 'h2', name: 'Dad', key: shortHelper }] });
    expect(await statusOf(call('PUT', `/api/a/w/${w.wid}/planner/doc/checklist`, { cookie: w.owner, headers: { 'If-Match': '0' }, body: checklist(helper1) }))).toBe(200);
    expect(await statusOf(call('PUT', `/api/a/w/${w.wid2}/planner/doc/checklist`, { cookie: w.other, headers: { 'If-Match': '0' }, body: checklist(helper2) }))).toBe(200);

    const p = `/api/p/${SLUG}`;
    // The right keys work.
    expect(await statusOf(call('GET', `${p}/tasks?k=${helper1}`))).toBe(200);
    expect(await statusOf(call('GET', `${p}/coordinator?k=${k1.coord}`))).toBe(200);
    expect(await statusOf(call('GET', `/api/cal/${w.wid}/${k1.cal}.ics`))).toBe(200);
    expect(await statusOf(call('GET', `${p}/live?k=${k1.live}`))).toBe(200);

    const failures: string[] = [];
    const expect404 = async (what: string, res: Response | Promise<Response>) => {
      const status = await statusOf(res);
      if (status !== 404) failures.push(`${what} -> ${status}`);
    };
    const wrong = (k: string) => ['', 'x'.repeat(24), k.slice(0, -1), `${k}x`, k.slice(0, 15)];
    for (const k of [...wrong(helper1), helper2, shortHelper]) {
      await expect404(`tasks?k=${k}`, call('GET', `${p}/tasks?k=${k}`));
      await expect404(`POST tasks k=${k}`, call('POST', `${p}/tasks`, { body: { k, id: 't1', status: 'done' } }));
    }
    for (const k of [...wrong(k1.coord), k2.coord]) {
      await expect404(`coordinator?k=${k}`, call('GET', `${p}/coordinator?k=${k}`));
      await expect404(`POST coordinator k=${k}`, call('POST', `${p}/coordinator`, { body: { k, action: 'add', text: 'Hacked' } }));
    }
    for (const k of [...wrong(k1.cal), k2.cal]) await expect404(`cal/${w.wid}/${k}.ics`, call('GET', `/api/cal/${w.wid}/${k}.ics`));
    await expect404(`cal/${w.wid2}/(wedding 1's key).ics`, call('GET', `/api/cal/${w.wid2}/${k1.cal}.ics`));
    for (const k of [...wrong(k1.live), k2.live]) await expect404(`live?k=${k}`, call('GET', `${p}/live?k=${k}`));
    // Short stored keys never open (the pages need 20+ characters).
    await t.db
      .prepare(`UPDATE wedding SET content = json_set(content, '$.coordinator', json(?), '$.plannerCal', ?) WHERE id = ?`)
      .bind(JSON.stringify({ key: 'shortkey', name: 'x' }), 'shortkey', w.wid)
      .run();
    await expect404('coordinator?k=shortkey (stored)', call('GET', `${p}/coordinator?k=shortkey`));
    await expect404('cal shortkey.ics (stored)', call('GET', `/api/cal/${w.wid}/shortkey.ics`));
    // Off: the old keys stop working.
    await call('PUT', `/api/a/w/${w.wid2}/coordinator`, { cookie: w.other, body: { on: false } });
    await call('PUT', `/api/a/w/${w.wid2}/planner-calendar`, { cookie: w.other, body: { on: false } });
    await call('PUT', `/api/a/w/${w.wid2}/live`, { cookie: w.other, body: { on: false } });
    await expect404('coordinator off', call('GET', `/api/p/${SLUG2}/coordinator?k=${k2.coord}`));
    await expect404('calendar off', call('GET', `/api/cal/${w.wid2}/${k2.cal}.ics`));
    await expect404('calendar off, empty key', call('GET', `/api/cal/${w.wid2}/.ics`));
    await expect404('live off', call('GET', `/api/p/${SLUG2}/live?k=${k2.live}`));
    expect(failures, listOf(failures)).toEqual([]);
  }, 60_000);

  // ---------------------------------------------------------------- 4. rate limits

  it('admin sign-in: guessing is cut off (429) per network, per network and email, and per email', async () => {
    const tryLogin = (email: string, passcode: string, ip: string) => statusOf(call('POST', '/api/a/auth/login', { body: { email, passcode }, headers: { 'CF-Connecting-IP': ip } }));
    // One network, many emails: 30 per 15 minutes.
    const many: number[] = [];
    for (let i = 0; i < 31; i++) many.push(await tryLogin(`nobody${i}@example.com`, 'wrong-guess', '198.51.100.1'));
    expect(many.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(many[30]).toBe(429);
    // One network, one email: 10, then even the right passcode is refused.
    for (let i = 0; i < 10; i++) expect(await tryLogin('owner@example.com', `wrong-guess-${i}`, '198.51.100.2')).toBe(401);
    expect(await tryLogin('owner@example.com', PASS.owner, '198.51.100.2')).toBe(429);
    // One email from many networks: 30 an hour (the setup's sign-in was the first), then even the right passcode is refused.
    for (let i = 0; i < 29; i++) expect(await tryLogin('viewer@example.com', `wrong-guess-${i}`, `203.0.113.${i + 1}`)).toBe(401);
    expect(await tryLogin('viewer@example.com', PASS.viewer, '203.0.113.200')).toBe(429);
    // Someone else, elsewhere, is unaffected.
    expect(await tryLogin('other@example.com', PASS.other, '192.0.2.50')).toBe(200);
  }, 120_000);

  it('party portal sign-in: guessing is cut off (429), and five wrong passwords lock the account', async () => {
    await portalAccount(w.owner, w.wid, SLUG, w.partyPid, 'ella@example.com', 'bridesmaid-2027');
    const tryLogin = (email: string, password: string, ip: string) => statusOf(call('POST', `/api/p/${SLUG}/portal/login`, { body: { email, password }, headers: { 'CF-Connecting-IP': ip } }));
    // One network: 30 per 15 minutes.
    const many: number[] = [];
    for (let i = 0; i < 31; i++) many.push(await tryLogin(`nobody${i}@example.com`, 'wrong-guess', '198.51.100.10'));
    expect(many.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(many[30]).toBe(429);
    // A real account: five wrong (from anywhere) locks it, even against the right password.
    for (let i = 0; i < 5; i++) expect(await tryLogin('ella@example.com', `wrong-guess-${i}`, `203.0.113.${i + 1}`)).toBe(401);
    expect(await tryLogin('ella@example.com', 'bridesmaid-2027', '203.0.113.99')).toBe(429);
    // One email from many networks: 20 an hour.
    for (let i = 0; i < 20; i++) expect(await tryLogin('ghost@example.com', `wrong-guess-${i}`, `192.0.2.${i + 1}`)).toBe(401);
    expect(await tryLogin('ghost@example.com', 'wrong-guess', '192.0.2.200')).toBe(429);
  }, 120_000);

  // ---------------------------------------------------------------- 5. secrets

  it('no response carries a password hash, a session id or an invite/reset hash', async () => {
    const jar = await portalAccount(w.owner, w.wid, SLUG, w.partyPid, 'ella@example.com', 'bridesmaid-2027');
    // A pending invite for another member and a pending reset, so every kind of hash exists.
    expect(await statusOf(call('PUT', `/api/a/w/${w.wid}/planner/people/${w.pid}/role`, { cookie: w.owner, body: { role: 'Groomsman' } }))).toBe(200);
    expect(await statusOf(call('POST', `/api/a/w/${w.wid}/party-accounts/${w.pid}/invite`, { cookie: w.owner, body: { email: 'ivy@example.com' } }))).toBe(200);
    expect(await statusOf(call('POST', `/api/a/w/${w.wid}/party-accounts/${w.partyPid}/reset`, { cookie: w.owner, body: {} }))).toBe(200);
    const secrets: string[] = [];
    for (const sql of [
      `SELECT pass_hash AS v FROM user`,
      `SELECT id AS v FROM session`,
      `SELECT id AS v FROM party_session`,
      `SELECT pass_hash AS v FROM party_account`,
      `SELECT invite_hash AS v FROM party_account`,
      `SELECT reset_hash AS v FROM party_account`,
    ]) {
      const { results } = await t.db.prepare(sql).all<{ v: string | null }>();
      for (const r of results) if (r.v) secrets.push(r.v);
    }
    for (const c of [w.owner, w.viewer, w.other, jar]) secrets.push(c.slice(c.indexOf('=') + 1));
    expect(secrets.length).toBeGreaterThan(10);
    const a = `/api/a/w/${w.wid}`;
    const pages: [string, string][] = [
      [`${a}/party-accounts`, w.owner],
      [`/api/p/${SLUG}/portal/me`, jar],
      [`/api/p/${SLUG}/party`, jar],
      [`${a}/overview`, w.owner],
      [`${a}/planner/party`, w.owner],
      [`${a}/planner/doc/checklist`, w.owner],
      [`${a}/planner/doc/party-setup`, w.owner],
      [`${a}/planner/doc/party-p1`, w.owner],
      [`${a}/settings`, w.owner],
      [`${a}/settings/backup`, w.owner],
      [`${a}/guests`, w.owner],
      [`${a}/pages`, w.owner],
      [a, w.owner],
      ['/api/a/me', w.owner],
    ];
    const failures: string[] = [];
    for (const [path, cookie] of pages) {
      const res = await call('GET', path, { cookie });
      const text = await res.text();
      if (res.status !== 200) failures.push(`GET ${path} -> ${res.status}`);
      if (/pass_hash|invite_hash|reset_hash|pbkdf2\$/.test(text)) failures.push(`GET ${path} names a hash field`);
      if (secrets.some((s) => text.includes(s))) failures.push(`GET ${path} contains a hash, session id or session token`);
    }
    expect(failures, listOf(failures)).toEqual([]);
  }, 60_000);

  it('viewers see that private links exist, never the links themselves', async () => {
    const a = `/api/a/w/${w.wid}`;
    const coord = await jsonOf<{ url: string }>(call('PUT', `${a}/coordinator`, { cookie: w.owner, body: { on: true, name: 'Jo' } }));
    const cal = await jsonOf<{ url: string }>(call('PUT', `${a}/planner-calendar`, { cookie: w.owner, body: { on: true } }));
    const live = await jsonOf<{ code: string | null }>(call('PUT', `${a}/live`, { cookie: w.owner, body: { on: true } }));
    const helperKey = 'helper-key-viewer-cccccccc';
    expect(
      await statusOf(call('PUT', `${a}/planner/doc/checklist`, { cookie: w.owner, headers: { 'If-Match': '0' }, body: { tasks: [], helpers: [{ id: 'h1', name: 'Mum', key: helperKey }] } })),
    ).toBe(200);
    const coordKey = new URL(coord.url).searchParams.get('k') ?? '';
    const calKey = (new URL(cal.url).pathname.split('/').pop() ?? '').replace(/\.ics$/, '');
    const tokens = (await t.db.prepare(`SELECT token FROM invitation WHERE wedding_id = ?`).bind(w.wid).all<{ token: string }>()).results.map((r) => r.token);
    const secrets = [coordKey, calKey, live.code ?? '', helperKey, ...tokens];
    expect(secrets.every((s) => s.length >= 16)).toBe(true);

    // What the viewer gets: on/off, not the link.
    expect(await jsonOf<{ on: boolean; url: string }>(call('GET', `${a}/coordinator`, { cookie: w.viewer }))).toMatchObject({ on: true, url: '' });
    expect(await jsonOf<{ url: string }>(call('GET', `${a}/planner-calendar`, { cookie: w.viewer }))).toMatchObject({ url: '' });
    expect(await jsonOf<{ on: boolean; code: string | null }>(call('GET', `${a}/live`, { cookie: w.viewer }))).toMatchObject({ on: true, code: null });
    const doc = await jsonOf<{ data: { helpers: { key: string }[] } }>(call('GET', `${a}/planner/doc/checklist`, { cookie: w.viewer }));
    expect(doc.data.helpers.map((h) => h.key)).toEqual(['']);
    expect((await jsonOf<{ links: Record<string, string> }>(call('GET', `${a}/guests`, { cookie: w.viewer }))).links).toEqual({});
    expect((await jsonOf<{ link: string }>(call('GET', `${a}/guests/${w.inv}`, { cookie: w.viewer }))).link).toBe('');
    const party = await jsonOf<{ members: { token: string | null }[] }>(call('GET', `${a}/planner/party`, { cookie: w.viewer }));
    expect(party.members.length).toBeGreaterThan(0);
    expect(party.members.every((m) => m.token === null)).toBe(true);

    // And no read route anywhere hands a viewer one of these keys or a guest's link. (Setup → Guest pages
    // is checked on its own below: its share code is a known gap.)
    const failures: string[] = [];
    const reads = adminTable(w).filter((r) => r.method === 'GET' && !r.path.endsWith('/pages') && !r.path.endsWith('/settings/backup'));
    await inLanes(reads, async (r) => {
      const res = await call('GET', r.path, { cookie: w.viewer });
      const text = await res.text();
      // (The vendor search answers 502 here: the map service is offline in tests.)
      if (res.status === 500 || res.status === 401 || res.status === 403) failures.push(`GET ${r.path} as viewer -> ${res.status}`);
      if (secrets.some((s) => text.includes(s))) failures.push(`GET ${r.path} as viewer contains a private key or guest link`);
    });
    const pages = await jsonOf<{ samples: unknown[] }>(call('GET', `${a}/pages`, { cookie: w.viewer }));
    expect(pages.samples).toEqual([]);
    expect(failures, listOf(failures)).toEqual([]);
  }, 60_000);

  // Known gap: src/routes/pages.ts payload() returns `share` (the Share-a-preview code) to every member, viewers
  // included, although its comment says "admins only". Anyone with it opens the night-before pages (addresses,
  // run sheet) as a stand-in guest. Fix: share: role === 'viewer' ? null : ...; then drop `.fails`.
  it('a viewer never gets the share-a-preview code from GET /pages', async () => {
    const a = `/api/a/w/${w.wid}`;
    expect(await statusOf(call('POST', `${a}/pages/share`, { cookie: w.owner, body: { on: true } }))).toBe(200);
    const owner = await jsonOf<{ share: string | null }>(call('GET', `${a}/pages`, { cookie: w.owner }));
    expect(owner.share).toBeTruthy();
    const viewer = await jsonOf<{ share: string | null }>(call('GET', `${a}/pages`, { cookie: w.viewer }));
    expect(viewer.share).toBeNull();
  });

  // ---------------------------------------------------------------- 6. odd methods, paths and headers

  it('unknown paths are 404 JSON; HEAD, OPTIONS, odd paths, cookies and headers never give a 500', async () => {
    const failures: string[] = [];
    const a = `/api/a/w/${w.wid}`;
    for (const [path, cookie] of [
      ['/api/nope', ''],
      ['/api/a/nope', w.owner],
      [`${a}/nope`, w.owner],
      [`${a}/planner/nope/deeper`, w.owner],
      [`/api/p/${SLUG}/nope/deeper`, ''],
      ['/api/p/no-such-wedding/invite', ''],
      ['/api/p/no-such-wedding/party', ''],
      ['/api/hooks/nope?k=hook-key', ''],
      ['/api/oauth/nope', ''],
    ] as const) {
      const res = await call('GET', path, { cookie });
      const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } } | null;
      if (res.status !== 404 || typeof body?.error?.message !== 'string') failures.push(`GET ${path} -> ${res.status} ${JSON.stringify(body)}`);
    }

    const probes: Probe[] = [];
    const add = (label: string, method: string, path: string, headers: Record<string, string> = {}, body: string | null = null, nonJson = false) =>
      probes.push({ label, method, path, headers: { 'CF-Connecting-IP': nextIp(), ...headers }, body, nonJson });
    for (const [path, cookie] of [
      ['/api/health', ''],
      [`${a}/overview`, w.owner],
      [`${a}/overview`, ''],
      [`${a}/settings/backup`, w.owner],
      [`${a}/planner/doc/checklist`, w.owner],
      [`/api/p/${SLUG}/invite?g=${w.tok}`, ''],
      [`/api/p/${SLUG}/board?g=${w.tok}`, ''],
      [`/api/p/${SLUG}/calendar/${w.eventKey}.ics`, ''],
      [`/api/cal/${w.wid}/${'c'.repeat(32)}.ics`, ''],
      ['/api/nope', ''],
    ] as const) {
      for (const method of ['HEAD', 'OPTIONS']) add(method, method, path, cookie ? { cookie } : {}, null, path.startsWith('/api/cal/'));
    }
    for (const path of [
      '/api/a/w/%E0%A4%A/guests',
      `${a}/guests/%E0%A4%A`,
      `${a}/guests/%2e%2e%2f%2e%2e`,
      `${a}/guests/${'z'.repeat(10_000)}`,
      `${a}/planner/doc/%00`,
      `${a}/planner/doc/checklist/%00`,
      `/api/p/%E0%A4%A/invite`,
      `/api/p/${SLUG}/calendar/%E0%A4%A.ics`,
      `/api/p/${SLUG}/board/%00/like`,
      `/api/p/${SLUG}/invite?g=%E0%A4%A&g=2`,
      `/api/p/${SLUG}/invite?g[]=1&g[]=2`,
      `/api/p/${'s'.repeat(5000)}/invite`,
    ]) {
      add('odd path', 'GET', path, { cookie: w.owner });
      add('odd path', 'POST', path, { cookie: w.owner, 'content-type': 'application/json' }, '{}');
    }
    for (const cookie of ['wp_session=%E0%A4%A', `wp_session=${'A'.repeat(5000)}`, 'wp_session=a; wp_session=b', '=;;;=; ;', 'wp_party=%ZZ', `wp_party=${'B'.repeat(5000)}`]) {
      add(`cookie ${clip(cookie)}`, 'GET', '/api/a/me', { cookie });
      add(`cookie ${clip(cookie)}`, 'GET', `/api/p/${SLUG}/portal/me`, { cookie });
      add(`cookie ${clip(cookie)}`, 'GET', `/api/p/${SLUG}/party`, { cookie });
    }
    // Version headers that aren't numbers.
    for (const v of ['abc', 'NaN', '1.5', '-1', '1e3', '9'.repeat(400), '0x10', ' 1 ', '']) {
      const h = { cookie: w.owner, 'content-type': 'application/json', 'If-Match': v };
      add(`If-Match ${clip(v)}`, 'PUT', `${a}/planner/doc/checklist`, h, JSON.stringify({ tasks: [], helpers: [] }));
      add(`If-Match ${clip(v)}`, 'PUT', `${a}/events/${w.eventId}`, h, JSON.stringify({ venue: 'Valley' }));
      add(`If-Match ${clip(v)}`, 'PATCH', `${a}/guests/${w.inv}`, h, JSON.stringify({ party: 'Friends' }));
      add(`If-Match ${clip(v)}`, 'PUT', `${a}/settings`, h, JSON.stringify({ paused: true }));
      add(`If-Match ${clip(v)}`, 'PUT', `${a}/seating`, h, JSON.stringify({ event: w.eventKey, aspect: '4 / 3', tables: [], areas: [], seats: {} }));
      add(`If-Match ${clip(v)}`, 'PATCH', `${a}/texts/${w.cid}`, h, JSON.stringify({ enabled: false }));
    }
    // Upload headers: a garbled name, a photo upload header on a JSON route.
    add('X-Photo-By garbled', 'PUT', `/api/p/${SLUG}/photos?g=${w.tok}`, { 'content-type': 'image/jpeg', 'X-Photo-By': '%E0%A4%A' }, 'not really a photo');
    add('X-Photo-Upload', 'PUT', `${a}/photos/upload`, { cookie: w.owner, 'content-type': 'image/jpeg', 'X-Photo-Upload': '1', 'X-Photo-By': '%ZZ' }, 'not really a photo');
    // A cross-site write is refused, not crashed on.
    add('evil origin', 'POST', `${a}/guests`, { cookie: w.owner, 'content-type': 'application/json', origin: 'https://evil.example' }, '{}');
    add('bad origin', 'POST', `/api/p/${SLUG}/find`, { 'content-type': 'application/json', origin: 'not a url' }, '{"name":"x"}');
    for (const p of probes) {
      const f = await probe(p);
      if (f) failures.push(f);
    }
    expect(failures, listOf(failures)).toEqual([]);
  }, 60_000);
});
