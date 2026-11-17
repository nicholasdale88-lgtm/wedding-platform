import { dietCategories, zonedToUtc, localParts } from '@wp/shared';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { D1SmsStore } from '../../apps/api/src/db/smsStore';
import type { Env } from '../../apps/api/src/env';
import { createApp } from '../../apps/api/src/index';
import { testD1 } from '../../apps/api/test/support/d1';
import { FakeProvider } from '../../apps/api/test/support/fakes';

/**
 * The stress run: randomised, realistic weddings (1,000 by default) pushed through the real API routes and app
 * logic on a real local database (Miniflare D1), with texting, email, card payments, Google Drive, OneDrive and
 * the AI assistant mocked. Every wedding is made from its own seeded random numbers, so any failure replays:
 *   STRESS_SEED=<seed> STRESS_ONLY=<wedding numbers> pnpm stress
 *
 * Checked on every wedding: no 5xx anywhere; what was written reads back; headcounts and dietary totals agree
 * on every page that shows them (overview, each event, events list, insights, guest list, seating, the
 * vendor's day-of brief and their couples list); guests can't reach other weddings; calendar files are valid.
 * Each route's speed is recorded and reported (p95), but only correctness fails the run.
 *
 * Settings (environment): STRESS_WEDDINGS (1000), STRESS_SEED, STRESS_BATCH (weddings per database, 20),
 * STRESS_PARALLEL (weddings at once per database, 4), STRESS_ONLY (comma-separated wedding numbers).
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED = Number(process.env.STRESS_SEED ?? 20261117) >>> 0;
const TOTAL = Number(process.env.STRESS_WEDDINGS ?? 1000);
const BATCH = Number(process.env.STRESS_BATCH ?? 20);
const PARALLEL = Number(process.env.STRESS_PARALLEL ?? 4);
const ONLY = (process.env.STRESS_ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

const PLATFORM = 'platform@example.com';
const PASSCODE = 'stress-test-passcode';
const BASE = 'https://example.com';
const enc = new TextEncoder();

// ------------------------------------------------------------------------------------------------ random

/** mulberry32: small, fast, seeded. */
function rngOf(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!,
    chance: (p: number) => next() < p,
  };
}
type Rng = ReturnType<typeof rngOf>;
const seedFor = (i: number) => (Math.imul(SEED ^ 0x9e3779b9, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0;

// ------------------------------------------------------------------------------------------------ names

const FIRST = [
  'Olivia', 'Jack', 'Charlotte', 'William', 'Amelia', 'Noah', 'Isla', 'Thomas', 'Mia', 'James', 'Ava', 'Lucas', 'Grace', 'Henry', 'Chloe',
  'Oliver', 'Matilda', 'Leo', 'Zoe', 'Hugo', 'Ruby', 'Archie', 'Harper', 'Lachlan', 'Sienna', 'Zoë', 'Siobhán', 'José', 'Renée', 'Ngọc',
  'Mạnh', 'Søren', 'Łukasz', 'Ana-María', 'Aroha', 'Tāne', 'Priya', 'Arjun', 'Mei', '李小龍', 'Wiremu', 'Fatima', 'Yusuf', 'Chiara', 'Björn',
  'Élodie', 'Inès', 'Kai', 'Ngaio', 'Darcy', 'Frankie', 'Te Aroha', 'Đức', 'Nikolaos', 'Saoirse',
];
const EMOJI = ['🌸', '🎉', '😀', '💍', '🦘'];
const LAST = [
  'Smith', 'Nguyen', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Anderson', 'Martin', 'Kelly', 'Murphy', 'O’Brien', 'Ó Briain', 'García',
  'Müller', 'Kowalski', 'Tanaka', 'Ngata', 'Papadopoulos', 'van der Berg', 'MacDonald', 'Đặng', 'Singh', 'Al-Masri', 'Chen', 'Kim',
  'Fitzgerald', 'Rossi', 'Haddad', 'Walker', 'Okafor',
];
const COUPLE = ['Mia', 'Theo', 'Zoë 🌸', 'Siobhán', 'José', 'Ngọc Anh', 'Aroha', 'Priya', 'Sam', 'Alex', 'Jordan', '李', 'Renée', 'Kai', 'Björn', '💍 Frankie'];
const LONG_COUPLE = 'Maximiliana Alexandrina Theodora Wilhelmina Featherstonehaugh'.slice(0, 60);
/** Needs written the way guests write them. None contains another guest's first name, '.', or ';'. */
const NEEDS = ['Vegetarian', 'Vegan', 'Coeliac', 'Gluten free', 'Severe nut allergy', 'Shellfish allergy', 'No pork', 'Dairy free', 'Halal', 'Kosher', 'Pregnant, no soft cheese', 'Anaphylactic to peanuts', 'Low FODMAP'];
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;

// ------------------------------------------------------------------------------------------------ time zones and dates

const ZONES = ['Australia/Sydney', 'Australia/Perth', 'Australia/Adelaide', 'Australia/Brisbane', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Europe/London'] as const;
/** Days where the clocks change (2027 and 2028) and a wall time that exists on them (twice, when the clocks go back). */
const DST: Record<string, { day: string; time: string }[]> = {
  'Australia/Sydney': [{ day: '2027-04-04', time: '02:30' }, { day: '2027-10-03', time: '15:00' }, { day: '2028-04-02', time: '02:30' }],
  'Australia/Adelaide': [{ day: '2027-04-04', time: '02:30' }, { day: '2027-10-03', time: '16:00' }],
  'Australia/Lord_Howe': [{ day: '2027-04-04', time: '01:45' }, { day: '2027-10-03', time: '15:00' }],
  'Pacific/Auckland': [{ day: '2027-04-04', time: '02:30' }, { day: '2027-09-26', time: '15:00' }],
  'Europe/London': [{ day: '2027-03-28', time: '15:00' }, { day: '2027-10-31', time: '01:30' }],
  'Australia/Perth': [{ day: '2027-04-04', time: '15:00' }],
  'Australia/Brisbane': [{ day: '2027-10-03', time: '15:00' }],
};
const ymdIn = (tz: string, d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// ------------------------------------------------------------------------------------------------ the model of one wedding

type Plan = 'basic' | 'essentials' | 'complete';
interface EvModel {
  key: string;
  id: string;
  version: number;
  name: string;
  local: string;
  startsAt: string;
  catered: boolean;
  hasSeating: boolean;
  venue: string;
  address: string;
  birthday: boolean;
}
interface Reply {
  attending: boolean | null;
  count: number;
}
interface House {
  n: number;
  people: string[];
  seats: number;
  phone: string | null;
  email: string;
  kids: boolean[];
  /** Event indexes (0 = the wedding). */
  invited: number[];
  id: string;
  token: string;
  personIds: string[];
  version: number;
  rsvp: Record<string, Reply>;
  diet: string[];
}
interface Wed {
  i: number;
  rng: Rng;
  name1: string;
  name2: string;
  email: string;
  tz: string;
  plan: Plan;
  isPublic: boolean;
  id: string;
  slug: string;
  cookie: string;
  ip: string;
  events: EvModel[];
  houses: House[];
  /** eventKey -> personId -> table name (the saved plan: who sits where). */
  seats: Record<string, Record<string, string>>;
  /** eventKey -> table id -> name. */
  tables: Record<string, Record<string, string>>;
  /** eventKey -> what guests were shown when it was published (personId -> table name), and its tables. */
  published: Record<string, { seats: Record<string, string>; tables: number }>;
  /** eventKey -> personId -> courses given to them. */
  meals: Record<string, Record<string, { e: string; m: string; d: string }>>;
  photos: { id: string; bytes: Uint8Array }[];
  vendor: { k: number; entryId: string; proposalId: string; total1: number; total2: number } | null;
  done: boolean;
}

const evKeys = (w: Wed, h: House) => h.invited.map((x) => w.events[x]!.key);
const isInvited = (w: Wed, h: House, key: string) => evKeys(w, h).includes(key);
const placesOf = (h: House) => Math.max(1, h.seats, h.people.length);
const heldOf = (h: House) => Math.max(h.seats, h.people.length);
const answerOf = (w: Wed, h: House, key: string): boolean | null => (isInvited(w, h, key) ? (h.rsvp[key]?.attending ?? null) : null);
const comingN = (w: Wed, h: House, key: string) => (isInvited(w, h, key) && h.rsvp[key]?.attending === true ? Math.max(1, h.rsvp[key]!.count) : 0);
/** The people coming (by index): on a yes, the first N named. */
const namedComing = (w: Wed, h: House, key: string) => (comingN(w, h, key) ? h.people.map((_, i) => i).slice(0, Math.max(1, h.rsvp[key]!.count)) : []);
/** Can have a seat: invited, not a no, and (on a yes) among the first N. */
const seatable = (w: Wed, h: House, key: string, idx: number) =>
  isInvited(w, h, key) && h.rsvp[key]?.attending !== false && !(h.rsvp[key]?.attending === true && idx >= Math.max(1, h.rsvp[key]!.count));

/** After any reply: seats and meals the app frees (declined, not invited, beyond the number coming). */
function settle(w: Wed) {
  for (const e of w.events) {
    const seats = w.seats[e.key];
    for (const h of w.houses)
      h.personIds.forEach((pid, idx) => {
        if (seats && seats[pid] && !seatable(w, h, e.key, idx)) delete seats[pid];
        if (h.rsvp[e.key]?.attending === false) delete w.meals[e.key]?.[pid];
      });
  }
  // Declined everything they're invited to: dietary notes cleared.
  for (const h of w.houses) if (h.invited.length && evKeys(w, h).every((k) => h.rsvp[k]?.attending === false)) h.diet = h.people.map(() => '');
}

// ------------------------------------------------------------------------------------------------ calendar files

/** Everything wrong with a calendar file (RFC 5545: CRLF, folded lines of at most 75 octets, balanced blocks, UTC times, escaped text). */
function icsProblems(text: string): { problems: string[]; props: { name: string; params: string; value: string }[] } {
  const problems: string[] = [];
  if (!text.endsWith('\r\n')) problems.push('does not end with CRLF');
  if (/\r(?!\n)|(?<!\r)\n/.test(text)) problems.push('bare CR or LF');
  if (text.includes('�')) problems.push('a character was broken (U+FFFD)');
  const phys = text.replace(/\r\n$/, '').split('\r\n');
  for (const l of phys) {
    const n = enc.encode(l).length;
    if (n > 75) problems.push(`line of ${n} octets: ${l.slice(0, 30)}`);
  }
  const logical: string[] = [];
  for (const l of phys) {
    if (l.startsWith(' ') || l.startsWith('\t')) {
      if (!logical.length) problems.push('starts with a folded line');
      else logical[logical.length - 1] += l.slice(1);
    } else logical.push(l);
  }
  const props: { name: string; params: string; value: string }[] = [];
  const stack: string[] = [];
  for (const l of logical) {
    const m = /^([A-Z][A-Z0-9-]*)((?:;[^:]*)?):(.*)$/.exec(l);
    if (!m) {
      problems.push(`unreadable line: ${l.slice(0, 30)}`);
      continue;
    }
    const [, name, params, value] = m as unknown as [string, string, string, string];
    props.push({ name, params, value });
    if (name === 'BEGIN') stack.push(value);
    else if (name === 'END') {
      const open = stack.pop();
      if (open !== value) problems.push(`END:${value} closes ${open ?? 'nothing'}`);
    } else if (name === 'DTSTART' || name === 'DTEND' || name === 'DTSTAMP') {
      const ok = params === ';VALUE=DATE' ? /^\d{8}$/.test(value) : params === '' && /^\d{8}T\d{6}Z$/.test(value);
      if (!ok) problems.push(`${name}${params} is not a UTC time: ${value}`);
    } else if (['SUMMARY', 'LOCATION', 'DESCRIPTION', 'X-WR-CALNAME'].includes(name)) {
      for (let i = 0; i < value.length; i++) {
        const ch = value[i]!;
        if (ch === '\\') {
          if (!'\\;,nN'.includes(value[i + 1] ?? '')) problems.push(`${name}: a bad escape`);
          i++;
        } else if (ch === ';' || ch === ',') {
          problems.push(`${name}: an unescaped "${ch}"`);
          break;
        }
      }
    }
  }
  if (stack.length) problems.push(`not closed: ${stack.join(', ')}`);
  if (logical[0] !== 'BEGIN:VCALENDAR' || logical[logical.length - 1] !== 'END:VCALENDAR') problems.push('not one VCALENDAR');
  return { problems, props };
}
const unescapeIcs = (v: string) => v.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));

// ------------------------------------------------------------------------------------------------ results

interface Failure {
  wedding: number;
  check: string;
  detail: string;
}
interface ServerError {
  wedding: number;
  route: string;
  status: number;
  body: string;
  logged: string;
}
const lat = new Map<string, number[]>();
const failures: Failure[] = [];
const serverErrors: ServerError[] = [];
let checks = 0;
const weddingResults = new Map<number, boolean>();
/** What the server logged (console.error) lately: shown beside a 5xx. */
const logged: string[] = [];

const p95 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] ?? 0;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * Plain ASCII for the job log and its annotations: anything else written as \u{…}. (Half an emoji, cut by a
 * slice, crashes the CI runner's own logging.)
 */
const ascii = (s: string) =>
  s
    .replace(/[’‘]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7e\n]/gu, (c) => `\\u{${(c.codePointAt(0) ?? 0).toString(16)}}`);

// ------------------------------------------------------------------------------------------------ one database, several weddings

interface Res {
  status: number;
  text: string;
  headers: Headers;
  json: <T>() => T;
}

class Batch {
  t!: Awaited<ReturnType<typeof testD1>>;
  env!: Env;
  provider = new FakeProvider();
  bucket = new Map<string, Uint8Array>();
  app = createApp((env) => ({ store: new D1SmsStore(env.DB, env.PUBLIC_BASE_URL), provider: this.provider, now: () => new Date(), uuid: () => crypto.randomUUID() }));
  ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => undefined), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  ipN = 0;
  platform = '';
  vendors: { slug: string; email: string; name: string; category: string; cookie: string; id: string }[] = [];
  outbound: string[] = [];

  ip() {
    const n = ++this.ipN;
    return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
  }

  async open(b: number) {
    this.t = await testD1();
    const bucket = this.bucket;
    this.env = {
      DB: this.t.db,
      PUBLIC_BASE_URL: BASE,
      SESSION_SECRET: `stress-secret-${b}-000000000000000000`,
      SUPER_ADMINS: PLATFORM,
      RESEND_API_KEY: 're_test_stress',
      EMAIL_FROM: 'The Yes List <hello@example.com>',
      GOOGLE_CLIENT_ID: 'google-id',
      GOOGLE_CLIENT_SECRET: 'google-secret',
      MS_CLIENT_ID: 'ms-id',
      MS_CLIENT_SECRET: 'ms-secret',
      MEDIA: {
        put: async (k: string, v: Uint8Array | ArrayBuffer) => void bucket.set(k, v instanceof Uint8Array ? v : new Uint8Array(v)),
        get: async (k: string) => (bucket.has(k) ? { body: new Blob([bucket.get(k)!]).stream(), size: bucket.get(k)!.byteLength } : null),
        head: async (k: string) => (bucket.has(k) ? { size: bucket.get(k)!.byteLength } : null),
        delete: async (k: string) => void bucket.delete(k),
      } as unknown as R2Bucket,
      AI: { run: async () => ({ response: 'Start with the venue and the date, then the guest list.' }) },
    };
  }

  /** One request through the real app; a "busy, try again" (503) is retried as the pages do. */
  async call(w: number, label: string, method: string, path: string, o: { cookie?: string; ip?: string; body?: unknown; bytes?: Uint8Array; headers?: Record<string, string> } = {}): Promise<Res> {
    const headers: Record<string, string> = { 'CF-Connecting-IP': o.ip ?? 'local', ...(o.cookie ? { cookie: o.cookie } : {}), ...o.headers };
    let body: BodyInit | undefined;
    if (o.bytes) body = o.bytes;
    else if (o.body !== undefined) {
      body = JSON.stringify(o.body);
      headers['content-type'] ??= 'application/json';
    } else if (method !== 'GET') headers['content-type'] ??= 'application/json';
    for (let attempt = 0; ; attempt++) {
      const t0 = performance.now();
      const r = await this.app.request(`/api${path}`, { method, headers, ...(body !== undefined ? { body } : {}) }, this.env, this.ctx);
      const text = await r.text();
      const ms = performance.now() - t0;
      if (r.status === 503 && attempt < 8) {
        await sleep(100 + attempt * 150);
        continue;
      }
      let arr = lat.get(label);
      if (!arr) lat.set(label, (arr = []));
      arr.push(ms);
      if (r.status >= 500) serverErrors.push({ wedding: w, route: label, status: r.status, body: text.slice(0, 300), logged: logged.slice(-2).join(' | ').slice(0, 300) });
      return {
        status: r.status,
        text,
        headers: r.headers,
        json: <T>() => {
          try {
            return JSON.parse(text) as T;
          } catch {
            throw new Error(`${label}: not JSON (${r.status}): ${text.slice(0, 120)}`);
          }
        },
      };
    }
  }

  async close() {
    await this.t.dispose();
  }
}

