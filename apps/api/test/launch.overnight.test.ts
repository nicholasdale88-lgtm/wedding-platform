import { allPayments, autoSeat, inQuietHours, PRICE_CENTS, EVENT_ADDON_CENTS, dateIn, zonedToUtc, type Budget, type Vendors } from '@wp/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp, scheduled } from '../src/index';
import { receiveEmail } from '../src/routes/inbox';
import type { EngineDeps } from '../src/sms/engine';
import { testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

/**
 * The overnight run: 12 sample weddings on every push (500 in the Nightly workflow) in ONE database, built from a seed so any failure reproduces, taken
 * through a couple's whole year phase by phase (each phase an `it`, in order). Sizes 10 to 350 guests, one to
 * three events, Free, Essentials and Deluxe (upgraded by the platform, a promo code, a card payment and a
 * payment link), guest lists with odd data, a concept seating plan before the invitations, invitations by text
 * and by email through the real cron (quiet hours, daily caps), replies and changes of mind, late replies,
 * meals, seating after the replies (auto-seat, versions, publish), declines after being seated, the planner,
 * the wedding party, the inbox, and the company portal checked against the totals of every wedding.
 *
 * After each phase the invariants are checked: no wedding sees another's data; the figures match the data;
 * nobody who said no has a seat, a meal or dietary notes; no table is over its seats; published seating shows
 * only people coming; money adds up to the payments; no 5xx; nothing slow.
 */

function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

/** 12 on every push (the push CI has a 15-minute limit); the Nightly workflow runs 500 (STRESS_WEDDINGS=500). */
const WEDDINGS = Math.max(12, Number(process.env.STRESS_WEDDINGS) || 12);
/** Each phase gets more time as the number of weddings grows. */
const PHASE_MS = Math.round(240_000 * Math.max(1, WEDDINGS / 40));
const BOSS = 'boss@overnight.example';
const PASSCODE = 'overnight-2027';
const WHSEC = 'whsec_overnight';
const TZ = 'Australia/Sydney';
/** yyyy-mm-dd, n days from today. */
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ipOf = (n: number) => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Each request slower than this is a fault (a busy CI runner is allowed a lot). */
const SLOW_MS = 8000;

const FIRST = ['Olivia', 'Jack', 'Charlotte', 'William', 'Amelia', 'Noah', 'Isla', 'Thomas', 'Mia', 'James', 'Ava', 'Lucas', 'Grace', 'Henry', 'Chloe', 'Oliver', 'Matilda', 'Leo', 'Zoë', 'José', 'Siobhán', 'Renée', 'Björk', 'Ngaio', 'Saoirse'];
const LAST = ['Smith', 'Nguyễn', 'Williams', 'Brown', "O'Neil-Smythe", 'Ångström', 'Núñez', 'Müller', '李', 'Ó Briain', 'Kelly', 'Murphy'];
const PARTNERS = ['Sam', 'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie'];
const DIETS = ['Vegetarian', 'Vegan', 'Coeliac', 'Severe peanut allergy', 'No seafood', 'Halal', 'Dairy free'];

type Plan = 'free' | 'essentials' | 'complete';
type Channel = '' | 'text' | 'email' | 'both';
type Init = { method?: string; body?: string; headers?: Record<string, string> };
type Person = { id: string; idx: number; name: string };
type Reply = { attending: boolean; count: number };
type Inv = { id: string; token: string; people: Person[]; seats: number; phone: string | null; email: string | null; channel: Channel; invited: string[]; rsvp: Record<string, Reply> };
type Wd = {
  n: number; id: string; slug: string; cookie: string; email: string; plan: Plan; keys: string[]; tz: string; cap: number; invs: Inv[];
  paidCents: number; closed: boolean; conceptVersion: string; tag: string;
};
type ImportRow = { people: string[]; phone?: string; email?: string; seats?: number; party?: string; invited?: string[] };
type ServerGuest = { id: string; version: number; seatsHeld: number; people: { id: string; idx: number; name: string; diet: string }[]; invited: string[]; rsvp: Record<string, { attending: boolean | null; count: number }> };
type GuestList = { guests: ServerGuest[]; links: Record<string, string> };
type PerEvent = { key: string; invited: number; yes: number; no: number; awaiting: number; coming: number; seated: number };
type Overview = { wedding: { id: string; plan: Plan }; total: number; perEvent: PerEvent[] };
type SeatTable = { id: string; name: string; shape: string; dir: 'h' | 'v'; len: number; x: number; y: number; seats: number };
type SeatPerson = { id: string; invitationId: string; name: string; party: string; role: string; tableId: string | null; coming: boolean };
type SeatView = {
  version: number;
  event: { key: string };
  tables: SeatTable[];
  people: SeatPerson[];
  versions: { id: string; name: string }[];
  current: { id: string } | null;
  published: { changes: number; saidNo: string[] } | null;
  stage: { auto: string };
};
type Stats = { weddings: number; plans: Record<string, number>; revenue: { total: number; payments: number }; guests: number; replies: number };

describe(`overnight: ${WEDDINGS} sample weddings, phase by phase`, () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const provider = new FakeProvider();
  const clock = fakeClock('2026-10-20T09:00');
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: clock.now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const waits: Promise<unknown>[] = [];
  const ctx = () => ({ waitUntil: (p: Promise<unknown>) => void waits.push(p.catch(() => undefined)), passThroughOnException: () => {}, props: {} }) as unknown as ExecutionContext;
  /** Emails handed to Resend. */
  const mailed: { from: string; to: string[]; subject: string; text: string }[] = [];
  const weddings: Wd[] = [];
  let boss = '';
  let ipN = 0;
  const nextIp = () => ipOf(++ipN);
  /** Every status any route returned in this phase: none may be a 5xx. */
  const seen: { status: number; what: string; ms: number }[] = [];
  const faults: string[] = [];
  /** Payments the company should have counted. */
  const payments: { wid: string; cents: number }[] = [];

  const call = async (path: string, init: Init = {}, cookie = '', ip = 'local') => {
    const what = `${init.method ?? 'GET'} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id').replace(/g=[\w-]+/, 'g=:t').slice(0, 90)}`;
    for (let i = 0; ; i++) {
      const t0 = performance.now();
      const r = await app.request(
        `/api${path}`,
        {
          method: init.method ?? 'GET',
          ...(init.body !== undefined ? { body: init.body } : {}),
          headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, ...(cookie ? { cookie } : {}), ...init.headers },
        },
        env,
        ctx(),
      );
      const ms = performance.now() - t0;
      // "Busy for a moment" (a burst of writes at once): the pages try again, so does this.
      if (r.status === 503 && i < 5 && (await r.clone().text()).includes('"busy"')) {
        await sleep(100 + i * 200);
        continue;
      }
      seen.push({ status: r.status, what, ms });
      return r;
    }
  };
  const json = async <T,>(r: Response) => (await r.json()) as T;
  const admin = (w: Wd, path: string, init: Init = {}) => call(`/a/w/${w.id}${path}`, init, w.cookie);
  const post = (w: Wd, path: string, data: unknown) => admin(w, path, { method: 'POST', body: JSON.stringify(data) });
  const put = (w: Wd, path: string, version: number, data: unknown) => admin(w, path, { method: 'PUT', headers: { 'If-Match': String(version) }, body: JSON.stringify(data) });
  const company = (path: string, init: Init = {}) => call(`/a/company${path}`, init, boss);
  const one = async <T,>(sql: string, ...bind: unknown[]) => (await t.db.prepare(sql).bind(...bind).first<T>())!;
  const all = async <T,>(sql: string, ...bind: unknown[]) => (await t.db.prepare(sql).bind(...bind).all<T>()).results;
  const settle = async () => {
    while (waits.length) await Promise.all(waits.splice(0));
  };

  /** No 5xx, nothing slow: checked at the end of every phase. */
  const healthy = async (phase: string) => {
    await settle();
    const crashed = seen.filter((s) => s.status >= 500).map((s) => `${s.status} ${s.what}`);
    expect(crashed, `${phase}: ${faults.slice(0, 4).join(' | ')}`).toEqual([]);
    const slow = seen.filter((s) => s.ms > SLOW_MS).map((s) => `${Math.round(s.ms)}ms ${s.what}`);
    expect(slow, phase).toEqual([]);
    seen.length = 0;
    faults.length = 0;
  };

  /**
   * The database-wide rules, whatever happened before: a seat needs an invitation to that event and no "no"
   * (and a yes for N is the first N people); seats are at a table of the same event and wedding; no table has
   * more people than seats; nobody who said no has a meal there; nobody who said no to everything keeps
   * dietary notes; replies are for the guest's own wedding's events.
   */
  const dbInvariants = async (phase: string) => {
    // One query per rule (D1 allows only a few terms in a compound SELECT).
    const rules = [
      `SELECT p.name, 'seated but not coming' AS why FROM seat s JOIN person p ON p.id = s.person_id JOIN invitation i ON i.id = p.invitation_id
          LEFT JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = s.event_id
          LEFT JOIN rsvp r ON r.invitation_id = i.id AND r.event_id = s.event_id
        WHERE i.deleted_at IS NULL AND p.deleted_at IS NULL AND (ie.event_id IS NULL OR r.attending = 0 OR (r.attending = 1 AND p.idx >= MAX(1, r.count)))
      `,
      `SELECT p.name, 'seat at another event or wedding' FROM seat s JOIN person p ON p.id = s.person_id JOIN invitation i ON i.id = p.invitation_id
          JOIN seat_table t ON t.id = s.table_id JOIN event e ON e.id = s.event_id
        WHERE t.event_id != s.event_id OR t.wedding_id != i.wedding_id OR e.wedding_id != i.wedding_id OR t.deleted_at IS NOT NULL
      `,
      `SELECT t.name, 'over capacity' FROM seat_table t WHERE t.deleted_at IS NULL AND (SELECT COUNT(*) FROM seat s WHERE s.table_id = t.id) > t.seats
      `,
      `SELECT p.name, 'meal after a no' FROM meal_choice m JOIN person p ON p.id = m.person_id JOIN rsvp r ON r.invitation_id = p.invitation_id AND r.event_id = m.event_id WHERE r.attending = 0
      `,
      `SELECT p.name, 'diet after declining everything' FROM person p JOIN invitation i ON i.id = p.invitation_id
        WHERE p.diet != '' AND i.deleted_at IS NULL AND EXISTS (SELECT 1 FROM invite_event WHERE invitation_id = i.id)
          AND NOT EXISTS (SELECT 1 FROM invite_event ie LEFT JOIN rsvp r ON r.invitation_id = ie.invitation_id AND r.event_id = ie.event_id
                           WHERE ie.invitation_id = i.id AND (r.attending IS NULL OR r.attending = 1))
      `,
      `SELECT i.id, 'reply to another wedding''s event' FROM rsvp r JOIN invitation i ON i.id = r.invitation_id JOIN event e ON e.id = r.event_id WHERE e.wedding_id != i.wedding_id`,
    ];
    const bad: Record<string, unknown>[] = [];
    for (const sql of rules) bad.push(...(await all<Record<string, unknown>>(`${sql} LIMIT 5`)));
    expect(bad, phase).toEqual([]);
  };

  /** What guests are shown right after publishing: only people coming (a yes, and among the first N of a yes for N). */
  const publishedOnlyComing = async (w: Wd, key: string) => {
    const row = await one<{ snapshot: string } | null>(`SELECT sp.snapshot FROM seat_publish sp JOIN event e ON e.id = sp.event_id WHERE e.wedding_id = ? AND e.key = ?`, w.id, key);
    if (!row) return;
    const ids = Object.keys((JSON.parse(row.snapshot) as { seats: Record<string, string> }).seats);
    const coming = new Set(w.invs.flatMap((g) => comingPeople(g, key)).map((p) => p.id));
    expect(ids.filter((id) => !coming.has(id)), `${w.tag} published ${key}`).toEqual([]);
  };

  /** People coming to an event: a yes for N is the first N on the invitation. */
  const comingPeople = (g: Inv, key: string) => (g.invited.includes(key) && g.rsvp[key]?.attending ? g.people.slice(0, g.rsvp[key]!.count) : []);
  const clampCount = (g: Inv, count: number) => Math.max(1, Math.min(g.seats, count));

  /** The overview and the seating plan agree with what happened (the model). */
  const figuresMatch = async (w: Wd) => {
    const ov = await json<Overview>(await admin(w, '/overview'));
    expect(ov.total, w.tag).toBe(w.invs.length);
    expect(ov.wedding.plan, w.tag).toBe(w.plan);
    for (const k of w.keys) {
      const inv = w.invs.filter((g) => g.invited.includes(k));
      const yes = inv.filter((g) => g.rsvp[k]?.attending === true).length;
      const no = inv.filter((g) => g.rsvp[k]?.attending === false).length;
      const coming = inv.reduce((s, g) => s + comingPeople(g, k).length, 0);
      expect(ov.perEvent.find((e) => e.key === k), `${w.tag} ${k}`).toMatchObject({ invited: inv.length, yes, no, awaiting: inv.length - yes - no, coming });
    }
  };
  const seatingMatches = async (w: Wd, k: string) => {
    const s = await json<SeatView>(await admin(w, `/seating?event=${k}`));
    const comingIds = new Set(w.invs.flatMap((g) => comingPeople(g, k)).map((p) => p.id));
    const pencilled = new Set(w.invs.filter((g) => g.invited.includes(k) && !g.rsvp[k]).flatMap((g) => g.people.map((p) => p.id)));
    expect(s.people.filter((p) => p.coming).map((p) => p.id).sort(), `${w.tag} ${k} coming`).toEqual([...comingIds].sort());
    expect(s.people.filter((p) => !p.coming && !pencilled.has(p.id)).map((p) => p.name), `${w.tag} ${k} not coming on the plan`).toEqual([]);
    return s;
  };

  /** The model's view of the guest list, refreshed from the server (ids, tokens, people), checked against what was imported. */
  const sync = async (w: Wd) => {
    const r = await admin(w, '/guests');
    expect(r.status, w.tag).toBe(200);
    const list = await json<GuestList>(r);
    const token = (id: string) => new URL(list.links[id]!).searchParams.get('g')!;
    return { list, token };
  };

  beforeAll(async () => {
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void faults.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ').slice(0, 300)));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    t = await testD1();
    env = {
      DB: t.db,
      PUBLIC_BASE_URL: 'https://example.com',
      SESSION_SECRET: 'test-secret-for-sessions-000000',
      SUPER_ADMINS: BOSS,
      STRIPE_SECRET_KEY: 'sk_test_overnight',
      STRIPE_WEBHOOK_SECRET: WHSEC,
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'The Yes List <hello@site.example>',
      INBOX_DOMAIN: 'mail.example',
    } as Env;
    let stripeN = 0;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('api.resend.com')) {
        mailed.push(JSON.parse(String(init?.body ?? '{}')));
        return new Response('{"id":"re_1"}', { status: 200 });
      }
      if (url.includes('api.stripe.com')) {
        stripeN++;
        return new Response(JSON.stringify({ id: `cs_test_${stripeN}`, url: `https://checkout.stripe.com/c/pay/cs_test_${stripeN}` }), { status: 200 });
      }
      return new Response('not here', { status: 404 });
    });
  });
  afterAll(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await t.dispose();
  });

  // ------------------------------------------------------------------------------------------------ 1
  it(`1. ${WEDDINGS} couples sign up; plans by the platform, a promo code, a card (webhook twice) and a payment link; 1 to 3 events`, { timeout: PHASE_MS }, async () => {
    const signup = async (firstName: string, partnerName: string, email: string, date: string) => {
      const r = await call('/a/signup', { method: 'POST', body: JSON.stringify({ firstName, partnerName, email, date, passcode: PASSCODE, plan: 'free', marketing: false, website: '' }) }, '', nextIp());
      expect(r.status, `${email}: ${await r.clone().text()}`).toBe(200);
      const b = await json<{ weddingId: string; weddings: { id: string; slug: string }[] }>(r);
      return { id: b.weddingId, slug: b.weddings.find((x) => x.id === b.weddingId)!.slug, cookie: (r.headers.get('set-cookie') ?? '').split(';')[0]! };
    };
    boss = (await signup('Boss', 'Owner', BOSS, day(400))).cookie;
    expect((await company('/promos', { method: 'PUT', body: JSON.stringify({ codes: [{ code: 'FREEDAY', percentOff: 100 }, { code: 'HALF', percentOff: 50 }] }) })).status).toBe(200);
    const sign = async (raw: string) => {
      const enc = new TextEncoder();
      const ts = Math.floor(Date.now() / 1000);
      const key = await crypto.subtle.importKey('raw', enc.encode(WHSEC), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const mac = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${raw}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `t=${ts},v1=${mac}`;
    };
    /** Stripe says it's paid (delivered twice, as Stripe does): counted and switched on once. */
    const paidByCard = async (w: Wd, what: 'essentials' | 'complete' | 'event', cents: number, promo = '') => {
      const co = await post(w, '/plan/checkout', { what, ...(promo ? { code: promo } : {}) });
      expect(co.status, `${w.tag} checkout ${what}: ${await co.clone().text()}`).toBe(200);
      const raw = JSON.stringify({
        id: `evt_${w.n}_${what}`,
        type: 'checkout.session.completed',
        data: { object: { id: `cs_${w.n}_${what}`, payment_status: 'paid', amount_total: cents, currency: 'aud', metadata: { wedding: w.id, what, ...(promo ? { promo } : {}) } } },
      });
      for (let k = 0; k < 2; k++) {
        const r = await call('/hooks/stripe', { method: 'POST', body: raw, headers: { 'Stripe-Signature': await sign(raw) } });
        expect(r.status, w.tag).toBe(200);
      }
      payments.push({ wid: w.id, cents });
      w.paidCents += cents;
    };

    for (let n = 0; n < WEDDINGS; n++) {
      const r = rng(104_729 * (n + 3));
      const plan: Plan = n % 10 < 4 ? 'free' : n % 10 < 7 ? 'essentials' : 'complete';
      const s = await signup(FIRST[n % FIRST.length]!, PARTNERS[n % PARTNERS.length]!, `couple${n}@overnight.example`, day(90 + (n % 300)));
      const w: Wd = { n, ...s, email: `couple${n}@overnight.example`, plan: 'free', keys: ['wedding'], tz: n % 9 === 0 ? 'Australia/Perth' : TZ, cap: 0, invs: [], paidCents: 0, closed: false, conceptVersion: '', tag: `#${n}` };
      w.tag = `#${n} (${plan})`;
      if (w.tz !== TZ) await t.db.prepare(`UPDATE wedding SET timezone = ? WHERE id = ?`).bind(w.tz, w.id).run();
      weddings.push(w);
      // Basic (paid, so guests' pages are live): a second event is an add-on.
      if (plan === 'free') {
        await t.db.prepare(`UPDATE wedding SET plan = 'basic' WHERE id = ?`).bind(w.id).run();
        if (n % 4 === 0) expect((await post(w, '/events', { name: 'Welcome drinks', startsAt: `${day(89 + (n % 300))}T08:00:00.000Z` })).status, w.tag).toBe(402);
        continue;
      }
      const how = n % 4;
      if (how === 0) {
        expect((await call('/a/super/plan', { method: 'PUT', body: JSON.stringify({ slug: w.slug, plan }) }, boss)).status, w.tag).toBe(200);
      } else if (how === 1) {
        expect((await post(w, '/plan/promo', { what: plan, code: 'freeday' })).status, w.tag).toBe(200);
        const co = await post(w, '/plan/checkout', { what: plan, code: 'FREEDAY' });
        expect(co.status, `${w.tag} ${await co.clone().text()}`).toBe(200);
        payments.push({ wid: w.id, cents: 0 });
      } else if (how === 2) {
        if (plan === 'complete' && r() < 0.5) {
          // Essentials first, then Deluxe for the difference.
          await paidByCard(w, 'essentials', PRICE_CENTS.essentials);
          await paidByCard(w, 'complete', PRICE_CENTS.complete - PRICE_CENTS.essentials);
        } else await paidByCard(w, plan, r() < 0.3 ? PRICE_CENTS[plan] / 2 : PRICE_CENTS[plan], r() < 0.3 ? 'HALF' : '');
        // Bought already: there's nothing more to buy at that plan.
        expect((await post(w, '/plan/checkout', { what: plan })).status, w.tag).toBe(409);
      } else {
        expect((await post(w, '/plan/request', { plan })).status, w.tag).toBe(200);
        expect((await company(`/weddings/${w.slug}/paid`, { method: 'POST', body: JSON.stringify({ what: plan, cents: PRICE_CENTS[plan] }) })).status, w.tag).toBe(200);
        payments.push({ wid: w.id, cents: PRICE_CENTS[plan] });
        w.paidCents += PRICE_CENTS[plan];
      }
      w.plan = plan;
      // Events: Essentials includes one, Deluxe two; another is bought by card.
      const included = plan === 'complete' ? 2 : 1;
      const want = plan === 'complete' ? 2 + (r() < 0.4 ? 1 : 0) : 1 + (r() < 0.4 ? 1 : 0);
      for (let e = 1; e < want; e++) {
        const name = ['', 'Welcome drinks', 'Recovery brunch'][e]!;
        const body = { name, startsAt: `${day(e === 1 ? 89 + (n % 300) : 91 + (n % 300))}T0${e}:00:00.000Z` };
        if (e >= included) {
          expect((await post(w, '/events', body)).status, `${w.tag} event ${e} before paying`).toBe(402);
          await paidByCard(w, 'event', EVENT_ADDON_CENTS);
        }
        const ev = await post(w, '/events', body);
        expect(ev.status, `${w.tag} event ${e}: ${await ev.clone().text()}`).toBe(201);
        w.keys.push((await json<{ added: string }>(ev)).added);
      }
    }
    for (const w of weddings.filter((x) => x.plan === 'free')) expect(w.keys, w.tag).toEqual(['wedding']);

    // The company's figures: every wedding, every plan, every payment exactly once.
    const st = await json<Stats>(await company('/stats'));
    const plans = (p: Plan) => weddings.filter((w) => w.plan === p).length;
    expect(st.weddings).toBe(WEDDINGS + 1);
    expect(st.plans).toMatchObject({ free: 1, basic: plans('free'), essentials: plans('essentials'), complete: plans('complete') }); // 'free': the one not paid yet
    expect(st.revenue).toMatchObject({ total: payments.reduce((a, p) => a + p.cents, 0), payments: payments.length });
    const money = await json<{ total: { gross: number; sales: number } }>(await company('/money'));
    expect(money.total).toMatchObject({ gross: payments.reduce((a, p) => a + p.cents, 0), sales: payments.length });
    for (const w of weddings.filter((x) => x.n % 7 === 0)) {
      const found = await json<{ weddings: { slug: string; paidCents: number; plan: string }[] }>(await company(`/weddings?q=${w.slug}`));
      expect(found.weddings.find((x) => x.slug === w.slug), w.tag).toMatchObject({ paidCents: w.paidCents, plan: w.plan === 'free' ? 'basic' : w.plan });
    }
    await healthy('sign-ups and plans');
  });

  // ------------------------------------------------------------------------------------------------ 2
  it('2. guest lists with odd data: duplicates, no mobiles, emails, unicode, huge households, plus-ones, Free over its limit', { timeout: PHASE_MS }, async () => {
    for (const w of weddings) {
      const r = rng(7919 * (w.n + 11));
      const free = w.plan === 'free';
      const target = free ? 10 + Math.floor(r() * 41) : w.n === 7 ? 350 : w.n === 17 ? 300 : 10 + Math.floor(340 * r() ** 3);
      const rows: ImportRow[] = [];
      let people = 0;
      for (let i = 0; people < target; i++) {
        const roll = r();
        const room = target - people;
        const size = Math.min(room, roll < 0.45 ? 1 : roll < 0.8 ? 2 : roll < 0.93 ? 3 + Math.floor(r() * 2) : roll < 0.98 ? 5 + Math.floor(r() * 2) : room >= 10 ? 10 + Math.floor(r() * 3) : 2);
        const surname = `${LAST[i % LAST.length]}${i}`;
        const names = [`${FIRST[(i + w.n) % FIRST.length]} ${surname}`, `${PARTNERS[i % PARTNERS.length]} ${surname}`, ...Array.from({ length: 10 }, (_, k) => `Kid${k} ${surname}`)].slice(0, size);
        const invited = w.keys.length > 1 && r() < 0.5 ? w.keys.filter((key) => key === w.keys[0] || r() < 0.5) : w.keys;
        rows.push({
          people: names,
          ...(r() < 0.7 ? { phone: `04${String(20_000_000 + w.n * 1000 + i)}` } : {}),
          ...(r() < 0.4 ? { email: `G${w.n}x${i}@Guests.Example` } : {}),
          ...(size === 1 && r() < 0.15 ? { seats: 2 } : {}), // a plus-one, name to come
          party: ['', 'Family', 'Uni friends', 'Work', 'Netball'][Math.floor(r() * 5)]!,
          invited,
        });
        people += size;
      }
      // Odd data the import must skip: the same name again (different case and spacing), a mobile already on the list.
      const dupes: ImportRow[] = [{ people: [`  ${rows[0]!.people[0]!.toUpperCase()}  `] }];
      const withPhone = rows.find((x) => x.phone);
      if (withPhone) dupes.push({ people: [`Someone Else${w.n}`], phone: withPhone.phone!.replace(/^04(\d\d)/, '04$1 ') });

      if (w.n % 10 === 3) {
        // A row with a bad email stops the whole import: nothing added.
        const bad = await post(w, '/guests/import', { rows: [...rows.slice(0, 3), { people: ['Bad Email'], email: 'not-an-email' }] });
        expect(bad.status, w.tag).toBe(400);
      }
      if (free && w.n % 2 === 0) {
        // Free: more than 50 people is refused whole (402), nothing added.
        const over = await post(w, '/guests/import', { rows: Array.from({ length: 26 }, (_, i) => ({ people: [`Over${i} Limit`, `Plus${i} Limit`] })) });
        expect(over.status, w.tag).toBe(402);
      }
      const res = await post(w, '/guests/import', { rows: [...rows, ...dupes] });
      const body = await json<{ added: number; skipped: unknown[]; problems: unknown[] }>(res);
      expect(res.status, `${w.tag} ${JSON.stringify(body).slice(0, 300)}`).toBe(200);
      expect(body.added, w.tag).toBe(rows.length);
      expect(body.skipped, w.tag).toHaveLength(dupes.length);

      // The model, from the server's list, checked against the rows.
      const { list, token } = await sync(w);
      expect(list.guests, w.tag).toHaveLength(rows.length);
      const byName = new Map(list.guests.map((g) => [g.people[0]!.name, g]));
      w.invs = rows.map((row): Inv => {
        const g = byName.get(row.people[0]!);
        expect(g, `${w.tag} ${row.people[0]}`).toBeDefined();
        expect(g!.people.map((p) => p.name), w.tag).toEqual(row.people);
        expect(g!.invited, w.tag).toEqual(row.invited);
        expect(g!.seatsHeld, w.tag).toBe(Math.max(row.seats ?? row.people.length, row.people.length));
        return {
          id: g!.id, token: token(g!.id), people: g!.people.map(({ id, idx, name }) => ({ id, idx, name })), seats: g!.seatsHeld,
          phone: row.phone ?? null, email: row.email?.toLowerCase() ?? null, channel: '', invited: row.invited!, rsvp: {},
        };
      });
      // Some want email as well as (or instead of) texts.
      for (const g of w.invs.filter((x) => x.phone && x.email)) {
        const roll = r();
        if (roll > 0.5) continue;
        const version = list.guests.find((x) => x.id === g.id)!.version;
        const ch: Channel = roll < 0.3 ? 'both' : 'email';
        const p = await admin(w, `/guests/${g.id}`, { method: 'PATCH', headers: { 'If-Match': String(version) }, body: JSON.stringify({ channel: ch }) });
        expect(p.status, w.tag).toBe(200);
        g.channel = ch;
      }
      await figuresMatch(w);
    }
    // Everyone's guests, counted by the company.
    const st = await json<Stats>(await company('/stats'));
    expect(st.guests).toBe(weddings.reduce((a, w) => a + w.invs.reduce((b, g) => b + g.people.length, 0), 0));
    await dbInvariants('import');
    await healthy('import');
  });

  // ------------------------------------------------------------------------------------------------ 3
  it('3. a concept seating plan before any invitation: everyone pencilled in by auto-seat, no table over its seats', { timeout: PHASE_MS }, async () => {
    for (const w of weddings) {
      const s0 = await json<SeatView>(await admin(w, '/seating'));
      if (w.plan === 'free') {
        expect((await put(w, '/seating', s0.version, { event: 'wedding', aspect: '4 / 3', tables: [], areas: [], seats: {} })).status, w.tag).toBe(402);
        continue;
      }
      expect(s0.stage.auto, w.tag).toBe('draft');
      const everyone = s0.people.length;
      expect(everyone, w.tag).toBe(w.invs.filter((g) => g.invited.includes('wedding')).reduce((a, g) => a + g.people.length, 0));
      // Tables of 8, 10 and 12, with about 15% to spare.
      const tables: SeatTable[] = [];
      for (let room = 0, i = 0; room < everyone * 1.15 + 4; i++) {
        const seats = [8, 10, 12][i % 3]!;
        tables.push({ id: crypto.randomUUID(), name: String(i + 1), shape: 'round', dir: 'h', len: 30, x: 5 + (i % 9) * 10, y: 5 + Math.floor(i / 9) * 12, seats });
        room += seats;
      }
      const plan = autoSeat(s0.people.map((p) => ({ ...p, coming: true })), tables, {});
      const counts = new Map<string, number>();
      for (const tid of Object.values(plan.seats)) if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1);
      expect(tables.filter((x) => (counts.get(x.id) ?? 0) > x.seats).map((x) => x.name), `${w.tag} auto-seat over capacity`).toEqual([]);
      const saved = await put(w, '/seating', s0.version, { event: 'wedding', aspect: '4 / 3', tables, areas: [{ label: 'Dance floor', x: 40, y: 80, w: 20, h: 10 }], seats: plan.seats });
      expect(saved.status, `${w.tag} ${await saved.clone().text()}`).toBe(200);
      const v = await json<SeatView>(await post(w, '/seating/versions', { event: 'wedding', name: 'Concept' }));
      w.conceptVersion = v.versions.find((x) => x.name === 'Concept')!.id;
      expect(v.people.filter((p) => !p.tableId).length, `${w.tag} left unseated`).toBe(plan.left);
    }
    await dbInvariants('concept plan');
    await healthy('concept plan');
  });

  // ------------------------------------------------------------------------------------------------ 4
  it('4. invitations by text and email through the real cron: quiet hours, daily caps, each guest once, Free emails only', { timeout: PHASE_MS }, async () => {
    const D = day(2);
    const paid = weddings.filter((w) => w.plan !== 'free');
    for (const w of paid) {
      w.cap = w.n % 5 === 0 ? 25 : 500;
      await t.db.prepare(`UPDATE wedding SET sms_sender = ?, admin_mobile = ?, sms_daily_cap = ? WHERE id = ?`).bind(`+6140000${String(w.n).padStart(4, '0')}`, `+6141900${String(w.n).padStart(4, '0')}`, w.cap, w.id).run();
    }
    for (const w of weddings) {
      const slot = zonedToUtc(`${D}T10:00`, w.tz).toISOString();
      const r = await post(w, '/texts', { name: 'Invitations', audience: { all: true }, body: 'Hi {first}, you are invited! Your invitation and RSVP: {link}', dates: [slot] });
      expect(r.status, `${w.tag} ${await r.clone().text()}`).toBe(200);
    }
    await settle();
    vi.useFakeTimers({ toFake: ['Date'] });
    const at = (local: string) => {
      clock.set(local);
      vi.setSystemTime(clock.now());
    };
    const tick = async () => {
      await scheduled(env, deps);
      await settle();
    };
    const campaignTexts = () =>
      all<{ wedding_id: string; invitation_id: string; to_phone: string; sent_at: string }>(
        `SELECT o.wedding_id, o.invitation_id, o.to_phone, o.sent_at FROM sms_out o JOIN campaign c ON c.id = o.campaign_id WHERE c.name = 'Invitations' AND o.invitation_id IS NOT NULL AND o.status IN ('sent', 'delivered')`,
      );
    const invitesMailed = () => mailed.filter((m) => m.text.includes('you are invited'));
    try {
      // Before the slot (and in quiet hours): nothing at all.
      at(`${D}T07:00`);
      await tick();
      expect(await campaignTexts()).toHaveLength(0);
      expect(invitesMailed()).toHaveLength(0);
      // Each morning and afternoon for a week (Perth is three hours behind: its 10am is Sydney's 1pm).
      for (let k = 0; k < 7; k++) {
        const d = new Date(Date.parse(`${D}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
        at(`${d}T10:05`);
        await tick();
        at(`${d}T15:05`);
        await tick();
      }
    } finally {
      vi.useRealTimers();
    }
    const texts = await campaignTexts();
    const mails = invitesMailed();
    expect(provider.duplicates()).toEqual([]);
    for (const w of weddings) {
      const mine = texts.filter((x) => x.wedding_id === w.id);
      if (w.plan === 'free') expect(mine, `${w.tag} texts on Free`).toHaveLength(0);
      else {
        const textable = w.invs.filter((g) => g.phone && g.channel !== 'email').map((g) => g.id).sort();
        expect(mine.map((x) => x.invitation_id).sort(), `${w.tag} each textable guest once`).toEqual(textable);
        // Never more than the day's cap, never in quiet hours (where the wedding is).
        const perDay = new Map<string, number>();
        for (const x of mine) perDay.set(dateIn(w.tz, new Date(x.sent_at)), (perDay.get(dateIn(w.tz, new Date(x.sent_at))) ?? 0) + 1);
        expect([...perDay.values()].filter((c) => c > w.cap), `${w.tag} cap`).toEqual([]);
        expect(mine.filter((x) => inQuietHours(new Date(x.sent_at), w.tz)).map((x) => x.sent_at), `${w.tag} quiet hours`).toEqual([]);
      }
      // Email: guests with no mobile, or who chose email; once each, from the wedding's own address.
      const emailable = w.invs.filter((g) => g.email && (g.channel === 'email' || g.channel === 'both' || (!g.channel && !g.phone))).map((g) => g.email!).sort();
      const got = mails.filter((m) => emailable.includes(m.to[0]!));
      expect(got.map((m) => m.to[0]!).sort(), `${w.tag} each emailed guest once`).toEqual(emailable);
      expect(got.filter((m) => !m.from.includes('@mail.example')).map((m) => m.from), w.tag).toEqual([]);
    }
    // Nobody else's guests got this wedding's invitation.
    const everyEmail = new Set(weddings.flatMap((w) => w.invs.map((g) => g.email).filter((e): e is string => !!e)));
    expect(mails.filter((m) => !everyEmail.has(m.to[0]!)).map((m) => m.to[0])).toEqual([]);
    await dbInvariants('invitations');
    await healthy('invitations');
  });

  // ------------------------------------------------------------------------------------------------ 5
  it('5. replies: yes for some of the household, no, split answers, changes of mind, dietary needs, late replies after the close', { timeout: PHASE_MS }, async () => {
    const rsvp = async (w: Wd, g: Inv, answers: Record<string, boolean>, count: number, extra: Record<string, unknown> = {}) => {
      const r = await call(
        `/p/${w.slug}/rsvp`,
        { method: 'POST', body: JSON.stringify({ token: g.token, events: Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, { attending: a }])), count, ...extra }) },
        '',
        nextIp(),
      );
      if (r.status === 200) for (const [k, a] of Object.entries(answers)) g.rsvp[k] = { attending: a, count: clampCount(g, count) };
      return r;
    };
    for (const w of weddings) {
      const r = rng(31_337 * (w.n + 5));
      for (const g of w.invs) {
        const roll = r();
        if (roll > 0.8) continue; // never replies (yet)
        const answers = Object.fromEntries(g.invited.map((k) => [k, roll < 0.5 ? true : roll < 0.65 ? r() < 0.5 : false]));
        const count = 1 + Math.floor(r() * (g.seats + 1)); // sometimes fewer than the household, sometimes more than they hold
        const diet = Object.values(answers).some(Boolean) && r() < 0.25 ? DIETS[Math.floor(r() * DIETS.length)]! : '';
        const res = await rsvp(w, g, answers, count, { diet, ...(r() < 0.1 ? { message: 'Can’t wait! 🥂 ' + 'x'.repeat(200) } : {}) });
        expect(res.status, `${w.tag} reply`).toBe(200);
      }
      // Changes of mind: some flip every answer, some change how many are coming.
      for (const g of w.invs.filter((x) => Object.keys(x.rsvp).length && r() < 0.15)) {
        const flip = Object.fromEntries(Object.entries(g.rsvp).map(([k, v]) => [k, !v.attending]));
        expect((await rsvp(w, g, flip, g.seats)).status, `${w.tag} change`).toBe(200);
      }
      await figuresMatch(w);
    }
    // Late replies: a close date in the past. A first reply still counts; a change is refused (403) and changes nothing.
    for (const w of weddings.filter((x) => x.n % 12 === 5)) {
      await t.db.prepare(`UPDATE wedding SET content = json_set(content, '$.invitation.rsvpClose', ?) WHERE id = ?`).bind(day(-2), w.id).run();
      w.closed = true;
      const late = w.invs.find((g) => !Object.keys(g.rsvp).length);
      if (late) expect((await rsvp(w, late, Object.fromEntries(late.invited.map((k) => [k, true])), 1)).status, `${w.tag} late first reply`).toBe(200);
      const changer = w.invs.find((g) => g !== late && Object.keys(g.rsvp).length);
      if (changer) {
        const before = structuredClone(changer.rsvp);
        const r = await rsvp(w, changer, Object.fromEntries(Object.keys(changer.rsvp).map((k) => [k, !changer.rsvp[k]!.attending])), 1);
        expect(r.status, `${w.tag} change after the close`).toBe(403);
        expect(changer.rsvp, w.tag).toEqual(before);
      }
      await figuresMatch(w);
    }
    // Meals for some of those coming; never for someone who said no.
    for (const w of weddings.filter((x) => x.plan !== 'free')) {
      const coming = w.invs.flatMap((g) => comingPeople(g, 'wedding')).slice(0, 6);
      for (const p of coming) expect((await admin(w, `/people/${p.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', entree: 'Soup', main: 'Barramundi', dessert: 'Pavlova' }) })).status, w.tag).toBe(200);
      const no = w.invs.find((g) => g.rsvp.wedding?.attending === false);
      if (no) expect((await admin(w, `/people/${no.people[0]!.id}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', entree: '', main: 'Fish', dessert: '' }) })).status, `${w.tag} meal for a no`).toBe(400);
    }
    // The company counts every answer.
    const st = await json<Stats>(await company('/stats'));
    expect(st.replies).toBe(weddings.reduce((a, w) => a + w.invs.reduce((b, g) => b + g.invited.filter((k) => g.rsvp[k]).length, 0), 0));
    await dbInvariants('replies');
    await healthy('replies');
  });

  // ------------------------------------------------------------------------------------------------ 6
  it('6. seating after the replies: auto-seat, versions, published with only the people coming', { timeout: PHASE_MS }, async () => {
    for (const w of weddings.filter((x) => x.plan !== 'free')) {
      const s1 = await seatingMatches(w, 'wedding');
      // Auto-seat everyone still on the plan (pencilled-in guests keep a place), keeping who's already seated.
      const current = Object.fromEntries(s1.people.map((p) => [p.id, p.tableId]));
      const plan = autoSeat(s1.people.map((p) => ({ ...p, coming: true })), s1.tables, current);
      const saved = await put(w, '/seating', s1.version, { event: 'wedding', aspect: '4 / 3', tables: s1.tables, areas: [], seats: plan.seats });
      expect(saved.status, `${w.tag} ${await saved.clone().text()}`).toBe(200);
      const v1 = await json<SeatView>(await post(w, '/seating/versions', { event: 'wedding', name: 'After replies' }));
      const after = v1.versions.find((x) => x.name === 'After replies')!.id;
      // Back to the concept, then the new one again: nobody who said no comes back with it.
      const c1 = await admin(w, `/seating/versions/${w.conceptVersion}/current`, { method: 'POST', headers: { 'If-Match': String(v1.version) }, body: '{}' });
      expect(c1.status, w.tag).toBe(200);
      await dbInvariants(`${w.tag} concept made current`);
      const c2 = await admin(w, `/seating/versions/${after}/current`, { method: 'POST', headers: { 'If-Match': String((await json<SeatView>(c1)).version) }, body: '{}' });
      expect(c2.status, w.tag).toBe(200);
      const v2 = await json<SeatView>(c2);
      expect(v2.current?.id, w.tag).toBe(after);
      const pub = await admin(w, '/seating/publish', { method: 'POST', headers: { 'If-Match': String(v2.version) }, body: JSON.stringify({ event: 'wedding' }) });
      expect(pub.status, w.tag).toBe(200);
      expect((await json<SeatView>(pub)).published?.changes, w.tag).toBe(0);
      await publishedOnlyComing(w, 'wedding');
      await seatingMatches(w, 'wedding');
      await figuresMatch(w);
    }
    await dbInvariants('seating');
    await healthy('seating');
  });

  // ------------------------------------------------------------------------------------------------ 7
  it('7. declines after being seated (on the website, by the couple, by email, fewer coming): seats and meals freed, guests told once republished', { timeout: PHASE_MS }, async () => {
    for (const w of weddings.filter((x) => x.plan !== 'free' && !x.closed)) {
      const seated = await json<SeatView>(await admin(w, '/seating?event=wedding'));
      const seatedInv = new Set(seated.people.filter((p) => p.tableId && p.coming).map((p) => p.invitationId));
      const yes = w.invs.filter((g) => seatedInv.has(g.id) && g.rsvp.wedding?.attending);
      const gone: string[] = [];
      // On the website: no to everything.
      const a = yes[0];
      if (a) {
        const r = await call(`/p/${w.slug}/rsvp`, { method: 'POST', body: JSON.stringify({ token: a.token, events: Object.fromEntries(a.invited.map((k) => [k, { attending: false }])), count: 1 }) }, '', nextIp());
        expect(r.status, w.tag).toBe(200);
        for (const k of a.invited) a.rsvp[k] = { attending: false, count: 1 };
        gone.push(...a.people.map((p) => p.name));
      }
      // The couple records a phone call: no to the wedding.
      const b = yes[1];
      if (b) {
        const g = await json<{ guest: { version: number } }>(await admin(w, `/guests/${b.id}`));
        const r = await admin(w, `/guests/${b.id}/rsvp`, { method: 'PUT', headers: { 'If-Match': String(g.guest.version) }, body: JSON.stringify({ events: { wedding: { attending: false } } }) });
        expect(r.status, w.tag).toBe(200);
        b.rsvp.wedding = { attending: false, count: b.rsvp.wedding!.count };
        gone.push(...b.people.map((p) => p.name));
      }
      // Fewer coming: a family of several now says one.
      const c = yes.slice(2).find((g) => g.people.length > 1 && (g.rsvp.wedding?.count ?? 0) > 1);
      if (c) {
        const r = await call(`/p/${w.slug}/rsvp`, { method: 'POST', body: JSON.stringify({ token: c.token, events: Object.fromEntries(c.invited.map((k) => [k, { attending: true }])), count: 1 }) }, '', nextIp());
        expect(r.status, w.tag).toBe(200);
        for (const k of c.invited) c.rsvp[k] = { attending: true, count: 1 };
        gone.push(...c.people.slice(1).map((p) => p.name));
      }
      await dbInvariants(`${w.tag} after declines`);
      const s = await seatingMatches(w, 'wedding');
      // The published plan still shows them until it's published again: the couple is told who.
      expect([...(s.published?.saidNo ?? [])].sort(), w.tag).toEqual(expect.arrayContaining(gone.filter((name) => seated.people.some((p) => p.name === name && p.coming && p.tableId))));
      const pub = await admin(w, '/seating/publish', { method: 'POST', headers: { 'If-Match': String(s.version) }, body: JSON.stringify({ event: 'wedding' }) });
      expect(pub.status, w.tag).toBe(200);
      expect((await json<SeatView>(pub)).published?.saidNo, w.tag).toEqual([]);
      await publishedOnlyComing(w, 'wedding');
      await figuresMatch(w);
    }
    await dbInvariants('declines');
    await healthy('declines');
  });

  // ------------------------------------------------------------------------------------------------ 8
  it('8. the planner: budget, vendors with quotes and a booking, the wedding party with its own page', { timeout: PHASE_MS }, async () => {
    for (const w of weddings.filter((x) => x.plan !== 'free')) {
      const budget = { total: 20_000 + w.n * 250, guests: w.invs.length, lines: [{ category: 'Venue and catering', item: 'Venue hire', estimate: 9000 + w.n }, { category: 'Music', item: 'DJ', estimate: 1800 }] };
      const b = await put(w, '/planner/doc/budget', 0, budget);
      expect(b.status, w.tag).toBe(200);
      const deposit = 500 + w.n;
      const balance = 2000 + w.n * 3;
      const vendors = {
        list: [
          { id: `v-photo-${w.n}`, name: `Lumen Photography ${w.n}`, category: 'Photographer', status: 'booked', accepted: 'q1', quotes: [{ id: 'q1', amount: deposit + balance, deposit, date: day(-10), validUntil: day(60), includes: '8 hours' }, { id: 'q2', amount: 5100, deposit: 1000, date: day(-9), validUntil: day(60), includes: '10 hours' }], payments: [{ id: 'dep', label: 'Deposit', amount: deposit, due: day(-5), paid: true, paidOn: day(-5) }, { id: 'bal', label: 'Balance', amount: balance, due: day(20), paid: false, paidOn: '' }] },
          { id: `v-flor-${w.n}`, name: `Willow Florals ${w.n}`, category: 'Florist', status: 'quoted', email: `quotes${w.n}@florals.example`, quotes: [{ id: 'q3', amount: 2200, deposit: 500, date: day(-3), validUntil: day(30), includes: 'Bouquet and arbour' }] },
        ],
      };
      const v = await put(w, '/planner/doc/vendors', 0, vendors);
      expect(v.status, `${w.tag} ${await v.clone().text()}`).toBe(200);
      const bd = await json<{ data: Budget }>(await admin(w, '/planner/doc/budget'));
      const vd = await json<{ data: Vendors }>(await admin(w, '/planner/doc/vendors'));
      const pays = allPayments(bd.data.lines, vd.data.list);
      expect(pays.filter((p) => !p.paid).reduce((a, p) => a + p.amount, 0), w.tag).toBe(balance);
      expect(pays.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0), w.tag).toBe(deposit);
      // A wedding party member added straight in: on the guest list, with their own page.
      const added = await post(w, '/planner/people', { name: `Riley Party${w.n}`, mobile: '', role: 'Bridesmaid' });
      expect(added.status, `${w.tag} ${await added.clone().text()}`).toBe(201);
      const { list, token } = await sync(w);
      const g = list.guests.find((x) => x.people[0]?.name === `Riley Party${w.n}`)!;
      w.invs.push({
        id: g.id, token: token(g.id), people: g.people.map(({ id, idx, name }) => ({ id, idx, name })), seats: g.seatsHeld, phone: null, email: null, channel: '', invited: g.invited,
        rsvp: Object.fromEntries(Object.entries(g.rsvp).filter(([, x]) => x.attending !== null).map(([k, x]) => [k, { attending: !!x.attending, count: x.count }])),
      });
      const page = await call(`/p/${w.slug}/party?g=${token(g.id)}`, {}, '', nextIp());
      expect(page.status, w.tag).toBe(200);
      expect((await json<{ me: { name: string; role: string }[] }>(page)).me, w.tag).toEqual([{ name: `Riley Party${w.n}`, role: 'Bridesmaid' }]);
      await figuresMatch(w);
    }
    await dbInvariants('planner');
    await healthy('planner');
  });

  // ------------------------------------------------------------------------------------------------ 9
  it("9. the inbox: each wedding's email lands only in its own inbox; a guest's emailed no frees their seat; a vendor's quote is filed", { timeout: PHASE_MS }, async () => {
    const mail = (to: string, from: string, subject: string, text: string, id: string, attach = '') => {
      const raw = attach
        ? `From: ${from}\r\nSubject: ${subject}\r\nMessage-ID: <${id}@overnight.example>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\n${text}\r\n--b\r\nContent-Type: application/pdf; name="${attach}"\r\nContent-Disposition: attachment; filename="${attach}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa('%PDF-1.4 quote')}\r\n--b--\r\n`
        : `From: ${from}\r\nSubject: ${subject}\r\nMessage-ID: <${id}@overnight.example>\r\n\r\n${text}`;
      return receiveEmail({ from, to, raw: new Blob([new TextEncoder().encode(raw)]).stream(), headers: new Headers() }, env);
    };
    const expected = new Map<string, number>();
    for (const w of weddings) {
      const address = `inbox-${w.n}@weddings.example`;
      expect((await admin(w, '/inbox/settings/address', { method: 'PUT', body: JSON.stringify({ address }) })).status, w.tag).toBe(200);
      let n = 0;
      // A question from a guest's own email.
      const asker = w.invs.find((g) => g.email);
      if (asker) {
        expect((await mail(address, asker.email!, 'Parking?', 'Is there parking at the venue?', `q-${w.n}`)).stored, w.tag).toBe(true);
        n++;
      }
      // One wedding, one event: a seated guest emails that they can't come.
      if (w.keys.length === 1 && !w.closed) {
        const decliner = w.invs.find((g) => g.email && g !== asker && g.rsvp.wedding?.attending);
        if (decliner) {
          const r = await mail(address, decliner.email!, 'Re: invitation', "Sorry, we can't make it.", `n-${w.n}`);
          expect(r, w.tag).toMatchObject({ stored: true, action: 'RSVP set to no' });
          decliner.rsvp.wedding = { attending: false, count: decliner.rsvp.wedding!.count };
          n++;
        }
      }
      // A vendor's quote, filed under them.
      if (w.plan !== 'free') {
        expect((await mail(address, `quotes${w.n}@florals.example`, 'Your quote', 'Quote attached.', `v-${w.n}`, `quote-${w.n}.pdf`)).stored, w.tag).toBe(true);
        n++;
      }
      // Delivered twice: kept once. Sent to an address nobody has: dropped.
      if (asker) expect((await mail(address, asker.email!, 'Parking?', 'Is there parking at the venue?', `q-${w.n}`)).stored, w.tag).toBe(false);
      expect((await mail(`nobody-${w.n}@weddings.example`, 'x@example.org', 'Hello', 'Hi', `x-${w.n}`)).stored, w.tag).toBe(false);
      expected.set(w.id, n);
    }
    for (const w of weddings) {
      const box = await json<{ address: string; emails: { from?: string; fromAddr?: string }[] }>(await admin(w, '/inbox'));
      expect(box.emails, w.tag).toHaveLength(expected.get(w.id)!);
      const own = new Set([...w.invs.map((g) => g.email), `quotes${w.n}@florals.example`]);
      const rows = await all<{ from_addr: string }>(`SELECT from_addr FROM inbox_email WHERE wedding_id = ?`, w.id);
      expect(rows.filter((x) => !own.has(x.from_addr)).map((x) => x.from_addr), `${w.tag} someone else's email`).toEqual([]);
      if (w.plan !== 'free') {
        const vd = await json<{ data: Vendors }>(await admin(w, '/planner/doc/vendors'));
        expect(vd.data.list.find((x) => x.id === `v-flor-${w.n}`)!.quotes.length, `${w.tag} quote filed`).toBe(2);
      }
      await figuresMatch(w);
      if (w.plan !== 'free') await seatingMatches(w, 'wedding');
    }
    await settle();
    await dbInvariants('inbox');
    await healthy('inbox');
  });

  // ------------------------------------------------------------------------------------------------ 10
  it('10. the company portal against every wedding: stats, money, feedback, staff and a bot see the same totals', { timeout: PHASE_MS }, async () => {
    const people = weddings.reduce((a, w) => a + w.invs.reduce((b, g) => b + g.people.length, 0), 0);
    const replies = weddings.reduce((a, w) => a + w.invs.reduce((b, g) => b + g.invited.filter((k) => g.rsvp[k]).length, 0), 0);
    const cents = payments.reduce((a, p) => a + p.cents, 0);
    const st = await json<Stats>(await company('/stats'));
    expect(st).toMatchObject({ weddings: WEDDINGS + 1, guests: people, replies, revenue: { total: cents, payments: payments.length } });
    const money = await json<{ total: { gross: number; sales: number }; sales: { cents: number }[] }>(await company('/money'));
    expect(money.total).toMatchObject({ gross: cents, sales: payments.length });
    expect(money.sales.reduce((a, s) => a + s.cents, 0)).toBe(cents);
    // Each wedding's own figures, as the company sees them.
    for (const w of weddings.filter((x) => x.n % 5 === 1)) {
      const found = await json<{ weddings: { slug: string; paidCents: number; plan: string; guests: number }[] }>(await company(`/weddings?q=${w.slug}`));
      expect(found.weddings.find((x) => x.slug === w.slug), w.tag).toMatchObject({ paidCents: w.paidCents, plan: w.plan === 'free' ? 'basic' : w.plan, guests: w.invs.reduce((a, g) => a + g.people.length, 0) });
    }
    // Feedback from 25 couples: all there, new.
    for (const w of weddings.slice(0, 25)) expect((await post(w, '/feedback', { kind: w.n % 2 ? 'idea' : 'problem', text: `Overnight note from wedding ${w.n}` })).status, w.tag).toBe(200);
    const fb = await json<{ feedback: { text: string }[]; counts: Record<string, number> }>(await company('/feedback'));
    expect(fb.counts.new).toBe(Math.min(25, weddings.length));
    // A couple can't reach the company portal.
    expect((await call('/a/company/stats', {}, weddings[0]!.cookie)).status).toBe(403);
    // Staff: support sees couples, not money.
    const inv = await json<{ link: string }>(await company('/team/invite', { method: 'POST', body: JSON.stringify({ email: 'support@overnight.example', role: 'support' }) }));
    const joined = await call(`/a/staff-join/${new URL(inv.link).searchParams.get('t')}`, { method: 'POST', body: JSON.stringify({ passcode: 'long-enough-support', firstName: 'Sup' }) });
    expect(joined.status).toBe(200);
    const sup = (joined.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect((await call('/a/company/weddings', {}, sup)).status).toBe(200);
    expect((await call('/a/company/money', {}, sup)).status).toBe(403);
    // A marketing bot reads the same stats.
    const bot = await json<{ key: string }>(await company('/bots', { method: 'POST', body: JSON.stringify({ name: 'Overnight bot', role: 'marketing' }) }));
    const viaBot = await json<Stats>(await call('/a/company/stats', { headers: { authorization: `Bearer ${bot.key}` } }));
    expect(viaBot).toMatchObject({ weddings: st.weddings, guests: st.guests, replies: st.replies, revenue: st.revenue });
    expect((await call('/a/company/weddings', { headers: { authorization: `Bearer ${bot.key}` } })).status).toBe(403);
    await healthy('company');
  });

  // ------------------------------------------------------------------------------------------------ 11
  it("11. isolation: every couple's session and every guest link is refused by every other wedding", { timeout: PHASE_MS }, async () => {
    for (let k = 0; k < weddings.length; k++) {
      const me = weddings[k]!;
      const other = weddings[(k + 1) % weddings.length]!;
      for (const path of ['/overview', '/guests', '/seating', '/planner/doc/budget', '/inbox', '/texts']) {
        const r = await call(`/a/w/${other.id}${path}`, {}, me.cookie);
        expect([403, 404], `${me.tag} reading ${other.tag} ${path}`).toContain(r.status);
      }
      const write = await call(`/a/w/${other.id}/guests/import`, { method: 'POST', body: JSON.stringify({ rows: [{ people: ['Intruder'] }] }) }, me.cookie);
      expect([403, 404], me.tag).toContain(write.status);
      const g = me.invs[0];
      if (g) {
        expect((await call(`/p/${other.slug}/invite?g=${g.token}`, {}, '', nextIp())).status, me.tag).not.toBe(200);
        const r = await call(`/p/${other.slug}/rsvp`, { method: 'POST', body: JSON.stringify({ token: g.token, events: { wedding: { attending: false } } }) }, '', nextIp());
        expect(r.status, me.tag).toBe(404);
      }
    }
    // Still exactly as each wedding left it.
    for (const w of weddings.filter((x) => x.n % 3 === 0)) await figuresMatch(w);
    await dbInvariants('isolation');
    await healthy('isolation');
  });
});

/** Focused checks for the faults the overnight run found. */
describe('overnight fixes', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  const opened: Awaited<ReturnType<typeof testD1>>[] = [];
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  let ip = 0;
  const call = (path: string, init: RequestInit = {}, cookie = '') =>
    app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `172.16.0.${++ip}`, ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);

  const setup = async () => {
    t = await testD1();
    opened.push(t);
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', SUPER_ADMINS: 'boss@fix.example' } as Env;
    const su = async (email: string) => {
      const r = await call('/a/signup', { method: 'POST', body: JSON.stringify({ firstName: 'Fix', partnerName: 'Test', email, date: day(200), passcode: PASSCODE, plan: 'free', marketing: false, website: '' }) });
      const b = (await r.json()) as { weddingId: string; weddings: { id: string; slug: string }[] };
      return { cookie: (r.headers.get('set-cookie') ?? '').split(';')[0]!, wid: b.weddingId, slug: b.weddings.find((x) => x.id === b.weddingId)!.slug };
    };
    const bossW = await su('boss@fix.example');
    const w = await su('couple@fix.example');
    expect((await call('/a/super/plan', { method: 'PUT', body: JSON.stringify({ slug: w.slug, plan: 'essentials' }) }, bossW.cookie)).status).toBe(200);
    expect((await call(`/a/w/${w.wid}/guests/import`, { method: 'POST', body: JSON.stringify({ rows: [{ people: ['Ann Four', 'Ben Four', 'Cat Four', 'Dan Four'] }, { people: ['Eve Solo'] }] }) }, w.cookie)).status).toBe(200);
    const list = (await (await call(`/a/w/${w.wid}/guests`, {}, w.cookie)).json()) as GuestList;
    const fam = list.guests.find((g) => g.people.length === 4)!;
    const solo = list.guests.find((g) => g.people.length === 1)!;
    const tok = (id: string) => new URL(list.links[id]!).searchParams.get('g')!;
    return { boss: bossW, w, fam, solo, tok };
  };
  afterAll(async () => {
    for (const d of opened) await d.dispose();
  });

  it('a yes for two of a family of four seats only those two: the other two are not on the plan, not seated, never published', async () => {
    const { w, fam, tok } = await setup();
    const reply = async (count: number) =>
      expect((await call(`/p/${w.slug}/rsvp`, { method: 'POST', body: JSON.stringify({ token: tok(fam.id), events: { wedding: { attending: true } }, count }) })).status).toBe(200);
    const view = async () => (await (await call(`/a/w/${w.wid}/seating`, {}, w.cookie)).json()) as SeatView;
    // Pencilled in before they reply: all four seated at one table.
    const v0 = await view();
    const table: SeatTable = { id: crypto.randomUUID(), name: '1', shape: 'round', dir: 'h', len: 30, x: 50, y: 50, seats: 10 };
    const seats = Object.fromEntries(fam.people.map((p) => [p.id, table.id]));
    expect((await call(`/a/w/${w.wid}/seating`, { method: 'PUT', headers: { 'If-Match': String(v0.version) }, body: JSON.stringify({ event: 'wedding', aspect: '4 / 3', tables: [table], areas: [], seats }) }, w.cookie)).status).toBe(200);
    // They answer: two of us.
    await reply(2);
    const v1 = await view();
    const ids = fam.people.map((p) => p.id);
    expect(v1.people.filter((p) => ids.includes(p.id)).map((p) => [p.name, p.coming, !!p.tableId])).toEqual([['Ann Four', true, true], ['Ben Four', true, true]]);
    const seated = await t.db.prepare(`SELECT COUNT(*) AS n FROM seat WHERE person_id IN (?, ?, ?, ?)`).bind(...ids).first<{ n: number }>();
    expect(seated!.n).toBe(2);
    // The overview agrees: two coming, two seated.
    const ov = (await (await call(`/a/w/${w.wid}/overview`, {}, w.cookie)).json()) as Overview;
    expect(ov.perEvent[0]).toMatchObject({ coming: 2, seated: 2 });
    // Published: only the two.
    const pub = await call(`/a/w/${w.wid}/seating/publish`, { method: 'POST', headers: { 'If-Match': String(v1.version) }, body: JSON.stringify({ event: 'wedding' }) }, w.cookie);
    expect(pub.status).toBe(200);
    const snap = await t.db.prepare(`SELECT snapshot FROM seat_publish`).first<{ snapshot: string }>();
    expect(Object.keys((JSON.parse(snap!.snapshot) as { seats: Record<string, string> }).seats).sort()).toEqual(ids.slice(0, 2).sort());
    // Saving a seat for someone beyond the count is refused (they're not coming).
    expect((await call(`/a/w/${w.wid}/seating`, { method: 'PUT', headers: { 'If-Match': String((await view()).version) }, body: JSON.stringify({ event: 'wedding', aspect: '4 / 3', tables: [table], areas: [], seats: { [ids[3]!]: table.id } }) }, w.cookie)).status).toBe(400);
    // All four after all: everyone can be seated again.
    await reply(4);
    expect((await view()).people.filter((p) => ids.includes(p.id) && p.coming)).toHaveLength(4);
  });

  it('a meal for someone who said no is refused, and nothing is stored', async () => {
    const { w, solo, tok } = await setup();
    expect((await call(`/p/${w.slug}/rsvp`, { method: 'POST', body: JSON.stringify({ token: tok(solo.id), events: { wedding: { attending: false } } }) })).status).toBe(200);
    const pid = solo.people[0]!.id;
    const r = await call(`/a/w/${w.wid}/people/${pid}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', entree: '', main: 'Fish', dessert: '' }) }, w.cookie);
    expect(r.status).toBe(400);
    expect(await t.db.prepare(`SELECT COUNT(*) AS n FROM meal_choice WHERE person_id = ?`).bind(pid).first<{ n: number }>()).toEqual({ n: 0 });
    // Changing their mind: now it can be set.
    expect((await call(`/p/${w.slug}/rsvp`, { method: 'POST', body: JSON.stringify({ token: tok(solo.id), events: { wedding: { attending: true } } }) })).status).toBe(200);
    expect((await call(`/a/w/${w.wid}/people/${pid}/meal`, { method: 'PUT', body: JSON.stringify({ event: 'wedding', entree: '', main: 'Fish', dessert: '' }) }, w.cookie)).status).toBe(200);
  });

  it('a guide on a plan published before the count dropped: no table for the ones not coming, and they are nobody’s table mate', async () => {
    const { w, fam, solo, tok } = await setup();
    const pages = (await (await call(`/a/w/${w.wid}/pages`, {}, w.cookie)).json()) as { version: number };
    const guide = { style: 'reception', date: 'Saturday evening', address: '1 Long Road, Berrima NSW', arrive: '3:30pm', start: '4:00pm' };
    expect((await call(`/a/w/${w.wid}/pages`, { method: 'PUT', headers: { 'If-Match': String(pages.version) }, body: JSON.stringify({ guides: { wedding: guide } }) }, w.cookie)).status).toBe(200);
    const reply = async (token: string, count: number) =>
      expect((await call(`/p/${w.slug}/rsvp`, { method: 'POST', body: JSON.stringify({ token, events: { wedding: { attending: true } }, count }) })).status).toBe(200);
    await reply(tok(fam.id), 4);
    await reply(tok(solo.id), 1);
    const v0 = (await (await call(`/a/w/${w.wid}/seating`, {}, w.cookie)).json()) as SeatView;
    const table: SeatTable = { id: crypto.randomUUID(), name: '1', shape: 'round', dir: 'h', len: 30, x: 50, y: 50, seats: 10 };
    const seats = Object.fromEntries([...fam.people, ...solo.people].map((p) => [p.id, table.id]));
    const saved = await call(`/a/w/${w.wid}/seating`, { method: 'PUT', headers: { 'If-Match': String(v0.version) }, body: JSON.stringify({ event: 'wedding', aspect: '4 / 3', tables: [table], areas: [], seats }) }, w.cookie);
    const v1 = (await saved.json()) as SeatView;
    expect((await call(`/a/w/${w.wid}/seating/publish`, { method: 'POST', headers: { 'If-Match': String(v1.version) }, body: JSON.stringify({ event: 'wedding' }) }, w.cookie)).status).toBe(200);
    // Now only two of the family are coming; the plan isn't published again.
    await reply(tok(fam.id), 2);
    type Guide = { guest: { people: { name: string; tableId: string | null }[] }; mates: Record<string, string[]> };
    const famGuide = (await (await call(`/p/${w.slug}/guide?g=${tok(fam.id)}`)).json()) as Guide;
    expect(famGuide.guest.people.map((p) => [p.name, p.tableId])).toEqual([['Ann Four', table.id], ['Ben Four', table.id], ['Cat Four', null], ['Dan Four', null]]);
    const eve = (await (await call(`/p/${w.slug}/guide?g=${tok(solo.id)}`)).json()) as Guide;
    expect(eve.mates[table.id]).toEqual(['Ann Four', 'Ben Four']);
  });

  it("the company's reply count is answers only, not a count the couple noted without an answer", async () => {
    const { boss, w, fam, solo, tok } = await setup();
    expect((await call(`/p/${w.slug}/rsvp`, { method: 'POST', body: JSON.stringify({ token: tok(solo.id), events: { wedding: { attending: true } } }) })).status).toBe(200);
    // The couple notes how many are coming for a household that hasn't answered: no reply yet.
    const g = (await (await call(`/a/w/${w.wid}/guests/${fam.id}`, {}, w.cookie)).json()) as { guest: { version: number } };
    expect((await call(`/a/w/${w.wid}/guests/${fam.id}/rsvp`, { method: 'PUT', headers: { 'If-Match': String(g.guest.version) }, body: JSON.stringify({ events: {}, count: 3 }) }, w.cookie)).status).toBe(200);
    const stats = async () => ((await (await call('/a/company/stats', {}, boss.cookie)).json()) as Stats).replies;
    expect(await stats()).toBe(1);
  });
});
