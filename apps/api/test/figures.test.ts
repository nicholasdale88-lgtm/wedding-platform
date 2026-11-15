import { countGuests, isBlankGuest, placesOf, type GuestCounts } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/**
 * Every page's figures agree (the owner: "these figures need to align"). A wedding and a birthday, with the
 * awkward cases added on purpose: blank invitations, an invitation holding fewer places than the people named,
 * a yes for some of a household, a no, guests of the birthday only, and a child. Then each page's numbers for
 * each event are compared with one another and with the guest list.
 */
describe('figures agree on every page', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const get = async <T>(path: string) => (await (await app.request(`/api/a/w/${wid}${path}`, { headers: { cookie } }, env, ctx)).json()) as T;

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;

    // The awkward cases.
    const ev = async (key: string) => (await t.db.prepare(`SELECT id FROM event WHERE wedding_id = ? AND key = ?`).bind(wid, key).first<{ id: string }>())!.id;
    const wedding = await ev('wedding');
    const birthday = await ev('30th');
    const now = '2026-11-15T00:00:00.000Z';
    const inv = async (o: { seats: number; names: string[]; events: string[]; reply?: { attending: 0 | 1; count?: number }; child?: number; phone?: string }) => {
      const id = crypto.randomUUID();
      await t.db.prepare(`INSERT INTO invitation (id, wedding_id, token, phone, seats_held, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, wid, crypto.randomUUID().replace(/-/g, ''), o.phone ?? null, o.seats, now, now).run();
      for (const [i, name] of o.names.entries()) await t.db.prepare(`INSERT INTO person (id, invitation_id, idx, name, child) VALUES (?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), id, i, name, o.child === i ? 1 : 0).run();
      for (const e of o.events) {
        await t.db.prepare(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`).bind(id, e).run();
        if (o.reply) await t.db.prepare(`INSERT INTO rsvp (invitation_id, event_id, attending, count, updated_at) VALUES (?, ?, ?, ?, ?)`).bind(id, e, o.reply.attending, o.reply.count ?? (o.reply.attending ? 1 : 0), now).run(); // count is required (0 on a no)
      }
    };
    // Three blank invitations (Add guest, never filled in): to the wedding.
    for (let i = 0; i < 3; i++) await inv({ seats: 1, names: [''], events: [wedding] });
    // Fewer places held than people named, and still to reply.
    await inv({ seats: 1, names: ['Ann Field', 'Bob Field', 'Kit Field'], events: [wedding], child: 2 });
    // A yes for 2 of a household of 3.
    await inv({ seats: 3, names: ['Cy Hart', 'Di Hart', 'Ed Hart'], events: [wedding], reply: { attending: 1, count: 2 } });
    // A no.
    await inv({ seats: 2, names: ['Fay Low', 'Gus Low'], events: [wedding], reply: { attending: 0 } });
    // The birthday only.
    await inv({ seats: 2, names: ['Hal Moss', 'Ivy Moss'], events: [birthday], reply: { attending: 1, count: 2 } });
    // Both events, a phone and no name yet (still a guest: it has a way to reach them).
    await inv({ seats: 1, names: [''], events: [wedding, birthday], phone: '+61412000111' });
  });
  afterEach(() => t.dispose());

  type Guest = { seatsHeld: number; invited: string[]; rsvp: Record<string, { attending: boolean | null; count: number }>; people: { name: string; child?: boolean }[]; phone: string | null; email?: string };
  type Overview = { guests: GuestCounts; perEvent: { key: string; guests: number; coming: number; yes: number; no: number; awaiting: number }[]; events: { key: string; coming: number }[]; total: number };

  it('each event: the guest list, the overview, its figures and the events list agree, and never mix the two events', async () => {
    const { guests } = await get<{ guests: Guest[] }>('/guests');
    const events = (await get<{ events: { key: string; invited: number; coming: number }[] }>('/events')).events;
    for (const key of ['wedding', '30th']) {
      // What the guest list shows for this event: real invitations invited to it, counted in places.
      const list = guests.filter((g) => !isBlankGuest(g) && g.invited.includes(key));
      const want = countGuests(guests, key);
      expect(want.invitations).toBe(list.length);
      expect(want.guests).toBe(list.reduce((n, g) => n + placesOf(g), 0));
      expect(want.coming + want.cantCome + want.awaiting).toBe(want.guests);

      const o = await get<Overview>(`/overview?event=${key}`);
      expect(o.guests, key).toEqual(want);
      expect(o.total, `${key} invitations`).toBe(list.length);
      const per = o.perEvent.find((e) => e.key === key)!;
      expect(per, key).toMatchObject({ guests: want.guests, coming: want.coming, yes: want.invitationsYes, no: want.invitationsNo, awaiting: want.invitationsAwaiting });
      expect(o.events.find((e) => e.key === key)!.coming, key).toBe(want.coming);
      expect(events.find((e) => e.key === key), key).toMatchObject({ invited: want.guests, coming: want.coming });
    }
    // Insights (the planner's progress page) counts in guests the same way, each event apart.
    const ins = await get<{ events: { key: string; guests: number; people: number; cantCome: number; awaitingGuests: number }[] }>('/insights');
    for (const key of ['wedding', '30th']) {
      const want = countGuests(guests, key);
      expect(ins.events.find((e) => e.key === key), `insights ${key}`).toMatchObject({ guests: want.guests, people: want.coming, cantCome: want.cantCome, awaitingGuests: want.awaiting });
    }
    // The two events are counted apart: the birthday-only guests aren't in the wedding's numbers, and the other way.
    const w = countGuests(guests, 'wedding');
    const b = countGuests(guests, '30th');
    expect(w.guests).not.toBe(b.guests);
  });

  it('an invitation never holds fewer places than the people named on it', async () => {
    const { guests } = await get<{ guests: (Guest & { id: string; version: number })[] }>('/guests');
    const g = guests.find((x) => x.people.some((p) => p.name === 'Ann Field'))!;
    const r = await app.request(`/api/a/w/${wid}/guests/${g.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json', 'If-Match': String(g.version) }, body: JSON.stringify({ seatsHeld: 1 }) }, env, ctx);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { guest: { seatsHeld: number } }).guest.seatsHeld).toBe(3);
  });

  it('seating counts the named people of this event only, with the couple apart and only at the wedding', async () => {
    const { guests } = await get<{ guests: Guest[] }>('/guests');
    for (const key of ['wedding', '30th']) {
      const s = await get<{ people: { id: string; name: string; coming: boolean }[]; couple: unknown[] }>(`/seating?event=${key}`);
      // Everyone named who hasn't said no, and on a yes only as many as it said.
      const want = guests
        .filter((g) => !isBlankGuest(g) && g.invited.includes(key) && g.rsvp[key]?.attending !== false)
        .reduce((n, g) => n + (g.rsvp[key]?.attending === true ? Math.min(Math.max(1, g.rsvp[key]!.count ?? 1), g.people.filter((p) => p.name.trim()).length) : g.people.filter((p) => p.name.trim()).length), 0);
      expect(s.people.length, key).toBe(want);
      expect(s.couple.length, key).toBe(key === 'wedding' ? 2 : 0);
    }
  });
});
