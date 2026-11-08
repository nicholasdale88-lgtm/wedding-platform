import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { D1SmsStore } from '../src/db/smsStore';
import { emailable, phoneable } from '../src/mail/campaigns';
import { textable } from '../src/sms/audience';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Who each guest is to the couple (side, relationship, circles), and "Suggest a plan from who knows who". */
describe('guest ties and the who-knows-who plan', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) => call(path, { method: 'POST', body: JSON.stringify(body), headers });
  type G = { id: string; version: number; side: string; relation: string; circles: string[]; party: string; people: { name: string }[]; address: Record<string, string>; delivery: string; phone: string | null };
  const guests = async () => ((await (await call('/guests')).json()) as { guests: G[] }).guests;
  const byName = async (name: string) => (await guests()).find((g) => g.people[0]?.name === name)!;

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

  it('imports side, relationship and circles; a side that is not one of the couple is kept as the group', async () => {
    const rows = [
      { people: ['Tess Uni'], side: 'Bride', relation: 'Uni friend', circles: 'Uni crew; Netball' },
      { people: ['Owen Work'], side: 'Both', relation: 'Old work', circles: 'Acme work' },
      { people: ['Fay Fam'], side: 'Family' },
    ];
    const r = await post('/guests/import', { rows });
    expect(r.status).toBe(200);
    expect(await byName('Tess Uni')).toMatchObject({ side: 'p1', relation: 'friend_uni', circles: ['Uni crew', 'Netball'] });
    expect(await byName('Owen Work')).toMatchObject({ side: 'both', relation: 'ex_work', circles: ['Acme work'] });
    expect(await byName('Fay Fam')).toMatchObject({ side: '', party: 'Family', circles: [] });
  });

  it('saves them on one guest, tidying the circles', async () => {
    const g = (await guests())[0]!;
    const res = await call(`/guests/${g.id}`, { method: 'PATCH', headers: { 'If-Match': String(g.version) }, body: JSON.stringify({ side: 'p2', relation: 'family_extended', circles: [' Lee  cousins ', 'lee cousins', 'Golf'] }) });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { guest: G }).guest).toMatchObject({ side: 'p2', relation: 'family_extended', circles: ['Lee cousins', 'Golf'] });
    const bad = await call(`/guests/${g.id}`, { method: 'PATCH', headers: { 'If-Match': String(g.version + 1) }, body: JSON.stringify({ relation: 'enemy' }) });
    expect(bad.status).toBe(400);
  });

  it('sets several guests at once, adding and taking away circles, only in this wedding', async () => {
    const [a, b, c] = await guests();
    const r = await post('/guests/bulk', { ids: [a!.id, b!.id, 'not-a-guest'], side: 'p1', relation: 'work', addCircles: ['Acme work'] });
    expect(await r.json()).toMatchObject({ updated: 2 });
    const after = await guests();
    for (const g of [a!, b!]) expect(after.find((x) => x.id === g.id)).toMatchObject({ side: 'p1', relation: 'work', circles: expect.arrayContaining(['Acme work']), version: g.version + 1 });
    expect(after.find((x) => x.id === c!.id)!.circles).not.toContain('Acme work');
    await post('/guests/bulk', { ids: [a!.id], removeCircles: ['acme WORK'] });
    expect((await guests()).find((x) => x.id === a!.id)).toMatchObject({ side: 'p1', relation: 'work' });
    expect((await guests()).find((x) => x.id === a!.id)!.circles).not.toContain('Acme work');
    expect((await post('/guests/bulk', { ids: [] })).status).toBe(400);
  });

  it('sets how invitations go for several guests at once, and flags anyone it can't reach', async () => {
    const [a, b] = await guests();
    await call(`/guests/${a!.id}`, { method: 'PATCH', headers: { 'If-Match': String(a!.version) }, body: JSON.stringify({ phone: null, email: null, address: { street: '' } }) });
    const r = await post('/guests/bulk', { ids: [a!.id, b!.id], delivery: 'post', channel: 'email' });
    const out = (await r.json()) as { updated: number; flagged: { name: string; gaps: string[] }[] };
    expect(out.updated).toBe(2);
    const after = await guests();
    expect(after.find((x) => x.id === a!.id)).toMatchObject({ delivery: 'post', channel: 'email' });
    // Printed by post with no address: flagged (post only sends no emails, so a missing email doesn't matter).
    expect(out.flagged.find((f) => f.name === a!.people[0]!.name)?.gaps).toEqual(['address']);
    const d = await post('/guests/bulk', { ids: [a!.id], delivery: 'digital', channel: 'text' });
    expect(((await d.json()) as { flagged: { gaps: string[] }[] }).flagged[0]!.gaps).toEqual(['mobile']);
    expect((await post('/guests/bulk', { ids: [a!.id], channel: 'pigeon' })).status).toBe(400);
  });

  it('keeps a suggested plan as a new version without changing the current plan', async () => {
    type View = { version: number; event: { key: string }; tables: { id: string }[]; people: { id: string; tableId: string | null; circles: string[] }[]; versions: { id: string; name: string; seated: number }[]; current: { id: string } | null };
    const [g] = await guests();
    await post('/guests/bulk', { ids: [g!.id], addCircles: ['Uni crew'] });
    const s = (await (await call('/seating')).json()) as View;
    expect(s.people.some((p) => p.circles.includes('Uni crew'))).toBe(true);
    const before = Object.fromEntries(s.people.map((p) => [p.id, p.tableId]));
    const t1 = s.tables[0]!.id;
    const seats = Object.fromEntries(s.people.slice(0, 3).map((p) => [p.id, t1]));
    const res = await post('/seating/versions/suggest', { event: s.event.key, name: 'Who knows who — Mon 9 Nov', seats });
    expect(res.status).toBe(200);
    const v = (await res.json()) as View & { created: string };
    expect(v.versions.find((x) => x.id === v.created)).toMatchObject({ name: 'Who knows who — Mon 9 Nov', seated: 3 });
    expect(v.current?.id ?? null).not.toBe(v.created);
    expect(Object.fromEntries(v.people.map((p) => [p.id, p.tableId]))).toEqual(before);
    const snap = (await (await call(`/seating/versions/${v.created}`)).json()) as { seats: Record<string, string> };
    expect(snap.seats).toEqual(seats);
    // A table from somewhere else is refused.
    const bad = await post('/seating/versions/suggest', { event: s.event.key, name: 'X', seats: { [s.people[0]!.id]: crypto.randomUUID() } });
    expect(bad.status).toBe(400);
  });
  it('imports contacts with postal addresses, and a printed-only invitation gets nothing digital', async () => {
    const rows = [
      { people: ['Pia Post'], phone: '+61 412 777 001', email: 'pia@example.com', street: '12 Rose St', suburb: 'Newtown', state: 'NSW', postcode: '2042', country: 'Australia', delivery: 'post' },
      { people: ['Ben Both'], phone: '0412 777 002', street: '1 King St', suburb: 'Perth', state: 'WA', postcode: '6000', delivery: 'both' },
      { people: ['Dee Digital'], phone: '0412 777 003', email: 'dee@example.com' },
    ];
    expect((await post('/guests/import', { rows })).status).toBe(200);
    const pia = await byName('Pia Post');
    expect(pia).toMatchObject({ delivery: 'post', phone: '+61412777001', address: { street: '12 Rose St', suburb: 'Newtown', state: 'NSW', postcode: '2042', country: 'Australia' } });
    expect(await byName('Ben Both')).toMatchObject({ delivery: 'both', address: { suburb: 'Perth' } });
    expect(await byName('Dee Digital')).toMatchObject({ delivery: 'digital', address: { street: '' } });

    const { recipients } = await new D1SmsStore(t.db, '').audience(wid);
    const r = (name: string) => recipients.find((x) => x.people[0] === name)!;
    expect(r('Pia Post').post).toBe(true);
    // Whatever way the wedding sends (a texting number, email, or the couple's own phone), post only gets none of it.
    const via = (name: string, channel: 'text' | 'email' | 'phone') => ({ ...r(name), channel });
    expect([textable(via('Pia Post', 'text')), emailable(via('Pia Post', 'email')), phoneable(via('Pia Post', 'phone'))]).toEqual([false, false, false]);
    expect([textable(via('Ben Both', 'text')), phoneable(via('Ben Both', 'phone'))]).toEqual([true, true]);
    expect([textable(via('Dee Digital', 'text')), emailable(via('Dee Digital', 'email'))]).toEqual([true, true]);

    // Changed on the guest: back to digital, a new address line.
    const res = await call(`/guests/${pia.id}`, { method: 'PATCH', headers: { 'If-Match': String(pia.version) }, body: JSON.stringify({ delivery: 'digital', address: { street: '14 Rose St' } }) });
    expect(((await res.json()) as { guest: G }).guest).toMatchObject({ delivery: 'digital', address: { street: '14 Rose St', suburb: 'Newtown' } });
    expect((await new D1SmsStore(t.db, '').audience(wid)).recipients.find((x) => x.people[0] === 'Pia Post')!.post).toBe(false);
    expect((await post('/guests/import', { rows: [{ people: ['Bad Way'], delivery: 'pigeon' }] })).status).toBe(400);
  });
});
