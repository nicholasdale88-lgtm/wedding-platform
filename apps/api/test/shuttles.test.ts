import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Shuttle seats: the couple sets up runs; guests book seats, never more than are left. */
describe('shuttles', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const admin = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const guest = (path: string, init: RequestInit = {}) => app.request(`/api/p/sophie-and-nicholas${path}`, { ...init, headers: { 'content-type': 'application/json', ...init.headers } }, env, ctx);
  const tokenOf = async (name: string) =>
    (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = ?`).bind(name).first<{ token: string }>())!.token;

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

  it('guests book seats on a run (never beyond what is left), change and cancel; the couple sees who', async () => {
    const run = { id: 's1', time: '1:00pm', from: 'Gosford station', to: 'The ceremony', seats: 3 };
    expect((await admin('/planner/doc/shuttles/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ list: [run] }) })).status).toBe(200);
    const a = await tokenOf('Margaret Bloor'); // two people
    const b = await tokenOf('Ella Thompson');
    const inv = (await (await guest(`/invite?g=${b}`)).json()) as { events: { key: string; shuttles: boolean }[] };
    expect(inv.events.find((e) => e.key === 'wedding')!.shuttles).toBe(true);
    const booked = (await (await guest('/shuttles', { method: 'POST', body: JSON.stringify({ token: a, shuttleId: 's1', seats: 2 }) })).json()) as { events: { runs: { left: number; mine: number }[] }[] };
    expect(booked.events[0]!.runs[0]).toMatchObject({ left: 1, mine: 2 });
    // Ella asks for 1: fits. Asking again for more than is left: refused.
    expect((await guest('/shuttles', { method: 'POST', body: JSON.stringify({ token: b, shuttleId: 's1', seats: 1 }) })).status).toBe(200);
    await t.db.prepare(`UPDATE invitation SET seats_held = 4 WHERE token = ?`).bind(b).run();
    expect((await guest('/shuttles', { method: 'POST', body: JSON.stringify({ token: b, shuttleId: 's1', seats: 3 }) })).status).toBe(409);
    // Margaret cancels: seats come back.
    const after = (await (await guest('/shuttles', { method: 'POST', body: JSON.stringify({ token: a, shuttleId: 's1', seats: 0 }) })).json()) as { events: { runs: { left: number }[] }[] };
    expect(after.events[0]!.runs[0]!.left).toBe(2);
    const who = (await (await admin('/shuttles')).json()) as { bookings: Record<string, { names: string; seats: number }[]> };
    expect(who.bookings.s1).toEqual([{ names: 'Ella Thompson', seats: 1 }]);
  });

  it('saying no to the event gives the seats back, and a guest who said no cannot book', async () => {
    const run = { id: 's1', time: '1:00pm', from: 'Gosford station', to: 'The ceremony', seats: 3 };
    await admin('/planner/doc/shuttles/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ list: [run] }) });
    const b = await tokenOf('Ella Thompson');
    expect((await guest('/shuttles', { method: 'POST', body: JSON.stringify({ token: b, shuttleId: 's1', seats: 1 }) })).status).toBe(200);
    expect((await guest('/rsvp', { method: 'POST', body: JSON.stringify({ token: b, events: { wedding: { attending: false } } }) })).status).toBe(200);
    const left = await t.db.prepare(`SELECT COUNT(*) AS n FROM shuttle_booking WHERE shuttle_id = 's1'`).first<{ n: number }>();
    expect(left!.n).toBe(0);
    expect((await guest('/shuttles', { method: 'POST', body: JSON.stringify({ token: b, shuttleId: 's1', seats: 1 }) })).status).toBe(404); // not their event any more
  });
});
