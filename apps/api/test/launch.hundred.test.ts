import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { testD1 } from './support/d1';

/**
 * A hundred weddings, generated from a seed so any failure reproduces: each signs up, is on Free, Essentials
 * or Complete, maybe adds a second event, imports its guests (households of one to four, some without a
 * mobile, in groups), gets a mix of replies with dietary needs and changes of mind, then (when the plan has
 * them) seats everyone, publishes, plans a budget and a checklist with a helper, adds a wedding party
 * member, deletes a guest, and stays private. After each step the figures must add up, nothing may answer
 * 5xx, and no wedding can see another's.
 */

/** Seeded PRNG so a failure always reproduces. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const PLATFORM = 'platform@example.com';
const PASSCODE = 'our-big-day-2027';
/** yyyy-mm-dd, n days from now. */
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** A distinct client address per caller, so per-address rate limits don't stand in for the thing under test. */
const ipOf = (n: number) => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;

const FIRST = ['Olivia', 'Jack', 'Charlotte', 'William', 'Amelia', 'Noah', 'Isla', 'Thomas', 'Mia', 'James', 'Ava', 'Lucas', 'Grace', 'Henry', 'Chloe', 'Oliver', 'Matilda', 'Leo', 'Zoe', 'Hugo', 'Ruby', 'Archie', 'Harper', 'Lachlan', 'Sienna'];
const LAST = ['Smith', 'Nguyen', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Anderson', 'Martin', 'Kelly', 'Murphy'];
const PARTNERS = ['Sam', 'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie'];

type Plan = 'free' | 'essentials' | 'complete';
type Init = { method?: string; body?: string | Uint8Array; headers?: Record<string, string> };
type W = { id: string; slug: string; cookie: string; email: string };
type SignupForm = { firstName: string; partnerName: string; email: string; date: string };
type ImportRow = { people: string[]; phone?: string; seats?: number; party?: string; invited?: string[] };
type ImportResult = { added: number; skipped: unknown[]; problems: unknown[] };
type Reply = { attending: boolean | null; count: number; message: string; answers: Record<string, string> };
type Person = { id: string; idx: number; name: string; diet: string; tables: Record<string, string>; meal: { entree: string; main: string; dessert: string } };
type Guest = { id: string; phone: string | null; seatsHeld: number; party: string; version: number; people: Person[]; invited: string[]; rsvp: Record<string, Reply> };
type GuestList = { events: { key: string; name: string }[]; guests: Guest[]; links: Record<string, string> };
type PerEvent = { key: string; invited: number; yes: number; no: number; awaiting: number; coming: number; diet: number; seated: number };
type Overview = {
  wedding: { id: string; slug: string; name1: string; name2: string; monogram: string; plan: Plan; planRequested: string; private: boolean; adminName: string };
  total: number;
  replied: number;
  awaiting: number;
  yesInv: number;
  noInv: number;
  seatsHeld: number;
  events: { key: string; coming: number }[];
  diet: { people: number; serious: number; mealsSet: number };
  needsYou: { kind: string; title: string; detail: string }[];
  perEvent: PerEvent[];
  nav: { guests: number; dietary: number };
  latest: { id: string; name: string; message: string }[];
};
type SeatTable = { id: string; name: string; shape: string; dir: 'h' | 'v'; len: number; x: number; y: number; seats: number };
type SeatPerson = { id: string; invitationId: string; name: string; tableId: string | null; coming: boolean };
type SeatView = {
  version: number;
  event: { key: string; name: string };
  aspect: string;
  tables: SeatTable[];
  people: SeatPerson[];
  versions: { id: string; name: string; tables: number; seated: number }[];
  current: { id: string; name: string; changes: number } | null;
  published: { at: string; changes: number } | null;
};

describe('a hundred weddings, generated', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let bucket: Map<string, Uint8Array>;
  let signups = 0;
  let platformCookie = '';
  /** Every status any route returned in this scenario: none may be a 5xx. */
  const seen: { status: number; what: string }[] = [];
  // What the server logged for a 5xx (its console.error), so a failure says why.
  const faults: string[] = [];
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

  const record = async (what: string, p: Response | Promise<Response>) => {
    const r = await p;
    seen.push({ status: r.status, what });
    return r;
  };
  const send = (path: string, init: Init = {}, cookie = '', ip = 'local') =>
    record(
      `${init.method ?? 'GET'} ${path.slice(0, 120)}`,
      app.request(
        `/api${path}`,
        {
          method: init.method ?? 'GET',
          ...(init.body !== undefined ? { body: init.body } : {}),
          headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, ...(cookie ? { cookie } : {}), ...init.headers },
        },
        env,
        ctx,
      ),
    );
  const read = async <T>(r: Response) => (await r.json()) as T;
  /** The couple's admin API for one wedding (their own session cookie unless another is given). */
  const admin = (w: W, path: string, init: Init = {}, cookie = w.cookie) => send(`/a/w/${w.id}${path}`, init, cookie);
  const post = (w: W, path: string, data: unknown, cookie = w.cookie) => admin(w, path, { method: 'POST', body: JSON.stringify(data) }, cookie);
  const put = (w: W, path: string, version: number, data: unknown, cookie = w.cookie) =>
    admin(w, path, { method: 'PUT', headers: { 'If-Match': String(version) }, body: JSON.stringify(data) }, cookie);
  const del = (w: W, path: string, version?: number, cookie = w.cookie) =>
    admin(w, path, { method: 'DELETE', ...(version !== undefined ? { headers: { 'If-Match': String(version) } } : {}) }, cookie);
  /** A guest-facing page for the wedding. */
  const pub = (w: W, path: string, init: Init = {}, ip = 'local') => send(`/p/${w.slug}${path}`, init, '', ip);
  /** A guest's reply. Like the real page, a "busy, try again" (503) is retried a few times; only the final answer counts. */
  const rsvp = async (w: W, token: string, body: Record<string, unknown>, ip: string) => {
    const init = { method: 'POST', body: JSON.stringify({ token, ...body }), headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip } };
    for (let i = 0; ; i++) {
      const r = await app.request(`/api/p/${w.slug}/rsvp`, init, env, ctx);
      if (r.status !== 503 || i === 5) return record(`POST /p/${w.slug}/rsvp`, r);
      await new Promise((ok) => setTimeout(ok, 150 + Math.random() * 400));
    }
  };
  const healthy = () =>
    expect(
      seen.filter((s) => s.status >= 500).map((s) => `${s.status} ${s.what}`),
      faults.slice(0, 5).join(' | '),
    ).toEqual([]);

  /** Sign up from the front page: a new account and a new wedding (Free), signed in. Each from its own address. */
  const signup = async (f: SignupForm): Promise<W> => {
    const res = await send('/a/signup', { method: 'POST', body: JSON.stringify({ passcode: PASSCODE, plan: 'free', marketing: false, website: '', ...f }) }, '', `192.0.2.${++signups}`);
    expect(res.status, await res.clone().text()).toBe(200);
    const b = await read<{ weddingId: string; weddings: { id: string; slug: string }[] }>(res);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect(cookie).toMatch(/=/);
    return { id: b.weddingId, slug: b.weddings.find((x) => x.id === b.weddingId)!.slug, cookie, email: f.email };
  };
  /** The platform owner (a super admin) switches a plan on once it's paid. */
  const upgrade = async (w: W, plan: Plan) => {
    if (!platformCookie) platformCookie = (await signup({ firstName: 'Platform', partnerName: 'Owner', email: PLATFORM, date: day(500) })).cookie;
    // With room for a few extra events (an add-on), as these weddings have brunches and welcome drinks.
    const r = await send('/a/super/plan', { method: 'PUT', body: JSON.stringify({ slug: w.slug, plan, extraEvents: 3 }) }, platformCookie);
    expect(r.status).toBe(200);
  };
  const importRows = async (w: W, rows: ImportRow[]) => {
    const res = await post(w, '/guests/import', { rows });
    const body = await read<ImportResult>(res);
    expect(res.status, JSON.stringify(body).slice(0, 300)).toBe(200);
    expect(body.problems).toEqual([]);
    expect(body.added).toBe(rows.length);
    return body;
  };
  const guests = async (w: W) => {
    const r = await admin(w, '/guests');
    expect(r.status).toBe(200);
    const list = await read<GuestList>(r);
    return {
      list: list.guests,
      byName: new Map(list.guests.map((g) => [g.people[0]?.name ?? '', g])),
      token: (g: Guest) => new URL(list.links[g.id]!).searchParams.get('g')!,
    };
  };
  const overview = async (w: W) => {
    const r = await admin(w, '/overview');
    expect(r.status).toBe(200);
    return read<Overview>(r);
  };
  const seating = async (w: W) => {
    const r = await admin(w, '/seating');
    expect(r.status).toBe(200);
    return read<SeatView>(r);
  };
  const table = (name: string, i: number): SeatTable => ({ id: crypto.randomUUID(), name, shape: 'round', dir: 'h', len: 30, x: 15 + (i % 4) * 22, y: 20 + Math.floor(i / 4) * 30, seats: 10 });

  beforeEach(async () => {
    seen.length = 0;
    faults.length = 0;
    signups = 0;
    platformCookie = '';
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void faults.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ').slice(0, 400)));
    bucket = new Map();
    t = await testD1();
    env = {
      DB: t.db,
      PUBLIC_BASE_URL: 'https://example.com',
      SESSION_SECRET: 'test-secret-for-sessions-000000',
      SUPER_ADMINS: PLATFORM,
      // The site's own photo storage (R2), in memory.
      MEDIA: {
        put: async (k: string, v: Uint8Array) => void bucket.set(k, v),
        get: async (k: string) => (bucket.has(k) ? { body: new Blob([bucket.get(k)!]).stream() } : null),
        delete: async (k: string) => void bucket.delete(k),
      } as unknown as R2Bucket,
    };
  });
  afterEach(async () => {
    const crashed = seen.filter((s) => s.status >= 500).map((s) => `${s.status} ${s.what}`);
    await t.dispose();
    vi.restoreAllMocks();
    expect(crashed, faults.slice(0, 5).join(' | ')).toEqual([]);
  });

  const DIETS = ['', '', '', 'Vegetarian', 'Vegan', 'Coeliac', 'Severe peanut allergy', 'No seafood', 'Halal', 'Dairy free'];

  /** One generated wedding, start to finish. Returns it, for the isolation check. */
  const run = async (n: number): Promise<W> => {
    const r = rng(7919 * (n + 1));
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
    const plan = (['free', 'essentials', 'complete'] as const)[n % 3]!;
    const tag = `#${n} (${plan})`;
    const w = await signup({ firstName: FIRST[n % 25]!, partnerName: PARTNERS[n % 8]!, email: `couple${n}@example.com`, date: day(60 + (n % 200)) });
    if (plan !== 'free') await upgrade(w, plan);

    // A second event for some (Free can't add one: it asks for the add-on).
    const keys = ['wedding'];
    if (n % 4 === 0) {
      const ev = await post(w, '/events', { name: 'Recovery brunch', startsAt: `${day(61 + (n % 200))}T00:00:00.000Z` });
      if (plan === 'free') expect(ev.status, tag).toBe(402);
      else {
        expect(ev.status, tag).toBe(201);
        keys.push((await read<{ added: string }>(ev)).added);
      }
    }

    // Guests: Free stays under its 50 people.
    const households = plan === 'free' ? 3 + Math.floor(r() * 12) : 5 + Math.floor(r() * 30);
    const rows: ImportRow[] = Array.from({ length: households }, (_, i) => {
      const size = 1 + Math.floor(r() * (plan === 'free' ? 3 : 4));
      const surname = `${LAST[i % 10]}${i >= 10 ? Math.floor(i / 10) : ''}`;
      const people = [`${FIRST[i % 25]} ${surname}`, `${PARTNERS[i % 8]} ${surname}`, `Kid${i}a ${surname}`, `Kid${i}b ${surname}`].slice(0, size);
      const invited = keys.length > 1 ? (r() < 0.6 ? keys : [pick(keys)]) : keys;
      return { people, ...(r() < 0.7 ? { phone: `04${String(30000000 + n * 100 + i).padStart(8, '0')}` } : {}), party: pick(['', 'Family', 'Friends', 'Work']), invited };
    });
    await importRows(w, rows);
    const g0 = await guests(w);
    expect(g0.list, tag).toHaveLength(households);

    // Replies: about half yes, a fifth no, the rest none yet; some with dietary needs.
    const answer = new Map<string, { yes: boolean; count: number }>();
    for (const [i, g] of g0.list.entries()) {
      const roll = r();
      if (roll > 0.65) continue;
      const yes = roll < 0.45;
      const count = yes ? 1 + Math.floor(r() * g.people.length) : 0;
      const res = await rsvp(w, g0.token(g), { events: Object.fromEntries(g.invited.map((k) => [k, { attending: yes }])), ...(yes ? { count } : {}), diet: yes ? pick(DIETS) : '' }, ipOf(n * 1000 + i));
      expect(res.status, `${tag} reply ${i}`).toBe(200);
      answer.set(g.id, { yes, count });
    }
    // One change of mind: a yes becomes a no.
    const switcher = g0.list.find((g) => answer.get(g.id)?.yes);
    if (switcher) {
      expect((await rsvp(w, g0.token(switcher), { events: Object.fromEntries(switcher.invited.map((k) => [k, { attending: false }])) }, ipOf(n * 1000 + 999))).status, tag).toBe(200);
      answer.set(switcher.id, { yes: false, count: 0 });
    }
    // The wedding's figures add up.
    const atWedding = g0.list.filter((g) => g.invited.includes('wedding'));
    const yesW = atWedding.filter((g) => answer.get(g.id)?.yes);
    const noW = atWedding.filter((g) => answer.get(g.id) && !answer.get(g.id)!.yes);
    const comingW = yesW.reduce((s, g) => s + answer.get(g.id)!.count, 0);
    const ov = await overview(w);
    expect(ov.perEvent.find((e) => e.key === 'wedding'), tag).toMatchObject({ invited: atWedding.length, yes: yesW.length, no: noW.length, awaiting: atWedding.length - yesW.length - noW.length, coming: comingW });
    expect(ov.total, tag).toBe(households);

    // Seating: Free asks to upgrade; the others seat everyone coming, then a no takes a seat away.
    const s0 = await seating(w);
    const coming = s0.people.filter((p) => p.coming);
    if (plan === 'free') {
      expect((await put(w, '/seating', s0.version, { event: 'wedding', aspect: '4 / 3', tables: [], areas: [], seats: {} })).status, tag).toBe(402);
    } else {
      const tables = Array.from({ length: Math.max(1, Math.ceil(coming.length / 10)) + 1 }, (_, i) => table(String(i + 1), i));
      const seats = Object.fromEntries(coming.map((p, k) => [p.id, tables[k % tables.length]!.id]));
      const saved = await put(w, '/seating', s0.version, { event: 'wedding', aspect: '4 / 3', tables, areas: [], seats });
      expect(saved.status, `${tag} seating`).toBe(200);
      const s1 = await read<SeatView>(saved);
      expect(s1.people.filter((p) => p.coming && !p.tableId), tag).toEqual([]);
      expect((await put(w, '/seating', s0.version, { event: 'wedding', aspect: '4 / 3', tables, areas: [], seats })).status, tag).toBe(409); // a stale copy
      const leaver = yesW.find((g) => g.id !== switcher?.id);
      if (leaver) {
        expect((await rsvp(w, g0.token(leaver), { events: Object.fromEntries(leaver.invited.map((k) => [k, { attending: false }])) }, ipOf(n * 1000 + 998))).status, tag).toBe(200);
        const s2 = await seating(w);
        const hers = new Set(leaver.people.map((p) => p.id));
        expect(s2.people.filter((p) => hers.has(p.id) && p.tableId), `${tag} a no keeps no seat`).toEqual([]);
        const published = await admin(w, '/seating/publish', { method: 'POST', headers: { 'If-Match': String(s2.version) }, body: JSON.stringify({ event: 'wedding' }) });
        expect(published.status, `${tag} publish`).toBe(200);
      }

      // The planner: a budget, a checklist with a helper, and a day-checklist item handed to them.
      expect((await put(w, '/planner/doc/budget', 0, { total: 20000 + n * 100, guests: households, lines: [], split: {} })).status, tag).toBe(200);
      const key = `k${n}`.padEnd(24, 'x');
      expect((await put(w, '/planner/doc/checklist', 0, { helpers: [{ id: 'h1', name: 'Mum', key }], tasks: [{ id: 't1', text: 'Order the cake', before: 30, helper: 'h1' }] })).status, tag).toBe(200);
      expect((await put(w, '/planner/doc/day-checklist/wedding', 0, { p1: [{ text: 'Collect the rings', time: '10:30am', phase: 'morning', id: 'r1', helper: 'h1' }], p2: [], both: [] })).status, tag).toBe(200);
      const helper = await read<{ tasks: unknown[]; day: { id: string }[] }>(await pub(w, `/tasks?k=${key}`));
      expect(helper.tasks, tag).toHaveLength(1);
      expect(helper.day.map((x) => x.id), tag).toEqual(['r1']);
      expect((await pub(w, `/tasks/cal/${key}.ics`)).status, tag).toBe(200);

      // A wedding party member added straight in joins the guest list.
      const added = await post(w, '/planner/people', { name: `Riley Party${n}`, mobile: '', role: pick(['Bridesmaid', 'Groomsman', 'MC']) });
      expect(added.status, `${tag} party`).toBe(201);
      expect((await overview(w)).total, tag).toBe(households + 1);
    }

    // Deleting a guest takes them off everything.
    const gone = g0.list[0]!;
    expect((await del(w, `/guests/${gone.id}`)).status, tag).toBe(200);
    const after = await guests(w);
    expect(after.list.some((g) => g.id === gone.id), tag).toBe(false);
    const s3 = await seating(w);
    expect(s3.people.some((p) => gone.people.some((x) => x.id === p.id)), tag).toBe(false);

    // Private: nothing without a guest's own link; their own link works.
    const shut = await pub(w, '/invite');
    expect(shut.status, tag).toBe(404);
    const someone = after.list[0];
    if (someone) expect((await pub(w, `/invite?g=${after.token(someone)}`)).status, tag).toBe(200);
    return w;
  };

  for (let batch = 0; batch < 10; batch++) {
    it(`weddings ${batch * 10 + 1}–${batch * 10 + 10}: everything adds up, nothing breaks, and no wedding sees another`, { timeout: 300_000 }, async () => {
      const made: W[] = [];
      for (let k = 0; k < 10; k++) made.push(await run(batch * 10 + k));
      // Isolation: each couple's session is turned away from the next wedding.
      for (let k = 0; k < made.length; k++) {
        const other = made[(k + 1) % made.length]!;
        for (const path of ['/overview', '/guests', '/seating', '/planner/doc/budget']) {
          const res = await send(`/a/w/${other.id}${path}`, {}, made[k]!.cookie);
          expect([403, 404], `${path} of another wedding`).toContain(res.status);
        }
      }
      healthy();
    });
  }
});