/** Fake outside services: Resend, Stripe, Google (sign-in and Drive), Microsoft (sign-in and OneDrive). Nothing leaves the machine. */
function fakeFetch(outbound: string[]) {
  const ok = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  const jwt = (email: string) => `x.${btoa(JSON.stringify({ email })).replace(/=+$/, '')}.y`;
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    outbound.push(`${method} ${url.split('?')[0]}`);
    if (url.startsWith('https://api.resend.com')) return ok({ id: crypto.randomUUID() });
    if (url.startsWith('https://api.stripe.com')) return ok({ id: `cs_test_${crypto.randomUUID()}`, url: 'https://checkout.stripe.com/pay/test' });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return ok({ access_token: 'g-access', refresh_token: 'g-refresh', id_token: jwt('couple@example.com'), expires_in: 3600 });
    if (url.startsWith('https://www.googleapis.com/drive/v3/files') && method === 'GET') return ok({ files: [] });
    if (url.startsWith('https://www.googleapis.com/drive/v3/files')) return ok({ id: `folder-${crypto.randomUUID().slice(0, 8)}` });
    if (url.startsWith('https://www.googleapis.com/upload/drive')) return ok({ id: `file-${crypto.randomUUID().slice(0, 8)}` });
    if (url.startsWith('https://login.microsoftonline.com')) return ok({ access_token: 'm-access', refresh_token: 'm-refresh', expires_in: 3600 });
    if (url.startsWith('https://graph.microsoft.com/v1.0/me/drive/special/approot') && url.includes('createUploadSession')) return ok({ uploadUrl: 'https://upload.onedrive.example/session' });
    if (url.startsWith('https://graph.microsoft.com/v1.0/me/drive/special/approot')) return ok({}, 201);
    if (url.startsWith('https://graph.microsoft.com/v1.0/me')) return ok({ mail: 'couple@example.com' });
    if (url.startsWith('https://upload.onedrive.example')) return ok({ id: `od-${crypto.randomUUID().slice(0, 8)}` });
    if (url.startsWith('https://api.open-meteo.com')) return ok({});
    return ok({});
  };
}

// ------------------------------------------------------------------------------------------------ making a wedding

