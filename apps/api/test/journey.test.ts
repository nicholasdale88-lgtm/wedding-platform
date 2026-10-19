import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp, scheduled } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import type { EngineDeps } from '../src/sms/engine';
import { testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

/**
 * The whole guest journey on a fresh wedding, end to end: import the list → invitations go out →
 * replies (by link and by text) → thank-yous → reminders only to those still to reply → seating only
 * for yes → night-before only to those coming → STOP and removed guests never texted again.
 * Real database, real routes, real engine; only the SMS provider and the clock are fakes.
 */
describe('guest journey (list → invitation → RSVP → texts)', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let provider: FakeProvider;
  let waits: Promise<unknown>[];
  let cookie = '';
  let wid = '';
  const clock = fakeClock('2027-06-01T10:00');
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: clock.now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = () => ({ waitUntil: (p: Promise<unknown>) => void waits.push(p), passThroughOnException: () => {}, props: {} }) as unknown as ExecutionContext;
  const api = (path: string, init: RequestInit = {}) => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx());
  const tick = async () => {
    await scheduled(env, deps);
    await Promise.all(waits);
  };
  const to = (mobile: string) => provider.delivered.filter((m) => m.to.endsWith(mobile.slice(1)));
  const tokenOf = async (name: string) =>
    (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = ? AND i.deleted_at IS NULL`).bind(name).first<{ token: string }>())!.token;
  const invId = async (name: string) =>
    (await t.db.prepare(`SELECT i.id, i.version FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = ?`).bind(name).first<{ id: string; version: number }>())!;
  const rsvp = (token: string, events: Record<string, { attending: boolean }>) =>
    app.request('/api/p/sophie-and-nicholas/rsvp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, events }) }, env, ctx());

  const A = '0412000101'; // invited to both, will say yes
  const B = '0412000102'; // wedding only, will decline
  const C = '0412000103'; // both, never replies, then replies STOP

  beforeEach(async () => {
    provider = new FakeProvider();
    waits = [];
    clock.set('2027-06-01T10:00');
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027'), sampleGuests: false });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    await t.db.prepare(`UPDATE wedding SET sms_sender = '+61400000999'`).run();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', MM_HOOK_SECRET: 'hook' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx());
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
  });
  afterEach(() => t.dispose());

  it('runs the whole journey with every rule holding', async () => {
    // 1. Import the guest list from a spreadsheet.
    const imp = await api(`/a/w/${wid}/guests/import`, {
      method: 'POST',
      body: JSON.stringify({
        rows: [
          { people: ['Ann Able', 'Andy Able'], phone: A },
          { people: ['Ben Bell'], phone: B, invited: ['wedding'] },
          { people: ['Cat Cole'], phone: C },
          { people: ['Dan Dee'] }, // no mobile: never texted, sent by WhatsApp instead
        ],
      }),
    });
    expect(((await imp.json()) as { added: number }).added).toBe(4);

    // 2. The autopilot sends each invitation once, with that guest's own link; nobody without a mobile.
    await tick();
    expect(to(A)).toHaveLength(1);
    expect(to(B)).toHaveLength(1);
    expect(to(C)).toHaveLength(1);
    expect(provider.delivered).toHaveLength(3);
    expect(to(A)[0]!.message).toContain(`/w/sophie-and-nicholas/?g=${await tokenOf('Ann Able')}`);
    await tick(); // running again sends nothing twice
    expect(provider.delivered).toHaveLength(3);

    // 3. Ann says yes to both on her invitation, with a dietary note for each person → one thank-you.
    expect((await rsvp(await tokenOf('Ann Able'), { wedding: { attending: true }, '30th': { attending: true } })).status).toBe(200);
    await api(`/a/w/${wid}/guests/${(await invId('Ann Able')).id}/rsvp`, {
      method: 'PUT',
      headers: { 'If-Match': String((await invId('Ann Able')).version) },
      body: JSON.stringify({ events: {}, diet: 'Ann vegetarian, Andy coeliac' }),
    });
    await tick();
    expect(to(A)).toHaveLength(2);
    expect(to(A)[1]!.message).toMatch(/^Thanks Ann/);
    const diets = (await t.db.prepare(`SELECT p.name, p.diet FROM person p WHERE p.name LIKE '% Able' ORDER BY p.idx`).all()).results;
    expect(diets).toEqual([{ name: 'Ann Able', diet: 'Vegetarian' }, { name: 'Andy Able', diet: 'Coeliac' }]);

    // 4. Ben declines by replying to the text → thank-you; the reply is recorded as an RSVP.
    await app.request('/api/hooks/mm/inbound?k=hook', {
      method: 'POST',
      body: JSON.stringify({ to: '0400000999', message: 'No sorry', sender: B, received_at: '2027-06-02 10:00:00', type: 'inbound', original_message_id: '', original_custom_ref: '' }),
    }, env, ctx());
    await Promise.all(waits);
    clock.set('2027-06-02T10:05');
    await tick();
    const ben = await t.db.prepare(`SELECT r.attending, r.via FROM rsvp r JOIN event e ON e.id = r.event_id WHERE e.key = 'wedding' AND r.invitation_id = ?`).bind((await invId('Ben Bell')).id).first();
    expect(ben).toEqual({ attending: 0, via: 'sms' });
    const benTexts = to(B).length;

    // 5. The first reminder date: only Cat (still to reply) gets it. Ann and Ben have replied.
    clock.set('2027-06-18T10:05');
    await tick();
    expect(to(C).at(-1)!.message).toMatch(/gentle reminder/);
    expect(to(A).some((m) => /gentle reminder/.test(m.message))).toBe(false);
    expect(to(B)).toHaveLength(benTexts);

    // 6. Seating: Ann's party can be seated (said yes); Ben (declined) and Cat (no reply) cannot.
    const seating = (await (await api(`/a/w/${wid}/seating?event=wedding`)).json()) as { version: number; tables: unknown[]; areas: unknown[]; aspect: string; people: { id: string; name: string; coming: boolean }[] };
    expect(seating.people.map((p) => p.name).sort()).toEqual(['Andy Able', 'Ann Able', 'Cat Cole', 'Dan Dee']); // Ben declined: gone
    expect(seating.people.filter((p) => p.coming).map((p) => p.name).sort()).toEqual(['Andy Able', 'Ann Able']);
    const table = { id: crypto.randomUUID(), name: '1', shape: 'round', dir: 'h', len: 40, x: 50, y: 50, seats: 10 };
    const save = (seats: Record<string, string | null>, v: number) =>
      api(`/a/w/${wid}/seating`, { method: 'PUT', headers: { 'If-Match': String(v) }, body: JSON.stringify({ event: 'wedding', aspect: seating.aspect, tables: [...(seating.tables as object[]), table], areas: seating.areas, seats }) });
    const cat = seating.people.find((p) => p.name === 'Cat Cole')!;
    expect((await save({ [cat.id]: table.id }, seating.version)).status).toBe(400);
    const ann = seating.people.filter((p) => p.coming);
    const saved = (await (await save(Object.fromEntries(ann.map((p) => [p.id, table.id])), seating.version)).json()) as { version: number };
    await api(`/a/w/${wid}/seating/publish`, { method: 'POST', headers: { 'If-Match': String(saved.version) }, body: JSON.stringify({ event: 'wedding' }) });

    // 7. Cat texts STOP: never texted again, whatever is sent.
    await app.request('/api/hooks/mm/inbound?k=hook', {
      method: 'POST',
      body: JSON.stringify({ to: '0400000999', message: 'STOP', sender: C, received_at: '2027-07-01 10:00:00', type: 'inbound', original_message_id: '', original_custom_ref: '' }),
    }, env, ctx());
    await Promise.all(waits);
    const catTexts = to(C).length;
    clock.set('2027-07-18T10:05'); // second reminder date
    await tick();
    expect(to(C)).toHaveLength(catTexts);

    // 8. The night before the wedding: only Ann (coming), with her published table filled in.
    const night = (await t.db.prepare(`SELECT id, version FROM campaign WHERE key = 'nightW'`).first<{ id: string; version: number }>())!;
    await api(`/a/w/${wid}/texts/${night.id}`, { method: 'PATCH', headers: { 'If-Match': String(night.version) }, body: JSON.stringify({ body: 'Hi {first}, see you tomorrow at table {table}!' }) });
    clock.set('2027-11-17T17:05');
    await tick();
    expect(to(A).at(-1)!.message).toMatch(/^Hi Ann & Andy, see you tomorrow at table 1!/);
    expect(to(B).some((m) => /tomorrow/.test(m.message))).toBe(false);

    // 9. A removed guest is never texted again.
    await api(`/a/w/${wid}/guests/${(await invId('Ann Able')).id}`, { method: 'DELETE' });
    const annTexts = to(A).length;
    const everyone = (await t.db.prepare(`SELECT id FROM campaign WHERE key = 'invite'`).first<{ id: string }>())!;
    clock.set('2027-11-18T12:00');
    await api(`/a/w/${wid}/texts/${everyone.id}/send`, { method: 'POST', body: '{}' });
    expect(to(A)).toHaveLength(annTexts);

    // Nobody was ever sent the same message twice, and nobody without a mobile was texted.
    const keys = (await t.db.prepare(`SELECT dedupe_key FROM sms_out`).all<{ dedupe_key: string }>()).results.map((r) => r.dedupe_key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(provider.delivered.every((m) => /^\+?61/.test(m.to))).toBe(true);
  });
});
