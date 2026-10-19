import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import { loadWedding } from '../src/admin/data';
import { buildOverview } from '../src/admin/overview';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import type { EngineDeps } from '../src/sms/engine';
import { testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

/** M3: the admin API on the real seed (22 invitations, 2 events). */
describe('admin API', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const provider = new FakeProvider();
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: fakeClock('2026-10-20T10:00').now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`/api/a/w/${wid}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const json = async <T = Record<string, unknown>>(res: Response) => (await res.json()) as T;

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
  });
  afterEach(() => t.dispose());

  const guestNamed = async (name: string) => {
    const { guests } = await json<{ guests: { id: string; version: number; people: { name: string }[] }[] }>(await call('/guests'));
    return guests.find((g) => g.people[0]!.name === name)!;
  };

  it('overview: counts, per-event figures and Needs you from the real seed', async () => {
    const o = await json<ReturnType<typeof buildOverview>>(await call('/overview'));
    expect(o.total).toBe(22);
    expect(o.replied + o.awaiting).toBe(22);
    expect(o.events.map((e) => e.key)).toEqual(['wedding', '30th']);
    const kinds = o.needsYou.map((n) => n.kind);
    expect(kinds).toContain('sms-setup'); // no sender number yet
    expect(kinds).toContain('awaiting');
    expect(kinds).toContain('no-mobile'); // one seeded guest has no mobile
    expect(o.needsYou.find((n) => n.kind === 'awaiting')!.detail).toBe('Reminders go out by themselves on 18 Jun, 18 Jul and 11 Aug.');
    expect(o.nav.guests).toBe(22);
  });

  it('every admin route needs a session and membership', async () => {
    cookie = '';
    expect((await call('/overview')).status).toBe(401);
    expect((await call('/guests')).status).toBe(401);
  });

  it('guests list carries people, invites, replies and the last text; tokens are not in the list', async () => {
    const res = await call('/guests');
    const body = await res.text();
    expect(body).not.toMatch(/"token"/);
    const { guests } = JSON.parse(body) as { guests: { people: { name: string }[]; invited: string[]; lastSms: unknown }[] };
    const m = guests.find((g) => g.people[0]!.name === 'Margaret Bloor')!;
    expect(m.people.map((p) => p.name)).toEqual(['Margaret Bloor', 'Peter Bloor']);
    expect(m.invited).toEqual(['wedding', '30th']);
    expect(m.lastSms).toMatchObject({ status: 'delivered' });
  });

  it('detail gives the personal link and text history', async () => {
    const g = await guestNamed('Margaret Bloor');
    const d = await json<{ link: string; sms: unknown[] }>(await call(`/guests/${g.id}`));
    expect(d.link).toMatch(/^https:\/\/example\.com\/w\/sophie-and-nicholas\/\?g=[A-Za-z0-9_-]{22}$/);
    expect(d.sms).toHaveLength(1);
  });

  it('edits people, mobile, seats and events with If-Match', async () => {
    const g = await guestNamed('Ella Thompson');
    const res = await call(`/guests/${g.id}`, {
      method: 'PATCH', headers: { 'If-Match': String(g.version) },
      body: JSON.stringify({ people: ['Ella Thompson', 'Sam Lee'], phone: '0412 000 111', seatsHeld: 2, invited: ['wedding', '30th'] }),
    });
    expect(res.status).toBe(200);
    const { guest } = await json<{ guest: { people: { name: string }[]; phone: string; seatsHeld: number; invited: string[]; version: number } }>(res);
    expect(guest.people.map((p) => p.name)).toEqual(['Ella Thompson', 'Sam Lee']);
    expect(guest).toMatchObject({ phone: '+61412000111', seatsHeld: 2, invited: ['wedding', '30th'], version: g.version + 1 });

    // Removing a person, then adding them back, reuses the slot.
    const r2 = await call(`/guests/${g.id}`, { method: 'PATCH', headers: { 'If-Match': String(guest.version) }, body: JSON.stringify({ people: ['Ella Thompson'] }) });
    expect((await json<{ guest: { people: unknown[] } }>(r2)).guest.people).toHaveLength(1);
  });

  it('docs/05 test 3: a stale edit gets 409 and the guest\'s own reply is kept', async () => {
    const g = await guestNamed("Liam O'Brien"); // awaiting both events
    // The guest replies by text while the admin has the old version open.
    const store = new D1SmsStore(t.db, '');
    await store.setRsvp(g.id, 'wedding', { attending: true, count: 2 }, '2026-10-20T00:00:00.000Z');
    const stale = await call(`/guests/${g.id}/rsvp`, {
      method: 'PUT', headers: { 'If-Match': String(g.version) }, body: JSON.stringify({ events: { wedding: { attending: false } } }),
    });
    expect(stale.status).toBe(409);
    expect((await json<{ error: { message: string } }>(stale)).error.message).toBe('Updated elsewhere, reloaded.');
    const row = await t.db.prepare(`SELECT attending FROM rsvp r JOIN event e ON e.id = r.event_id WHERE r.invitation_id = ? AND e.key = 'wedding'`).bind(g.id).first<{ attending: number }>();
    expect(row!.attending).toBe(1);
  });

  it('records a reply for the guest (via admin), with dietary attached to the named person', async () => {
    const g = await guestNamed('Oscar Rossi');
    const res = await call(`/guests/${g.id}/rsvp`, {
      method: 'PUT', headers: { 'If-Match': String(g.version) },
      body: JSON.stringify({ events: { wedding: { attending: true }, '30th': { attending: false } }, count: 2, diet: 'Mia is vegan', message: 'See you there' }),
    });
    expect(res.status).toBe(200);
    const { guest } = await json<{ guest: { rsvp: Record<string, { attending: boolean; via: string; count: number }>; people: { name: string; diet: string }[] } }>(res);
    expect(guest.rsvp.wedding).toMatchObject({ attending: true, via: 'admin', count: 2 });
    expect(guest.rsvp['30th']!.attending).toBe(false);
    expect(guest.people.find((p) => p.name === 'Mia Rossi')!.diet).toBe('Mia is vegan');
  });

  it('rejects a bad mobile in plain English, and an unknown table', async () => {
    const g = await guestNamed('Ivy Scott');
    const bad = await call(`/guests/${g.id}`, { method: 'PATCH', headers: { 'If-Match': String(g.version) }, body: JSON.stringify({ phone: '0412 34' }) });
    expect(bad.status).toBe(400);
    expect((await json<{ error: { message: string } }>(bad)).error.message).toMatch(/start with 04 and have 10 digits/);
    const table = await call(`/guests/${g.id}`, { method: 'PATCH', headers: { 'If-Match': String(g.version) }, body: JSON.stringify({ table: '99' }) });
    expect((await json<{ error: { message: string } }>(table)).error.message).toBe('There\'s no table called "99" yet. Add it in Seating.');
  });

  it('seats a whole invitation at a table by name', async () => {
    const g = await guestNamed('Ivy Scott');
    const res = await call(`/guests/${g.id}`, { method: 'PATCH', headers: { 'If-Match': String(g.version) }, body: JSON.stringify({ table: '3' }) });
    expect((await json<{ guest: { people: { table: string }[] } }>(res)).guest.people[0]!.table).toBe('3');
  });

  it('add, remove and undo', async () => {
    const added = await call('/guests', { method: 'POST', body: '{}' });
    expect(added.status).toBe(201);
    const { guest } = await json<{ guest: { id: string; invited: string[] } }>(added);
    expect(guest.invited).toEqual(['wedding', '30th']);
    expect((await call(`/guests/${guest.id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await call(`/guests/${guest.id}`)).status).toBe(404);
    expect((await call(`/guests/${guest.id}/restore`, { method: 'POST', body: '{}' })).status).toBe(200);
    expect((await call(`/guests/${guest.id}`)).status).toBe(200);
  });

  it('every change is in the audit log', async () => {
    const g = await guestNamed('Ivy Scott');
    await call(`/guests/${g.id}`, { method: 'PATCH', headers: { 'If-Match': String(g.version) }, body: JSON.stringify({ seatsHeld: 2 }) });
    const row = await t.db.prepare(`SELECT action, target FROM audit`).first<{ action: string; target: string }>();
    expect(row).toEqual({ action: 'guest.edit', target: g.id });
  });

  it('docs/05 test 9: overview and guest list for 300 invitations with 6 texts each stay fast', async () => {
    const now = '2026-10-01T00:00:00.000Z';
    const s: D1PreparedStatement[] = [];
    for (let i = 0; i < 300; i++) {
      s.push(t.db.prepare(`INSERT INTO invitation (id, wedding_id, token, phone, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(`x${i}`, wid, `tok-load-${String(i).padStart(14, '0')}`, `+6149${String(i).padStart(7, '0')}`, now, now));
      s.push(t.db.prepare(`INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, 0, ?)`).bind(`xp${i}`, `x${i}`, `Load ${i}`));
      for (let k = 0; k < 6; k++) {
        s.push(t.db.prepare(`INSERT INTO sms_out (id, wedding_id, invitation_id, dedupe_key, to_phone, body, parts, status, created_at, sent_at) VALUES (?, ?, ?, ?, '+61400000000', 'x', 1, 'sent', ?, ?)`).bind(`xs${i}-${k}`, wid, `x${i}`, `load:${i}:${k}`, now, now));
      }
    }
    for (let i = 0; i < s.length; i += 500) await t.db.batch(s.slice(i, i + 500));
    const started = performance.now();
    expect((await call('/overview')).status).toBe(200);
    expect((await call('/guests')).status).toBe(200);
    expect(performance.now() - started).toBeLessThan(1000); // both requests together; the brief's bar is 500 ms each
  });

  it('pure overview: "All caught up" when nothing needs doing', async () => {
    const data = (await loadWedding(t.db, wid))!;
    data.wedding.sender = '+61400000001';
    data.guests = [];
    data.slots = [];
    expect(buildOverview(data, new Date('2026-10-20T00:00:00Z')).needsYou).toEqual([]);
  });
});