function generate(i: number): Wed {
  const rng = rngOf(seedFor(i));
  const r = rng.next();
  const people = r < 0.08 ? rng.int(2, 39) : r < 0.85 ? rng.int(40, 150) : r < 0.97 ? rng.int(151, 299) : rng.int(300, 500);
  const roll = rng.next();
  const plan: Plan = people <= 48 && roll < 0.3 ? 'basic' : roll < 0.45 ? 'essentials' : 'complete';
  const tz = rng.chance(0.4) ? 'Australia/Sydney' : rng.pick(ZONES);
  const name1 = rng.chance(0.05) ? LONG_COUPLE : rng.pick(COUPLE);
  let name2 = rng.pick(COUPLE);
  while (first(name2) === first(name1)) name2 = rng.pick(COUPLE);
  const w: Wed = {
    i, rng, name1, name2, email: `couple${i}@example.com`, tz, plan, isPublic: rng.chance(0.4), id: '', slug: '', cookie: '', ip: '',
    events: [], houses: [], seats: {}, tables: {}, published: {}, meals: {}, photos: [], vendor: null, done: false,
  };

  // When: yesterday, tomorrow, two years out, a weekend the clocks change, or any time in the next two years.
  const today = ymdIn(tz, new Date());
  const d = rng.next();
  const dst = DST[tz]!;
  let day: string;
  let time = rng.pick(['15:00', '16:30', '11:00', '17:45', '13:15']);
  if (d < 0.04) day = addDays(today, -1);
  else if (d < 0.08) day = addDays(today, 1);
  else if (d < 0.12) day = addDays(today, 730);
  else if (d < 0.32) {
    const x = rng.pick(dst);
    // The wedding on the day the clocks change, or the day before (the next event then crosses the change).
    if (rng.chance(0.5)) {
      day = x.day;
      time = x.time;
    } else day = addDays(x.day, -1);
  } else day = addDays(today, rng.int(20, 700));

  const nEvents = plan === 'basic' ? 1 : (() => {
    const e = rng.next();
    return e < 0.55 ? 1 : e < 0.8 ? 2 : e < 0.93 ? 3 : 4;
  })();
  const weddingSeating = plan !== 'basic' && rng.chance(0.75);
  w.events.push({
    key: 'wedding', id: '', version: 0, name: 'The wedding', local: `${day}T${time}`, startsAt: '', catered: true, hasSeating: weddingSeating,
    venue: rng.pick(['The Boathouse, Palm Beach', 'St Mary’s; then the Gardens', 'Glasshouse — Rooftop 🌿', 'Old Coach House, Kangaroo Valley']),
    address: rng.pick(['Lot 7, Old Coach Rd, Kangaroo Valley NSW 2577', '1 Harbour St, Sydney NSW 2000', '12 Rue de la Paix; Level 2, Perth WA 6000', '']),
    birthday: false,
  });
  const extras = [
    { name: `${first(name1)}’s 30th 🎂`, birthday: true, offset: rng.int(-40, 40), time: '19:00' },
    { name: 'Welcome drinks; sunset, canapés & a long, long table 🍸', birthday: false, offset: -1, time: '18:00' },
    { name: 'Recovery brunch', birthday: false, offset: 1, time: '10:30' },
    { name: 'Día dos — ceremonia y fiesta ✨ with a very long name to fill the line up', birthday: false, offset: 2, time: '12:00' },
  ];
  const chosen = extras.slice(0, nEvents - 1);
  if (chosen.length && rng.chance(0.3)) chosen.reverse();
  for (const x of chosen) {
    w.events.push({
      key: '', id: '', version: 0, name: x.name.slice(0, 80), local: `${addDays(day, x.offset)}T${x.time}`, startsAt: '', catered: rng.chance(0.6), hasSeating: rng.chance(0.5),
      venue: x.birthday ? 'Bar Luca, Surry Hills' : 'The Terrace', address: x.birthday ? '52 Riley St, Surry Hills NSW 2010' : '', birthday: x.birthday,
    });
  }
  // Sometimes only the birthday has a seating plan (the wedding's caterer must still see the wedding).
  if (plan !== 'basic' && w.events.some((e) => e.birthday) && rng.chance(0.3)) {
    w.events[0]!.hasSeating = false;
    for (const e of w.events) if (e.birthday) e.hasSeating = true;
  }
  if (plan === 'basic') for (const e of w.events) e.hasSeating = false;

  // Households: singles, couples, a named or unnamed plus-one, families with children, big households.
  const birthdayIdx = w.events.findIndex((e) => e.birthday);
  const mains = new Set<string>();
  const phones = new Set<string>();
  let total = 0;
  let n = 0;
  const personName = (fn: string, ln: string) => {
    const long = rng.chance(0.015);
    const emoji = rng.chance(0.02) ? `${rng.pick(EMOJI)} ` : '';
    const name = long ? `${fn} ${'Featherstonehaugh-Montgomery '.repeat(5)}${ln}`.slice(0, 118).trim() : `${emoji}${fn} ${ln}`;
    return name.replace(/\s+/g, ' ').trim();
  };
  while (total < people) {
    const t = rng.next();
    const size = t < 0.3 ? 1 : t < 0.65 ? 2 : t < 0.77 ? 1 : t < 0.9 ? rng.int(3, 6) : t < 0.92 ? rng.int(7, 12) : 3;
    const plusOne = t >= 0.65 && t < 0.77;
    const ln = rng.pick(LAST);
    const names = Array.from({ length: size }, () => personName(rng.pick(FIRST), ln));
    for (let k = 0; mains.has(norm(names[0]!)); k++) names[0] = personName(rng.pick(FIRST), `${rng.pick(LAST)}${k > 3 ? ` ${String.fromCharCode(65 + (k % 26))}.` : ''}`);
    // Each person's first name is their own in the household (a dietary note names them by it).
    const firsts = names.map((x) => first(x).toLowerCase());
    if (new Set(firsts).size !== firsts.length) continue;
    mains.add(norm(names[0]!));
    let phone: string | null = null;
    if (rng.chance(0.85)) {
      do phone = `04${String(rng.int(10_000_000, 99_999_999))}`;
      while (phones.has(phone));
      phones.add(phone);
    }
    const kids = names.map((_, k) => size >= 3 && size <= 6 && k >= 2 && rng.chance(0.8));
    let invited: number[] = [0];
    if (birthdayIdx > 0 && rng.chance(0.15)) invited = [birthdayIdx];
    else for (let e = 1; e < w.events.length; e++) if (rng.chance(w.events[e]!.birthday ? 0.4 : 0.6)) invited.push(e);
    w.houses.push({
      n: n++, people: names, seats: plusOne ? 2 : size, phone, email: rng.chance(0.2) ? `guest${i}-${n}@example.com` : '', kids, invited,
      id: '', token: '', personIds: [], version: 0, rsvp: {}, diet: names.map(() => ''),
    });
    total += Math.max(names.length, plusOne ? 2 : size);
    if (plan === 'basic' && total >= 46) break;
  }
  return w;
}

// ------------------------------------------------------------------------------------------------ running one wedding

type Check = (ok: boolean, name: string, detail?: () => string) => void;

