import { allPayments, dateIn, inQuietHours, isSerious, type Budget, type PlanChecklist, type Vendors } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp, scheduled } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { bodyLimitFor } from '../src/lib/security';
import { receiveEmail } from '../src/routes/inbox';
import { buildSeed } from '../src/seed/build';
import type { EngineDeps } from '../src/sms/engine';
import { testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

/**
 * Launch stress pass: every feature with sample events, pushed to its limits through the real routes and a
 * real (miniflare) D1. Each test starts from a fresh database. Generic names only in the data made here.
 *
 * What is deliberately not done here (see the notes in each test):
 * - A vendors document at its schema maximum (200 vendors x 12 quotes x 12 payments) is bigger than the
 *   100 KB request body cap, so it cannot be saved through PUT /planner/doc/vendors. The test checks the
 *   save is refused cleanly (not a 500) and then writes the document straight to the database so the
 *   readers (overview, insights, calendar, reminders) can still be measured at full size.
 * - Overlapping cron runs are only checked for double sends where the daily cap can't be the limit
 *   (concurrent runs racing the cap is a suspected bug, reported rather than asserted).
 * - More than 300 payments due at once: once a known limit of the reminder memory, now fixed (tested below).
 */

/** Seeded PRNG so a failure always reproduces. */
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const OWNER = 'owner@example.com';
const PASS = 'valley-2027';
const TZ = 'Australia/Sydney';
/** Distinct Australian mobiles: 0410000000, 0410000001… */
const mobile = (i: number) => `04${String(10000000 + i).padStart(8, '0')}`;
/** A distinct client address per caller, so per-address rate limits don't stand in for the thing under test. */
const ipOf = (n: number) => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
/** A helper's private task-list key (20+ characters). */
const helperKey = (i: number) => `hk${String(i).padStart(3, '0')}${'x'.repeat(20)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** yyyy-mm-dd, n days from now. */
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

type ImportRow = { people: string[]; phone?: string; invited?: string[]; party?: string };
type G = { id: string; token: string; seats: number; party: string; version: number; name: string; invited: string[] };

describe('launch scale: every feature pushed hard', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  let slug = '';
  /** Every status any route returned in this test: none may be a 500. */
  const seen: number[] = [];
  // What the server logged for a 500 (its console.error), so a failure says why.
  const faults: string[] = [];
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const record = async (p: Response | Promise<Response>) => {
    const r = await p;
    seen.push(r.status);
    return r;
  };
  const api = (path: string, init: RequestInit = {}) =>
    record(app.request(`/api/a/w/${wid}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx));
  const pub = (path: string, init: RequestInit = {}, ip = 'local') =>
    record(app.request(`/api/p/${slug}${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, ...init.headers } }, env, ctx));
  // A guest's page tries again when the server says it's busy (503), as the real page does.
  const rsvp = async (token: string, body: Record<string, unknown>, ip: string) => {
    let r = await pub('/rsvp', { method: 'POST', body: JSON.stringify({ token, ...body }) }, ip);
    for (let i = 0; i < 4 && r.status === 503; i++) {
      await new Promise((ok) => setTimeout(ok, 200 * (i + 1)));
      r = await pub('/rsvp', { method: 'POST', body: JSON.stringify({ token, ...body }) }, ip);
    }
    return r;
  };
  const put = (path: string, version: number, data: unknown) => api(path, { method: 'PUT', headers: { 'If-Match': String(version) }, body: JSON.stringify(data) });
  /** Send in waves of `size` at once (all of a wave concurrently). */
  const inWaves = async <T>(items: T[], size: number, fn: (x: T) => Promise<Response>) => {
    const out: Response[] = [];
    for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
    return out;
  };

  const importRows = async (rows: ImportRow[]) => {
    const res = await api('/guests/import', { method: 'POST', body: JSON.stringify({ rows }) });
    const body = (await res.json()) as { added: number; problems: unknown[] };
    expect(res.status).toBe(200);
    expect(body.problems).toEqual([]);
    expect(body.added).toBe(rows.length);
  };
  const guestList = async (): Promise<G[]> => {
    const { results } = await t.db
      .prepare(
        `SELECT i.id, i.token, i.seats_held AS seats, i.party, i.version, p.name FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0
          WHERE i.wedding_id = ? AND i.deleted_at IS NULL ORDER BY p.name`,
      )
      .bind(wid)
      .all<Omit<G, 'invited'>>();
    const { results: ie } = await t.db
      .prepare(`SELECT ie.invitation_id AS id, e.key FROM invite_event ie JOIN event e ON e.id = ie.event_id AND e.deleted_at IS NULL ORDER BY e.sort`)
      .all<{ id: string; key: string }>();
    const by = new Map<string, string[]>();
    for (const r of ie) by.set(r.id, [...(by.get(r.id) ?? []), r.key]);
    return results.map((r) => ({ ...r, invited: by.get(r.id) ?? [] }));
  };
  const one = async <T>(sql: string, ...bind: unknown[]) => (await t.db.prepare(sql).bind(...bind).first<T>())!;

  beforeEach(async () => {
    seen.length = 0;
    faults.length = 0;
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void faults.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ').slice(0, 400)));
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: OWNER, ownerPassHash: await hashPasscode(PASS), sampleGuests: false });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    await t.db.prepare(`UPDATE wedding SET sms_sender = '+61400000999', admin_mobile = '+61412000777'`).run();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: OWNER, passcode: PASS }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    slug = (await one<{ slug: string }>(`SELECT slug FROM wedding WHERE id = ?`, wid)).slug;
  });
  afterEach(async () => {
    const crashed = seen.filter((s) => s >= 500 && s !== 503); // 503 is "busy, try again", not a fault
    await t.dispose();
    vi.restoreAllMocks();
    expect(crashed, faults.slice(0, 5).join(' | ')).toEqual([]);
  });

  // ------------------------------------------------------------------------------------------------ 1
  it('a large wedding: 5 events, 300 invitations (700 people), everyone replies, the figures add up exactly', { timeout: 120_000 }, async () => {
    const random = rng(2027);
    // Three more events through the events API.
    const added: string[] = [];
    for (const [name, startsAt] of [
      ['Recovery brunch', '2027-11-18T23:00:00.000Z'],
      ['Welcome drinks', '2027-11-17T08:00:00.000Z'],
      ['Birthday party', '2027-11-21T07:00:00.000Z'],
    ] as const) {
      const r = await api('/events', { method: 'POST', body: JSON.stringify({ name, startsAt }) });
      expect(r.status).toBe(201);
      added.push(((await r.json()) as { added: string }).added);
    }
    expect(added).toEqual(['recovery-brunch', 'welcome-drinks', 'birthday-party']);
    const [brunch, drinks, birthday] = added as [string, string, string];

    // 300 invitations, 700 people, mixed event lists and groups, some without a mobile, in one import.
    const sets = [['wedding'], ['wedding', '30th'], ['wedding', '30th', brunch, drinks, birthday], ['wedding', brunch, drinks], ['30th', birthday]];
    const groups = ['Side A', 'Side B', 'Work', ''];
    const rows: ImportRow[] = Array.from({ length: 300 }, (_, i) => ({
      people: Array.from({ length: i % 3 === 0 ? 3 : 2 }, (_, j) => (j === 0 ? `Guest${i} Family${i}` : `Plus${j} Family${i}`)),
      ...(i % 7 === 0 ? {} : { phone: mobile(i) }),
      invited: sets[i % 5]!,
      party: groups[i % 4]!,
    }));
    await importRows(rows);
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ?`, wid)).n).toBe(700);
    // Importing the same list again adds nobody.
    const again = (await (await api('/guests/import', { method: 'POST', body: JSON.stringify({ rows }) })).json()) as { added: number; skipped: unknown[] };
    expect(again.added).toBe(0);
    expect(again.skipped).toHaveLength(300);

    // Everyone answers on their own link: yes/no per event, a count (sometimes more than they hold), a diet, a note.
    const all = await guestList();
    expect(all).toHaveLength(300);
    type Plan = { g: G; events: Record<string, { attending: boolean }>; count: number; diet?: string; message?: string; ip: string };
    const diets = ['Vegetarian', 'Vegan', 'Coeliac', 'Severe nut allergy', 'No pork', ''];
    const silent: G[] = [];
    const first: Plan[] = [];
    all.forEach((g, n) => {
      if (random() < 0.08) {
        silent.push(g); // never replies
        return;
      }
      const events = Object.fromEntries(g.invited.map((k) => [k, { attending: random() < 0.7 }]));
      const diet = diets[Math.floor(random() * diets.length)]!;
      const message = random() < 0.2 ? `Can't wait! (${n})` : '';
      first.push({ g, events, count: 1 + Math.floor(random() * (g.seats + 1)), ...(diet ? { diet } : {}), ...(message ? { message } : {}), ip: ipOf(n) });
    });
    // Some change their mind: one event flipped, a new count.
    const second: Plan[] = first
      .filter(() => random() < 0.15)
      .map((p) => {
        const flip = p.g.invited[Math.floor(random() * p.g.invited.length)]!;
        return { ...p, events: { ...p.events, [flip]: { attending: !p.events[flip]!.attending } }, count: 1 + Math.floor(random() * p.g.seats) };
      });
    expect(second.length).toBeGreaterThan(10);
    const send = (p: Plan) =>
      rsvp(p.g.token, { events: p.events, count: p.count, ...(p.diet !== undefined ? { diet: p.diet } : {}), ...(p.message ? { message: p.message } : {}) }, p.ip);
    const r1 = await inWaves(first, 25, send);
    const r2 = await inWaves(second, 25, send);
    expect([...r1, ...r2].map((r) => r.status).filter((s) => s !== 200), faults.slice(0, 5).join(' | ')).toEqual([]);

    // The stored replies are exactly the last answer each guest gave (count held to the seats they have).
    const last = new Map<string, Plan>();
    for (const p of [...first, ...second]) last.set(p.g.id, p);
    const want = [...last.values()].flatMap((p) => p.g.invited.map((k) => `${p.g.id}|${k}|${p.events[k]!.attending ? 1 : 0}|${Math.max(1, Math.min(p.g.seats, p.count))}`)).sort();
    const { results: stored } = await t.db
      .prepare(`SELECT r.invitation_id AS id, e.key, r.attending, r.count FROM rsvp r JOIN event e ON e.id = r.event_id`)
      .all<{ id: string; key: string; attending: number | null; count: number }>();
    expect(stored.map((r) => `${r.id}|${r.key}|${r.attending}|${r.count}`).sort()).toEqual(want);

    // What the database now says, guest by guest.
    type Snap = { id: string; seats: number; party: string; invited: string[]; rsvp: Record<string, { attending: boolean | null; count: number }>; people: { diet: string }[] };
    const { results: ps } = await t.db
      .prepare(`SELECT p.invitation_id AS id, p.diet FROM person p WHERE p.deleted_at IS NULL ORDER BY p.invitation_id, p.idx`)
      .all<{ id: string; diet: string | null }>();
    const snap: Snap[] = (await guestList()).map((g) => ({ id: g.id, seats: g.seats, party: g.party, invited: g.invited, rsvp: {}, people: [] }));
    const byId = new Map(snap.map((g) => [g.id, g]));
    for (const p of ps) byId.get(p.id)?.people.push({ diet: p.diet ?? '' });
    for (const r of stored) {
      const g = byId.get(r.id);
      if (g) g.rsvp[r.key] = { attending: r.attending === null ? null : !!r.attending, count: r.count };
    }
    const { results: events } = await t.db
      .prepare(`SELECT key, catered FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`)
      .bind(wid)
      .all<{ key: string; catered: number }>();
    expect(events.map((e) => e.key)).toEqual(['wedding', '30th', brunch, drinks, birthday]);
    const att = (g: Snap, k: string) => g.invited.includes(k) && g.rsvp[k]?.attending === true;
    const pending = (g: Snap, k: string) => (g.rsvp[k]?.attending ?? null) === null;
    const comingPeople = (g: Snap, k: string) => (att(g, k) ? g.people.slice(0, Math.max(1, g.rsvp[k]?.count ?? 1)) : []);

    // Overview.
    type Overview = {
      total: number; replied: number; awaiting: number; yesInv: number; noInv: number; seatsHeld: number;
      events: { key: string; coming: number }[]; diet: { people: number; serious: number };
      perEvent: { key: string; invited: number; yes: number; no: number; awaiting: number; coming: number; diet: number }[]; nav: { guests: number };
    };
    const ov = (await (await api('/overview')).json()) as Overview;
    const awaiting = snap.filter((g) => g.invited.some((k) => pending(g, k))).length;
    const yesInv = snap.filter((g) => g.invited.some((k) => att(g, k))).length;
    expect(awaiting).toBe(silent.length); // everyone who replied answered every event they're invited to
    expect(ov).toMatchObject({ total: 300, replied: 300 - awaiting, awaiting, yesInv, noInv: 300 - awaiting - yesInv, seatsHeld: snap.reduce((n, g) => n + g.seats, 0) });
    expect(ov.nav.guests).toBe(300);
    expect(ov.events.map(({ key, coming }) => ({ key, coming }))).toEqual(
      events.map(({ key }) => ({ key, coming: snap.reduce((n, g) => n + (att(g, key) ? Math.max(1, g.rsvp[key]?.count ?? 1) : 0), 0) })),
    );
    const catered = events.find((e) => e.catered)!.key;
    const dietPeople = snap.flatMap((g) => comingPeople(g, catered)).filter((p) => p.diet.trim());
    expect(ov.diet).toMatchObject({ people: dietPeople.length, serious: dietPeople.filter((p) => isSerious(p.diet)).length });
    expect(ov.perEvent.map(({ key, invited, yes, no, awaiting: a, coming, diet }) => ({ key, invited, yes, no, awaiting: a, coming, diet }))).toEqual(
      events.map(({ key, catered: c }) => {
        const inv = snap.filter((g) => g.invited.includes(key));
        const people = inv.flatMap((g) => comingPeople(g, key));
        return {
          key,
          invited: inv.length,
          yes: inv.filter((g) => g.rsvp[key]?.attending === true).length,
          no: inv.filter((g) => g.rsvp[key]?.attending === false).length,
          awaiting: inv.filter((g) => pending(g, key)).length,
          coming: people.length,
          diet: c ? people.filter((p) => p.diet.trim()).length : 0,
        };
      }),
    );

    // Insights.
    type Insights = {
      events: { key: string; invited: number; yes: number; no: number; awaiting: number; people: number; seats: number }[];
      groups: { group: string; invited: number; yes: number; no: number }[];
      catering: { people: number; withNeeds: number };
      opened: { invitations: number };
      repliesByDay: { n: number }[];
    };
    const ins = (await (await api('/insights')).json()) as Insights;
    expect(ins.events).toEqual(
      events.map(({ key }) => {
        const inv = snap.filter((g) => g.invited.includes(key));
        const yes = inv.filter((g) => g.rsvp[key]?.attending === true);
        const no = inv.filter((g) => g.rsvp[key]?.attending === false).length;
        return expect.objectContaining({
          key, invited: inv.length, yes: yes.length, no, awaiting: inv.length - yes.length - no,
          people: yes.reduce((n, g) => n + (g.rsvp[key]?.count ?? 0), 0), seats: inv.reduce((n, g) => n + g.people.length, 0),
        });
      }),
    );
    const groupWant = new Map<string, { invited: number; yes: number; no: number }>();
    for (const g of snap) {
      const k = g.party || 'No group';
      const e = groupWant.get(k) ?? { invited: 0, yes: 0, no: 0 };
      e.invited++;
      if (Object.values(g.rsvp).some((r) => r.attending === true)) e.yes++;
      if (Object.values(g.rsvp).some((r) => r.attending === false)) e.no++;
      groupWant.set(k, e);
    }
    expect(Object.fromEntries(ins.groups.map((x) => [x.group, { invited: x.invited, yes: x.yes, no: x.no }]))).toEqual(Object.fromEntries(groupWant));
    // Catering in Insights counts everyone on an invitation that said yes to the first event (not the reply's count).
    const weddingYes = snap.filter((g) => g.rsvp.wedding?.attending === true);
    expect(ins.catering).toMatchObject({
      people: weddingYes.reduce((n, g) => n + g.people.length, 0),
      withNeeds: weddingYes.flatMap((g) => g.people).filter((p) => p.diet.trim()).length,
    });
    expect(ins.opened.invitations).toBe(300);
    expect(ins.repliesByDay.reduce((n, d) => n + d.n, 0)).toBe(snap.filter((g) => g.invited.includes('wedding') && !pending(g, 'wedding')).length);

    // Events list: invited and coming (invitations) per event.
    const evs = (await (await api('/events')).json()) as { events: { key: string; invited: number; coming: number }[] };
    expect(evs.events.map(({ key, invited, coming }) => ({ key, invited, coming }))).toEqual(
      events.map(({ key }) => ({ key, invited: snap.filter((g) => g.invited.includes(key)).length, coming: snap.filter((g) => att(g, key)).length })),
    );
  });

  // ------------------------------------------------------------------------------------------------ 2
  it('an RSVP storm: 100 at once, the same guest twice at once, one address flooding, bad input, and the closing date', { timeout: 120_000 }, async () => {
    await importRows(Array.from({ length: 160 }, (_, i) => ({ people: [`Storm${i} Guest`], phone: mobile(i), invited: i % 2 ? ['wedding', '30th'] : ['wedding'] })));
    const byName = new Map((await guestList()).map((x) => [x.name, x]));
    const g = (i: number) => byName.get(`Storm${i} Guest`)!;
    const answer = (x: G, yes: boolean) => Object.fromEntries(x.invited.map((k) => [k, { attending: yes }]));
    const rowsOf = async (id: string) =>
      (await t.db.prepare(`SELECT e.key, r.attending, r.count FROM rsvp r JOIN event e ON e.id = r.event_id WHERE r.invitation_id = ? ORDER BY e.key`).bind(id).all<{ key: string; attending: number | null; count: number }>()).results;
    const versionOf = async (id: string) => (await one<{ version: number }>(`SELECT version FROM invitation WHERE id = ?`, id)).version;

    // 1. A hundred guests at once, each from their own phone.
    const storm = await Promise.all(Array.from({ length: 100 }, (_, i) => rsvp(g(i).token, { events: answer(g(i), i % 3 !== 0) }, ipOf(i))));
    expect(storm.map((r) => r.status)).toEqual(storm.map(() => 200));
    const { results: stormRows } = await t.db.prepare(`SELECT r.invitation_id AS id, e.key, r.attending FROM rsvp r JOIN event e ON e.id = r.event_id`).all<{ id: string; key: string; attending: number }>();
    expect(stormRows.map((r) => `${r.id}|${r.key}|${r.attending}`).sort()).toEqual(
      Array.from({ length: 100 }, (_, i) => g(i).invited.map((k) => `${g(i).id}|${k}|${i % 3 !== 0 ? 1 : 0}`)).flat().sort(),
    );

    // 2. The same guest twice at once (yes on one phone, no on another): one whole answer wins, nothing half-written, no lost version bump.
    const twins = Array.from({ length: 10 }, (_, j) => g(100 + j));
    const pairs = await Promise.all(
      twins.flatMap((x, j) => [rsvp(x.token, { events: answer(x, true) }, ipOf(1000 + 2 * j)), rsvp(x.token, { events: answer(x, false) }, ipOf(1001 + 2 * j))]),
    );
    expect(pairs.map((r) => r.status)).toEqual(pairs.map(() => 200));
    for (const x of twins) {
      const rows = await rowsOf(x.id);
      expect(rows.map((r) => r.key)).toEqual([...x.invited].sort());
      expect(new Set(rows.map((r) => r.attending)).size).toBe(1);
      expect(await versionOf(x.id)).toBe(x.version + 2);
    }

    // 3. One address flooding: exactly 30 a minute get through, the rest are told to slow down (never a 500).
    const flooders = Array.from({ length: 40 }, (_, j) => g(110 + j));
    const flood = await Promise.all(flooders.map((x) => rsvp(x.token, { events: answer(x, true) }, '198.51.100.7')));
    expect(flood.filter((r) => r.status === 200)).toHaveLength(30);
    expect(flood.filter((r) => r.status === 429)).toHaveLength(10);
    const answered = await one<{ n: number }>(`SELECT COUNT(DISTINCT invitation_id) AS n FROM rsvp WHERE invitation_id IN (SELECT value FROM json_each(?))`, JSON.stringify(flooders.map((x) => x.id)));
    expect(answered.n).toBe(30);

    // 4. Bad input is refused, never a crash, and writes nothing.
    const bad = 'bad-input';
    const fresh = g(150);
    const wed = { wedding: { attending: true } };
    const refused = [
      await rsvp('nope', { events: wed }, bad),
      await rsvp('A'.repeat(22), { events: wed }, bad),
      await rsvp(fresh.token, { events: {} }, bad),
      await rsvp(fresh.token, { events: { 'no-such-event': { attending: true } } }, bad),
      await rsvp(fresh.token, { events: wed, message: 'x'.repeat(1001) }, bad),
      await rsvp(fresh.token, { events: { wedding: { attending: 'yes' } } }, bad),
      await rsvp(fresh.token, { events: wed, count: 0 }, bad),
      await pub('/rsvp', { method: 'POST', body: '{not json' }, bad),
      await pub('/rsvp', { method: 'POST', body: JSON.stringify({ token: fresh.token, events: wed, message: 'x'.repeat(200_000) }) }, bad),
    ];
    expect(refused.slice(0, 8).map((r) => r.status)).toEqual([400, 404, 400, 400, 400, 400, 400, 400]);
    expect([400, 413]).toContain(refused[8]!.status); // over the 100 KB body cap
    expect(await rowsOf(fresh.id)).toEqual([]);

    // 5. Replies close (a date in the past): changes are refused, a first late reply still counts, the couple can still correct.
    const w = await one<{ content: string }>(`SELECT content FROM wedding WHERE id = ?`, wid);
    const content = JSON.parse(w.content || '{}') as { invitation?: Record<string, unknown> };
    content.invitation = { ...(content.invitation ?? {}), rsvpClose: '2020-01-01', rsvpEmail: 'rsvp@example.com' };
    await t.db.prepare(`UPDATE wedding SET content = ? WHERE id = ?`).bind(JSON.stringify(content), wid).run();
    expect(((await (await api('/insights')).json()) as { rsvpClose: string }).rsvpClose).toBe('2020-01-01');

    const beforeClose = await rowsOf(g(1).id);
    const change = await rsvp(g(1).token, { events: answer(g(1), false) }, ipOf(2001));
    expect(change.status).toBe(403);
    const closed = (await change.json()) as { error: { code: string; message: string } };
    expect(closed.error.code).toBe('closed');
    expect(closed.error.message).toContain('rsvp@example.com');
    expect(await rowsOf(g(1).id)).toEqual(beforeClose);
    // Twenty who already replied try at once: all refused.
    const late = await Promise.all(Array.from({ length: 20 }, (_, i) => rsvp(g(i).token, { events: answer(g(i), i % 3 === 0) }, ipOf(3000 + i))));
    expect(late.map((r) => r.status)).toEqual(late.map(() => 403));
    // Ten first replies at once: all accepted; then changing them is refused.
    const firsts = Array.from({ length: 10 }, (_, j) => g(150 + j));
    const firstLate = await Promise.all(firsts.map((x, j) => rsvp(x.token, { events: answer(x, true) }, ipOf(4000 + j))));
    expect(firstLate.map((r) => r.status)).toEqual(firstLate.map(() => 200));
    for (const x of firsts) expect((await rowsOf(x.id)).map((r) => r.attending)).toEqual(x.invited.map(() => 1));
    expect((await rsvp(fresh.token, { events: answer(fresh, false) }, ipOf(4100))).status).toBe(403);
    // A guest held back by the flood (never answered) can still give a first reply.
    const { results: unanswered } = await t.db
      .prepare(`SELECT value AS id FROM json_each(?) WHERE value NOT IN (SELECT invitation_id FROM rsvp)`)
      .bind(JSON.stringify(flooders.map((x) => x.id)))
      .all<{ id: string }>();
    expect(unanswered).toHaveLength(10);
    const held = flooders.find((x) => x.id === unanswered[0]!.id)!;
    expect((await rsvp(held.token, { events: answer(held, true) }, ipOf(4200))).status).toBe(200);
    // The couple records a change after the close (If-Match), and a stale copy is refused.
    const v = await versionOf(g(1).id);
    const fix = await api(`/guests/${g(1).id}/rsvp`, { method: 'PUT', headers: { 'If-Match': String(v) }, body: JSON.stringify({ events: { wedding: { attending: false } } }) });
    expect(fix.status).toBe(200);
    expect((await rowsOf(g(1).id)).find((r) => r.key === 'wedding')!.attending).toBe(0);
    const stale = await api(`/guests/${g(1).id}/rsvp`, { method: 'PUT', headers: { 'If-Match': String(v) }, body: JSON.stringify({ events: { wedding: { attending: true } } }) });
    expect(stale.status).toBe(409);
  });

  // ------------------------------------------------------------------------------------------------ 3
  it('planner documents at their maximum sizes: versions hold, too big is a 400, and every reader stays fast', { timeout: 120_000 }, async () => {
    const checklist = (tasks: number, helpers: number) => ({
      tasks: Array.from({ length: tasks }, (_, i) => ({
        id: `t${i}`, text: `Planning task ${i}`, before: 800 - (i % 300) * 2, legal: i % 50 === 0, helper: helpers && i < 200 ? `h${i % helpers}` : '',
        owner: i >= 200 ? (['p1', 'p2', 'both', ''] as const)[i % 4] : '',
      })),
      helpers: Array.from({ length: helpers }, (_, i) => ({ id: `h${i}`, name: `Helper ${i}`, mobile: '', key: helperKey(i) })),
    });
    const budget = (n: number) => ({
      total: 90000,
      lines: Array.from({ length: n }, (_, i) => ({ category: `Category ${i % 11}`, item: `Line ${i}`, estimate: 500, quote: i % 2 ? 400 : 0, paid: i % 3 ? 0 : 100, due: i % 5 ? '' : day(5 + (i % 30)) })),
    });
    const vendors = (n: number, quotes = 12, payments = 12) => ({
      list: Array.from({ length: n }, (_, i) => ({
        id: `v${i}`, name: `Vendor ${String(i).padStart(3, '0')}`, category: 'Florist', status: i % 4 === 0 ? 'booked' : 'quoted',
        quotes: Array.from({ length: quotes }, (_, j) => ({ id: `v${i}q${j}`, amount: 1000 + j, deposit: 100, validUntil: day(20 + j) })),
        payments: Array.from({ length: payments }, (_, j) => ({ id: `p${j}`, label: `Part ${j}`, amount: 50 + j, due: day(j * 7 - 7), paid: j === 0 })),
      })),
    });

    // Checklist: 300 tasks, 40 helpers.
    const c1 = await put('/planner/doc/checklist', 0, checklist(300, 40));
    expect(c1.status).toBe(200);
    expect(((await c1.json()) as { version: number }).version).toBe(1);
    expect((await put('/planner/doc/checklist', 0, checklist(300, 40))).status).toBe(409); // someone made it first
    // The whole document as the page has it (every field filled in) goes back in one save.
    const got = (await (await api('/planner/doc/checklist')).json()) as { data: PlanChecklist; version: number };
    expect(got.data.tasks).toHaveLength(300);
    expect(got.data.helpers).toHaveLength(40);
    got.data.tasks[0]!.done = true;
    const c2 = await put('/planner/doc/checklist', 1, got.data);
    expect(c2.status).toBe(200);
    expect(((await c2.json()) as { version: number }).version).toBe(2);
    const stale = await put('/planner/doc/checklist', 1, checklist(300, 40));
    expect(stale.status).toBe(409);
    const cur = ((await stale.json()) as { current: { version: number; data: PlanChecklist } }).current;
    expect(cur.version).toBe(2);
    expect(cur.data.tasks).toHaveLength(300);
    // Ten saves from the same version at once: exactly one wins.
    const race = await Promise.all(Array.from({ length: 10 }, () => put('/planner/doc/checklist', 2, got.data)));
    expect(race.map((r) => r.status).sort()).toEqual([200, ...Array.from({ length: 9 }, () => 409)]);
    // Over the maximum: refused with a 400, and the saved copy is untouched.
    expect((await put('/planner/doc/checklist', 3, checklist(301, 40))).status).toBe(400);
    expect((await put('/planner/doc/checklist', 3, checklist(300, 41))).status).toBe(400);
    expect(((await (await api('/planner/doc/checklist')).json()) as { version: number }).version).toBe(3);

    // Budget: 300 lines; 301 refused.
    expect((await put('/planner/doc/budget', 0, budget(300))).status).toBe(200);
    expect((await put('/planner/doc/budget', 1, budget(301))).status).toBe(400);
    const b = (await (await api('/planner/doc/budget')).json()) as { data: Budget; version: number };
    expect(b.data.lines).toHaveLength(300);
    expect(b.version).toBe(1);

    // Vendors: over the maximum is refused…
    expect((await put('/planner/doc/vendors', 0, vendors(201, 0, 0))).status).toBe(400);
    expect((await put('/planner/doc/vendors', 0, vendors(1, 13, 0))).status).toBe(400);
    expect((await put('/planner/doc/vendors', 0, vendors(1, 0, 13))).status).toBe(400);
    // …and the maximum itself (200 vendors x 12 quotes x 12 payments). Past the request body cap it can't be sent
    // at all (a clean refusal, see the file header); it is then written directly so the readers are measured at size.
    const max = vendors(200);
    const body = JSON.stringify(max);
    const vput = await put('/planner/doc/vendors', 0, max);
    if (body.length > bodyLimitFor(`/api/a/w/${wid}/planner/doc/vendors`)) {
      expect([400, 413]).toContain(vput.status);
      await t.db.prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?, 'vendors', '', ?, 1, ?)`).bind(wid, body, new Date().toISOString()).run();
    } else {
      expect(vput.status).toBe(200);
    }
    const v = (await (await api('/planner/doc/vendors')).json()) as { data: Vendors; version: number };
    expect(v.data.list).toHaveLength(200);
    expect(v.data.list.every((x) => x.quotes.length === 12 && x.payments.length === 12)).toBe(true);

    // Every reader, timed.
    const timed = async (f: () => Promise<Response>) => {
      const start = performance.now();
      const r = await f();
      const text = await r.text();
      return { status: r.status, ms: performance.now() - start, text };
    };
    const LIMIT_MS = 5_000;

    const ins = await timed(() => api('/insights'));
    expect(ins.status).toBe(200);
    expect(ins.ms).toBeLessThan(LIMIT_MS);
    const insData = JSON.parse(ins.text) as { tasks: { total: number; byStatus: { todo: number; done: number } } };
    expect(insData.tasks.total).toBe(300);
    expect(insData.tasks.byStatus.done).toBe(1);

    const ov = await timed(() => api('/overview'));
    expect(ov.status).toBe(200);
    expect(ov.ms).toBeLessThan(LIMIT_MS);
    const needs = (JSON.parse(ov.text) as { needsYou: { kind: string; title: string; detail: string }[] }).needsYou;
    const first = await one<{ starts_at: string }>(`SELECT starts_at FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`, wid);
    const overdue = got.data.tasks.filter((x) => !x.done && Date.parse(first.starts_at) - x.before * 86_400_000 < Date.now());
    if (overdue.length > 1) {
      expect(needs.find((n) => n.kind === 'plan-overdue')).toMatchObject({ title: `${overdue.length} planning tasks overdue` });
    }
    expect(needs.find((n) => n.kind === 'payments-due')?.title).toMatch(/payments? (overdue|due in the next fortnight)$/);
    expect(needs.find((n) => n.kind === 'contracts')).toMatchObject({ title: '50 booked vendors have no signed contract' });

    const cal = (await (await api('/planner-calendar', { method: 'PUT', body: JSON.stringify({ on: true }) })).json()) as { url: string };
    const feed = await timed(() => record(app.request(cal.url.replace('https://example.com', ''), {}, env, ctx)));
    expect(feed.status).toBe(200);
    expect(feed.ms).toBeLessThan(LIMIT_MS);
    const eventCount = (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM event WHERE wedding_id = ? AND deleted_at IS NULL`, wid)).n;
    const close = (JSON.parse((await one<{ content: string }>(`SELECT content FROM wedding WHERE id = ?`, wid)).content || '{}') as { invitation?: { rsvpClose?: string } }).invitation?.rsvpClose ?? '';
    const want =
      eventCount +
      got.data.tasks.filter((x) => !x.done).length +
      allPayments(b.data.lines, v.data.list).filter((p) => !p.paid && p.due && p.amount > 0).length +
      v.data.list.filter((x) => x.status !== 'booked' && x.status !== 'declined').reduce((n, x) => n + x.quotes.filter((q) => q.validUntil).length, 0) +
      (/^\d{4}-\d{2}-\d{2}$/.test(close) ? 1 : 0);
    expect((feed.text.match(/BEGIN:VEVENT/g) ?? []).length).toBe(want);
    expect(feed.text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(feed.text.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(feed.text.split('\r\n').every((line) => [...line].length <= 75)).toBe(true); // folded

    const pay = await timed(() => api('/pay-reminders'));
    expect(pay.status).toBe(200);
    expect(pay.ms).toBeLessThan(LIMIT_MS);
    expect(JSON.parse(pay.text)).toMatchObject({ on: false, days: 3, hasMobile: true });
  });

  // ------------------------------------------------------------------------------------------------ 5
  it('the party portal with 20 members: sign-ups, lock-out after 5 wrong passwords, permissions, sign-in needed, sessions ended on reset', { timeout: 120_000 }, async () => {
    const roles = ['Maid of honour', 'Best man', ...Array.from({ length: 9 }, () => 'Bridesmaid'), ...Array.from({ length: 9 }, () => 'Groomsman')];
    await importRows(roles.map((_, i) => ({ people: [`Member${i} Party`], phone: mobile(500 + i) })));
    const members = await Promise.all(
      roles.map(async (role, i) => ({
        ...(await one<{ id: string; token: string }>(`SELECT p.id, i.token FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE p.name = ?`, `Member${i} Party`)),
        role, i, email: `member${i}@example.test`, password: `party-pass-${i}`, ip: ipOf(5000 + i), jar: '',
      })),
    );
    for (const m of members) expect((await api(`/planner/people/${m.id}/role`, { method: 'PUT', body: JSON.stringify({ role: m.role }) })).status).toBe(200);
    const items = [
      { title: 'All hands', who: ['party'] },
      { title: 'Bride side prep', who: ['p1'] },
      { title: 'Groom side prep', who: ['p2'] },
      { title: 'Leads briefing', who: ['Maid of honour', 'Best man'] },
    ];
    expect((await put('/planner/doc/party-runsheet/wedding', 0, { items, note: '', packing: [{ text: 'Charger', who: ['party'] }] })).status).toBe(200);

    const admin = (path: string, init: RequestInit = {}) => api(`/party-accounts${path}`, init);
    const portal = (path: string, ip: string, body?: unknown, jar = '') =>
      pub(`/portal${path}`, body === undefined ? { headers: jar ? { cookie: jar } : {} } : { method: 'POST', body: JSON.stringify(body), headers: jar ? { cookie: jar } : {} }, ip);
    const jarOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]!;
    const sessions = async (personId: string) =>
      (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM party_session s JOIN party_account a ON a.id = s.account_id WHERE a.person_id = ?`, personId)).n;
    type Party = {
      mine: { personId: string }[]; events: { key: string; items: { title: string }[] }[]; perms: Record<string, boolean>;
      account: { name: string } | null; vendors?: unknown[]; guests?: { invited: number; coming: number; waiting: number }; seating?: unknown[];
    };
    const party = async (m: (typeof members)[number], jar = m.jar) => pub('/party', { headers: jar ? { cookie: jar } : {} }, m.ip);

    // Everyone is invited, sets a password and signs in (all at once).
    const links = new Map<string, string>();
    for (const m of members) {
      const r = await admin(`/${m.id}/invite`, { method: 'POST', body: JSON.stringify({ email: m.email }) });
      expect(r.status).toBe(200);
      links.set(m.id, new URL(((await r.json()) as { link: string }).link).searchParams.get('t')!);
    }
    const setUp = await Promise.all(members.map((m) => portal('/password-link', m.ip, { t: links.get(m.id)!, password: m.password })));
    expect(setUp.map((r) => r.status)).toEqual(setUp.map(() => 200));
    const logins = await Promise.all(members.map((m) => portal('/login', m.ip, { email: m.email.toUpperCase(), password: m.password })));
    expect(logins.map((r) => r.status)).toEqual(logins.map(() => 200));
    logins.forEach((r, i) => (members[i]!.jar = jarOf(r)));
    // An invite link works once.
    expect((await portal(`/link?t=${links.get(members[0]!.id)!}`, members[0]!.ip)).status).toBe(404);

    // Each sees only their own part, and only what their role allows.
    for (const m of members) {
      const r = await party(m);
      expect(r.status).toBe(200);
      const p = (await r.json()) as Party;
      expect(p.account?.name).toBe(`Member${m.i} Party`);
      expect(p.mine.map((x) => x.personId)).toEqual([m.id]);
      const lead = m.role === 'Maid of honour' || m.role === 'Best man';
      const side = m.role === 'Maid of honour' || m.role === 'Bridesmaid' ? 'Bride side prep' : 'Groom side prep';
      expect(p.events.find((e) => e.key === 'wedding')!.items.map((x) => x.title)).toEqual(['All hands', side, ...(lead ? ['Leads briefing'] : [])]);
      if (lead) {
        expect(p.vendors).toEqual([]);
        expect(p.guests).toEqual({ invited: 20, coming: 0, waiting: 20 });
        expect((p.seating as { people: string[] }[]).every((t) => t.people.length === 0)).toBe(true);
      } else {
        expect(p.vendors).toBeUndefined();
        expect(p.guests).toBeUndefined();
        expect(p.seating).toBeUndefined();
      }
    }
    const act = (m: (typeof members)[number], body: Record<string, unknown>, jar = m.jar) =>
      pub('/party', { method: 'POST', body: JSON.stringify({ personId: m.id, ...body }), headers: jar ? { cookie: jar } : {} }, m.ip);
    // Never someone else's list; their own works.
    expect((await act(members[2]!, { personId: members[3]!.id, action: 'packed', text: 'Charger', done: true })).status).toBe(403);
    expect((await act(members[2]!, { action: 'add-pack', text: 'Shoes' })).status).toBe(200);
    // The couple narrows one member: no run sheet, no packing.
    const narrowed = members[4]!;
    expect((await admin(`/${narrowed.id}/perms`, { method: 'PUT', body: JSON.stringify({ perms: { runsheet: false, packing: false } }) })).status).toBe(200);
    expect(((await (await party(narrowed)).json()) as Party).events.every((e) => !e.items.length)).toBe(true);
    expect((await act(narrowed, { action: 'add-pack', text: 'Shoes' })).status).toBe(403);

    // Five wrong passwords lock the sign-in, even for the right one; a reset from the couple unlocks it and ends old sessions.
    const locked = members[2]!;
    for (let k = 0; k < 5; k++) expect((await portal('/login', locked.ip, { email: locked.email, password: `wrong-${k}-password` })).status).toBe(401);
    const blocked = await portal('/login', locked.ip, { email: locked.email, password: locked.password });
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe('locked');
    type List = { signIn: boolean; members: { personId: string; account: { status: string; locked: boolean } | null }[] };
    expect(((await (await admin('')).json()) as List).members.find((x) => x.personId === locked.id)!.account).toMatchObject({ status: 'active', locked: true });
    expect(await sessions(locked.id)).toBe(2); // set-up and sign-in
    const reset = (await (await admin(`/${locked.id}/reset`, { method: 'POST', body: '{}' })).json()) as { link: string };
    const newPass = 'a-brand-new-password';
    expect((await portal('/password-link', locked.ip, { t: new URL(reset.link).searchParams.get('t')!, password: newPass })).status).toBe(200);
    expect(await sessions(locked.id)).toBe(1); // only the one the reset just started
    expect(((await (await portal('/me', locked.ip, undefined, locked.jar)).json()) as { signedIn: boolean }).signedIn).toBe(false);
    expect((await portal('/login', locked.ip, { email: locked.email, password: locked.password })).status).toBe(401); // the old password is gone
    const relog = await portal('/login', locked.ip, { email: locked.email, password: newPass });
    expect(relog.status).toBe(200);
    locked.jar = jarOf(relog);

    // Signed out everywhere by the couple.
    const out = members[3]!;
    expect((await admin(`/${out.id}/signout`, { method: 'POST', body: '{}' })).status).toBe(200);
    expect(await sessions(out.id)).toBe(0);
    expect(((await (await portal('/me', out.ip, undefined, out.jar)).json()) as { signedIn: boolean }).signedIn).toBe(false);

    // Sign-in needed: no private link opens the portal any more; signed-in members still get in.
    expect((await admin('/settings', { method: 'PUT', body: JSON.stringify({ signIn: true }) })).status).toBe(200);
    for (const m of members) {
      expect((await pub(`/party?g=${m.token}`, {}, m.ip)).status).toBe(401);
      expect((await pub('/party', { method: 'POST', body: JSON.stringify({ token: m.token, personId: m.id, action: 'packed', text: 'Charger', done: true }) }, m.ip)).status).toBe(401);
    }
    expect((await party(members[5]!)).status).toBe(200);
    expect((await party(locked)).status).toBe(200);
    expect((await party(out)).status).toBe(401);
    // Switched off again: links work again.
    expect((await admin('/settings', { method: 'PUT', body: JSON.stringify({ signIn: false }) })).status).toBe(200);
    expect((await pub(`/party?g=${members[6]!.token}`, {}, members[6]!.ip)).status).toBe(200);

    // A removed sign-in: its sessions go and the password no longer works.
    const removed = members[7]!;
    expect((await admin(`/${removed.id}`, { method: 'DELETE' })).status).toBe(200);
    expect(await sessions(removed.id)).toBe(0);
    expect((await portal('/login', removed.ip, { email: removed.email, password: removed.password })).status).toBe(401);
    const list = (await (await admin('')).json()) as List;
    expect(list.members).toHaveLength(20);
    expect(list.members.filter((x) => x.account?.status === 'active')).toHaveLength(19);
    expect(list.members.find((x) => x.personId === removed.id)!.account).toBeNull();
  });

  // ------------------------------------------------------------------------------------------------ 6
  it('40 helpers tick their own tasks at the same time: nothing is lost and the totals match', { timeout: 120_000 }, async () => {
    const helpers = Array.from({ length: 40 }, (_, i) => ({ id: `h${i}`, name: `Helper ${i}`, mobile: '', key: helperKey(i) }));
    const tasks = [
      ...Array.from({ length: 200 }, (_, i) => ({ id: `t${i}`, text: `Helper task ${i}`, before: 300 - i, helper: `h${Math.floor(i / 5)}` })),
      ...Array.from({ length: 100 }, (_, i) => ({ id: `u${i}`, text: `Couple task ${i}`, before: 90 - i, owner: 'both' })),
    ];
    const saved = await put('/planner/doc/checklist', 0, { helpers, tasks });
    expect(saved.status).toBe(200);
    const plan = (h: number) =>
      [[`t${h * 5}`, 'done'], [`t${h * 5 + 1}`, 'done'], [`t${h * 5 + 2}`, 'done'], [`t${h * 5 + 3}`, 'doing'], [`t${h * 5 + 4}`, 'todo']] as const;

    // A helper's phone retries a busy save, as the page does. (Concurrent saves on one document can come back 409
    // "busy" after the server's own retries; and the per-wedding save limit is per hour, so a 429 here is treated as
    // the hour having passed.)
    const stats = { conflicts: 0, limited: 0 };
    const mark = async (k: string, id: string, status: string) => {
      for (let attempt = 0; attempt < 60; attempt++) {
        const r = await pub('/tasks', { method: 'POST', body: JSON.stringify({ k, id, status }) }, 'helpers');
        if (r.status === 200) return;
        if (r.status === 409 || r.status === 503) stats.conflicts++; // busy: the page tries again
        else if (r.status === 429) {
          stats.limited++;
          await t.db.prepare(`DELETE FROM rate_limit WHERE k LIKE 'mytasks-save:%'`).run();
        } else throw new Error(`marking ${id} ${status}: ${r.status}`);
        await sleep(Math.random() * 10);
      }
      throw new Error(`marking ${id} ${status}: still busy`);
    };
    await Promise.all(helpers.map(async (h, i) => {
      for (const [id, status] of plan(i)) await mark(h.key, id, status);
    }));
    console.log('helpers: busy retries', stats.conflicts, 'rate-limited', stats.limited);

    // Each helper's list shows exactly what they did, and only their tasks.
    for (const [i, h] of helpers.entries()) {
      const r = await pub(`/tasks?k=${h.key}`, {}, ipOf(6000 + i));
      expect(r.status).toBe(200);
      const view = (await r.json()) as { name: string; tasks: { id: string; status: string }[] };
      expect(view.name).toBe(h.name);
      expect(view.tasks.map((x) => [x.id, x.status])).toEqual(plan(i).map(([id, s]) => [id, s]));
    }
    // No tick was lost: one version per real change (the "todo" taps changed nothing).
    const doc = (await (await api('/planner/doc/checklist')).json()) as { data: PlanChecklist; version: number };
    expect(doc.version).toBe(1 + 40 * 4);
    const today = dateIn(TZ);
    expect(doc.data.tasks.filter((x) => x.status === 'done').every((x) => x.done && x.doneOn === today)).toBe(true);
    const ins = (await (await api('/insights')).json()) as {
      tasks: { total: number; byStatus: { todo: number; doing: number; done: number }; byPerson: { name: string; todo: number; doing: number; done: number }[]; donePerWeek: { n: number }[] };
    };
    expect(ins.tasks.total).toBe(300);
    expect(ins.tasks.byStatus).toEqual({ todo: 140, doing: 40, done: 120 });
    for (const h of helpers) expect(ins.tasks.byPerson.find((p) => p.name === h.name)).toMatchObject({ todo: 1, doing: 1, done: 3 });
    expect(ins.tasks.donePerWeek.at(-1)!.n).toBe(120);
    // The couple's copy from before the helpers ticked can't overwrite their ticks.
    expect((await put('/planner/doc/checklist', 1, { helpers, tasks })).status).toBe(409);
  });

  // ------------------------------------------------------------------------------------------------ 7
  const payDoc = (dueSoon: (j: number) => boolean) => ({
    list: Array.from({ length: 200 }, (_, i) => ({
      id: `v${i}`, name: `Vendor ${String(i).padStart(3, '0')}`, category: 'Catering', status: 'booked',
      payments: Array.from({ length: 12 }, (_, j) => ({
        id: `p${j}`, label: j === 0 ? 'Deposit' : `Part ${j}`, amount: j === 0 ? 500 : 100,
        due: dueSoon(j) ? '2027-03-12' : `2027-06-${String(j + 1).padStart(2, '0')}`, paid: false,
      })),
    })),
  });
  const runReminders = async (doc: ReturnType<typeof payDoc>) => {
    // Switched on through the real route first (the cron below runs in 2027 and clears this 2026 sign-in).
    const on = await api('/pay-reminders', { method: 'PUT', body: JSON.stringify({ on: true, days: 3 }) });
    expect(on.status).toBe(200);
    expect(await on.json()).toMatchObject({ on: true, days: 3, hasMobile: true });
    await t.db.prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?, 'vendors', '', ?, 1, '2027-01-01')`).bind(wid, JSON.stringify(doc)).run();
    const provider = new FakeProvider();
    const clock = fakeClock('2027-03-10T23:00');
    const run = () => scheduled({ DB: t.db, PUBLIC_BASE_URL: 'https://example.com' }, () => ({ store: new D1SmsStore(t.db, 'https://example.com'), provider, now: clock.now, uuid: () => crypto.randomUUID() }));
    const texts = () => provider.delivered.filter((m) => m.message.startsWith('Wedding payments'));
    return { run, clock, texts, provider };
  };

  it('payment reminders for 200 vendors: exactly one text, five lines and "and N more", never repeated', { timeout: 120_000 }, async () => {
    const { run, clock, texts } = await runReminders(payDoc((j) => j === 0));
    await run();
    expect(texts()).toHaveLength(0); // quiet hours
    clock.set('2027-03-11T09:30');
    await run();
    expect(texts()).toHaveLength(1);
    const msg = texts()[0]!;
    expect(msg.to.endsWith('412000777')).toBe(true);
    expect(msg.message.split('\n').filter((l) => l.startsWith('• '))).toHaveLength(5);
    expect(msg.message).toContain('• Vendor 000 deposit $500, Fri 12 Mar');
    expect(msg.message).toContain('• Vendor 004 deposit $500, Fri 12 Mar');
    expect(msg.message).not.toContain('Vendor 005');
    expect(msg.message).toContain('\nand 195 more\n');
    for (const at of ['2027-03-11T09:45', '2027-03-11T15:00', '2027-03-12T10:00', '2027-03-13T10:00']) {
      clock.set(at);
      await run();
    }
    expect(texts()).toHaveLength(1);
    const s = await one<{ s: string }>(`SELECT json_extract(content, '$.payReminders') AS s FROM wedding WHERE id = ?`, wid);
    expect((JSON.parse(s.s) as { sent: string[] }).sent).toHaveLength(200);
  });

  // Fixed: the reminder used to remember only the last 300 payments it texted about, so with 2,400 due at
  // once the next day's run texted again. It now remembers every payment still owing.
  it('more than 300 payments due at once are reminded once, not again the next day', { timeout: 120_000 }, async () => {
    const { run, clock, texts } = await runReminders(payDoc(() => true));
    clock.set('2027-03-11T09:30');
    await run();
    expect(texts()).toHaveLength(1);
    clock.set('2027-03-12T10:00');
    await run();
    expect(texts()).toHaveLength(1);
  });

  // ------------------------------------------------------------------------------------------------ 8
  it('email intake: 100 emails with duplicates, huge bodies and odd encodings; dedupe holds and nothing throws', { timeout: 120_000 }, async () => {
    const ADDRESS = 'hello@scale-test.example';
    const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'];
    await importRows(NAMES.map((n) => ({ people: [`${n} Mailer`] })));
    expect((await api('/inbox/settings/address', { method: 'PUT', body: JSON.stringify({ address: ADDRESS }) })).status).toBe(200);
    expect((await put('/planner/doc/vendors', 0, { list: [{ id: 'vb', name: 'Bloom Test Co', category: 'Florist', email: 'sales@bloom-test.example' }] })).status).toBe(200);
    const mail = (raw: string, to = ADDRESS) => {
      const bytes = new TextEncoder().encode(raw.replace(/\n/g, '\r\n'));
      return receiveEmail({ from: 'x@example.com', to, raw: new Blob([bytes]).stream(), headers: new Headers() }, env);
    };
    const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
    const build = (i: number): string => {
      const id = `<m${i}@scale.example>`;
      switch (i % 10) {
        case 0:
          return `From: Someone ${i} <someone${i}@example.org>\nSubject: Hello ${i}\nMessage-ID: ${id}\n\nJust saying hi.`;
        case 1: // the previous email delivered again
          return `From: Someone <someone@example.org>\nSubject: Hello again\nMessage-ID: <m${i - 1}@scale.example>\n\nThe same email, twice.`;
        case 2:
          return `From: Long Writer <long@example.org>\nSubject: A very long letter ${i}\nMessage-ID: ${id}\n\n${'All work and no play. '.repeat(50_000)}`;
        case 3:
          return `From: =?ISO-8859-1?Q?Jos=E9_Garc=EDa?= <jose@example.org>\nSubject: =?ISO-8859-1?Q?Caf=E9_menu_=E0_la_carte?=\nMessage-ID: ${id}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=ISO-8859-1\nContent-Transfer-Encoding: quoted-printable\n\nCaf=E9 au lait, cr=E8me br=FBl=E9e =\nand a soft line break.`;
        case 4:
          return `From: Abroad <abroad@example.org>\nSubject: =?UTF-8?B?${b64(`Hello 🎉 from 東京 ${i}`)}?=\nMessage-ID: ${id}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: base64\n\n${b64('Grüße, こんにちは, 🥂🥂🥂')}`;
        case 5: // no Message-ID: can't be recognised when delivered again
          return `From: No Id <noid@example.org>\nSubject: No message id ${i}\n\nThis one has no Message-ID header.`;
        case 6:
          return `From: Html Only <html@example.org>\nSubject: Html ${i}\nMessage-ID: ${id}\nMIME-Version: 1.0\nContent-Type: text/html; charset=UTF-8\n\n<html><style>p{color:red}</style><body><p>Hello&nbsp;<b>there</b></p>${'<div>x</div>'.repeat(5000)}</body></html>`;
        case 7:
          return `From: Jess <jess@bloom-test.example>\nSubject: Our quote ${i}\nMessage-ID: ${id}\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary="b"\n\n--b\nContent-Type: text/plain\n\nQuote attached.\n--b\nContent-Type: application/pdf; name="quote-${i}.pdf"\nContent-Disposition: attachment; filename="quote-${i}.pdf"\nContent-Transfer-Encoding: base64\n\n${btoa(`%PDF-1.4 quote ${i}`)}\n--b--\n`;
        case 8:
          return `From: ${NAMES[Math.floor(i / 10)]} Mailer <mailer${i}@gmail.com>\nSubject: Parking ${i}?\nMessage-ID: ${id}\n\nIs there parking?`;
        default: // no From, a multipart that never closes, control characters and a lone surrogate
          return `Subject: Broken ${i}\nMessage-ID: ${id}\nMIME-Version: 1.0\nContent-Type: multipart/mixed; boundary="never-closed"\n\n--never-closed\nContent-Type: text/plain\n\nA part that never ends \u0001\u0002 and a lone \uD800 surrogate`;
      }
    };
    const errors: string[] = [];
    const deliver = async (i: number) => {
      try {
        return (await mail(build(i))).stored;
      } catch (e) {
        errors.push(`${i}: ${String(e)}`);
        return false;
      }
    };
    const firstPass: boolean[] = [];
    for (let i = 0; i < 100; i++) firstPass.push(await deliver(i));
    expect(errors).toEqual([]);
    expect(firstPass.filter(Boolean)).toHaveLength(90);
    expect(firstPass.filter((s, i) => !s && i % 10 !== 1)).toEqual([]); // only the repeats were dropped

    const count = async () => (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM inbox_email WHERE wedding_id = ?`, wid)).n;
    expect(await count()).toBe(90);
    expect((await one<{ n: number }>(`SELECT MAX(length(body)) AS n FROM inbox_email`)).n).toBe(20_000);
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM inbox_email WHERE subject = 'Café menu à la carte'`)).n).toBe(10); // i = 3, 13, … 93
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM inbox_email WHERE subject = ?`, 'Hello 🎉 from 東京 4')).n).toBe(1);
    expect((await one<{ body: string }>(`SELECT body FROM inbox_email WHERE subject = 'Html 6'`)).body).not.toContain('<b>');
    // Sorted: ten from the vendor (each quote filed under them), ten from guests by name.
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM inbox_email WHERE kind = 'vendor' AND filed = 'vb'`)).n).toBe(10);
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM inbox_email WHERE kind = 'guest' AND invitation_id IS NOT NULL`)).n).toBe(10);
    const vendorDoc = (await (await api('/planner/doc/vendors')).json()) as { data: Vendors };
    expect(vendorDoc.data.list[0]!.quotes).toHaveLength(10);
    expect(vendorDoc.data.list[0]!.status).toBe('quoted');

    // Everything delivered again: only the ten without a Message-ID come in twice.
    const secondPass: boolean[] = [];
    for (let i = 0; i < 100; i++) secondPass.push(await deliver(i));
    expect(errors).toEqual([]);
    expect(secondPass.map((s, i) => (s ? i : -1)).filter((i) => i >= 0)).toEqual(Array.from({ length: 10 }, (_, k) => k * 10 + 5));
    // The same new email ten times at once: kept once.
    const burst = await Promise.all(Array.from({ length: 10 }, () => mail('From: Burst <burst@example.org>\nSubject: Burst\nMessage-ID: <burst@scale.example>\n\nOnce only.')));
    expect(burst.filter((r) => r.stored)).toHaveLength(1);
    // Not our address: dropped.
    expect((await mail(build(0), 'someone-else@scale-test.example')).stored).toBe(false);

    expect(await count()).toBe(101);
    const list = (await (await api('/inbox')).json()) as { address: string; emails: unknown[] };
    expect(list.address).toBe(ADDRESS);
    expect(list.emails).toHaveLength(101);
    const ins = (await (await api('/insights')).json()) as { guests: { emails: number; vendorEmails: number; guestEmails: number } };
    expect(ins.guests).toMatchObject({ emails: 101, vendorEmails: 10, guestEmails: 10 });
  });
});

// -------------------------------------------------------------------------------------------------- 4
/** The autopilot for 300 guests: real database, real engine, fake provider and clock (as in journey.test). */
describe('launch scale: invitation texts for 300 guests', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let provider: FakeProvider;
  let waits: Promise<unknown>[];
  let cookie = '';
  let wid = '';
  const clock = fakeClock('2027-06-01T07:00');
  const at = (local: string) => {
    clock.set(local);
    vi.setSystemTime(clock.now());
  };
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: clock.now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = () => ({ waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException: () => {}, props: {} }) as unknown as ExecutionContext;
  const api = (path: string, init: RequestInit = {}) => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx());
  const tick = async () => {
    await scheduled(env, deps);
    await Promise.all(waits);
  };
  const CAP = 100;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    provider = new FakeProvider();
    waits = [];
    at('2027-06-01T07:00');
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: OWNER, ownerPassHash: await hashPasscode(PASS), sampleGuests: false });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    await t.db.prepare(`UPDATE wedding SET sms_sender = '+61400000999', sms_daily_cap = ?`).bind(CAP).run();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', MM_HOOK_SECRET: 'hook' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: OWNER, passcode: PASS }) }, env, ctx());
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    await t.db.prepare(`UPDATE session SET expires_at = '2099-01-01T00:00:00.000Z'`).run();
  });
  afterEach(async () => {
    await t.dispose();
    vi.useRealTimers();
  });

  it('the daily cap holds, quiet hours hold, and repeated or overlapping cron runs never send twice', { timeout: 120_000 }, async () => {
    const imp = await api(`/a/w/${wid}/guests/import`, {
      method: 'POST',
      body: JSON.stringify({ rows: Array.from({ length: 300 }, (_, i) => ({ people: i % 2 ? [`Text${i} Guest`, `Plus Text${i}`] : [`Text${i} Guest`], phone: mobile(i) })) }),
    });
    expect(imp.status).toBe(200);
    expect(((await imp.json()) as { added: number }).added).toBe(300);
    const sentInvites = async () =>
      (await t.db
        .prepare(`SELECT o.invitation_id, o.dedupe_key, o.sent_at FROM sms_out o JOIN campaign c ON c.id = o.campaign_id WHERE c.key = 'invite' AND o.status = 'sent'`)
        .all<{ invitation_id: string; dedupe_key: string; sent_at: string }>()).results;
    const outbox = async () => (await t.db.prepare(`SELECT COUNT(*) AS n FROM sms_out`).first<{ n: number }>())!.n;

    // 7am: quiet hours. Nothing is queued or sent.
    await tick();
    expect(provider.delivered).toHaveLength(0);
    expect(await outbox()).toBe(0);

    // 10am: the first 100 (the daily cap); five more runs that morning send nothing more.
    at('2027-06-01T10:00');
    await tick();
    expect(provider.delivered).toHaveLength(CAP);
    for (const time of ['10:15', '10:30', '10:45', '11:00', '11:15']) {
      at(`2027-06-01T${time}`);
      await tick();
    }
    expect(provider.delivered).toHaveLength(CAP);
    expect(await outbox()).toBe(300); // the rest wait in the queue
    // Evening and early morning: quiet hours, though there is room tomorrow.
    at('2027-06-01T21:00');
    await tick();
    at('2027-06-02T06:30');
    await tick();
    expect(provider.delivered).toHaveLength(CAP);

    // Day two: the next 100.
    at('2027-06-02T10:00');
    await tick();
    for (let k = 0; k < 4; k++) await tick();
    expect(provider.delivered).toHaveLength(2 * CAP);

    // Day three: three overlapping runs at once still send each remaining invitation once.
    at('2027-06-03T10:00');
    await Promise.all([tick(), tick(), tick()]);
    expect(provider.delivered).toHaveLength(300);
    // Day four: five more runs, nothing left to send.
    at('2027-06-04T10:00');
    for (let k = 0; k < 5; k++) await tick();
    expect(provider.delivered).toHaveLength(300);

    const sent = await sentInvites();
    expect(sent).toHaveLength(300);
    expect(new Set(sent.map((s) => s.invitation_id)).size).toBe(300);
    const keys = (await t.db.prepare(`SELECT dedupe_key FROM sms_out`).all<{ dedupe_key: string }>()).results.map((r) => r.dedupe_key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(provider.duplicates()).toEqual([]);
    expect(new Set(provider.delivered.map((m) => m.to)).size).toBe(300);
    // Per day (where the wedding is): never more than the cap, never in quiet hours.
    const perDay = new Map<string, number>();
    for (const s of sent) perDay.set(dateIn(TZ, new Date(s.sent_at)), (perDay.get(dateIn(TZ, new Date(s.sent_at))) ?? 0) + 1);
    expect(Object.fromEntries(perDay)).toEqual({ '2027-06-01': CAP, '2027-06-02': CAP, '2027-06-03': CAP });
    expect(sent.filter((s) => inQuietHours(new Date(s.sent_at), TZ))).toEqual([]);
  });
});
