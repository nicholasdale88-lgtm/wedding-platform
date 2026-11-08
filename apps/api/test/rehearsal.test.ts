import { zonedToUtc } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import type { EngineDeps } from '../src/sms/engine';
import { publishSeating, replyD1, seedD1, testD1 } from './support/d1';
import { fakeClock, FakeProvider, TZ } from './support/fakes';

type Data = {
  now: string;
  asOf: string;
  current: string;
  steps: {
    key: string;
    at: string;
    messages: { campaignId: string; name: string; sendAt: string | null; quiet: boolean; reach: Record<string, number>; gets: { persona: string; how: string | null; text: string | null; why: string }[] }[];
    guests: { persona: string; name: string; standIn: boolean; page: { kind: string; path: string }; sees: string[] }[];
    party: string[];
    coordinator: string[];
    checks: string[];
  }[];
  checks: { key: string; area: string; level: string; title: string; step: string; fix: { tab: string } }[];
  areas: { area: string; level: string; count: number }[];
};

/** The D-Day rehearsal: the whole wedding as a dry run on the real data, read-only. */
describe('rehearsal', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  const clock = fakeClock('2026-10-20T10:00');
  const deps = (e: Env): EngineDeps => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider: new FakeProvider(), now: clock.now, uuid: () => crypto.randomUUID() });
  const app = createApp(deps);
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const get = async (q = '') => {
    const r = await app.request(`/api/a/w/w1/rehearsal${q}`, { headers: { cookie } }, env, ctx);
    expect(r.status).toBe(200);
    return (await r.json()) as Data;
  };
  const step = (d: Data, key: string) => d.steps.find((s) => s.key === key)!;
  const check = (d: Data, key: string) => d.checks.find((c) => c.key === key);

  beforeEach(async () => {
    clock.set('2026-10-20T10:00');
    t = await testD1();
    await seedD1(t.db, 6);
    const day = zonedToUtc('2027-11-18T15:00', TZ).toISOString();
    await t.db.prepare(`UPDATE event SET starts_at = ?, venue = 'The Barn', address = '1 Valley Rd' WHERE id = 'e1'`).bind(day).run();
    await t.db.prepare(`UPDATE event SET starts_at = ?, venue = 'The Paddock' WHERE id = 'e2'`).bind(zonedToUtc('2027-11-20T10:00', TZ).toISOString()).run();
    await t.db.prepare(`UPDATE wedding SET plan = 'complete'`).run();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const now = new Date().toISOString();
    await t.db.prepare(`INSERT INTO user (id, email, name, pass_hash, created_at) VALUES ('u1', 'owner@example.com', 'Owner', ?, ?)`).bind(await hashPasscode('valley-2027'), now).run();
    await t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES ('w1', 'u1', 'owner')`).run();
    const login = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
    // One guest has said yes to both events.
    await replyD1(t.db, 'i1', 'e1', true, new Date('2026-10-10T00:00:00Z'));
    await replyD1(t.db, 'i1', 'e2', true, new Date('2026-10-10T00:00:00Z'));
  });
  afterEach(() => t.dispose());

  it('runs every moment in order, from the invitations to the day after, and "as of" picks the moment', async () => {
    const d = await get();
    expect(d.steps.map((s) => s.key)).toEqual(['invites', 'replies', 'reminders', 'rsvp', 'seating', 'night', 'morning', 'ceremony', 'reception', 'after']);
    for (let i = 1; i < d.steps.length; i++) expect(d.steps[i]!.at >= d.steps[i - 1]!.at).toBe(true);
    // The night before is the night-before text's own time; the ceremony is the wedding's start.
    expect(step(d, 'night').at).toBe(zonedToUtc('2027-11-17T17:00', TZ).toISOString());
    expect(step(d, 'ceremony').at).toBe(zonedToUtc('2027-11-18T15:00', TZ).toISOString());
    expect(step(d, 'reminders').at).toBe(zonedToUtc('2027-06-18T10:00', TZ).toISOString());
    // Today is before the invitations go out (8 months before the day).
    expect(d.current).toBe('invites');
    expect((await get(`?asOf=${encodeURIComponent(zonedToUtc('2027-11-17T19:30', TZ).toISOString())}`)).current).toBe('night');
    expect((await get(`?asOf=${encodeURIComponent(zonedToUtc('2027-11-18T16:00', TZ).toISOString())}`)).current).toBe('ceremony');
    expect((await get('?asOf=not-a-date')).current).toBe('invites');
  });

  it('shows each message on its moment in its real words, and what each kind of guest gets', async () => {
    const d = await get();
    const night = step(d, 'night').messages.find((m) => m.campaignId === 'c-nightW')!;
    expect(night).toBeTruthy();
    const yes = night.gets.find((g) => g.persona === 'yes')!;
    expect(yes.text).toMatch(/^Hi Guest1, see you tomorrow!/);
    expect(yes.text).toContain('https://example.com/w/sophie-and-nicholas/tomorrow?g=tok0000000000000000001');
    expect(yes.how).toBe('text');
    expect(night.gets.find((g) => g.persona === 'waiting')!.text).toBeNull();
    expect(night.reach).toEqual({ text: 1 });

    const reminder = step(d, 'reminders').messages.find((m) => m.campaignId === 'c-reminder')!;
    expect(reminder.gets.find((g) => g.persona === 'waiting')!.text).toMatch(/gentle reminder/);
    expect(reminder.gets.find((g) => g.persona === 'yes')!.text).toBeNull();
    // The invitation goes to everyone as they're added, before anyone has replied.
    const invite = step(d, 'invites').messages.find((m) => m.campaignId === 'c-invite')!;
    expect(invite.sendAt).toBeNull();
    expect(invite.gets.every((g) => !!g.text)).toBe(true);

    // Their pages, as the couple's preview at that moment; nobody has said no yet, so someone stands in.
    const g = step(d, 'night').guests;
    expect(g.find((x) => x.persona === 'yes')).toMatchObject({ standIn: false, page: { kind: 'invitation' } });
    expect(g.find((x) => x.persona === 'yes')!.page.path).toMatch(/^\/w\/sophie-and-nicholas\/\?g=tok0000000000000000001&preview=1&asOf=/);
    expect(g.find((x) => x.persona === 'no')!.standIn).toBe(true);
    expect(g.find((x) => x.persona === 'no')!.page.path).not.toContain('g=');
    expect(g.find((x) => x.persona === 'yes')!.sees.join(' ')).toMatch(/Night-before page: not set up/);
    expect(step(d, 'reception').guests.find((x) => x.persona === 'yes')!.page.kind).toBe('photos');
  });

  it('readiness: what would break or embarrass on the day, each with somewhere to fix it', async () => {
    let d = await get();
    expect(check(d, 'rsvp-date')).toMatchObject({ level: 'amber', area: 'replies' });
    expect(check(d, 'no-guide:wedding')).toMatchObject({ level: 'amber', step: 'night', fix: { tab: 'pages' } });
    expect(check(d, 'photos')).toMatchObject({ level: 'amber', fix: { tab: 'photos' } });
    expect(check(d, 'coordinator')).toBeTruthy();
    expect(check(d, 'no-texting')).toBeUndefined(); // a texting number is connected
    expect(d.areas.find((a) => a.area === 'texts')!.level).toBe('green');

    // A seating plan published without the guest who said yes: they'd have no table.
    await t.db.prepare(`INSERT INTO seat_table (id, wedding_id, event_id, name, x, y, seats) VALUES ('t1', 'w1', 'e1', 'Table 1', 10, 10, 8)`).run();
    await publishSeating(t.db);
    d = await get();
    expect(check(d, 'no-table:wedding')).toMatchObject({ level: 'red', area: 'seating', title: expect.stringMatching(/^1 guest has no table/) });
    expect(d.areas.find((a) => a.area === 'seating')!.level).toBe('red');
    expect(step(d, 'seating').checks).toContain('no-table:wedding');
    expect(step(d, 'seating').guests.find((x) => x.persona === 'yes')!.sees.join(' ')).toMatch(/No table: they aren’t in your published plan/);

    // No texting, but the couple chose the texting number: every guest with a mobile is unreachable.
    await t.db.prepare(`UPDATE wedding SET sms_sender = NULL, content = json_set(content, '$.sendVia', 'service')`).run();
    d = await get();
    expect(check(d, 'no-texting')).toMatchObject({ level: 'red', title: 'No texting set up: 6 guests can’t be reached' });
    expect(d.checks[0]!.level).toBe('red');

    // A reminder due at 10pm waits for the morning.
    await t.db.prepare(`INSERT INTO campaign_slot (id, campaign_id, send_at) VALUES ('s9', 'c-reminder', ?)`).bind(zonedToUtc('2027-07-01T22:00', TZ).toISOString()).run();
    d = await get();
    const quiet = d.checks.find((c) => c.key.startsWith('quiet:c-reminder'));
    expect(quiet).toMatchObject({ level: 'amber', title: expect.stringMatching(/10pm, inside your quiet hours/) });
    expect(step(d, 'reminders').messages.some((m) => m.quiet)).toBe(true);
  });

  it('is read-only: nothing sent, queued, opened or saved', async () => {
    const before = await t.db.prepare(`SELECT (SELECT COUNT(*) FROM sms_out) AS sms, (SELECT COUNT(*) FROM email_out) AS email, (SELECT COUNT(*) FROM invitation WHERE opened_at IS NOT NULL) AS opened, (SELECT COUNT(*) FROM rsvp) AS rsvp`).first();
    await get();
    await get(`?asOf=${encodeURIComponent(zonedToUtc('2027-11-18T18:00', TZ).toISOString())}`);
    const after = await t.db.prepare(`SELECT (SELECT COUNT(*) FROM sms_out) AS sms, (SELECT COUNT(*) FROM email_out) AS email, (SELECT COUNT(*) FROM invitation WHERE opened_at IS NOT NULL) AS opened, (SELECT COUNT(*) FROM rsvp) AS rsvp`).first();
    expect(after).toEqual(before);
    // Signed out: no rehearsal.
    const r = await app.request('/api/a/w/w1/rehearsal', {}, env, ctx);
    expect(r.status).toBe(401);
  });
});
