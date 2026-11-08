import { zonedToUtc } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp, scheduled } from '../src/index';
import type { EngineDeps } from '../src/sms/engine';
import { starterTimes } from '../src/sms/starter';
import { testD1 } from './support/d1';
import { fakeClock, FakeProvider, TZ } from './support/fakes';

/** A new wedding starts with the usual texts, all switched off until the couple turns each on. */
describe('starter texts', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let provider: FakeProvider;
  const clock = fakeClock('2026-11-01T10:00');
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: clock.now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  type Camp = { id: string; key: string; name: string; mode: string; enabled: boolean; trigger: string | null; version: number; slots: { sendAt: string; status: string }[] };
  const local = (s: string) => zonedToUtc(s, TZ).toISOString();

  const signup = async (date: string, email = 'alex@example.com') => {
    const res = await app.request(
      '/api/a/signup',
      { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `7.7.7.${email.length}` }, body: JSON.stringify({ firstName: 'Alex', partnerName: 'Sam', email, passcode: 'long-enough-1', date, website: '' }) },
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    const { weddingId } = (await res.json()) as { weddingId: string };
    const call = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${weddingId}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
    const texts = async () => ((await (await call('/texts')).json()) as { campaigns: Camp[] }).campaigns;
    return { wid: weddingId, call, texts };
  };
  const byKey = (cs: Camp[]) => Object.fromEntries(cs.map((c) => [c.key, c]));
  const times = (c: Camp | undefined) => (c?.slots ?? []).filter((s) => s.status === 'pending').map((s) => s.sendAt).sort();

  beforeEach(async () => {
    provider = new FakeProvider();
    t = await testD1();
    env = {
      DB: t.db,
      PUBLIC_BASE_URL: 'https://example.com',
      SESSION_SECRET: 'test-secret-for-sessions-000000',
      RESEND_API_KEY: 're_test',
      EMAIL_FROM: 'The Yes List <hello@site.example>',
      INBOX_DOMAIN: 'mail.example',
    };
    vi.stubGlobal('fetch', async (url: string) => (String(url).includes('api.resend.com') ? new Response('{"id":"x"}', { status: 200 }) : new Response('unexpected', { status: 500 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('a new sign-up has the set, all off, with send times from the wedding day and the reply-by date', async () => {
    const w = await signup('2030-06-15');
    const cs = byKey(await w.texts());
    expect(Object.keys(cs).sort()).toEqual(['after', 'invite', 'lastcall', 'nightW', 'reminder', 'savedate', 'thanks']);
    expect(Object.values(cs).every((c) => !c.enabled)).toBe(true);
    expect(cs.invite).toMatchObject({ mode: 'auto', trigger: 'invitation_created' });
    expect(cs.thanks).toMatchObject({ mode: 'auto', trigger: 'rsvp_changed' });
    expect(cs.nightW!.name).toBe('Night before: the wedding');
    // Ten months before; two weeks and three days before replies close (six weeks before, when not set);
    // the evening before at 5pm; the day after at 11am. All in the wedding's own time.
    expect(times(cs.savedate)).toEqual([local('2029-08-15T10:00')]);
    expect(times(cs.reminder)).toEqual([local('2030-04-20T10:00')]);
    expect(times(cs.lastcall)).toEqual([local('2030-05-01T10:00')]);
    expect(times(cs.nightW)).toEqual([local('2030-06-14T17:00')]);
    expect(times(cs.after)).toEqual([local('2030-06-16T11:00')]);

    // A reply-by date, and a new wedding day: the untouched ones follow.
    await t.db.prepare(`UPDATE wedding SET content = json_set(content, '$.invitation.rsvpClose', '2030-07-01') WHERE id = ?`).bind(w.wid).run();
    const ev = (await (await w.call('/events')).json()) as { events: { id: string; version: number }[] };
    expect((await w.call(`/events/${ev.events[0]!.id}`, { method: 'PUT', headers: { 'If-Match': String(ev.events[0]!.version) }, body: JSON.stringify({ startsAt: local('2030-08-10T15:00') }) })).status).toBe(200);
    const moved = byKey(await w.texts());
    expect(times(moved.reminder)).toEqual([local('2030-06-17T10:00')]);
    expect(times(moved.lastcall)).toEqual([local('2030-06-28T10:00')]);
    expect(times(moved.nightW)).toEqual([local('2030-08-09T17:00')]);
    // Opening Texts again changes nothing (no duplicates).
    expect(times(byKey(await w.texts()).nightW)).toEqual([local('2030-08-09T17:00')]);
  });

  it('no date yet: no send times until the date is set', async () => {
    const w = await signup('', 'nodate@example.com');
    const cs = await w.texts();
    expect(cs).toHaveLength(7);
    expect(cs.flatMap((c) => c.slots)).toEqual([]);
    expect(starterTimes({ startsAt: local('2030-06-15T15:00'), tz: TZ, rsvpClose: '', dateSet: true }, new Date(local('2030-06-15T09:00')))).toMatchObject({ savedate: [], reminder: [], lastcall: [], nightW: [] });
  });

  it('a wedding with no texts gets the set when Texts opens; one already with its own keeps them', async () => {
    const w = await signup('2030-06-15', 'old@example.com');
    await t.db.prepare(`DELETE FROM campaign_slot WHERE campaign_id IN (SELECT id FROM campaign WHERE wedding_id = ?)`).bind(w.wid).run();
    await t.db.prepare(`DELETE FROM campaign WHERE wedding_id = ?`).bind(w.wid).run();
    await t.db.prepare(`UPDATE wedding SET content = json_remove(content, '$.starterTexts') WHERE id = ?`).bind(w.wid).run();
    const cs = await w.texts();
    expect(cs.map((c) => c.key).sort()).toEqual(['after', 'invite', 'lastcall', 'nightW', 'reminder', 'savedate', 'thanks']);
    expect(cs.every((c) => !c.enabled)).toBe(true);
    expect(await w.texts()).toHaveLength(7);
  });

  it('nothing is sent until a message is switched on, by any channel; then it goes by text, email and own phone', async () => {
    const w = await signup('2030-06-15', 'send@example.com');
    await t.db.prepare(`UPDATE wedding SET plan = 'essentials', sms_sender = '+61400000999' WHERE id = ?`).bind(w.wid).run();
    const ev = (await t.db.prepare(`SELECT id FROM event WHERE wedding_id = ?`).bind(w.wid).first<{ id: string }>())!;
    const at = '2026-11-01T00:00:00.000Z';
    const guests: [string, string | null, string | null, string][] = [
      ['ia', '+61412555101', null, ''], // text
      ['ib', null, 'ben@example.com', 'email'], // email
      ['ic', '+61412555103', null, 'phone'], // the couple's own phone
    ];
    await t.db.batch(
      guests.flatMap(([id, phone, email, channel], i) => [
        t.db.prepare(`INSERT INTO invitation (id, wedding_id, token, phone, email, channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, w.wid, `tok${String(i).padStart(19, '0')}`, phone, email, channel, at, at),
        t.db.prepare(`INSERT INTO person (id, invitation_id, idx, name) VALUES (?, ?, 0, ?)`).bind(`${id}p`, id, `Guest${i} Lee`),
        t.db.prepare(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`).bind(id, ev.id),
        t.db.prepare(`INSERT INTO rsvp (invitation_id, event_id, attending, count, updated_at) VALUES (?, ?, 1, 1, ?)`).bind(id, ev.id, local('2029-08-15T09:55')),
      ]),
    );
    const cs = byKey(await w.texts());
    const sent = async () => ({
      texts: (await t.db.prepare(`SELECT COUNT(*) AS n FROM sms_out WHERE wedding_id = ?`).bind(w.wid).first<{ n: number }>())!.n,
      emails: (await t.db.prepare(`SELECT COUNT(*) AS n FROM email_out WHERE wedding_id = ?`).bind(w.wid).first<{ n: number }>())!.n,
    });
    // Every moment one of them would go (and the invitations' start date): nothing, while they're off.
    for (const when of ['2029-08-15T10:05', '2029-10-15T16:00', '2030-04-20T10:05', '2030-05-01T10:05', '2030-06-14T17:05', '2030-06-16T11:05']) {
      clock.set(when);
      await scheduled(env, deps);
    }
    expect(await sent()).toEqual({ texts: 0, emails: 0 });
    expect(provider.delivered).toEqual([]);

    // The couple switches on the thank-you for coming: it goes to each guest the way they hear from the couple.
    const after = cs.after!;
    expect((await w.call(`/texts/${after.id}`, { method: 'PATCH', headers: { 'If-Match': String(after.version) }, body: JSON.stringify({ enabled: true }) })).status).toBe(200);
    clock.set('2030-06-16T11:05');
    await scheduled(env, deps);
    const rows = await t.db.prepare(`SELECT invitation_id AS inv FROM sms_out WHERE wedding_id = ? AND campaign_id = ?`).bind(w.wid, after.id).all<{ inv: string }>();
    expect(rows.results.map((r) => r.inv)).toEqual(['ia']);
    const mail = await t.db.prepare(`SELECT invitation_id AS inv, kind FROM email_out WHERE wedding_id = ? AND campaign_id = ? ORDER BY invitation_id`).bind(w.wid, after.id).all<{ inv: string; kind: string }>();
    expect(mail.results).toEqual([
      { inv: 'ib', kind: 'campaign' },
      { inv: 'ic', kind: 'phone' },
    ]);
    // The others are still off: nothing else went.
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM sms_out WHERE wedding_id = ? AND campaign_id != ?`).bind(w.wid, after.id).first<{ n: number }>())!.n).toBe(0);
  });
});