async function runWedding(b: Batch, w: Wed, check: Check) {
  const { rng } = w;
  const call = (label: string, method: string, path: string, o: Parameters<Batch['call']>[4] = {}) => b.call(w.i, label, method, path, o);
  const admin = (label: string, method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
    call(`${method} /a/w/:wid${label}`, method, `/a/w/${w.id}${path}`, { cookie: w.cookie, ...(body !== undefined ? { body } : {}), ...(headers ? { headers } : {}) });
  const must = async (r: Promise<Res> | Res, status: number, what: string) => {
    const res = await r;
    if (res.status !== status) throw new Error(`${what}: ${res.status} ${res.text.slice(0, 200)}`);
    return res;
  };

  // 1. Sign up from the front page, then the platform switches the plan on once paid.
  w.ip = b.ip();
  const su = await must(
    call('POST /a/signup', 'POST', '/a/signup', { ip: w.ip, body: { firstName: w.name1, partnerName: w.name2, email: w.email, passcode: PASSCODE, date: w.events[0]!.local.slice(0, 10), plan: w.plan === 'basic' ? 'free' : w.plan, marketing: false, website: '' } }),
    200,
    'sign up',
  );
  const sj = su.json<{ weddingId: string; weddings: { id: string; slug: string }[] }>();
  w.id = sj.weddingId;
  w.slug = sj.weddings.find((x) => x.id === w.id)!.slug;
  w.cookie = (su.headers.get('set-cookie') ?? '').split(';')[0]!;
  // Couples can't choose a time zone in the app yet (every sign-up is Sydney): set as the platform would.
  await b.t.db.prepare(`UPDATE wedding SET timezone = ? WHERE id = ?`).bind(w.tz, w.id).run();
  const included = w.plan === 'complete' ? 2 : 1;
  await must(call('PUT /a/super/plan', 'PUT', '/a/super/plan', { cookie: b.platform, body: { slug: w.slug, plan: w.plan, extraEvents: Math.max(0, w.events.length - included) } }), 200, 'plan');
  if (w.isPublic) await must(call('PUT /a/w/:wid/privacy', 'PUT', `/a/w/${w.id}/privacy`, { cookie: w.cookie, body: { private: false } }), 200, 'privacy');

  // 2. Events: the wedding's real time and place (in the wedding's own time zone), then the other events.
  const evs = (await must(admin('/events', 'GET', '/events'), 200, 'events')).json<{ events: { id: string; key: string; version: number }[] }>().events;
  const wed = w.events[0]!;
  wed.id = evs[0]!.id;
  wed.startsAt = zonedToUtc(wed.local, w.tz).toISOString();
  await must(
    admin('/events/:id', 'PUT', `/events/${wed.id}`, { startsAt: wed.startsAt, venue: wed.venue, address: wed.address, catered: true, hasSeating: wed.hasSeating }, { 'If-Match': String(evs[0]!.version) }),
    200,
    'wedding event',
  );
  for (const e of w.events.slice(1)) {
    e.startsAt = zonedToUtc(e.local, w.tz).toISOString();
    const r = await must(admin('/events', 'POST', '/events', { name: e.name, startsAt: e.startsAt, venue: e.venue, address: e.address, catered: e.catered, hasSeating: e.hasSeating }), 201, 'add event');
    e.key = r.json<{ added: string }>().added;
  }
  const listed = (await must(admin('/events', 'GET', '/events'), 200, 'events')).json<{ events: { id: string; key: string; name: string; startsAt: string; version: number; catered: boolean; hasSeating: boolean }[] }>().events;
  for (const e of w.events) {
    const got = listed.find((x) => x.key === e.key);
    check(!!got && got.name === e.name && got.startsAt === e.startsAt && got.catered === e.catered, 'events read back', () => `${e.key}: ${JSON.stringify(got)} vs ${e.name} ${e.startsAt}`);
    if (got) {
      e.id = got.id;
      e.version = got.version;
    }
    // The wall time survives the trip through UTC, across clock changes.
    const p = localParts(new Date(e.startsAt), w.tz);
    const back = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}T${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
    check(back === e.local, 'time zone round trip', () => `${w.tz} ${e.local} -> ${e.startsAt} -> ${back}`);
  }

  // 3. The guest list, imported in pieces; then the same rows again (nobody doubled).
  const rowOf = (h: House) => ({ people: h.people, seats: h.seats, ...(h.phone ? { phone: rng.chance(0.3) ? `${h.phone.slice(0, 4)} ${h.phone.slice(4, 7)} ${h.phone.slice(7)}` : h.phone } : {}), ...(h.email ? { email: h.email } : {}), invited: evKeys(w, h) });
  const late = w.houses.length > 6 ? w.houses.slice(-Math.min(5, Math.floor(w.houses.length / 10) + 1)) : [];
  const early = w.houses.slice(0, w.houses.length - late.length);
  for (let s = 0; s < early.length; ) {
    const size = rng.int(20, 220);
    const rows = early.slice(s, s + size);
    const r = await must(admin('/guests/import', 'POST', '/guests/import', { rows: rows.map(rowOf) }), 200, 'import');
    const j = r.json<{ added: number; skipped: unknown[]; problems: unknown[] }>();
    check(j.added === rows.length && j.problems.length === 0, 'import adds every row', () => `added ${j.added} of ${rows.length}, skipped ${JSON.stringify(j.skipped).slice(0, 200)}`);
    s += size;
  }
  if (early.length) {
    const again = early.filter(() => rng.chance(0.3)).slice(0, 150);
    if (again.length) {
      const j = (await must(admin('/guests/import', 'POST', '/guests/import', { rows: again.map(rowOf) }), 200, 're-import')).json<{ added: number; skipped: unknown[] }>();
      check(j.added === 0 && j.skipped.length === again.length, 're-import adds nobody', () => `added ${j.added}, skipped ${j.skipped.length} of ${again.length}`);
    }
  }
  // A row that can't be read: the whole file is refused, nobody added.
  const bad = await admin('/guests/import', 'POST', '/guests/import', { rows: [{ people: ['Not Added Anyone'] }, { people: ['Bad Mobile'], phone: '12345' }] });
  check(bad.status === 400, 'import with a bad mobile is refused', () => `${bad.status}`);
  // Late additions with two duplicates (the same name typed differently, and someone already on the list's mobile).
  if (late.length) {
    const dupName = early[0]!;
    const dupPhone = early.find((h) => h.phone);
    const rows = [...late.map(rowOf), { people: [`  ${dupName.people[0]!.toUpperCase()}  `] }, ...(dupPhone ? [{ people: ['Somebody Else Entirely'], phone: dupPhone.phone! }] : [])];
    const j = (await must(admin('/guests/import', 'POST', '/guests/import', { rows }), 200, 'late import')).json<{ added: number; skipped: unknown[] }>();
    check(j.added === late.length && j.skipped.length === rows.length - late.length, 'duplicates are skipped', () => `added ${j.added} (want ${late.length}), skipped ${j.skipped.length}`);
  }

  // 4. Read the list back: every name exactly as typed, the places held and the events.
  type GPerson = { id: string; idx: number; name: string; diet: string; tables: Record<string, string>; child: boolean };
  type GGuest = { id: string; seatsHeld: number; version: number; people: GPerson[]; invited: string[]; rsvp: Record<string, { attending: boolean | null; count: number }> };
  const guests = async () => (await must(admin('/guests', 'GET', '/guests'), 200, 'guest list')).json<{ guests: GGuest[]; links: Record<string, string> }>();
  {
    const g = await guests();
    const byMain = new Map(g.guests.map((x) => [x.people[0]?.name ?? '', x]));
    check(g.guests.length === w.houses.length, 'guest list has everyone once', () => `${g.guests.length} on the list, ${w.houses.length} imported`);
    for (const h of w.houses) {
      const x = byMain.get(h.people[0]!);
      if (!x) {
        check(false, 'imported guest reads back', () => `missing ${h.people[0]}`);
        continue;
      }
      h.id = x.id;
      h.version = x.version;
      h.token = new URL(g.links[x.id]!).searchParams.get('g') ?? '';
      h.personIds = [...x.people].sort((a, b) => a.idx - b.idx).map((p) => p.id);
      check(
        JSON.stringify(x.people.map((p) => p.name)) === JSON.stringify(h.people) && x.seatsHeld === heldOf(h) && [...x.invited].sort().join() === [...evKeys(w, h)].sort().join(),
        'imported guest reads back',
        () => `${JSON.stringify(x.people.map((p) => p.name))} held ${x.seatsHeld} ${x.invited} vs ${JSON.stringify(h.people)} ${heldOf(h)} ${evKeys(w, h)}`,
      );
    }
  }
  if (w.houses.some((h) => !h.id)) throw new Error('guests missing after import');

  // 5. Children marked on the family invitations.
  for (const h of w.houses.filter((x) => x.kids.some(Boolean))) {
    const r = await must(admin('/guests/:id', 'PATCH', `/guests/${h.id}`, { children: h.kids }, { 'If-Match': String(h.version) }), 200, 'children');
    h.version = r.json<{ guest: { version: number } }>().guest.version;
  }

  // 6. Replies from each guest's own link: yes or no per event, how many, dietary needs, a note. Then changes of mind.
  const reply = async (h: House, opts: { flip?: boolean; decline?: boolean } = {}) => {
    const events: Record<string, { attending: boolean }> = {};
    for (const k of evKeys(w, h)) {
      const was = h.rsvp[k]?.attending;
      const yes = opts.decline ? false : opts.flip && was !== undefined && was !== null ? (rng.chance(0.5) ? !was : was) : rng.chance(0.78);
      events[k] = { attending: yes };
    }
    if (rng.chance(0.05) && w.events.length > 1) {
      const other = w.events.find((e) => !isInvited(w, h, e.key));
      if (other) events[other.key] = { attending: true }; // not invited to it: ignored
    }
    const held = heldOf(h);
    const asked = rng.chance(0.1) ? held + 1 : rng.int(1, held);
    // Dietary needs: one note for the invitation, each part naming its person.
    let diet: string | undefined;
    let perPerson: string[] | undefined;
    if (rng.chance(0.85)) {
      perPerson = h.people.map(() => (rng.chance(0.18) ? rng.pick(NEEDS) : ''));
      diet = h.people.length === 1 ? perPerson[0]! : perPerson.map((d, k) => (d ? `${first(h.people[k]!)}: ${d}` : '')).filter(Boolean).join('; ');
    }
    const message = rng.chance(0.15) ? rng.pick(['Can’t wait! 🎉', 'So happy for you both, see you there', 'Ngā mihi — we’ll be there!', '']) : undefined;
    const r = await call('POST /p/:slug/rsvp', 'POST', `/p/${w.slug}/rsvp`, { ip: b.ip(), body: { token: h.token, events, count: asked, ...(diet !== undefined ? { diet } : {}), ...(message !== undefined ? { message } : {}) } });
    check(r.status === 200, 'a guest reply is saved', () => `${r.status} ${r.text.slice(0, 150)}`);
    if (r.status !== 200) return;
    const count = Math.max(1, Math.min(held, asked));
    for (const k of evKeys(w, h)) h.rsvp[k] = { attending: events[k]!.attending, count };
    if (perPerson) h.diet = perPerson;
    settle(w);
    const got = r.json<{ invitation: { rsvp: Record<string, { attending: boolean | null; count: number }>; people: { name: string; diet: string }[] } }>().invitation;
    check(
      evKeys(w, h).every((k) => got.rsvp[k]?.attending === h.rsvp[k]!.attending && got.rsvp[k]?.count === count),
      'a reply reads back',
      () => `${JSON.stringify(got.rsvp)} vs ${JSON.stringify(h.rsvp)}`,
    );
    check(JSON.stringify(got.people.map((p) => p.diet)) === JSON.stringify(h.diet), 'dietary needs go to the right person', () => `"${diet}" for ${JSON.stringify(h.people)} gave ${JSON.stringify(got.people.map((p) => p.diet))}`);
  };
  const waves = async <T>(xs: T[], size: number, fn: (x: T) => Promise<unknown>) => {
    for (let s = 0; s < xs.length; s += size) await Promise.all(xs.slice(s, s + size).map(fn));
  };
  const repliers = w.houses.filter(() => rng.chance(0.9));
  await waves(repliers, 10, (h) => reply(h));
  await waves(repliers.filter(() => rng.chance(0.15)), 10, (h) => reply(h, { flip: true }));

  // The couple records a few replies themselves (by phone, in person).
  for (const h of w.houses.filter((x) => !x.rsvp[evKeys(w, x)[0]!] && rng.chance(0.3)).slice(0, 5)) {
    const events = Object.fromEntries(evKeys(w, h).map((k) => [k, { attending: rng.chance(0.7) }]));
    const count = rng.int(1, heldOf(h));
    const r = await admin('/guests/:id/rsvp', 'PUT', `/guests/${h.id}/rsvp`, { events, count }, { 'If-Match': String(h.version) });
    check(r.status === 200, 'the couple records a reply', () => `${r.status} ${r.text.slice(0, 150)}`);
    if (r.status === 200) {
      for (const k of evKeys(w, h)) h.rsvp[k] = { attending: events[k]!.attending, count };
      h.version = r.json<{ guest: { version: number } }>().guest.version;
      settle(w);
    }
  }
  // Wrong links: refused, never a crash.
  check((await call('POST /p/:slug/rsvp', 'POST', `/p/${w.slug}/rsvp`, { ip: b.ip(), body: { token: 'x'.repeat(24), events: { wedding: { attending: true } } } })).status === 404, 'a made-up link is refused');
  check((await call('POST /p/:slug/rsvp', 'POST', `/p/${w.slug}/rsvp`, { ip: b.ip(), body: { token: w.houses[0]!.token, events: { 'not-an-event': { attending: true } } } })).status === 400, 'a reply to no event is refused');

  // 7. Meals: what the kitchen serves some of the people coming (and a no can't be given one).
  if (w.plan !== 'basic') {
    for (const e of w.events) {
      const people = w.houses.flatMap((h) => namedComing(w, h, e.key).map((idx) => ({ h, idx })));
      for (const { h, idx } of people.filter(() => rng.chance(0.12)).slice(0, 25)) {
        const meal = { e: rng.pick(['Burrata', 'Soup', '']), m: rng.pick(['Beef', 'Fish', 'Risotto (vegan)']), d: rng.pick(['Pavlova', 'Sorbet']) };
        const r = await admin('/people/:pid/meal', 'PUT', `/people/${h.personIds[idx]}/meal`, { event: e.key, menu: '', entree: meal.e, main: meal.m, dessert: meal.d });
        check(r.status === 200, 'a meal is saved', () => `${r.status} ${r.text.slice(0, 120)}`);
        if (r.status === 200) (w.meals[e.key] ??= {})[h.personIds[idx]!] = meal;
      }
      const no = w.houses.find((h) => isInvited(w, h, e.key) && h.rsvp[e.key]?.attending === false);
      if (no) check((await admin('/people/:pid/meal', 'PUT', `/people/${no.personIds[0]}/meal`, { event: e.key, menu: '', entree: '', main: 'Beef', dessert: '' })).status === 400, 'no meal for someone who said no');
    }
  }

  // 8. Seating: tables (some over capacity), everyone placed, people moved, a table with people on it removed, published.
  type SeatTable = { id: string; name: string; shape: 'round' | 'long' | 'square'; dir: 'h' | 'v'; len: number; x: number; y: number; seats: number };
  type SeatView = { version: number; event: { key: string; name: string }; tables: SeatTable[]; people: { id: string; tableId: string | null; coming: boolean }[]; couple: { id: string }[] };
  const seatView = async (key: string) => (await must(admin('/seating', 'GET', `/seating?event=${encodeURIComponent(key)}`), 200, 'seating')).json<SeatView>();
  for (const e of w.events.filter((x) => x.hasSeating)) {
    let v = await seatView(e.key);
    const pool = v.people.map((p) => p.id);
    const n = Math.max(1, Math.ceil(pool.length / 10) + rng.int(0, 1));
    const tables: SeatTable[] = Array.from({ length: n }, (_, k) => ({ id: crypto.randomUUID(), name: `Table ${k + 1}`, shape: rng.pick(['round', 'long', 'square'] as const), dir: 'h' as const, len: 30, x: 10 + (k % 5) * 18, y: Math.min(95, 10 + Math.floor(k / 5) * 15), seats: rng.int(8, 12) }));
    const seats: Record<string, string> = {};
    let k = 0;
    for (const pid of pool) {
      if (rng.chance(0.88)) seats[pid] = tables[Math.min(n - 1, Math.floor(k++ / 10))]!.id; // ten a table: some over capacity
    }
    if (v.couple.length && rng.chance(0.7)) for (const c of v.couple) seats[c.id] = tables[0]!.id;
    const save = async (tbls: typeof tables, s: Record<string, string | null>) => {
      const r = await admin('/seating', 'PUT', '/seating', { event: e.key, aspect: '4 / 3', tables: tbls, areas: [{ label: 'Dance floor', x: 40, y: 80, w: 20, h: 10 }], seats: s }, { 'If-Match': String(v.version) });
      check(r.status === 200, 'seating saves', () => `${r.status} ${r.text.slice(0, 150)}`);
      if (r.status === 200) v = r.json<SeatView>();
      return r.status === 200;
    };
    if (!(await save(tables, seats))) continue;
    const name = Object.fromEntries(tables.map((t) => [t.id, t.name]));
    w.tables[e.key] = { ...name };
    const ppl = new Set(pool);
    w.seats[e.key] = Object.fromEntries(Object.entries(seats).filter(([pid]) => ppl.has(pid)).map(([pid, tid]) => [pid, name[tid]!]));
    // Move a few people.
    const moved: Record<string, string | null> = {};
    for (const pid of Object.keys(w.seats[e.key]!).filter(() => rng.chance(0.08)).slice(0, 6)) {
      const t = rng.pick(tables);
      moved[pid] = t.id;
      w.seats[e.key]![pid] = t.name;
    }
    // Someone taken off their table.
    const off = Object.keys(w.seats[e.key]!)[0];
    if (off && rng.chance(0.5)) {
      moved[off] = null;
      delete w.seats[e.key]![off];
    }
    if (Object.keys(moved).length && !(await save(tables, moved))) continue;
    // A table removed with people still at it: they're no longer seated.
    if (tables.length > 1 && rng.chance(0.5)) {
      const gone = tables[tables.length - 1]!;
      const kept = tables.slice(0, -1);
      if (await save(kept, {})) {
        for (const [pid, t] of Object.entries(w.seats[e.key]!)) if (t === gone.name) delete w.seats[e.key]![pid];
        delete w.tables[e.key]![gone.id];
      }
    }
    // What the plan says now, person by person.
    const want = w.seats[e.key]!;
    const wrong = v.people.filter((p) => (p.tableId ? w.tables[e.key]![p.tableId] : undefined) !== want[p.id]);
    check(!wrong.length, 'seating reads back', () => `${wrong.length} people at the wrong table, e.g. ${JSON.stringify(wrong[0])} want ${want[wrong[0]!.id]}`);
    // Somebody who isn't in this wedding can't be seated in it.
    const r = await admin('/seating', 'PUT', '/seating', { event: e.key, aspect: '4 / 3', tables: v.tables.map(({ id, name, shape, dir, len, x, y, seats }) => ({ id, name, shape, dir, len, x, y, seats })), areas: [], seats: { [crypto.randomUUID()]: v.tables[0]?.id ?? null } }, { 'If-Match': String(v.version) });
    check(r.status === 400, 'a stranger can’t be seated', () => `${r.status}`);
    if (rng.chance(0.7)) {
      const p = await admin('/seating/publish', 'POST', '/seating/publish', { event: e.key }, { 'If-Match': String(v.version) });
      check(p.status === 200, 'seating publishes', () => `${p.status} ${p.text.slice(0, 120)}`);
      if (p.status === 200) {
        const shown: Record<string, string> = {};
        for (const h of w.houses) for (const idx of namedComing(w, h, e.key)) if (want[h.personIds[idx]!]) shown[h.personIds[idx]!] = want[h.personIds[idx]!]!;
        w.published[e.key] = { seats: shown, tables: Object.keys(w.tables[e.key]!).length };
      }
    }
  }

  // 9. Photos from guests' phones (some couples link their Google Drive or OneDrive too).
  if (rng.chance(0.3)) {
    if (w.plan !== 'basic' && rng.chance(0.35)) {
      const provider = rng.pick(['gdrive', 'onedrive'] as const);
      const c = await admin('/photo-links/connect', 'POST', '/photo-links/connect', { provider });
      check(c.status === 200, 'photo storage link starts', () => `${c.status} ${c.text.slice(0, 120)}`);
      if (c.status === 200) {
        const state = new URL(c.json<{ url: string }>().url).searchParams.get('state') ?? '';
        const cb = await call('GET /oauth/callback', 'GET', `/oauth/callback?code=abc&state=${state}`, { cookie: w.cookie });
        check(cb.status === 302 && (cb.headers.get('location') ?? '').includes(`linked=${provider}`), 'photo storage links', () => `${cb.status} ${cb.headers.get('location')}`);
      }
    }
    for (const h of w.houses.filter(() => rng.chance(0.1)).slice(0, 5)) {
      for (let p = 0; p < rng.int(1, 3); p++) {
        const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...enc.encode(`${w.i}-${h.n}-${p}-`), ...Array.from({ length: rng.int(10, 200) }, () => rng.int(0, 255))]);
        const ev = w.events[h.invited[0]!]!;
        const r = await call('PUT /p/:slug/photos', 'PUT', `/p/${w.slug}/photos?g=${h.token}&event=${encodeURIComponent(ev.key)}`, { ip: b.ip(), bytes, headers: { 'content-type': 'image/jpeg', 'X-Photo-By': encodeURIComponent(h.people[0]!) } });
        check(r.status === 200, 'a guest photo is saved', () => `${r.status} ${r.text.slice(0, 120)}`);
        if (r.status === 200) w.photos.push({ id: r.json<{ id: string }>().id, bytes });
      }
    }
    const list = (await must(admin('/photos', 'GET', '/photos'), 200, 'photos')).json<{ items: { id: string; url: string }[] }>();
    check(list.items.length === w.photos.length, 'every photo is in the album', () => `${list.items.length} of ${w.photos.length}`);
    for (const ph of w.photos.slice(0, 2)) {
      const item = list.items.find((x) => x.id === ph.id);
      const r = item ? await call('GET /a/w/:wid/photos/:id', 'GET', item.url.replace(/^\/api/, ''), { cookie: w.cookie }) : null;
      check(!!r && r.status === 200 && r.text.length > 0, 'a photo opens', () => `${r?.status}`);
    }
  }

  // 10. Texts: a message to everyone coming, sent now (texting mocked), and a reminder for later.
  if (w.plan !== 'basic' && rng.chance(0.4)) {
    const s = (await must(admin('/settings', 'GET', '/settings'), 200, 'settings')).json<{ version: number }>();
    await must(admin('/settings', 'PUT', '/settings', { sender: '0400 000 999', adminMobile: '0412 000 777' }, { 'If-Match': String(s.version) }), 200, 'settings save');
    const id = (await must(admin('/texts', 'POST', '/texts', { name: 'Stress check', audience: { attending: 'wedding' }, body: 'Hi {first}, see you soon!' }), 200, 'new text')).json<{ id: string }>().id;
    const sent = await admin('/texts/:cid/send', 'POST', `/texts/${id}/send`, {});
    check(sent.status === 200, 'a text sends', () => `${sent.status} ${sent.text.slice(0, 150)}`);
    const want = w.houses.filter((h) => h.phone && comingN(w, h, 'wedding') > 0).length;
    const got = await b.t.db.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT invitation_id) AS d FROM sms_out WHERE campaign_id = ?`).bind(id).first<{ n: number; d: number }>();
    check(got?.n === want && got?.d === want, 'a text goes to everyone coming, once', () => `${got?.n} texts (${got?.d} guests), want ${want}`);
    const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const rem = (await must(admin('/texts', 'POST', '/texts', { name: 'Last call', audience: { awaitingAny: true }, body: 'Hi {first}, please reply: {link}', dates: [at] }), 200, 'reminder')).json<{ id: string }>().id;
    const ov = (await must(admin('/overview', 'GET', '/overview'), 200, 'overview')).json<{ nextUp: { campaignId: string; sendAt: string }[] }>();
    check(ov.nextUp.some((x) => x.campaignId === rem && x.sendAt === at), 'a reminder is scheduled', () => JSON.stringify(ov.nextUp));
  }

  // 11. A vendor: the couple enquires, adds them to the planner, the vendor sends a fee proposal, the couple asks
  //     for changes, the vendor revises, the couple accepts (booked), and the vendor reads the day-of brief.
  if (w.plan !== 'basic' && rng.chance(0.55)) {
    const k = rng.int(0, b.vendors.length - 1);
    const v = b.vendors[k]!;
    const enq = await call('POST /directory/v/:slug/enquire', 'POST', `/directory/v/${v.slug}/enquire`, { ip: b.ip(), body: { name: w.name1, email: w.email, date: wed.local.slice(0, 10), guests: w.houses.length, message: 'We’d love a quote for our wedding, please.' } });
    check(enq.status === 200, 'an enquiry is sent', () => `${enq.status} ${enq.text.slice(0, 120)}`);
    const doc = (await must(admin('/planner/doc/:kind', 'GET', '/planner/doc/vendors'), 200, 'vendors doc')).json<{ version: number; data: { list: unknown[] } }>();
    const entryId = `v${w.i}-${k}`;
    const entry = { id: entryId, name: v.name, category: v.category === 'caterer' ? 'Caterer' : 'Photographer', status: 'contacted', email: v.email, meals: 2, arrival: '14:00', shareSeating: v.category === 'caterer' };
    await must(admin('/planner/doc/:kind', 'PUT', '/planner/doc/vendors', { list: [...doc.data.list, entry] }, { 'If-Match': String(doc.version) }), 200, 'add vendor');
    const link = (await must(admin('/vendor-chat/invite/vendor', 'POST', '/vendor-chat/invite/vendor', { vendorId: entryId }), 200, 'invite vendor')).json<{ linked: boolean }>();
    check(link.linked, 'the vendor is linked to the couple');
    const lines1 = [{ what: 'The package', amount: rng.int(2, 12) * 500 }, { what: 'Travel, set-up; pack-down', amount: rng.int(1, 6) * 50 }];
    const total1 = lines1.reduce((a, l) => a + l.amount, 0);
    const pr = await must(call('POST /a/vendor/proposals', 'POST', '/a/vendor/proposals', { cookie: v.cookie, body: { to: { couple: w.id }, title: 'Your wedding', lines: lines1, deposit: 500, validUntil: '', note: 'Thanks for asking!' } }), 200, 'proposal');
    const p = pr.json<{ id: string; link: string }>();
    const token = p.link.split('/proposal/')[1]!;
    const ans = (body: unknown) => call('POST /directory/proposal/:token/answer', 'POST', `/directory/proposal/${token}/answer`, { ip: w.ip, body });
    check((await ans({ answer: 'changes', revision: 1, message: 'Could you do it for a little less?' })).status === 200, 'the couple asks for changes');
    const lines2 = [{ what: 'The package', amount: lines1[0]!.amount - 250 }, lines1[1]!];
    const total2 = lines2.reduce((a, l) => a + l.amount, 0);
    const rv = await call('POST /a/vendor/proposals/:id/revise', 'POST', `/a/vendor/proposals/${p.id}/revise`, { cookie: v.cookie, body: { title: 'Your wedding', lines: lines2, deposit: 500, validUntil: '', note: 'Revised as asked.' } });
    check(rv.status === 200 && rv.json<{ revision: number }>().revision === 2, 'the vendor revises', () => `${rv.status} ${rv.text.slice(0, 120)}`);
    check((await ans({ answer: 'accept', revision: 1 })).status === 409, 'an old revision can’t be accepted');
    const acc = await ans({ answer: 'accept', revision: 2 });
    check(acc.status === 200, 'the couple accepts', () => `${acc.status} ${acc.text.slice(0, 120)}`);
    const view = (await must(call('GET /directory/proposal/:token', 'GET', `/directory/proposal/${token}`, { ip: w.ip }), 200, 'proposal page')).json<{ status: string; total: number; versions: unknown[] }>();
    check(view.status === 'accepted' && view.total === total2 && view.versions.length === 1, 'the proposal reads back', () => JSON.stringify(view).slice(0, 200));
    const after = (await must(admin('/planner/doc/:kind', 'GET', '/planner/doc/vendors'), 200, 'vendors doc')).json<{ data: { list: { id: string; status: string; accepted: string; quotes: { id: string; amount: number; before?: number }[] }[] } }>();
    const mine = after.data.list.find((x) => x.id === entryId);
    const q = mine?.quotes.find((x) => x.id === p.id);
    check(mine?.status === 'booked' && mine.accepted === p.id && q?.amount === total2 && q.before === total1, 'the planner has the vendor booked at the agreed price', () => JSON.stringify(mine).slice(0, 300));
    w.vendor = { k, entryId, proposalId: p.id, total1, total2 };
    // A proposal to the enquiry too, accepted: the enquiry is booked.
    if (rng.chance(0.3)) {
      const mineL = (await must(call('GET /a/vendor', 'GET', '/a/vendor', { cookie: v.cookie }), 200, 'vendor listing')).json<{ enquiries: { id: string; email: string }[] }>();
      const e = mineL.enquiries.find((x) => x.email === w.email);
      check(!!e, 'the vendor sees the enquiry');
      if (e) {
        const ep = (await must(call('POST /a/vendor/proposals', 'POST', '/a/vendor/proposals', { cookie: v.cookie, body: { to: { enquiry: e.id }, title: 'For your enquiry', lines: lines1, deposit: 0, validUntil: '', note: '' } }), 200, 'enquiry proposal')).json<{ link: string }>();
        const r = await call('POST /directory/proposal/:token/answer', 'POST', `/directory/proposal/${ep.link.split('/proposal/')[1]}/answer`, { ip: w.ip, body: { answer: 'decline' } });
        check(r.status === 200, 'an enquiry proposal can be declined', () => `${r.status}`);
      }
    }
  }

  // 12. Late changes, after the seating, meals and vendor are set: a few say no, change how many, change their needs.
  await waves(w.houses.filter((h) => Object.keys(h.rsvp).length && rng.chance(0.08)), 10, (h) => reply(h, rng.chance(0.4) ? { decline: true } : { flip: true }));

  // 13. Everything agrees everywhere.
  await checkAll(b, w, check, guests);
  w.done = true;
}

async function checkAll(
  b: Batch,
  w: Wed,
  check: Check,
  guests: () => Promise<{ guests: { id: string; seatsHeld: number; people: { id: string; idx: number; name: string; diet: string; tables: Record<string, string>; child: boolean }[]; invited: string[]; rsvp: Record<string, { attending: boolean | null; count: number }> }[] }>,
) {
  const call = (label: string, method: string, path: string, o: Parameters<Batch['call']>[4] = {}) => b.call(w.i, label, method, path, o);
  const get = async <T>(label: string, path: string, cookie = w.cookie) => {
    const r = await call(`GET ${label}`, 'GET', path, { cookie, ip: b.ip() });
    if (r.status !== 200) throw new Error(`${label}: ${r.status} ${r.text.slice(0, 200)}`);
    return r.json<T>();
  };
  const H = w.houses;
  const sum = (f: (h: House) => number, hs = H) => hs.reduce((a, h) => a + f(h), 0);
  const wedKey = 'wedding';

  // The guest list (and the dietary page, made from it): every person, reply, dietary note, table and child.
  const g = await guests();
  const byId = new Map(g.guests.map((x) => [x.id, x]));
  let wrong = 0;
  let example = '';
  for (const h of H) {
    const x = byId.get(h.id);
    const people = x ? [...x.people].sort((a, b) => a.idx - b.idx) : [];
    const bad = !x
      ? 'missing'
      : JSON.stringify(people.map((p) => p.name)) !== JSON.stringify(h.people)
        ? 'names'
        : evKeys(w, h).some((k) => (x.rsvp[k]?.attending ?? null) !== answerOf(w, h, k) || (h.rsvp[k] && x.rsvp[k]?.count !== h.rsvp[k]!.count))
          ? `replies ${JSON.stringify(x.rsvp)} vs ${JSON.stringify(h.rsvp)}`
          : JSON.stringify(people.map((p) => p.diet)) !== JSON.stringify(h.diet)
            ? `diet ${JSON.stringify(people.map((p) => p.diet))} vs ${JSON.stringify(h.diet)}`
            : people.some((p, idx) => p.child !== (idx > 0 && h.kids[idx] === true))
              ? 'children'
              : w.events.some((e) => people.some((p) => (p.tables[e.key] ?? undefined) !== (w.seats[e.key]?.[p.id] ?? undefined)))
                ? `tables ${JSON.stringify(people.map((p) => p.tables))} vs ${JSON.stringify(h.personIds.map((pid) => Object.fromEntries(w.events.map((e) => [e.key, w.seats[e.key]?.[pid]]))))}`
                : '';
    if (bad) {
      wrong++;
      example ||= `${h.people[0]}: ${bad}`;
    }
  }
  check(!wrong, 'the guest list reads back exactly', () => `${wrong} guests differ, e.g. ${example}`.slice(0, 400));

  // The overview (all events, and each event on its own).
  type PerEvent = { key: string; invited: number; yes: number; no: number; awaiting: number; coming: number; diet: number; seated: number; counts: { coming: number; cantCome: number; awaiting: number; guests: number; children: number } };
  type Ov = { total: number; replied: number; awaiting: number; yesInv: number; noInv: number; seatsHeld: number; daysToGo: number | null; events: { key: string; coming: number }[]; diet: { people: number; serious: number }; nav: { guests: number; dietary: number }; perEvent: PerEvent[] };
  const ov = await get<Ov>('/a/w/:wid/overview', `/a/w/${w.id}/overview`);
  const awaitingAny = (h: House) => evKeys(w, h).some((k) => answerOf(w, h, k) === null);
  const yesAny = (h: House) => evKeys(w, h).some((k) => answerOf(w, h, k) === true);
  const dietOf = (key: string) => H.flatMap((h) => namedComing(w, h, key).map((idx) => h.diet[idx]!)).filter((d) => d.trim());
  const want = {
    total: H.length,
    awaiting: H.filter(awaitingAny).length,
    yesInv: H.filter(yesAny).length,
    seatsHeld: sum(placesOf),
  };
  check(
    ov.total === want.total && ov.awaiting === want.awaiting && ov.replied === want.total - want.awaiting && ov.yesInv === want.yesInv && ov.noInv === want.total - want.awaiting - want.yesInv && ov.seatsHeld === want.seatsHeld && ov.nav.guests === want.seatsHeld,
    'overview totals',
    () => `${JSON.stringify({ total: ov.total, awaiting: ov.awaiting, yesInv: ov.yesInv, seatsHeld: ov.seatsHeld, nav: ov.nav.guests })} want ${JSON.stringify(want)}`,
  );
  const wedDiet = dietOf(wedKey);
  check(ov.diet.people === wedDiet.length && ov.nav.dietary === wedDiet.length, 'overview dietary total', () => `${ov.diet.people}/${ov.nav.dietary} want ${wedDiet.length}`);
  const today = ymdIn(w.tz, new Date());
  const days = Math.max(0, Math.round((Date.parse(ymdIn(w.tz, new Date(w.events[0]!.startsAt))) - Date.parse(today)) / 86_400_000));
  check(ov.daysToGo === days, 'days to go, in the wedding’s time zone', () => `${ov.daysToGo} want ${days} (${w.tz}, ${w.events[0]!.local})`);
  const evList = await get<{ events: { key: string; invited: number; coming: number }[] }>('/a/w/:wid/events', `/a/w/${w.id}/events`);
  for (const e of w.events) {
    const inv = H.filter((h) => isInvited(w, h, e.key));
    const coming = sum((h) => comingN(w, h, e.key));
    const cant = sum((h) => (answerOf(w, h, e.key) === false ? placesOf(h) : answerOf(w, h, e.key) === true ? Math.max(0, placesOf(h) - comingN(w, h, e.key)) : 0), inv);
    const waiting = sum((h) => (answerOf(w, h, e.key) === null ? placesOf(h) : 0), inv);
    const seated = H.flatMap((h) => namedComing(w, h, e.key).filter((idx) => w.seats[e.key]?.[h.personIds[idx]!])).length;
    const kids = sum((h) => h.kids.filter((k, idx) => k && idx > 0).length, inv);
    const pe = ov.perEvent.find((x) => x.key === e.key);
    const exp = {
      invited: inv.length, yes: inv.filter((h) => answerOf(w, h, e.key) === true).length, no: inv.filter((h) => answerOf(w, h, e.key) === false).length,
      awaiting: inv.filter((h) => answerOf(w, h, e.key) === null).length, coming, diet: e.catered ? dietOf(e.key).length : 0, seated,
    };
    const gotPe = pe ? { invited: pe.invited, yes: pe.yes, no: pe.no, awaiting: pe.awaiting, coming: pe.coming, diet: pe.diet, seated: pe.seated } : null;
    check(JSON.stringify(gotPe) === JSON.stringify(exp), `overview per event`, () => `${e.key}: ${JSON.stringify(gotPe)} want ${JSON.stringify(exp)}`);
    check(!!pe && pe.counts.coming === coming && pe.counts.cantCome === cant && pe.counts.awaiting === waiting && pe.counts.guests === sum(placesOf, inv) && pe.counts.children === kids, 'guests add up per event', () => `${e.key}: ${JSON.stringify(pe?.counts)} want coming ${coming} cant ${cant} waiting ${waiting} guests ${sum(placesOf, inv)} kids ${kids}`);
    check(ov.events.find((x) => x.key === e.key)?.coming === coming, 'overview coming per event', () => `${e.key}: ${ov.events.find((x) => x.key === e.key)?.coming} want ${coming}`);
    const el = evList.events.find((x) => x.key === e.key);
    check(el?.invited === sum(placesOf, inv) && el.coming === coming, 'events list counts', () => `${e.key}: ${JSON.stringify(el)} want invited ${sum(placesOf, inv)} coming ${coming}`);
    // The overview focused on this event: only its guests.
    const fo = await get<Ov>('/a/w/:wid/overview?event', `/a/w/${w.id}/overview?event=${encodeURIComponent(e.key)}`);
    check(fo.total === inv.length && fo.awaiting === exp.awaiting && fo.yesInv === exp.yes && fo.diet.people === (e.catered ? dietOf(e.key).length : 0), 'each event counted on its own', () => `${e.key}: ${JSON.stringify({ total: fo.total, awaiting: fo.awaiting, yes: fo.yesInv, diet: fo.diet.people })} want ${JSON.stringify(exp)}`);
    // The seating page: who can be seated and who is.
    if (w.seats[e.key] || e.hasSeating) {
      const sv = await get<{ people: { id: string; tableId: string | null }[]; couple: unknown[] }>('/a/w/:wid/seating', `/a/w/${w.id}/seating?event=${encodeURIComponent(e.key)}`);
      const able = H.flatMap((h) => h.personIds.filter((_, idx) => seatable(w, h, e.key, idx)));
      const ids = new Set(sv.people.map((p) => p.id));
      check(sv.people.length === able.length && able.every((pid) => ids.has(pid)), 'seating lists exactly who can be seated', () => `${e.key}: ${sv.people.length} listed, want ${able.length}`);
      check(sv.people.filter((p) => p.tableId).length === Object.keys(w.seats[e.key] ?? {}).length, 'seating keeps who sits where', () => `${e.key}: ${sv.people.filter((p) => p.tableId).length} seated, want ${Object.keys(w.seats[e.key] ?? {}).length}`);
      check(e.key === wedKey ? sv.couple.length === 2 : sv.couple.length === 0, 'the couple are only in the wedding’s seating', () => `${e.key}: ${sv.couple.length}`);
    }
  }

  // Insights (the planner's numbers).
  type Ins = { events: { key: string; invited: number; yes: number; no: number; people: number; guests: number; cantCome: number; awaitingGuests: number }[]; catering: { people: number; withNeeds: number; diets: [string, number][] }; seating: { seated: number; people: number } };
  const ins = await get<Ins>('/a/w/:wid/insights', `/a/w/${w.id}/insights`);
  for (const e of w.events) {
    const inv = H.filter((h) => isInvited(w, h, e.key));
    const x = ins.events.find((y) => y.key === e.key);
    const coming = sum((h) => comingN(w, h, e.key));
    check(
      !!x && x.invited === inv.length && x.yes === inv.filter((h) => answerOf(w, h, e.key) === true).length && x.no === inv.filter((h) => answerOf(w, h, e.key) === false).length && x.people === coming,
      'insights per event',
      () => `${e.key}: ${JSON.stringify(x)} want invited ${inv.length} coming ${coming}`,
    );
  }
  const cats = new Map<string, number>();
  for (const d of wedDiet) for (const c of dietCategories(d)) cats.set(c, (cats.get(c) ?? 0) + 1);
  check(ins.catering.people === sum((h) => comingN(w, h, wedKey)) && ins.catering.withNeeds === wedDiet.length, 'insights catering numbers', () => `${JSON.stringify(ins.catering).slice(0, 200)} want ${sum((h) => comingN(w, h, wedKey))} / ${wedDiet.length}`);
  check(JSON.stringify(Object.fromEntries([...ins.catering.diets].sort())) === JSON.stringify(Object.fromEntries([...cats].sort())), 'insights dietary headings', () => `${JSON.stringify(ins.catering.diets)} want ${JSON.stringify([...cats])}`);

  // The vendor: their couples list and the day-of brief match the couple's latest data.
  if (w.vendor) {
    const v = b.vendors[w.vendor.k]!;
    const list = await get<{ couples: { id: string; coming: number; invited: number; status: string }[] }>('/a/vendor/couples', '/a/vendor/couples', v.cookie);
    const mine = list.couples.find((x) => x.id === w.id);
    const wedInv = H.filter((h) => isInvited(w, h, wedKey));
    const coming = sum((h) => comingN(w, h, wedKey));
    check(!!mine && mine.coming === coming && mine.invited === sum(placesOf, wedInv) && mine.status === 'booked', 'the vendor’s couples list', () => `${JSON.stringify(mine)} want coming ${coming} invited ${sum(placesOf, wedInv)} booked`);
    type Brief = {
      guests: { coming: number; waiting: number } | null;
      dietary: { diet: string; n: number }[];
      meals: { course: string; choice: string; n: number }[];
      seating: { event: string; published: boolean; tables: unknown[]; special: unknown[]; notSeated: unknown[] } | null;
      vendorMeals: { name: string; meals: number }[];
      vendor: { name: string; arrival: string };
      event: { name: string; startsAt: string } | null;
      files: { dietary: string; day: string };
    };
    const d = await get<{ inPlanner: boolean; details: Brief | null }>('/a/vendor/couples/:wid/details', `/a/vendor/couples/${w.id}/details`, v.cookie);
    const brief = d.details;
    check(!!brief, 'the vendor’s day-of brief opens');
    if (brief) {
      const waiting = sum((h) => (answerOf(w, h, wedKey) === null ? placesOf(h) : 0), wedInv);
      check(brief.guests?.coming === coming && brief.guests.waiting === waiting, 'the brief’s guest numbers', () => `${JSON.stringify(brief.guests)} want coming ${coming} waiting ${waiting}`);
      const tally = new Map<string, number>();
      for (const dd of wedDiet) for (const part of dd.split(/[;,]\s*/).map((x) => x.trim()).filter(Boolean)) tally.set(part, (tally.get(part) ?? 0) + 1);
      const gotTally = Object.fromEntries(brief.dietary.map((x) => [x.diet, x.n]).sort());
      check(JSON.stringify(gotTally) === JSON.stringify(Object.fromEntries([...tally].sort())), 'the brief’s dietary needs', () => `${JSON.stringify(gotTally)} want ${JSON.stringify(Object.fromEntries(tally))}`);
      check(brief.event?.name === w.events[0]!.name && brief.event.startsAt === w.events[0]!.startsAt, 'the brief is for the wedding', () => JSON.stringify(brief.event));
      // Meal choices at the wedding (people coming, with a meal set).
      const meals = new Map<string, number>();
      for (const h of H)
        for (const idx of namedComing(w, h, wedKey)) {
          const m = w.meals[wedKey]?.[h.personIds[idx]!];
          if (!m) continue;
          for (const [course, c] of [['Entrée', m.e], ['Main', m.m], ['Dessert', m.d]] as const) if (c) meals.set(`${course}|${c}`, (meals.get(`${course}|${c}`) ?? 0) + 1);
        }
      const gotMeals = Object.fromEntries(brief.meals.map((m) => [`${m.course}|${m.choice}`, m.n]).sort());
      check(JSON.stringify(gotMeals) === JSON.stringify(Object.fromEntries([...meals].sort())), 'the brief’s meal choices are the wedding’s', () => `${JSON.stringify(gotMeals).slice(0, 200)} want ${JSON.stringify(Object.fromEntries(meals)).slice(0, 200)}`);
      if (v.category === 'caterer') {
        const s = brief.seating;
        const pub = w.published[wedKey];
        const plan = pub ? pub.seats : (w.seats[wedKey] ?? {});
        const special = H.flatMap((h) => namedComing(w, h, wedKey).filter((idx) => plan[h.personIds[idx]!] && (h.diet[idx]!.trim() || w.meals[wedKey]?.[h.personIds[idx]!])));
        check(!!s && s.event === w.events[0]!.name, 'the caterer’s seating is the wedding’s', () => `${s?.event} want ${w.events[0]!.name}`);
        if (s && s.event === w.events[0]!.name) {
          check(s.published === !!pub && s.tables.length === (pub ? pub.tables : Object.keys(w.tables[wedKey] ?? {}).length), 'the caterer’s tables', () => `${s.published} ${s.tables.length} want ${!!pub} ${pub?.tables ?? Object.keys(w.tables[wedKey] ?? {}).length}`);
          check(s.special.length === special.length, 'the caterer’s special meals by seat', () => `${s.special.length} want ${special.length}`);
        }
        check(brief.vendorMeals.some((x) => x.name === v.name && x.meals === 2), 'vendor meals for the caterer');
      }
      // The live files: the dietary spreadsheet and the calendar.
      const path = (u: string) => u.replace(/^https?:\/\/[^/]+\/api/, '');
      const csv = await call('GET /p/:slug/vendor/:vid/:key/dietary.csv', 'GET', path(brief.files.dietary), { ip: b.ip() });
      const row = csv.text.split('\r\n').find((l) => l.startsWith('"Guests coming"'));
      check(csv.status === 200 && row?.split(',')[1] === `"${coming}"`, 'the dietary spreadsheet’s numbers', () => `${csv.status} ${row}`);
      const day = await call('GET /p/:slug/vendor/:vid/:key/day.ics', 'GET', path(brief.files.day), { ip: b.ip() });
      const ics = icsProblems(day.text);
      check(day.status === 200 && !ics.problems.length, 'the vendor’s calendar file is valid', () => `${day.status} ${ics.problems.slice(0, 3).join('; ')}`);
      const date = ymdIn(w.tz, new Date(w.events[0]!.startsAt));
      const arrive = stamp(zonedToUtc(`${date}T14:00`, w.tz));
      check(ics.props.some((p) => p.name === 'DTSTART' && p.value === arrive), 'the vendor’s arrival time', () => `${ics.props.find((p) => p.name === 'DTSTART')?.value} want ${arrive}`);
    }
  }

  // Calendar files: each event's (private weddings: only with a guest's own link) and each guest's own.
  const couple = `${first(w.name1)} & ${first(w.name2)}`;
  const sample = H.filter(() => w.rng.chance(0.2)).slice(0, 6);
  if (!sample.length && H[0]) sample.push(H[0]);
  for (const e of w.events) {
    const guest = sample.find((h) => isInvited(w, h, e.key)) ?? H.find((h) => isInvited(w, h, e.key));
    const bare = await call('GET /p/:slug/calendar/:event.ics', 'GET', `/p/${w.slug}/calendar/${encodeURIComponent(e.key)}.ics`, { ip: b.ip() });
    check(bare.status === (w.isPublic ? 200 : 404), 'an event’s calendar file is public only for public weddings', () => `${bare.status} (public ${w.isPublic})`);
    const mineCal = guest ? await call('GET /p/:slug/calendar/:event.ics?g', 'GET', `/p/${w.slug}/calendar/${encodeURIComponent(e.key)}.ics?g=${guest.token}`, { ip: b.ip() }) : bare;
    check(mineCal.status === 200, 'a guest can add their event to their calendar', () => `${mineCal.status} (public ${w.isPublic})`);
    if (mineCal.status === 200) {
      const ics = icsProblems(mineCal.text);
      check(!ics.problems.length, 'event calendar file is valid', () => `${e.key}: ${ics.problems.slice(0, 3).join('; ')}`);
      const start = ics.props.find((p) => p.name === 'DTSTART')?.value;
      check(start === stamp(new Date(e.startsAt)), 'event calendar time', () => `${start} want ${stamp(new Date(e.startsAt))} (${w.tz} ${e.local})`);
      const summary = unescapeIcs(ics.props.find((p) => p.name === 'SUMMARY')?.value ?? '');
      check(summary === `${couple}: ${e.name}`, 'event calendar title', () => `"${summary}" want "${couple}: ${e.name}"`);
    }
    // Not invited to this event: no calendar for it from their link.
    const outsider = H.find((h) => !isInvited(w, h, e.key));
    if (outsider && !w.isPublic) {
      const r = await call('GET /p/:slug/calendar/:event.ics?g', 'GET', `/p/${w.slug}/calendar/${encodeURIComponent(e.key)}.ics?g=${outsider.token}`, { ip: b.ip() });
      check(r.status === 404, 'no calendar for an event they’re not invited to', () => `${r.status}`);
    }
  }
  for (const h of sample) {
    const r = await call('GET /p/:slug/calendar/mine.ics', 'GET', `/p/${w.slug}/calendar/mine.ics?g=${h.token}`, { ip: b.ip() });
    const ics = icsProblems(r.text);
    check(r.status === 200 && !ics.problems.length, 'a guest’s own calendar is valid', () => `${r.status} ${ics.problems.slice(0, 3).join('; ')}`);
    const uids = ics.props.filter((p) => p.name === 'UID').map((p) => p.value).sort();
    const wantU = evKeys(w, h).filter((k) => answerOf(w, h, k) !== false).map((k) => `${w.slug}-${k}@wedding-platform`).sort();
    check(JSON.stringify(uids) === JSON.stringify(wantU), 'a guest’s own calendar has their events (not ones they said no to)', () => `${uids} want ${wantU}`);
    // Their invitation page: their own names and replies, and only their events.
    const page = await call('GET /p/:slug/invite', 'GET', `/p/${w.slug}/invite?g=${h.token}`, { ip: b.ip() });
    const inv = page.status === 200 ? page.json<{ events: { key: string }[]; invitation: { people: { name: string }[]; invited: string[]; rsvp: Record<string, { attending: boolean | null }> } | null }>() : null;
    check(
      !!inv?.invitation && JSON.stringify(inv.invitation.people.map((p) => p.name)) === JSON.stringify(h.people) && inv.events.map((e) => e.key).sort().join() === evKeys(w, h).sort().join(),
      'a guest’s invitation shows them and only their events',
      () => `${page.status} ${JSON.stringify(inv?.events)} want ${evKeys(w, h)}`,
    );
  }
}

/** Guests of one wedding can't reach another: links, calendars, photos and the couple's pages all refuse. */
async function crossProbes(b: Batch, ws: Wed[], check: (i: number) => Check) {
  const done = ws.filter((w) => w.done && w.houses.length);
  for (let k = 0; k < done.length; k++) {
    const a = done[k]!;
    const o = done[(k + 1) % done.length]!;
    if (a === o) continue;
    const c = check(a.i);
    const h = o.houses[0]!;
    const call = (label: string, method: string, path: string, opts: Parameters<Batch['call']>[4] = {}) => b.call(a.i, label, method, path, { ip: b.ip(), ...opts });
    const inv = await call('GET /p/:slug/invite', 'GET', `/p/${a.slug}/invite?g=${h.token}`);
    const opened = inv.status === 200 ? inv.json<{ invitation: unknown }>().invitation : null;
    c(inv.status === (a.isPublic ? 200 : 404) && opened === null && !inv.text.includes(h.people[0]!.slice(0, 40)), 'another wedding’s link opens nothing here', () => `${inv.status}`);
    c((await call('POST /p/:slug/rsvp', 'POST', `/p/${a.slug}/rsvp`, { body: { token: h.token, events: { wedding: { attending: true } } } })).status === 404, 'another wedding’s link can’t reply here');
    c((await call('GET /p/:slug/calendar/mine.ics', 'GET', `/p/${a.slug}/calendar/mine.ics?g=${h.token}`)).status === 404, 'another wedding’s link gets no calendar here');
    if (!a.isPublic) c((await call('GET /p/:slug/calendar/:event.ics?g', 'GET', `/p/${a.slug}/calendar/wedding.ics?g=${h.token}`)).status === 404, 'another wedding’s link opens no private calendar');
    c((await call('PUT /p/:slug/photos', 'PUT', `/p/${a.slug}/photos?g=${h.token}`, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]), headers: { 'content-type': 'image/jpeg' } })).status === 404, 'another wedding’s link can’t add photos here');
    c((await call('GET /p/:slug/messages', 'GET', `/p/${a.slug}/messages?g=${h.token}`)).status === 404, 'another wedding’s link reads no messages here');
    c((await call('GET /a/w/:wid/overview', 'GET', `/a/w/${o.id}/overview`, { cookie: a.cookie })).status === 404, 'a couple can’t open another wedding');
    c((await call('GET /a/w/:wid/guests/:id', 'GET', `/a/w/${a.id}/guests/${h.id}`, { cookie: a.cookie })).status === 404, 'a couple can’t read another wedding’s guest');
    c((await call('PATCH /a/w/:wid/guests/:id', 'PATCH', `/a/w/${a.id}/guests/${h.id}`, { cookie: a.cookie, body: { party: 'Mine now' }, headers: { 'If-Match': '1' } })).status === 404, 'a couple can’t change another wedding’s guest');
    c((await call('PUT /a/w/:wid/people/:pid/meal', 'PUT', `/a/w/${a.id}/people/${h.personIds[0]}/meal`, { cookie: a.cookie, body: { menu: '', entree: '', main: 'x', dessert: '' } })).status === 404, 'a couple can’t give another wedding’s guest a meal');
    if (o.photos[0]) c((await call('GET /a/w/:wid/photos/:id', 'GET', `/a/w/${a.id}/photos/${o.photos[0].id}`, { cookie: a.cookie })).status === 404, 'a couple can’t open another wedding’s photo');
    if (a.vendor && (!o.vendor || o.vendor.k !== a.vendor.k)) {
      const v = b.vendors[a.vendor.k]!;
      c((await call('GET /a/vendor/couples/:wid/details', 'GET', `/a/vendor/couples/${o.id}/details`, { cookie: v.cookie })).status === 404, 'a vendor can’t open a couple they don’t work with');
    }
  }
}

// ------------------------------------------------------------------------------------------------ the parts

export function stressPart(part: number, parts: number) {
  const mine = Array.from({ length: TOTAL }, (_, i) => i).filter((i) => (ONLY.length ? ONLY.includes(i) : i % parts === part - 1));

  describe(`stress part ${part} of ${parts}`, () => {
    afterAll(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it(`${mine.length} randomised weddings through the real routes (seed ${SEED})`, async () => {
      const started = Date.now();
      console.log(`Stress part ${part}/${parts}: ${mine.length} weddings, seed ${SEED} (replay one: STRESS_SEED=${SEED} STRESS_ONLY=<n> pnpm stress)`);
      const outbound: string[] = [];
      vi.stubGlobal('fetch', fakeFetch(outbound));
      vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
        logged.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ').slice(0, 300));
        if (logged.length > 50) logged.splice(0, logged.length - 50);
      });
      vi.spyOn(console, 'log').mockImplementation(() => {}); // the cron's and app's own logs
      const say = (s: string) => process.stdout.write(`${ascii(s)}\n`);

      for (let s = 0; s < mine.length; s += BATCH) {
        const ids = mine.slice(s, s + BATCH);
        const b = new Batch();
        await b.open(ids[0]!);
        const checkFor =
          (i: number): Check =>
          (ok, name, detail) => {
            checks++;
            if (!ok) failures.push({ wedding: i, check: name, detail: detail ? detail().slice(0, 500) : '' });
          };
        // The platform owner (switches plans on) and the vendors who've joined the directory.
        const pf = await b.call(-1, 'POST /a/signup', 'POST', '/a/signup', { ip: b.ip(), body: { firstName: 'Platform', partnerName: 'Owner', email: PLATFORM, passcode: PASSCODE, date: '', plan: 'free', marketing: false, website: '' } });
        b.platform = (pf.headers.get('set-cookie') ?? '').split(';')[0]!;
        for (const [k, category] of ['caterer', 'photographer', 'caterer', 'florist', 'music', 'caterer'].entries()) {
          const email = `vendor${k}@example.com`;
          const name = `${['Harbour', 'Wattle', 'Saltbush', 'Ironbark', 'Lantana', 'Paperbark'][k]} ${category === 'caterer' ? 'Kitchen' : category === 'photographer' ? 'Photography' : category === 'florist' ? 'Flowers' : 'Music'}`;
          const r = await b.call(-1, 'POST /directory/join', 'POST', '/directory/join', { ip: b.ip(), body: { name, category, region: 'sydney', regions: ['central-coast'], contactName: 'Pat Vendor', phone: '0400 111 222', email, passcode: PASSCODE, about: 'Weddings, big and small.', priceFrom: 1500 } });
          if (r.status !== 200) throw new Error(`vendor join: ${r.status} ${r.text}`);
          b.vendors.push({ slug: r.json<{ slug: string }>().slug, email, name, category, cookie: (r.headers.get('set-cookie') ?? '').split(';')[0]!, id: '' });
        }
        const ws = ids.map(generate);
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(PARALLEL, ws.length) }, async () => {
            while (next < ws.length) {
              const w = ws[next++]!;
              const before = failures.length;
              const e5 = serverErrors.length;
              try {
                await runWedding(b, w, checkFor(w.i));
              } catch (e) {
                failures.push({ wedding: w.i, check: 'the wedding ran to the end', detail: String((e as Error)?.stack ?? e).slice(0, 500) });
              }
              weddingResults.set(w.i, failures.slice(before).every((f) => f.wedding !== w.i) && !serverErrors.slice(e5).some((x) => x.wedding === w.i));
            }
          }),
        );
        await crossProbes(b, ws, checkFor);
        for (const w of ws) if (failures.some((f) => f.wedding === w.i) || serverErrors.some((x) => x.wedding === w.i)) weddingResults.set(w.i, false);
        await b.close();
        const passed = [...weddingResults.values()].filter(Boolean).length;
        say(`  ${Math.min(s + BATCH, mine.length)}/${mine.length} weddings, ${passed} passed, ${failures.length} failed checks, ${serverErrors.length} server errors, ${Math.round((Date.now() - started) / 1000)} s`);
      }

      // The report: speed per route (p95, sorted), and what failed.
      const routes = [...lat.entries()].map(([route, xs]) => ({ route, n: xs.length, p50: Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0), p95: Math.round(p95(xs)), max: Math.round(Math.max(...xs)) }));
      routes.sort((a, b) => b.p95 - a.p95);
      const passed = [...weddingResults.values()].filter(Boolean).length;
      const byCheck = new Map<string, Failure[]>();
      for (const f of failures) byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), f]);
      const by5 = new Map<string, ServerError[]>();
      for (const e of serverErrors) by5.set(`${e.status} ${e.route}`, [...(by5.get(`${e.status} ${e.route}`) ?? []), e]);
      say(`\nStress part ${part}/${parts}, seed ${SEED}: ${passed}/${mine.length} weddings passed; ${checks - failures.length}/${checks} checks passed; ${serverErrors.length} server errors; ${Math.round((Date.now() - started) / 1000)} s`);
      say('Slowest routes (p95 ms):');
      for (const r of routes.slice(0, 25)) say(`  ${String(r.p95).padStart(6)}  p50 ${String(r.p50).padStart(5)}  max ${String(r.max).padStart(6)}  n ${String(r.n).padStart(6)}  ${r.route}`);
      for (const [k, fs] of byCheck) say(`FAILED ${fs.length}x ${k}: wedding ${fs[0]!.wedding}: ${fs[0]!.detail}`);
      for (const [k, es] of by5) say(`SERVER ERROR ${es.length}x ${k}: ${es[0]!.body} | ${es[0]!.logged}`);
      const dir = join(HERE, 'stress-report');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `part-${part}.json`),
        JSON.stringify({ part, parts, seed: SEED, weddings: mine.length, passed, checks, failed: failures.length, seconds: Math.round((Date.now() - started) / 1000), failures: failures.slice(0, 500), serverErrors: serverErrors.slice(0, 200), latency: Object.fromEntries([...lat].map(([k, xs]) => [k, xs.map((x) => Math.round(x))])) }),
      );

      const summary = [
        `Part ${part}/${parts} (seed ${SEED}): ${passed}/${mine.length} weddings passed, ${failures.length} of ${checks} checks failed, ${serverErrors.length} server errors.`,
        ...[...byCheck].map(([k, fs]) => `- ${fs.length}x ${k} (e.g. wedding ${fs[0]!.wedding}: ${fs[0]!.detail.slice(0, 220)})`),
        ...[...by5].map(([k, es]) => `- ${es.length}x ${k}: ${es[0]!.body.slice(0, 160)} ${es[0]!.logged.slice(0, 160)}`),
      ].join('\n');
      expect(failures.length + serverErrors.length, ascii(summary)).toBe(0);
    });
  });
}
