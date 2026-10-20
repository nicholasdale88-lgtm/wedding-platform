import { allPayments, isSerious, splitDiet, type Budget, type PlanChecklist, type PartySide, type Vendors } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { testD1 } from './support/d1';

/**
 * Launch system check: fifteen weddings, each signed up from the front page and run the way real couples
 * use the app (imports, replies, seating, the planner, quote requests, the wedding party, privacy, deleting
 * and restoring), through the real routes and a real (miniflare) D1. Each scenario is its own wedding (or
 * two), on a fresh database. Every scenario checks that the figures add up and that nothing answered 5xx.
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
/** Distinct Australian mobiles: 0420000000, 0420000001… */
const mobile = (i: number) => `04${String(20000000 + i).padStart(8, '0')}`;
/** A tiny, distinct JPEG (the photo routes check the first bytes). */
const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n & 255, (n >> 8) & 255, 0x4a, 0x46, 0x49, 0x46]);

const FIRST = ['Olivia', 'Jack', 'Charlotte', 'William', 'Amelia', 'Noah', 'Isla', 'Thomas', 'Mia', 'James', 'Ava', 'Lucas', 'Grace', 'Henry', 'Chloe', 'Oliver', 'Matilda', 'Leo', 'Zoe', 'Hugo', 'Ruby', 'Archie', 'Harper', 'Lachlan', 'Sienna'];
const LAST = ['Smith', 'Nguyen', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Anderson', 'Martin', 'Kelly', 'Murphy'];
const PARTNERS = ['Sam', 'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie'];
/** 250 distinct main names: "Olivia Smith"… */
const nameOf = (i: number) => `${FIRST[i % 25]!} ${LAST[Math.floor(i / 25) % 10]!}`;
const partnerOf = (i: number) => `${PARTNERS[i % 8]!} ${LAST[Math.floor(i / 25) % 10]!}`;

type Plan = 'free' | 'essentials' | 'complete';
type Init = { method?: string; body?: string | Uint8Array; headers?: Record<string, string> };
type W = { id: string; slug: string; cookie: string; email: string };
type SignupForm = { firstName: string; partnerName: string; email: string; date: string };
type ImportRow = { people: string[]; phone?: string; seats?: number; party?: string; invited?: string[] };
type ImportResult = { added: number; skipped: unknown[]; problems: unknown[] };
type ApiError = { error: { code: string; message: string; feature?: string } };
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
type EventRow = { id: string; key: string; name: string; venue: string; catered: boolean; version: number; invited: number; coming: number };
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
type Doc<T> = { data: T; version: number };
type Conflict<T> = ApiError & { current: Doc<T> };
type InvitePage = {
  events: { key: string; name: string }[];
  invitation: { people: { name: string; diet: string }[]; invited: string[]; rsvp: Record<string, { attending: boolean | null; count: number }>; message: string } | null;
};
type PhotoList = { enabled: boolean; items: { id: string; by: string; url: string; event: string | null }[] };
type Campaigns = { campaigns: { id: string; name: string; body: string; version: number }[] };

describe('launch scenarios: fifteen weddings run the way couples use the app', () => {
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
  /** Send in waves of `size` at once (all of a wave concurrently). */
  const inWaves = async <T>(items: T[], size: number, fn: (x: T, i: number) => Promise<Response>) => {
    const out: Response[] = [];
    for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map((x, j) => fn(x, i + j)))));
    return out;
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
  const events = async (w: W) => {
    const r = await admin(w, '/events');
    expect(r.status).toBe(200);
    return (await read<{ events: EventRow[] }>(r)).events;
  };
  const doc = async <T>(w: W, kind: string, cookie = w.cookie) => {
    const r = await admin(w, `/planner/doc/${kind}`, {}, cookie);
    expect(r.status).toBe(200);
    return read<Doc<T>>(r);
  };
  const seating = async (w: W) => {
    const r = await admin(w, '/seating');
    expect(r.status).toBe(200);
    return read<SeatView>(r);
  };
  const pagesVersion = async (w: W) => (await read<{ version: number }>(await admin(w, '/pages'))).version;
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

  // ------------------------------------------------------------------------------------------------ 1
  it('1. a tiny elopement: two witnesses, one event, Free, no texts', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Mia', partnerName: 'Theo', email: 'mia.theo@example.com', date: day(45) });
    await importRows(w, [{ people: ['Grace Lin'], phone: '0412 555 101' }, { people: ['Oliver Brandt'] }]);
    expect((await events(w)).map((e) => e.key)).toEqual(['wedding']);

    const { list, token, byName } = await guests(w);
    expect(list).toHaveLength(2);
    for (const [i, g] of list.entries()) {
      expect((await rsvp(w, token(g), { events: { wedding: { attending: true } }, message: 'So happy for you both!' }, ipOf(100 + i))).status).toBe(200);
    }
    const ov = await overview(w);
    expect(ov.wedding).toMatchObject({ plan: 'free', name1: 'Mia', name2: 'Theo', monogram: 'M&T', private: true });
    expect(ov).toMatchObject({ total: 2, replied: 2, awaiting: 0, yesInv: 2, noInv: 0, seatsHeld: 2 });
    expect(ov.events).toEqual([expect.objectContaining({ key: 'wedding', coming: 2 })]);
    expect(ov.perEvent).toEqual([expect.objectContaining({ key: 'wedding', invited: 2, yes: 2, no: 0, awaiting: 0, coming: 2 })]);
    expect(ov.latest.map((x) => x.message)).toEqual(['So happy for you both!', 'So happy for you both!']);
    expect((await events(w))[0]).toMatchObject({ invited: 2, coming: 2 });

    // No texts on Free: a test or a send asks to upgrade, and nothing is ever queued.
    const test = await post(w, '/texts/test', { body: 'Testing our texts' });
    expect(test.status).toBe(402);
    expect((await read<ApiError>(test)).error).toMatchObject({ code: 'upgrade', feature: 'texts' });
    const tx = await read<Campaigns>(await admin(w, '/texts'));
    for (const cp of tx.campaigns) expect((await post(w, `/texts/${cp.id}/send`, {})).status).toBe(402);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM sms_out WHERE wedding_id = ?`).bind(w.id).first<{ n: number }>())!.n).toBe(0);

    // Grace's own link shows her reply.
    const page = await read<InvitePage>(await pub(w, `/invite?g=${token(byName.get('Grace Lin')!)}`));
    expect(page.invitation).toMatchObject({ people: [expect.objectContaining({ name: 'Grace Lin' })], invited: ['wedding'], rsvp: { wedding: { attending: true, count: 1 } }, message: 'So happy for you both!' });
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 2
  it('2. Free reaches its 50-guest limit (402), asks to upgrade, is moved to Essentials and keeps adding', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Sophie', partnerName: 'Daniel', email: 'sophie.daniel@example.com', date: day(200) });
    await importRows(w, Array.from({ length: 50 }, (_, i) => ({ people: [nameOf(i)], phone: mobile(i) })));
    expect(await overview(w)).toMatchObject({ total: 50, seatsHeld: 50 });

    // The 51st person, one at a time or by import, asks to upgrade; nothing is added.
    const one = await post(w, '/guests', {});
    expect(one.status).toBe(402);
    expect((await read<ApiError>(one)).error).toMatchObject({ code: 'upgrade', feature: 'unlimitedGuests' });
    const more = await post(w, '/guests/import', { rows: [{ people: ['Late Addition'] }, { people: ['Another Late', 'Plus One'] }] });
    expect(more.status).toBe(402);
    expect((await read<ApiError>(more)).error.feature).toBe('unlimitedGuests');
    expect((await overview(w)).total).toBe(50);
    // Seating is an Essentials feature too.
    const s0 = await seating(w);
    expect((await put(w, '/seating', s0.version, { event: 'wedding', aspect: '4 / 3', tables: [], areas: [], seats: {} })).status).toBe(402);

    // Asking to upgrade is noted; the platform owner switches it on.
    expect((await post(w, '/plan/request', { plan: 'essentials' })).status).toBe(200);
    expect((await overview(w)).wedding).toMatchObject({ plan: 'free', planRequested: 'essentials' });
    expect((await send('/a/super/plan', { method: 'PUT', body: JSON.stringify({ slug: w.slug, plan: 'complete' }) }, w.cookie)).status).toBe(403); // not the couple
    await upgrade(w, 'essentials');
    expect((await overview(w)).wedding).toMatchObject({ plan: 'essentials', planRequested: '' });

    // Now more fit: 30 by import (some couples) and one by hand.
    const rows = Array.from({ length: 30 }, (_, i) => ({ people: i % 3 === 0 ? [nameOf(50 + i), partnerOf(50 + i)] : [nameOf(50 + i)], phone: mobile(50 + i) }));
    await importRows(w, rows);
    expect((await post(w, '/guests', {})).status).toBe(201);
    const people = 50 + rows.reduce((n, r) => n + r.people.length, 0) + 1;
    const ov = await overview(w);
    expect(ov).toMatchObject({ total: 81, seatsHeld: people, awaiting: 81, replied: 0 });
    expect(ov.nav.guests).toBe(81);
    expect(ov.perEvent[0]).toMatchObject({ invited: 81, awaiting: 81 });
    // And seating and texts are open (texts now only need the couple's own mobile).
    const s1 = await seating(w);
    expect((await put(w, '/seating', s1.version, { event: 'wedding', aspect: '4 / 3', tables: [table('Table 1', 0)], areas: [], seats: {} })).status).toBe(200);
    const test = await post(w, '/texts/test', { body: 'Testing' });
    expect(test.status).toBe(400);
    expect((await read<ApiError>(test)).error.code).toBe('no_mobile');
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 3
  it('3. a big wedding: 250 invitations imported in batches, everyone replies yes or no, the totals match', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Charlotte', partnerName: 'Lachlan', email: 'charlotte.lachlan@example.com', date: day(240) });
    await upgrade(w, 'essentials');
    const rows: ImportRow[] = Array.from({ length: 250 }, (_, i) => ({
      people: i % 3 === 0 ? [nameOf(i), partnerOf(i)] : [nameOf(i)],
      ...(i % 9 === 0 ? {} : { phone: mobile(i) }),
      party: i % 2 ? "Charlotte's side" : "Lachlan's side",
    }));
    for (let b = 0; b < rows.length; b += 50) await importRows(w, rows.slice(b, b + 50));
    // The first spreadsheet again adds nobody.
    const again = await read<ImportResult>(await post(w, '/guests/import', { rows: rows.slice(0, 50) }));
    expect(again.added).toBe(0);
    expect(again.skipped).toHaveLength(50);

    const { list, token } = await guests(w);
    expect(list).toHaveLength(250);
    const people = rows.reduce((n, r) => n + r.people.length, 0);
    expect(list.reduce((n, g) => n + g.people.length, 0)).toBe(people);

    const random = rng(250);
    const plans = list.map((g, n) => ({ g, yes: random() < 0.78, ip: ipOf(3000 + n) }));
    const res = await inWaves(plans, 25, (p) => rsvp(w, token(p.g), { events: { wedding: { attending: p.yes } }, count: p.g.people.length }, p.ip));
    expect(res.map((r) => r.status).filter((s) => s !== 200), faults.slice(0, 3).join(' | ')).toEqual([]);

    const yes = plans.filter((p) => p.yes);
    const coming = yes.reduce((n, p) => n + p.g.people.length, 0);
    const ov = await overview(w);
    expect(ov).toMatchObject({ total: 250, replied: 250, awaiting: 0, yesInv: yes.length, noInv: 250 - yes.length, seatsHeld: people });
    expect(ov.events).toEqual([expect.objectContaining({ key: 'wedding', coming })]);
    expect(ov.perEvent[0]).toMatchObject({ key: 'wedding', invited: 250, yes: yes.length, no: 250 - yes.length, awaiting: 0, coming });
    expect((await events(w))[0]).toMatchObject({ key: 'wedding', invited: 250, coming: yes.length });
    // Every reply stored as given.
    const after = await guests(w);
    const want = new Map(plans.map((p) => [p.g.id, p.yes]));
    expect(after.list.filter((g) => g.rsvp.wedding?.attending !== want.get(g.id)).map((g) => g.people[0]!.name)).toEqual([]);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 4
  it('4. a two-event weekend: the wedding and a recovery brunch, invited separately, counted per event', { timeout: 90_000 }, async () => {
    const date = day(180);
    const w = await signup({ firstName: 'Amelia', partnerName: 'Hugo', email: 'amelia.hugo@example.com', date });
    // Free includes one event: a second asks for the add-on, then works once it's paid for.
    const early = await post(w, '/events', { name: 'Recovery brunch', startsAt: `${day(181)}T00:00:00.000Z` });
    expect(early.status).toBe(402);
    expect((await read<ApiError>(early)).error).toMatchObject({ code: 'upgrade', feature: 'extraEvent' });
    expect((await events(w)).length).toBe(1);
    await upgrade(w, 'essentials');
    const ev = await post(w, '/events', { name: 'Recovery brunch', startsAt: `${day(181)}T00:00:00.000Z`, venue: 'The Boathouse, Palm Beach', catered: false });
    expect(ev.status).toBe(201);
    expect((await read<{ added: string }>(ev)).added).toBe('recovery-brunch');
    const BRUNCH = 'recovery-brunch';
    expect((await events(w)).map((e) => [e.key, e.venue, e.catered])).toEqual([
      ['wedding', '', true],
      [BRUNCH, 'The Boathouse, Palm Beach', false],
    ]);

    // Eight to the wedding only, eight to both, eight (the out-of-towners' friends) to the brunch only.
    const sets = [['wedding'], ['wedding', BRUNCH], [BRUNCH]];
    const rows: ImportRow[] = Array.from({ length: 24 }, (_, i) => ({ people: i % 3 === 1 ? [nameOf(i), partnerOf(i)] : [nameOf(i)], invited: sets[Math.floor(i / 8)]! }));
    await importRows(w, rows);
    const { list, token, byName } = await guests(w);
    expect(list).toHaveLength(24);

    // Each replies per event they're invited to (three never reply).
    type Ans = { g: Guest; events: Record<string, { attending: boolean }> };
    const answers: Ans[] = [];
    rows.forEach((r, n) => {
      if (n % 8 === 7) return;
      const g = byName.get(r.people[0]!)!;
      expect([...g.invited].sort()).toEqual([...r.invited!].sort());
      answers.push({ g, events: Object.fromEntries(g.invited.map((k, e) => [k, { attending: (n + e) % 3 !== 0 }])) });
    });
    const res = await inWaves(answers, 10, (a, i) => rsvp(w, token(a.g), { events: a.events, count: a.g.people.length }, ipOf(400 + i)));
    expect(res.map((r) => r.status)).toEqual(res.map(() => 200));

    // An answer only for an event they're not invited to is refused; one with extra events keeps only theirs.
    const weddingOnly = byName.get(rows[0]!.people[0]!)!;
    expect((await rsvp(w, token(weddingOnly), { events: { [BRUNCH]: { attending: true } } }, ipOf(450))).status).toBe(400);
    const extra = answers.find((a) => a.g.id === weddingOnly.id)!;
    expect((await rsvp(w, token(weddingOnly), { events: { ...extra.events, [BRUNCH]: { attending: true } }, count: 1 }, ipOf(451))).status).toBe(200);

    // Per event: invited, yes, no, still waiting, people coming.
    const by = new Map(answers.map((a) => [a.g.id, a]));
    const want = ['wedding', BRUNCH].map((key) => {
      const inv = list.filter((g) => g.invited.includes(key));
      const yes = inv.filter((g) => by.get(g.id)?.events[key]?.attending === true);
      const no = inv.filter((g) => by.get(g.id)?.events[key]?.attending === false);
      return { key, invited: inv.length, yes: yes.length, no: no.length, awaiting: inv.length - yes.length - no.length, coming: yes.reduce((n, g) => n + g.people.length, 0) };
    });
    expect(want.map((x) => x.invited)).toEqual([16, 16]);
    const ov = await overview(w);
    expect(ov.perEvent.map(({ key, invited, yes, no, awaiting, coming }) => ({ key, invited, yes, no, awaiting, coming }))).toEqual(want);
    expect(ov.events.map(({ key, coming }) => ({ key, coming }))).toEqual(want.map(({ key, coming }) => ({ key, coming })));
    expect(ov).toMatchObject({ total: 24, awaiting: 3, replied: 21 });
    expect(ov.perEvent.find((e) => e.key === BRUNCH)!.diet).toBe(0); // not catered
    expect((await events(w)).map(({ key, invited, coming }) => ({ key, invited, coming }))).toEqual(want.map(({ key, invited, yes }) => ({ key, invited, coming: yes })));
    // Each event focused on its own: only its guests.
    const brunchOv = await read<Overview>(await admin(w, `/overview?event=${BRUNCH}`));
    expect(brunchOv).toMatchObject({ total: 16, awaiting: want[1]!.awaiting, yesInv: want[1]!.yes });

    // A brunch-only guest sees only the brunch.
    const brunchOnly = byName.get(rows[16]!.people[0]!)!;
    const page = await read<InvitePage>(await pub(w, `/invite?g=${token(brunchOnly)}`));
    expect(page.events.map((e) => e.key)).toEqual([BRUNCH]);
    expect(page.invitation!.invited).toEqual([BRUNCH]);
    expect(Object.keys(page.invitation!.rsvp)).toEqual([BRUNCH]);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 5
  it('5. a private wedding: pages 404 without a guest link, open with one, then switched public', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Isla', partnerName: 'Marcus', email: 'isla.marcus@example.com', date: day(120) });
    const other = await signup({ firstName: 'Ruby', partnerName: 'Leo', email: 'ruby.leo@example.com', date: day(130) });
    await importRows(w, [{ people: ['Harriet Cole', 'Ned Cole'], phone: '0413 222 333' }]);
    const { list, token } = await guests(w);
    const tok = token(list[0]!);
    expect((await overview(w)).wedding.private).toBe(true);

    for (const path of ['/invite', '/save-the-date', '/photos', '/calendar/wedding.ics']) expect((await pub(w, path)).status, path).toBe(404);
    expect((await read<ApiError>(await pub(w, '/invite'))).error.code).toBe('private');
    expect((await pub(w, `/invite?g=${'A'.repeat(22)}`)).status).toBe(404); // a made-up link
    expect((await send(`/p/${w.slug}/invite`, {}, other.cookie)).status).toBe(404); // another couple's session
    // With the guest's own link.
    const page = await pub(w, `/invite?g=${tok}`);
    expect(page.status).toBe(200);
    expect((await read<InvitePage>(page)).invitation!.people.map((p) => p.name)).toEqual(['Harriet Cole', 'Ned Cole']);
    expect(await read<{ guest: string }>(await pub(w, `/save-the-date?g=${tok}`))).toMatchObject({ guest: 'Harriet' });
    expect(await read<{ linked: boolean }>(await pub(w, `/photos?g=${tok}`))).toMatchObject({ linked: true });
    // The couple, signed in, previewing.
    expect((await send(`/p/${w.slug}/invite`, {}, w.cookie)).status).toBe(200);
    expect((await rsvp(w, tok, { events: { wedding: { attending: true } }, count: 2 }, ipOf(500))).status).toBe(200);

    // Switched public: open to anyone with the address.
    expect((await put(w, '/privacy', 0, { private: false })).status).toBe(200);
    expect((await overview(w)).wedding.private).toBe(false);
    for (const path of ['/invite', '/save-the-date', '/photos', '/calendar/wedding.ics']) expect((await pub(w, path)).status, path).toBe(200);
    const open = await read<InvitePage>(await pub(w, '/invite'));
    expect(open.invitation).toBeNull(); // the public page never shows a guest's details
    expect((await overview(w))).toMatchObject({ total: 1, yesInv: 1, seatsHeld: 2 });
    expect((await overview(w)).events[0]!.coming).toBe(2);
    // The other wedding is still private.
    expect((await send(`/p/${other.slug}/invite`)).status).toBe(404);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 6
  it('6. seating: tables, everyone who said yes seated, versions A and B, A made current, published, the guide shows the table', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Grace', partnerName: 'Henry', email: 'grace.henry@example.com', date: day(150) });
    await upgrade(w, 'essentials');
    // The night-before guide first (it shares the wedding's version with seating).
    const guide = { style: 'reception', date: 'Saturday evening', address: 'Bendooley Estate, 3020 Old Hume Highway, Berrima NSW', arrive: '3:30pm', start: '4:00pm' };
    expect((await put(w, '/pages', await pagesVersion(w), { guides: { wedding: guide } })).status).toBe(200);

    const rows: ImportRow[] = Array.from({ length: 20 }, (_, i) => ({ people: i % 2 === 0 ? [nameOf(i), partnerOf(i)] : [nameOf(i)], phone: mobile(600 + i) }));
    await importRows(w, rows);
    const { token, byName } = await guests(w);
    // 16 say yes, 2 say no, 2 haven't replied.
    for (const [i, r] of rows.entries()) {
      if (i >= 18) continue;
      const g = byName.get(r.people[0]!)!;
      expect((await rsvp(w, token(g), { events: { wedding: { attending: i < 16 } }, count: g.people.length }, ipOf(600 + i))).status).toBe(200);
    }
    const yesPeople = rows.slice(0, 16).reduce((n, r) => n + r.people.length, 0);

    const v0 = await seating(w);
    expect(v0.event.key).toBe('wedding');
    const coming = v0.people.filter((p) => p.coming);
    expect(coming).toHaveLength(yesPeople);
    expect(v0.people.filter((p) => !p.coming)).toHaveLength(rows.slice(18).reduce((n, r) => n + r.people.length, 0)); // awaiting, shown but not seatable
    const tables = ['Table 1', 'Table 2', 'Table 3', 'Table 4'].map(table);
    const areas = [{ label: 'Dance floor', x: 40, y: 75, w: 20, h: 15 }];
    const seatsA = Object.fromEntries(coming.map((p, k) => [p.id, tables[k % 4]!.id]));
    const seatsB = Object.fromEntries(coming.map((p, k) => [p.id, tables[(k + 1) % 4]!.id]));
    const save = (version: number, seats: Record<string, string>) => put(w, '/seating', version, { event: 'wedding', aspect: '4 / 3', tables, areas, seats });

    // Someone who hasn't replied can't have a seat.
    const silent = v0.people.find((p) => !p.coming)!;
    const refused = await save(v0.version, { ...seatsA, [silent.id]: tables[0]!.id });
    expect(refused.status).toBe(400);
    expect((await read<ApiError>(refused)).error.code).toBe('not_coming');

    // Version A: saved and named.
    const a = await save(v0.version, seatsA);
    expect(a.status).toBe(200);
    const afterA = await read<SeatView>(a);
    expect(Object.fromEntries(afterA.people.filter((p) => p.coming).map((p) => [p.id, p.tableId]))).toEqual(seatsA);
    expect((await save(v0.version, seatsA)).status).toBe(409); // a stale copy
    const vA = await read<SeatView>(await post(w, '/seating/versions', { event: 'wedding', name: 'Family draft' }));
    const idA = vA.versions.find((x) => x.name === 'Family draft')!.id;
    expect(vA.current).toMatchObject({ id: idA, changes: 0 });
    expect(vA.versions.find((x) => x.id === idA)).toMatchObject({ tables: 4, seated: yesPeople });

    // Version B: everyone moved one table along.
    const b = await save(vA.version, seatsB);
    expect(b.status).toBe(200);
    const afterB = await read<SeatView>(b);
    expect(afterB.current).toMatchObject({ id: idA, changes: yesPeople }); // every seat differs from A
    const vB = await read<SeatView>(await post(w, '/seating/versions', { event: 'wedding', name: 'Friends mixed' }));
    const idB = vB.versions.find((x) => x.name === 'Friends mixed')!.id;
    expect(vB.versions).toHaveLength(2);
    expect(vB.current!.id).toBe(idB);
    const lookA = await read<{ name: string; seats: Record<string, string> }>(await admin(w, `/seating/versions/${idA}`));
    expect(lookA).toMatchObject({ name: 'Family draft', seats: seatsA });

    // A becomes the current arrangement, then is published.
    expect((await admin(w, `/seating/versions/${idA}/current`, { method: 'POST', headers: { 'If-Match': String(vB.version - 1) }, body: '{}' })).status).toBe(409);
    const cur = await admin(w, `/seating/versions/${idA}/current`, { method: 'POST', headers: { 'If-Match': String(vB.version) }, body: '{}' });
    expect(cur.status).toBe(200);
    const current = await read<SeatView>(cur);
    expect(current.current).toMatchObject({ id: idA, name: 'Family draft', changes: 0 });
    expect(Object.fromEntries(current.people.filter((p) => p.coming).map((p) => [p.id, p.tableId]))).toEqual(seatsA);
    const pubd = await admin(w, '/seating/publish', { method: 'POST', headers: { 'If-Match': String(current.version) }, body: JSON.stringify({ event: 'wedding' }) });
    expect(pubd.status).toBe(200);
    expect((await read<SeatView>(pubd)).published).toMatchObject({ changes: 0 });

    const ov = await overview(w);
    expect(ov.perEvent[0]).toMatchObject({ yes: 16, no: 2, awaiting: 2, coming: yesPeople, seated: yesPeople });
    expect(ov.needsYou.find((n) => n.kind === 'unseated')).toBeUndefined();

    // A couple who said yes: their guide shows their tables (version A) and their tablemates.
    const pair = byName.get(rows[0]!.people[0]!)!;
    const gd = await pub(w, `/guide?g=${token(pair)}`);
    expect(gd.status).toBe(200);
    const g = await read<{ guest: { attending: boolean | null; people: { name: string; tableId: string | null }[] }; seating: { tables: { id: string; name: string }[] } | null; mates: Record<string, string[]> }>(gd);
    const mine = v0.people.filter((p) => p.invitationId === pair.id);
    expect(g.guest.attending).toBe(true);
    expect(g.guest.people.map((p) => p.tableId)).toEqual(mine.map((p) => seatsA[p.id]));
    expect(g.seating!.tables.map((x) => x.name).sort()).toEqual(['Table 1', 'Table 2', 'Table 3', 'Table 4']);
    for (const tid of new Set(mine.map((p) => seatsA[p.id]!))) {
      const mates = coming.filter((p) => seatsA[p.id] === tid && p.invitationId !== pair.id).map((p) => p.name).sort();
      expect(g.mates[tid]).toEqual(mates);
    }
    // Someone who said no has no table.
    const declined = byName.get(rows[16]!.people[0]!)!;
    const no = await read<{ guest: { attending: boolean | null; people: { tableId: string | null }[] } }>(await pub(w, `/guide?g=${token(declined)}`));
    expect(no.guest.attending).toBe(false);
    expect(no.guest.people.every((p) => p.tableId === null)).toBe(true);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 7
  it('7. budget and vendors: lines, quotes, one booked, and its payments appear', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Matilda', partnerName: 'Archie', email: 'matilda.archie@example.com', date: day(300) });
    await upgrade(w, 'essentials');
    const budget = {
      total: 45000,
      guests: 90,
      lines: [
        { category: 'Venue and catering', item: 'Venue hire', estimate: 12000, quote: 11500, paid: 2000, due: day(20), vendor: 'Bendooley Estate' },
        { category: 'Photography and video', item: 'Photographer', estimate: 4500, vendor: 'Lumen Photography' },
        { category: 'Flowers and styling', item: 'Bridal bouquet and arbour', estimate: 2500, quote: 2200, due: day(40), vendor: 'Willow & Wren Florals' },
        { category: 'Music', item: 'DJ', estimate: 1800 }, // an estimate is a plan, not a bill
      ],
    };
    const b1 = await put(w, '/planner/doc/budget', 0, budget);
    expect(b1.status).toBe(200);
    expect((await read<Doc<Budget>>(b1)).version).toBe(1);
    expect((await put(w, '/planner/doc/budget', 0, budget)).status).toBe(409); // already made

    const quote = (id: string, amount: number, deposit: number, includes: string) => ({ id, amount, deposit, date: day(-10), validUntil: day(60), includes });
    const vendors = {
      list: [
        { id: 'v-bend', name: 'Bendooley Estate', category: 'Venue', status: 'quoted', contact: 'Events team', phone: '02 4877 2235', quotes: [quote('q-bend', 11500, 2000, 'Exclusive use, ceremony lawn, reception barn')] },
        { id: 'v-lumen', name: 'Lumen Photography', category: 'Photographer', status: 'quoted', quotes: [quote('q-lumen-8', 4200, 1000, '8 hours, online gallery'), quote('q-lumen-10', 5100, 1000, '10 hours and an album')] },
        { id: 'v-willow', name: 'Willow & Wren Florals', category: 'Florist', status: 'quoted', quotes: [quote('q-willow', 2200, 500, 'Bouquet, arbour, buttonholes')] },
      ],
    };
    expect((await put(w, '/planner/doc/vendors', 0, vendors)).status).toBe(200);
    const v1 = await doc<Vendors>(w, 'vendors');
    expect(v1.data.list.map((v) => [v.name, v.quotes.length])).toEqual([['Bendooley Estate', 1], ['Lumen Photography', 2], ['Willow & Wren Florals', 1]]);
    // Nothing booked: no vendor payments, no contracts to chase.
    expect((await overview(w)).needsYou.find((n) => n.kind === 'contracts')).toBeUndefined();

    // Book the photographer on the 8-hour quote: deposit paid, balance due in ten days.
    const lumen = v1.data.list.find((v) => v.id === 'v-lumen')!;
    lumen.status = 'booked';
    lumen.accepted = 'q-lumen-8';
    lumen.payments = [
      { id: 'deposit', label: 'Deposit', amount: 1000, due: day(-5), paid: true, paidOn: day(-5) },
      { id: 'balance', label: 'Balance', amount: 3200, due: day(10), paid: false, paidOn: '' },
    ];
    const booked = await put(w, '/planner/doc/vendors', v1.version, v1.data);
    expect(booked.status).toBe(200);
    expect((await put(w, '/planner/doc/vendors', v1.version, v1.data)).status).toBe(409);

    // The whole-wedding payments: the photographer's schedule, and each budget line that's agreed.
    const b = await doc<Budget>(w, 'budget');
    const v = await doc<Vendors>(w, 'vendors');
    expect(b.data.lines.map((l) => l.item)).toEqual(['Venue hire', 'Photographer', 'Bridal bouquet and arbour', 'DJ']);
    const pays = allPayments(b.data.lines, v.data.list).map((p) => `${p.who}|${p.label}|${p.amount}|${p.due}|${p.paid}`).sort();
    expect(pays).toEqual(
      [
        `Lumen Photography|Deposit|1000|${day(-5)}|true`,
        `Lumen Photography|Balance|3200|${day(10)}|false`,
        'Venue hire|Paid so far|2000||true',
        `Venue hire|Balance|9500|${day(20)}|false`,
        `Bridal bouquet and arbour|Payment|2200|${day(40)}|false`,
      ].sort(),
    );
    const owing = allPayments(b.data.lines, v.data.list).filter((p) => !p.paid).reduce((n, p) => n + p.amount, 0);
    expect(owing).toBe(3200 + 9500 + 2200);

    // Overview: the balance due within a fortnight, and the contract still to sign.
    const ov = await overview(w);
    expect(ov.needsYou.find((n) => n.kind === 'payments-due')).toMatchObject({ title: '1 payment due in the next fortnight', detail: 'Lumen Photography $3200' });
    expect(ov.needsYou.find((n) => n.kind === 'contracts')).toMatchObject({ title: '1 booked vendor has no signed contract', detail: 'Lumen Photography' });

    // Contract signed and the balance paid: both clear.
    const v2 = await doc<Vendors>(w, 'vendors');
    const l2 = v2.data.list.find((x) => x.id === 'v-lumen')!;
    l2.contractSigned = day(0);
    l2.payments = l2.payments.map((p) => ({ ...p, paid: true, paidOn: day(0) }));
    expect((await put(w, '/planner/doc/vendors', v2.version, v2.data)).status).toBe(200);
    const ov2 = await overview(w);
    expect(ov2.needsYou.find((n) => n.kind === 'contracts')).toBeUndefined();
    expect(ov2.needsYou.find((n) => n.kind === 'payments-due')).toBeUndefined();
    const v3 = await doc<Vendors>(w, 'vendors');
    expect(allPayments(b.data.lines, v3.data.list).filter((p) => !p.paid).reduce((n, p) => n + p.amount, 0)).toBe(9500 + 2200);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 8
  it('8. a quote request to three florists: each answers on their own link, one is booked, a list-only save keeps the request', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Ruby', partnerName: 'Archie', email: 'ruby.archie@example.com', date: day(260) });
    await upgrade(w, 'essentials');
    await importRows(w, [{ people: ['Nell Grant', 'Owen Grant'] }, { people: ['Pia Rossi', 'Dom Rossi'] }, { people: ['Kit Shaw', 'Lou Shaw'] }]);
    const gl = await guests(w);
    expect((await rsvp(w, gl.token(gl.byName.get('Kit Shaw')!), { events: { wedding: { attending: false } } }, ipOf(800))).status).toBe(200);

    const keys = { 'v-willow': 'rfq-willow-7f3a9c2e1b5d4a60', 'v-bloom': 'rfq-bloom-2c8e6f1a9d3b5e47', 'v-fern': 'rfq-fern-5b1d9e3c7a2f4e88' } as const;
    const florist = (id: string, name: string) => ({ id, name, category: 'Florist', status: 'requested', askedOn: day(-2), quoteBy: day(10) });
    const lines = [
      { id: 'l1', label: 'Bridal bouquet', detail: 'Garden roses, white and blush' },
      { id: 'l2', label: 'Bridesmaid bouquets (x3)', detail: '' },
      { id: 'l3', label: 'Ceremony arbour arrangement', detail: 'Asymmetric, native foliage' },
      { id: 'l4', label: 'Table centrepieces (x12)', detail: '' },
    ];
    const vendorsDoc = {
      list: [florist('v-willow', 'Willow & Wren Florals'), florist('v-bloom', 'Bloom Room'), florist('v-fern', 'Fern & Field Flowers')],
      rfqs: [
        {
          id: 'rfq-flowers', title: 'Wedding flowers', service: 'florist', lines, due: day(10), subject: 'Quote request: our wedding flowers',
          message: 'Hi! We are getting married next year and would love a quote for the flowers below.',
          vendors: Object.entries(keys).map(([vendorId, key]) => ({ vendorId, key, sentOn: day(-2) })), createdOn: day(-2),
        },
      ],
    };
    expect((await put(w, '/planner/doc/vendors', 0, vendorsDoc)).status).toBe(200);

    // Each florist opens their link: what's asked, for whom, about how many guests.
    type RfqPage = { couple: string; vendor: string; title: string; lines: { id: string; label: string }[]; guests: number; closed: boolean; answer: { amount: number; lines: { id: string; amount: number | null }[] } | null };
    const names = { 'v-willow': 'Willow & Wren Florals', 'v-bloom': 'Bloom Room', 'v-fern': 'Fern & Field Flowers' } as const;
    const prices: Record<keyof typeof keys, (number | null)[]> = { 'v-willow': [350, 540, 900, null], 'v-bloom': [420, 600, 1100, 960], 'v-fern': [300, 450, 850, 720] };
    const ids = Object.keys(keys) as (keyof typeof keys)[];
    for (const [n, id] of ids.entries()) {
      const r = await pub(w, `/rfq?k=${keys[id]}`, {}, ipOf(810 + n));
      expect(r.status).toBe(200);
      expect(await read<RfqPage>(r)).toMatchObject({ couple: 'Ruby & Archie', vendor: names[id], title: 'Wedding flowers', guests: 4, closed: false, answer: null, lines: lines.map((l) => expect.objectContaining({ id: l.id, label: l.label })) });
    }
    const answer = (id: keyof typeof keys, p: (number | null)[], n: number) =>
      pub(w, '/rfq', { method: 'POST', body: JSON.stringify({ k: keys[id], lines: lines.map((l, i) => ({ id: l.id, amount: p[i] ?? null })), deposit: 300, validUntil: day(30), includes: 'Delivery and set-up', excludes: p.includes(null) ? 'Centrepieces' : '' }) }, ipOf(820 + n));
    for (const [n, id] of ids.entries()) expect((await answer(id, prices[id], n)).status).toBe(200);
    // Willow sharpens their price (a new answer replaces their last).
    prices['v-willow'] = [330, 520, 880, 700];
    expect((await answer('v-willow', prices['v-willow'], 5)).status).toBe(200);

    const total = (p: (number | null)[]) => p.reduce<number>((a, x) => a + (x ?? 0), 0);
    const d1 = await doc<Vendors>(w, 'vendors');
    for (const id of ids) {
      const v = d1.data.list.find((x) => x.id === id)!;
      expect(v.status).toBe('quoted');
      expect(v.quotes).toHaveLength(1);
      expect(v.quotes[0]).toMatchObject({ rfq: 'rfq-flowers', amount: total(prices[id]), deposit: 300, lines: lines.map((l, i) => ({ id: l.id, amount: prices[id][i] ?? null })) });
      const rv = d1.data.rfqs[0]!.vendors.find((x) => x.vendorId === id)!;
      expect(rv.quoteId).toBe(v.quotes[0]!.id);
      expect(rv.openedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rv.answeredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // Booked: Fern & Field; the others declined; the request closed.
    const fern = d1.data.list.find((x) => x.id === 'v-fern')!;
    fern.status = 'booked';
    fern.accepted = fern.quotes[0]!.id;
    for (const x of d1.data.list) if (x.id !== 'v-fern') Object.assign(x, { status: 'declined', declinedWhy: 'Went with another florist' });
    d1.data.rfqs[0]!.closed = true;
    expect((await put(w, '/planner/doc/vendors', d1.version, d1.data)).status).toBe(200);
    // A late answer is refused; the page says it's decided and shows what they sent.
    const late = await answer('v-bloom', [1, 1, 1, 1], 6);
    expect(late.status).toBe(409);
    expect((await read<ApiError>(late)).error.code).toBe('closed');
    expect(await read<RfqPage>(await pub(w, `/rfq?k=${keys['v-bloom']}`, {}, ipOf(830)))).toMatchObject({ closed: true, answer: { amount: total(prices['v-bloom']) } });

    // A save of the vendor list alone (Payments, Checklist) keeps the quote request exactly as it was.
    const d2 = await doc<Vendors>(w, 'vendors');
    const list = d2.data.list.map((x) => (x.id === 'v-fern' ? { ...x, notes: 'Confirmed: delivery to the venue at 1pm' } : x));
    expect((await put(w, '/planner/doc/vendors', d2.version, { list })).status).toBe(200);
    const d3 = await doc<Vendors>(w, 'vendors');
    expect(d3.data.rfqs).toEqual(d2.data.rfqs);
    expect(d3.data.list.find((x) => x.id === 'v-fern')!.notes).toBe('Confirmed: delivery to the venue at 1pm');
    expect(d3.data.list.filter((x) => x.status === 'booked').map((x) => x.name)).toEqual(['Fern & Field Flowers']);

    // Made-up and short keys go nowhere.
    expect((await pub(w, `/rfq?k=${'z'.repeat(24)}`, {}, ipOf(831))).status).toBe(404);
    expect((await pub(w, '/rfq?k=short', {}, ipOf(832))).status).toBe(404);
    expect((await pub(w, '/rfq', { method: 'POST', body: JSON.stringify({ k: 'z'.repeat(24), lines: [] }) }, ipOf(833))).status).toBe(404);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 9
  it('9. last-minute changes: allowed before the close date, refused after it (403), a first late reply still counts', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Ava', partnerName: 'Noah', email: 'ava.noah@example.com', date: day(60) });
    const email = 'rsvp@avaandnoah.example';
    expect((await put(w, '/pages', await pagesVersion(w), { invitation: { rsvpClose: day(14), rsvpEmail: email } })).status).toBe(200);
    const rows = Array.from({ length: 12 }, (_, i) => ({ people: [nameOf(100 + i)], phone: mobile(900 + i) }));
    await importRows(w, rows);
    const { token, byName } = await guests(w);
    const g = (i: number) => byName.get(rows[i]!.people[0]!)!;
    const answers = new Map<number, boolean>();
    const say = async (i: number, yes: boolean, ip: number) => {
      const r = await rsvp(w, token(g(i)), { events: { wedding: { attending: yes } } }, ipOf(ip));
      if (r.status === 200) answers.set(i, yes);
      return r;
    };
    // Nine reply; three don't.
    for (let i = 0; i < 9; i++) expect((await say(i, i % 3 !== 0, 900 + i)).status).toBe(200);
    // Before the close: four change their minds.
    for (let i = 0; i < 4; i++) expect((await say(i, !answers.get(i), 920 + i)).status).toBe(200);
    const stored = async () => new Map((await guests(w)).list.map((x) => [x.people[0]!.name, x.rsvp.wedding?.attending ?? null]));
    let now = await stored();
    for (const [i, yes] of answers) expect(now.get(rows[i]!.people[0]!)).toBe(yes);

    // The close date passes.
    expect((await put(w, '/pages', await pagesVersion(w), { invitation: { rsvpClose: day(-1), rsvpEmail: email } })).status).toBe(200);
    const change = await say(4, !answers.get(4), 940);
    expect(change.status).toBe(403);
    const closed = await read<ApiError>(change);
    expect(closed.error.code).toBe('closed');
    expect(closed.error.message).toContain(email);
    now = await stored();
    expect(now.get(rows[4]!.people[0]!)).toBe(answers.get(4));
    // A first late reply still counts; changing it after is refused.
    expect((await say(9, true, 941)).status).toBe(200);
    expect((await say(9, false, 942)).status).toBe(403);
    // The couple can still record a change for a guest who rang them.
    const g4 = (await guests(w)).byName.get(rows[4]!.people[0]!)!;
    const fix = await put(w, `/guests/${g4.id}/rsvp`, g4.version, { events: { wedding: { attending: !answers.get(4) } } });
    expect(fix.status).toBe(200);
    answers.set(4, !answers.get(4)!);
    expect((await put(w, `/guests/${g4.id}/rsvp`, g4.version, { events: { wedding: { attending: true } } })).status).toBe(409); // stale

    now = await stored();
    for (const [i, yes] of answers) expect(now.get(rows[i]!.people[0]!), rows[i]!.people[0]).toBe(yes);
    const yes = [...answers.values()].filter(Boolean).length;
    const ov = await overview(w);
    expect(ov).toMatchObject({ total: 12, replied: 10, awaiting: 2, yesInv: yes, noInv: 10 - yes });
    expect(ov.perEvent[0]).toMatchObject({ yes, no: 10 - yes, awaiting: 2, coming: yes });
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 10
  it('10. dietary chaos: many diets through the RSVP, and the dietary figures in the overview and the guest list add up', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Harper', partnerName: 'Oliver', email: 'harper.oliver@example.com', date: day(90) });
    type Diner = { people: string[]; diet: string; reply: 'yes' | 'no' | 'none'; count?: number };
    const diners: Diner[] = [
      { people: ['Priya Sharma', 'Arjun Sharma'], diet: 'Priya vegetarian; Arjun coeliac', reply: 'yes' },
      { people: ['Sophie Turner'], diet: 'Severe peanut allergy, carries an EpiPen', reply: 'yes' },
      { people: ['Ben Carter', 'Lily Carter'], diet: 'Lily is vegan', reply: 'yes' },
      { people: ['Marco Rossi'], diet: 'No pork please', reply: 'yes' },
      { people: ['Hannah Lee', 'Daniel Lee'], diet: 'Daniel: lactose intolerant. Hannah: pregnant, no soft cheese', reply: 'yes' },
      { people: ['Ahmed Khan'], diet: 'Halal', reply: 'yes' },
      { people: ['Ella Brooks'], diet: 'Shellfish allergy (anaphylaxis)', reply: 'no' },
      { people: ['Tom Price', 'Kate Price'], diet: 'Kate gluten free', reply: 'yes', count: 1 }, // only Tom can come
      { people: ['Ruby Walsh'], diet: '', reply: 'yes' },
      { people: ['George Hill'], diet: 'Vegetarian', reply: 'yes' },
      { people: ['Isabelle Fraser'], diet: 'Coeliac', reply: 'yes' },
      { people: ['Noah Bennett', 'Ivy Bennett'], diet: 'Noah - no seafood, Ivy - vegetarian', reply: 'yes' },
      { people: ['Leah Morgan'], diet: 'Dairy free and egg free', reply: 'yes' },
      { people: ['Sam Ortiz'], diet: 'Kosher', reply: 'none' },
      { people: ['Grace Dunn', 'Paul Dunn'], diet: 'Grace: tree nut allergy; Paul: low FODMAP', reply: 'yes' },
    ];
    await importRows(w, diners.map((d) => ({ people: d.people })));
    const { token, byName } = await guests(w);
    for (const [i, d] of diners.entries()) {
      if (d.reply === 'none') continue;
      const g = byName.get(d.people[0]!)!;
      const r = await rsvp(w, token(g), { events: { wedding: { attending: d.reply === 'yes' } }, count: d.count ?? d.people.length, diet: d.diet }, ipOf(1000 + i));
      expect(r.status).toBe(200);
    }
    // Isabelle tells them later it was a mistake.
    const isabelle = diners.find((d) => d.people[0] === 'Isabelle Fraser')!;
    expect((await rsvp(w, token(byName.get('Isabelle Fraser')!), { events: { wedding: { attending: true } }, diet: '' }, ipOf(1100))).status).toBe(200);
    isabelle.diet = '';

    // Stored per person: split by name; cleared for anyone who declined everything; nothing for no reply.
    const want = (d: Diner) => (d.reply === 'yes' ? splitDiet(d.diet, d.people) : d.people.map(() => ''));
    const after = await guests(w);
    for (const d of diners) expect(after.byName.get(d.people[0]!)!.people.map((p) => p.diet), d.people[0]).toEqual(want(d));
    expect(splitDiet('Priya vegetarian; Arjun coeliac', ['Priya Sharma', 'Arjun Sharma'])).toEqual(['Vegetarian', 'Coeliac']);

    // Dietary figures: people coming (the first `count` on each invitation) who have a requirement.
    const coming = diners.filter((d) => d.reply === 'yes').flatMap((d) => want(d).slice(0, d.count ?? d.people.length));
    const withNeeds = coming.filter((x) => x.trim());
    const ov = await overview(w);
    expect(ov.diet).toEqual({ people: withNeeds.length, serious: withNeeds.filter((x) => isSerious(x)).length, mealsSet: 0 });
    expect(ov.nav.dietary).toBe(withNeeds.length);
    expect(ov.perEvent[0]).toMatchObject({ coming: coming.length, diet: withNeeds.length });
    expect(withNeeds.length).toBeGreaterThan(10);
    expect(ov.needsYou.find((n) => n.kind === 'meals')).toMatchObject({ title: `${withNeeds.length} dietary meals not set` });

    // The kitchen's answer for Sophie: one meal set.
    const sophie = after.byName.get('Sophie Turner')!.people[0]!;
    expect((await put(w, `/people/${sophie.id}/meal`, 0, { entree: 'Nut-free bruschetta', main: 'Grilled barramundi', dessert: 'Mango sorbet' })).status).toBe(200);
    const ov2 = await overview(w);
    expect(ov2.diet.mealsSet).toBe(1);
    expect(ov2.needsYou.find((n) => n.kind === 'meals')).toMatchObject({ title: `${withNeeds.length - 1} dietary meals not set` });
    // A 501-character note is refused, and changes nothing.
    expect((await rsvp(w, token(byName.get('Ruby Walsh')!), { events: { wedding: { attending: true } }, diet: 'x'.repeat(501) }, ipOf(1101))).status).toBe(400);
    expect((await overview(w)).diet.people).toBe(withNeeds.length);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 11
  it('11. concurrency: two admins save the same planner document at once; one gets 409 and nothing is lost after a retry', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Zoe', partnerName: 'Lucas', email: 'zoe.lucas@example.com', date: day(330) });
    await upgrade(w, 'essentials');
    // The couple's planner joins as an editor, on their own account.
    const inv = await post(w, '/members/invite', { email: 'jordan.planner@example.com', role: 'editor' });
    expect(inv.status).toBe(200);
    const t1 = new URL((await read<{ link: string }>(inv)).link).searchParams.get('t')!;
    const joined = await send(`/a/invite/${t1}`, { method: 'POST', body: JSON.stringify({ passcode: 'planner-pass-2027', firstName: 'Jordan' }) }, '', '198.51.100.20');
    expect(joined.status).toBe(200);
    const planner = (joined.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect(planner).not.toBe(w.cookie);

    type Task = { id: string; text: string; before: number; legal?: boolean; done?: boolean };
    const save = (cookie: string, version: number, tasks: Task[]) => put(w, '/planner/doc/checklist', version, { tasks, helpers: [] }, cookie);
    const mine: Task[] = [
      { id: 'a1', text: 'Book the celebrant', before: 365 },
      { id: 'a2', text: 'Lodge the Notice of Intended Marriage', before: 40, legal: true },
    ];
    const theirs: Task[] = [{ id: 'b1', text: 'Order the wedding cake', before: 120 }];

    // Round 1: both create the checklist at the same moment.
    const [r1, r2] = await Promise.all([save(w.cookie, 0, mine), save(planner, 0, theirs)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const loser = r1.status === 409 ? { res: r1, cookie: w.cookie, tasks: mine } : { res: r2, cookie: planner, tasks: theirs };
    const winnerTasks = r1.status === 409 ? theirs : mine;
    const conflict = await read<Conflict<PlanChecklist>>(loser.res);
    expect(conflict.error.code).toBe('conflict');
    expect(conflict.current.version).toBe(1);
    expect(conflict.current.data.tasks.map((x) => x.id)).toEqual(winnerTasks.map((x) => x.id));
    // The loser's page reloads and makes their change again on top.
    const retry = await save(loser.cookie, conflict.current.version, [...conflict.current.data.tasks, ...loser.tasks]);
    expect(retry.status).toBe(200);
    const d2 = await doc<PlanChecklist>(w, 'checklist');
    expect(d2.version).toBe(2);
    expect(d2.data.tasks.map((x) => x.id).sort()).toEqual(['a1', 'a2', 'b1']);

    // Round 2: from the same copy, one ticks a task while the other adds one.
    const ticked = d2.data.tasks.map((x) => (x.id === 'a1' ? { ...x, done: true, status: 'done' as const, doneOn: day(0) } : x));
    const added = [...d2.data.tasks, { id: 'b2', text: 'Send the save the dates', before: 300, done: false, note: '', legal: false, owner: '' as const, helper: '', status: 'todo' as const, doneOn: '' }];
    const [s1, s2] = await Promise.all([put(w, '/planner/doc/checklist', d2.version, { tasks: ticked, helpers: [] }), put(w, '/planner/doc/checklist', d2.version, { tasks: added, helpers: [] }, planner)]);
    expect([s1.status, s2.status].sort()).toEqual([200, 409]);
    const lost = s1.status === 409 ? s1 : s2;
    const cur = (await read<Conflict<PlanChecklist>>(lost)).current;
    const redo = s1.status === 409 ? cur.data.tasks.map((x) => (x.id === 'a1' ? { ...x, done: true, status: 'done' as const, doneOn: day(0) } : x)) : [...cur.data.tasks, added[added.length - 1]!];
    expect((await put(w, '/planner/doc/checklist', cur.version, { tasks: redo, helpers: [] }, s1.status === 409 ? w.cookie : planner)).status).toBe(200);
    const d4 = await doc<PlanChecklist>(w, 'checklist', planner);
    expect(d4.version).toBe(4);
    expect(d4.data.tasks.map((x) => x.id).sort()).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(d4.data.tasks.find((x) => x.id === 'a1')!.done).toBe(true);
    // A copy from before any of this can't overwrite it.
    expect((await save(w.cookie, 1, mine)).status).toBe(409);

    // The same at the budget: two saves at once, exactly one wins, the retry keeps both lines.
    const line = (item: string, estimate: number) => ({ category: 'Venue and catering', item, estimate });
    const [p1, p2] = await Promise.all([
      put(w, '/planner/doc/budget', 0, { total: 60000, lines: [line('Venue hire', 15000)] }),
      put(w, '/planner/doc/budget', 0, { total: 60000, lines: [line('Catering', 18000)] }, planner),
    ]);
    expect([p1.status, p2.status].sort()).toEqual([200, 409]);
    const bl = (await read<Conflict<Budget>>(p1.status === 409 ? p1 : p2)).current;
    const mineLine = p1.status === 409 ? line('Venue hire', 15000) : line('Catering', 18000);
    expect((await put(w, '/planner/doc/budget', bl.version, { ...bl.data, lines: [...bl.data.lines, mineLine] }, p1.status === 409 ? w.cookie : planner)).status).toBe(200);
    const b = await doc<Budget>(w, 'budget');
    expect(b.data.lines.map((l) => l.item).sort()).toEqual(['Catering', 'Venue hire']);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 12
  it("12. the wedding party: roles on guests, side tasks for one person, each member's page shows their own", { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Chloe', partnerName: 'William', email: 'chloe.william@example.com', date: day(210) });
    const crew = [
      ['Lucy Martin', 'Maid of honour'],
      ['Sienna Park', 'Bridesmaid'],
      ['Jack Wilson', 'Best man'],
      ['Liam Nguyen', 'Groomsman'],
    ] as const;
    await importRows(w, [...crew.map(([name], i) => ({ people: [name], phone: mobile(1200 + i) })), { people: ['Aunty Margaret Bloom'] }]);
    const { token, byName } = await guests(w);
    const pid = (name: string) => byName.get(name)!.people[0]!.id;
    for (const [name, role] of crew) {
      const r = await put(w, `/planner/people/${pid(name)}/role`, 0, { role });
      expect(r.status).toBe(200);
    }
    const party = await read<{ members: { personId: string; name: string; role: string; side: string; token: string | null }[] }>(await admin(w, '/planner/party'));
    expect(party.members.map((m) => [m.name, m.role, m.side]).sort()).toEqual([
      ['Jack Wilson', 'Best man', 'p2'],
      ['Liam Nguyen', 'Groomsman', 'p2'],
      ['Lucy Martin', 'Maid of honour', 'p1'],
      ['Sienna Park', 'Bridesmaid', 'p1'],
    ]);
    expect(party.members.every((m) => !!m.token)).toBe(true);

    // Each side's to-dos: some for one person, some for the whole side.
    const p1 = { tasks: [
      { id: 't1', text: 'Book the hens weekend in the Hunter Valley', person: pid('Lucy Martin'), due: day(30) },
      { id: 't2', text: 'Collect the bridesmaid dresses', person: '', due: day(45) },
      { id: 't3', text: 'Organise the bridal shower games', person: pid('Sienna Park'), due: day(60) },
    ] };
    const p2 = { tasks: [
      { id: 'g1', text: 'Pick up the suits from the tailor', person: pid('Jack Wilson'), due: day(50) },
      { id: 'g2', text: 'Plan the bucks night', person: pid('Liam Nguyen'), due: day(40) },
    ] };
    expect((await put(w, '/planner/doc/party-p1', 0, p1)).status).toBe(200);
    expect((await put(w, '/planner/doc/party-p2', 0, p2)).status).toBe(200);

    type PartyPage = { mine: { personId: string; name: string; role: string; tasks: { id: string; text: string; done: boolean; mine: boolean }[] }[]; me: { name: string; role: string }[] };
    const page = async (name: string, ip: number) => {
      const r = await pub(w, `/party?g=${token(byName.get(name)!)}`, {}, ipOf(ip));
      expect(r.status, name).toBe(200);
      return read<PartyPage>(r);
    };
    const tasksOf = (p: PartyPage) => p.mine[0]!.tasks.map((x) => [x.id, x.mine]);
    const lucy = await page('Lucy Martin', 1210);
    expect(lucy.me).toEqual([{ name: 'Lucy Martin', role: 'Maid of honour' }]);
    expect(tasksOf(lucy)).toEqual([['t1', true], ['t2', false]]);
    expect(tasksOf(await page('Sienna Park', 1211))).toEqual([['t2', false], ['t3', true]]);
    expect(tasksOf(await page('Jack Wilson', 1212))).toEqual([['g1', true]]);
    expect(tasksOf(await page('Liam Nguyen', 1213))).toEqual([['g2', true]]);
    // Not in the party: no page.
    const aunt = await pub(w, `/party?g=${token(byName.get('Aunty Margaret Bloom')!)}`, {}, ipOf(1214));
    expect(aunt.status).toBe(404);
    expect((await read<ApiError>(aunt)).error.code).toBe('not_party');

    // Lucy ticks hers off; she can't tick the groom's side's, nor Sienna's.
    const act = (name: string, body: Record<string, unknown>, ip: number) => pub(w, '/party', { method: 'POST', body: JSON.stringify({ token: token(byName.get(name)!), personId: pid(name), ...body }) }, ipOf(ip));
    expect((await act('Lucy Martin', { action: 'task', id: 't1', done: true }, 1215)).status).toBe(200);
    expect((await act('Lucy Martin', { action: 'task', id: 'g1', done: true }, 1216)).status).toBe(404);
    expect((await act('Lucy Martin', { action: 'task', id: 't3', done: true }, 1217)).status).toBe(404);
    expect((await act('Lucy Martin', { personId: pid('Jack Wilson'), action: 'task', id: 'g1', done: true }, 1218)).status).toBe(403); // someone else's person
    const side1 = await doc<PartySide>(w, 'party-p1');
    expect(side1.version).toBe(2);
    expect(side1.data.tasks.map((x) => [x.id, x.done])).toEqual([['t1', true], ['t2', false], ['t3', false]]);
    expect((await doc<PartySide>(w, 'party-p2')).data.tasks.every((x) => !x.done)).toBe(true);
    expect((await page('Lucy Martin', 1219)).mine[0]!.tasks.find((x) => x.id === 't1')!.done).toBe(true);

    // Sienna steps down: her page closes.
    expect((await put(w, `/planner/people/${pid('Sienna Park')}/role`, 0, { role: '' })).status).toBe(200);
    expect((await pub(w, `/party?g=${token(byName.get('Sienna Park')!)}`, {}, ipOf(1220))).status).toBe(404);
    expect((await read<{ members: unknown[] }>(await admin(w, '/planner/party'))).members).toHaveLength(3);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 13
  it('13. hostile input everywhere: emoji, 10k-character notes, HTML, SQL-looking strings and unicode are kept verbatim or refused with a 4xx', { timeout: 90_000 }, async () => {
    // The couple's own names.
    expect((await send('/a/signup', { method: 'POST', body: JSON.stringify({ firstName: 'x'.repeat(10_000), partnerName: 'Sam', email: 'long@example.com', passcode: PASSCODE, date: day(100) }) }, '', '192.0.2.200')).status).toBe(400);
    const name1 = 'Zoë 🌸';
    const name2 = "D'Arcy <b>&amp;</b>";
    const w = await signup({ firstName: name1, partnerName: name2, email: 'zoe.darcy@example.com', date: day(100) });
    await upgrade(w, 'essentials');
    expect((await overview(w)).wedding).toMatchObject({ name1, name2 });

    const NAMES = [
      '🌸 Zoë 👨‍👩‍👧 Ñandú',
      '<img src=x onerror=alert(1)> Ava',
      "Robert'); DROP TABLE invitation;--",
      'مريم القحطاني',
      '李小龍 たなか',
      'O\'Connor "Mac" \\ Smith',
      '${7*7} {{constructor}} %s %n',
      '../../etc/passwd',
    ];
    const LONG = 'x'.repeat(10_000);
    // A 10k-character name is refused (the whole file), nobody added.
    expect((await post(w, '/guests/import', { rows: [{ people: ['Fine Name'] }, { people: [LONG] }] })).status).toBe(400);
    expect((await overview(w)).total).toBe(0);
    await importRows(w, NAMES.map((n) => ({ people: [n] })));
    const { list, token, byName } = await guests(w);
    expect(list.map((g) => g.people[0]!.name).sort()).toEqual([...NAMES].sort());

    // Replies with hostile messages and answers: kept exactly (the message is trimmed only).
    const unit = '<script>alert("hi")</script> 🌸 \'; DROP TABLE rsvp;-- ';
    const MESSAGE = unit.repeat(Math.floor(990 / unit.length)); // with " #n" added, still under the 1,000 limit
    const ANSWERS = { song: '🎶 "Bohemian Rhapsody" <3', note: "1' OR '1'='1" };
    for (const [i, n] of NAMES.entries()) {
      const r = await rsvp(w, token(byName.get(n)!), { events: { wedding: { attending: true } }, message: `${MESSAGE.trim()} #${i}`, count: 1 }, ipOf(1300 + i));
      expect(r.status, n).toBe(200);
    }
    const target = byName.get(NAMES[2]!)!;
    expect((await rsvp(w, token(target), { events: { wedding: { attending: true, answers: ANSWERS } }, message: LONG }, ipOf(1310))).status).toBe(400);
    expect((await rsvp(w, token(target), { events: { wedding: { attending: true } }, diet: LONG }, ipOf(1311))).status).toBe(400);
    expect((await rsvp(w, token(target), { events: { wedding: { attending: true, answers: ANSWERS } }, message: 'Fine' }, ipOf(1312))).status).toBe(200);
    expect((await rsvp(w, "'; DROP TABLE invitation;--xxxxxxxx", { events: { wedding: { attending: true } } }, ipOf(1313))).status).toBe(400);
    const after = await guests(w);
    for (const [i, n] of NAMES.entries()) {
      if (i === 2) continue;
      expect(after.byName.get(n)!.rsvp.wedding!.message).toBe(`${MESSAGE.trim()} #${i}`);
    }
    expect(after.byName.get(NAMES[2]!)!.rsvp.wedding).toMatchObject({ message: 'Fine', answers: ANSWERS });
    // The guest's own page shows their name exactly.
    for (const n of NAMES.slice(0, 3)) expect((await read<InvitePage>(await pub(w, `/invite?g=${token(byName.get(n)!)}`))).invitation!.people[0]!.name).toBe(n);
    expect((await overview(w))).toMatchObject({ total: NAMES.length, yesInv: NAMES.length });

    // Editing a guest: hostile names kept, a 10k name refused.
    const g0 = after.byName.get(NAMES[0]!)!;
    const edited = await admin(w, `/guests/${g0.id}`, { method: 'PATCH', headers: { 'If-Match': String(g0.version) }, body: JSON.stringify({ people: [NAMES[0], '<svg onload=alert(1)>'], party: '"; DELETE FROM person; --' }) });
    expect(edited.status).toBe(200);
    expect((await read<{ guest: Guest }>(edited)).guest).toMatchObject({ party: '"; DELETE FROM person; --', people: [expect.objectContaining({ name: NAMES[0] }), expect.objectContaining({ name: '<svg onload=alert(1)>' })] });
    expect((await admin(w, `/guests/${g0.id}`, { method: 'PATCH', headers: { 'If-Match': String(g0.version + 1) }, body: JSON.stringify({ people: [LONG] }) })).status).toBe(400);

    // Events.
    const evName = '🎉 After-party <i>late</i>';
    const ev = await post(w, '/events', { name: evName, startsAt: `${day(101)}T10:00:00.000Z`, venue: "Bar 'Ø' <Rooftop>" });
    expect(ev.status).toBe(201);
    const key = (await read<{ added: string }>(ev)).added;
    expect((await events(w)).find((e) => e.key === key)).toMatchObject({ name: evName, venue: "Bar 'Ø' <Rooftop>" });
    expect((await post(w, '/events', { name: LONG, startsAt: `${day(101)}T10:00:00.000Z` })).status).toBe(400);
    expect((await put(w, `/events/${encodeURIComponent("1' OR '1'='1")}`, 0, { name: 'Hacked' })).status).toBeLessThan(500);

    // The planner.
    const vUnit = '<b>Bold</b> 🌸 DROP TABLE vendors;-- ';
    const notes = vUnit.repeat(Math.floor(1500 / vUnit.length));
    const vendor = { id: 'v1', name: "Ñandú & Sons' <Catering> 🍽️", category: 'Catering', status: 'quoted', notes, quotes: [{ id: 'q1', amount: 9800, includes: '李 canapés; "mains" & <desserts>' }] };
    expect((await put(w, '/planner/doc/vendors', 0, { list: [{ ...vendor, notes: LONG }] })).status).toBe(400);
    expect((await put(w, '/planner/doc/vendors', 0, { list: [vendor] })).status).toBe(200);
    const vd = await doc<Vendors>(w, 'vendors');
    expect(vd.data.list[0]).toMatchObject({ name: vendor.name, notes, quotes: [expect.objectContaining({ includes: vendor.quotes[0]!.includes })] });
    expect((await put(w, '/planner/doc/budget', 0, { total: 1, lines: [{ category: '🍰 <Cake>', item: "Robert'); --", estimate: 900, note: LONG }] })).status).toBe(400);
    expect((await put(w, '/planner/doc/budget', 0, { total: 1, lines: [{ category: '🍰 <Cake>', item: "Robert'); --", estimate: 900 }] })).status).toBe(200);
    expect((await doc<Budget>(w, 'budget')).data.lines[0]).toMatchObject({ category: '🍰 <Cake>', item: "Robert'); --" });
    for (const kind of ['constructor', '__proto__', 'toString', "'; DROP TABLE planner_doc;--"]) {
      expect((await admin(w, `/planner/doc/${encodeURIComponent(kind)}`)).status, kind).toBe(404);
      expect((await put(w, `/planner/doc/${encodeURIComponent(kind)}`, 0, {})).status, kind).toBe(404);
    }
    expect((await put(w, `/planner/doc/budget/${encodeURIComponent("x'; --")}`, 0, { total: 1 })).status).toBe(404);

    // Texts: a message of their own.
    const textBody = 'Hi {first} 👋 <a href="javascript:alert(1)">RSVP</a> \'; DROP TABLE campaign;-- 李';
    expect((await post(w, '/texts', { name: 'x'.repeat(81), audience: { all: true } })).status).toBe(400);
    expect((await post(w, '/texts', { name: 'Reminder', audience: { all: true }, body: LONG })).status).toBe(400);
    const made = await post(w, '/texts', { name: 'Reminder 💌 <b>soon</b>', audience: { all: true }, body: textBody });
    expect(made.status).toBe(200);
    const cid = (await read<{ id: string }>(made)).id;
    expect((await read<Campaigns>(await admin(w, '/texts'))).campaigns.find((c) => c.id === cid)).toMatchObject({ name: 'Reminder 💌 <b>soon</b>', body: textBody });

    // Seating, the admin's name, and odd ids and queries.
    const s = await seating(w);
    const head = { ...table('<b>Head</b> 🍾 table', 0) };
    expect((await put(w, '/seating', s.version, { event: 'wedding', aspect: '4 / 3', tables: [head], areas: [{ label: "Dance 'floor' <div>", x: 1, y: 1, w: 10, h: 10 }], seats: {} })).status).toBe(200);
    expect((await seating(w)).tables.map((x) => x.name)).toEqual(['<b>Head</b> 🍾 table']);
    expect((await put(w, '/admin-name', 0, { name: '💍 Zoë & D’Arcy <3' })).status).toBe(200);
    expect((await overview(w)).wedding.adminName).toBe('💍 Zoë & D’Arcy <3');
    expect((await admin(w, `/guests/${encodeURIComponent("' OR '1'='1")}`)).status).toBe(404);
    expect((await del(w, `/guests/${encodeURIComponent("' OR 1=1 --")}`)).status).toBe(404);
    expect((await admin(w, `/overview?event=${encodeURIComponent('<script>')}`)).status).toBe(200);
    expect((await admin(w, `/seating?event=${encodeURIComponent("' OR 1=1")}`)).status).toBe(200);
    expect((await pub(w, '/find', { method: 'POST', body: JSON.stringify({ name: "' OR '1'='1" }) }, ipOf(1320))).status).toBe(404);
    expect((await pub(w, '/find', { method: 'POST', body: JSON.stringify({ name: LONG }) }, ipOf(1321))).status).toBe(400);
    // Broken bodies.
    expect((await admin(w, '/guests/import', { method: 'POST', body: '{"rows": [' })).status).toBe(400);
    expect((await admin(w, '/guests/import', { method: 'POST', body: 'rows=1', headers: { 'content-type': 'text/plain' } })).status).toBe(415);
    expect((await pub(w, '/rsvp', { method: 'POST', body: 'token=x', headers: { 'content-type': 'application/x-www-form-urlencoded' } }, ipOf(1322))).status).toBe(400);
    expect((await put(w, '/planner/doc/checklist', 0, null)).status).toBe(400);
    expect((await put(w, '/planner/doc/checklist', 0, [1, 2, 3])).status).toBe(400);

    // Nothing was lost along the way.
    const end = await guests(w);
    expect(end.list).toHaveLength(NAMES.length);
    expect((await overview(w))).toMatchObject({ total: NAMES.length, replied: NAMES.length });
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 14
  it('14. delete and restore: guests, an event and photos removed, counts drop, another wedding untouched', { timeout: 90_000 }, async () => {
    const w = await signup({ firstName: 'Matilda', partnerName: 'James', email: 'matilda.james@example.com', date: day(110) });
    const other = await signup({ firstName: 'Harper', partnerName: 'Leo', email: 'harper.leo@example.com', date: day(115) });
    await importRows(w, Array.from({ length: 10 }, (_, i) => ({ people: [nameOf(150 + i)], phone: mobile(1400 + i) })));
    await importRows(other, Array.from({ length: 5 }, (_, i) => ({ people: [nameOf(200 + i)] })));
    await upgrade(w, 'essentials'); // a second event is an add-on
    expect((await post(w, '/events', { name: 'Recovery brunch', startsAt: `${day(111)}T00:00:00.000Z`, inviteEveryone: true })).status).toBe(201);

    const { list, token } = await guests(w);
    for (const [i, g] of list.entries()) {
      expect((await rsvp(w, token(g), { events: { wedding: { attending: i !== 0 }, 'recovery-brunch': { attending: i % 2 === 0 } } }, ipOf(1400 + i))).status).toBe(200);
    }
    // Guests send photos to the album.
    for (const [i, g] of list.slice(0, 3).entries()) {
      const r = await pub(w, `/photos?g=${token(g)}&event=wedding`, { method: 'PUT', body: jpeg(i), headers: { 'content-type': 'image/jpeg', 'X-Photo-By': encodeURIComponent(g.people[0]!.name) } }, ipOf(1420 + i));
      expect(r.status).toBe(200);
    }
    const o = await guests(other);
    expect((await pub(other, `/photos?g=${o.token(o.list[0]!)}`, { method: 'PUT', body: jpeg(99), headers: { 'content-type': 'image/jpeg' } }, ipOf(1430))).status).toBe(200);

    // The other wedding, before.
    const snap = async () => ({
      guests: await read<GuestList>(await admin(other, '/guests')),
      overview: await overview(other),
      events: await events(other),
      photos: await read<PhotoList>(await admin(other, '/photos')),
    });
    const before = await snap();
    expect(before.photos.items).toHaveLength(1);

    const ov0 = await overview(w);
    expect(ov0).toMatchObject({ total: 10, replied: 10 });
    expect(ov0.perEvent.map((e) => [e.key, e.invited])).toEqual([['wedding', 10], ['recovery-brunch', 10]]);
    const photos0 = await read<PhotoList>(await admin(w, '/photos'));
    expect(photos0.items).toHaveLength(3);

    // Two guests removed.
    const [gone1, gone2] = [list[1]!, list[2]!];
    expect((await del(w, `/guests/${gone1.id}`)).status).toBe(200);
    expect((await del(w, `/guests/${gone2.id}`)).status).toBe(200);
    expect((await del(w, `/guests/${gone2.id}`)).status).toBe(404); // already gone
    const ov1 = await overview(w);
    expect(ov1).toMatchObject({ total: 8, replied: 8 });
    expect(ov1.nav.guests).toBe(8);
    expect(ov1.perEvent.map((e) => [e.key, e.invited])).toEqual([['wedding', 8], ['recovery-brunch', 8]]);
    expect((await events(w)).map((e) => e.invited)).toEqual([8, 8]);
    expect((await rsvp(w, token(gone1), { events: { wedding: { attending: true } } }, ipOf(1440))).status).toBe(404); // their link stops working
    // The brunch is cancelled.
    const brunch = (await events(w)).find((e) => e.key === 'recovery-brunch')!;
    expect((await del(w, `/events/${brunch.id}`, brunch.version + 1)).status).toBe(409);
    expect((await del(w, `/events/${brunch.id}`, brunch.version)).status).toBe(200);
    expect((await events(w)).map((e) => e.key)).toEqual(['wedding']);
    const ov2 = await overview(w);
    expect(ov2.perEvent.map((e) => e.key)).toEqual(['wedding']);
    expect(ov2).toMatchObject({ total: 8, replied: 8, awaiting: 0 });
    const page = await read<InvitePage>(await pub(w, `/invite?g=${token(list[3]!)}`));
    expect(page.invitation!.invited).toEqual(['wedding']);
    // The last event can't be removed.
    const wed = (await events(w))[0]!;
    expect((await del(w, `/events/${wed.id}`, wed.version)).status).toBe(400);
    // A photo removed.
    const photo = photos0.items[0]!;
    expect((await del(w, `/photos/${photo.id}`)).status).toBe(200);
    expect((await del(w, `/photos/${photo.id}`)).status).toBe(404);
    expect((await read<PhotoList>(await admin(w, '/photos'))).items).toHaveLength(2);
    expect((await send(photo.url.replace(/^\/api/, ''), {}, w.cookie)).status).toBe(404);

    // One guest restored, with their reply.
    const back = await admin(w, `/guests/${gone1.id}/restore`, { method: 'POST', body: '{}' });
    expect(back.status).toBe(200);
    expect((await read<{ guest: Guest }>(back)).guest.rsvp.wedding?.attending).toBe(true);
    expect((await admin(w, `/guests/${gone1.id}/restore`, { method: 'POST', body: '{}' })).status).toBe(404);
    const ov3 = await overview(w);
    expect(ov3).toMatchObject({ total: 9, replied: 9 });
    expect(ov3.yesInv).toBe(list.filter((g, i) => i !== 0 && g.id !== gone2.id).length);
    expect((await events(w))[0]!.invited).toBe(9);

    // The other wedding didn't notice any of it.
    expect(await snap()).toEqual(before);
    healthy();
  });

  // ------------------------------------------------------------------------------------------------ 15
  it("15. isolation: one couple's session can't read or change another wedding's guests, seating, planner or texts", { timeout: 90_000 }, async () => {
    const a = await signup({ firstName: 'Olivia', partnerName: 'Jack', email: 'olivia.jack@example.com', date: day(140) });
    const b = await signup({ firstName: 'Amelia', partnerName: 'William', email: 'amelia.william@example.com', date: day(145) });
    await upgrade(a, 'essentials');
    await upgrade(b, 'essentials');
    await importRows(a, [{ people: ['Alice Cooper'] }]);
    await importRows(b, Array.from({ length: 6 }, (_, i) => ({ people: [nameOf(i)], phone: mobile(1500 + i) })));
    const bg = await guests(b);
    for (const [i, g] of bg.list.entries()) expect((await rsvp(b, bg.token(g), { events: { wedding: { attending: true } } }, ipOf(1500 + i))).status).toBe(200);
    // B's seating, a version, planner, texts, an extra event and a photo.
    const s0 = await seating(b);
    const bt = [table('Table 1', 0), table('Table 2', 1)];
    const people = s0.people.filter((p) => p.coming);
    const saved = await put(b, '/seating', s0.version, { event: 'wedding', aspect: '4 / 3', tables: bt, areas: [], seats: Object.fromEntries(people.map((p, k) => [p.id, bt[k % 2]!.id])) });
    expect(saved.status).toBe(200);
    const bVer = (await read<SeatView>(await post(b, '/seating/versions', { event: 'wedding', name: 'Final' }))).versions[0]!.id;
    expect((await put(b, '/planner/doc/budget', 0, { total: 38000, lines: [{ category: 'Venue and catering', item: 'Venue hire', estimate: 14000 }] })).status).toBe(200);
    const bCampaign = (await read<{ id: string }>(await post(b, '/texts', { name: 'Shuttle times', audience: { all: true }, body: 'The shuttle leaves at 3pm.' }))).id;
    expect((await post(b, '/events', { name: 'Welcome drinks', startsAt: `${day(144)}T08:00:00.000Z` })).status).toBe(201);
    expect((await pub(b, `/photos?g=${bg.token(bg.list[0]!)}`, { method: 'PUT', body: jpeg(7), headers: { 'content-type': 'image/jpeg' } }, ipOf(1510))).status).toBe(200);
    const bPhoto = (await read<PhotoList>(await admin(b, '/photos'))).items[0]!.id;
    const bEvent = (await events(b)).find((e) => e.key === 'welcome-drinks')!;
    const bGuest = bg.list[0]!;
    const bTexts = async () => (await read<Campaigns>(await admin(b, '/texts'))).campaigns;
    const snapshot = async () => ({
      guests: await read<GuestList>(await admin(b, '/guests')),
      seating: await seating(b),
      budget: await doc<Budget>(b, 'budget'),
      texts: await bTexts(),
      events: await events(b),
      photos: await read<PhotoList>(await admin(b, '/photos')),
      overview: await overview(b),
    });
    const before = await snapshot();

    // A's session on B's wedding: every read and write is "not found" (403 at most), never B's data.
    const asA = a.cookie;
    const onB = (path: string, init: Init = {}) => admin(b, path, init, asA);
    const reads = ['/overview', '/guests', `/guests/${bGuest.id}`, '/seating', `/seating/versions/${bVer}`, '/planner/doc/budget', '/planner/party', '/texts', '/events', '/photos', '/pages', '/settings', '/settings/backup', '/members', '/insights'];
    for (const path of reads) {
      const r = await onB(path);
      expect([403, 404], path).toContain(r.status);
      expect(await r.text(), path).not.toContain(bGuest.people[0]!.name);
    }
    const writes: [string, Init][] = [
      ['/guests', { method: 'POST', body: '{}' }],
      ['/guests/import', { method: 'POST', body: JSON.stringify({ rows: [{ people: ['Intruder'] }] }) }],
      [`/guests/${bGuest.id}`, { method: 'PATCH', headers: { 'If-Match': String(bGuest.version) }, body: JSON.stringify({ people: ['Changed'] }) }],
      [`/guests/${bGuest.id}/rsvp`, { method: 'PUT', headers: { 'If-Match': String(bGuest.version) }, body: JSON.stringify({ events: { wedding: { attending: false } } }) }],
      [`/guests/${bGuest.id}`, { method: 'DELETE' }],
      ['/seating', { method: 'PUT', headers: { 'If-Match': String(before.seating.version) }, body: JSON.stringify({ event: 'wedding', aspect: '4 / 3', tables: [], areas: [], seats: {} }) }],
      ['/seating/versions', { method: 'POST', body: JSON.stringify({ event: 'wedding', name: 'Mine now' }) }],
      [`/seating/versions/${bVer}`, { method: 'DELETE' }],
      ['/seating/publish', { method: 'POST', headers: { 'If-Match': String(before.seating.version) }, body: JSON.stringify({ event: 'wedding' }) }],
      ['/planner/doc/budget', { method: 'PUT', headers: { 'If-Match': String(before.budget.version) }, body: JSON.stringify({ total: 1 }) }],
      [`/planner/people/${bGuest.people[0]!.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Best man' }) }],
      ['/texts', { method: 'POST', body: JSON.stringify({ name: 'Spam', audience: { all: true }, body: 'Spam' }) }],
      [`/texts/${bCampaign}`, { method: 'PATCH', headers: { 'If-Match': '1' }, body: JSON.stringify({ body: 'Changed' }) }],
      [`/texts/${bCampaign}`, { method: 'DELETE' }],
      [`/texts/${bCampaign}/send`, { method: 'POST', body: '{}' }],
      ['/events', { method: 'POST', body: JSON.stringify({ name: 'Intrusion', startsAt: `${day(10)}T08:00:00.000Z` }) }],
      [`/events/${bEvent.id}`, { method: 'DELETE', headers: { 'If-Match': String(bEvent.version) } }],
      [`/photos/${bPhoto}`, { method: 'DELETE' }],
      ['/privacy', { method: 'PUT', body: JSON.stringify({ private: false }) }],
      ['/plan/request', { method: 'POST', body: JSON.stringify({ plan: 'complete' }) }],
    ];
    for (const [path, init] of writes) expect([403, 404], `${init.method} ${path}`).toContain((await onB(path, init)).status);

    // A's own wedding, pointed at B's things by id: refused, B unchanged.
    const crossed: [string, Init, number[]][] = [
      [`/guests/${bGuest.id}`, {}, [404]],
      [`/guests/${bGuest.id}`, { method: 'PATCH', headers: { 'If-Match': String(bGuest.version) }, body: JSON.stringify({ people: ['Changed'] }) }, [404]],
      [`/guests/${bGuest.id}/rsvp`, { method: 'PUT', headers: { 'If-Match': String(bGuest.version) }, body: JSON.stringify({ events: { wedding: { attending: false } } }) }, [404]],
      [`/guests/${bGuest.id}`, { method: 'DELETE' }, [404]],
      [`/guests/${bGuest.id}/restore`, { method: 'POST', body: '{}' }, [404]],
      [`/people/${bGuest.people[0]!.id}/meal`, { method: 'PUT', body: JSON.stringify({ entree: 'x', main: 'x', dessert: 'x' }) }, [404]],
      [`/planner/people/${bGuest.people[0]!.id}/role`, { method: 'PUT', body: JSON.stringify({ role: 'Best man' }) }, [404]],
      [`/seating/versions/${bVer}`, {}, [404]],
      [`/seating/versions/${bVer}`, { method: 'PATCH', body: JSON.stringify({ name: 'Taken' }) }, [404]],
      [`/seating/versions/${bVer}`, { method: 'DELETE' }, [404]],
      [`/texts/${bCampaign}`, { method: 'PATCH', headers: { 'If-Match': '1' }, body: JSON.stringify({ body: 'Changed' }) }, [404]],
      [`/texts/${bCampaign}`, { method: 'DELETE' }, [400, 404]],
      [`/events/${bEvent.id}`, { method: 'PUT', headers: { 'If-Match': String(bEvent.version) }, body: JSON.stringify({ name: 'Taken' }) }, [404, 409]],
      // (A has one event, so this stops at "keep at least one event" before it looks at the id.)
      [`/events/${bEvent.id}`, { method: 'DELETE', headers: { 'If-Match': String(bEvent.version) } }, [400, 404, 409]],
      [`/photos/${bPhoto}`, {}, [404]],
      [`/photos/${bPhoto}`, { method: 'DELETE' }, [404]],
    ];
    for (const [path, init, ok] of crossed) expect(ok, `${init.method ?? 'GET'} ${path}`).toContain((await admin(a, path, init)).status);
    // B's tables can't be taken into A's seating plan.
    const sa = await seating(a);
    expect((await put(a, '/seating', sa.version, { event: 'wedding', aspect: '4 / 3', tables: bt, areas: [], seats: {} })).status).toBe(400);
    // B's guest link on A's address finds nothing.
    expect((await rsvp(a, bg.token(bGuest), { events: { wedding: { attending: false } } }, ipOf(1520))).status).toBe(404);
    expect((await pub(a, `/guide?g=${bg.token(bGuest)}`, {}, ipOf(1521))).status).toBe(404);
    expect((await send(`/p/${b.slug}/invite`, {}, asA)).status).toBe(404); // A's session isn't B's couple previewing

    // B is exactly as it was; A has only its own.
    expect(await snapshot()).toEqual(before);
    expect((await overview(a))).toMatchObject({ total: 1 });
    expect((await doc<Budget>(a, 'budget')).version).toBe(0);
    healthy();
  });
});
