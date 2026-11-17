import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Add to calendar: a calendar file per event with only what the invitation shows. */
describe('calendar file', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'o@example.com', ownerPassHash: 'x' });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com' };
  });
  afterEach(() => t.dispose());

  it('gives a valid event with the start in UTC, a reminder the day before, and a link back', async () => {
    const res = await app.request('/api/p/sophie-and-nicholas/calendar/wedding.ics', {}, env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
    const body = await res.text();
    expect(body).toMatch(/^BEGIN:VCALENDAR\r\n/);
    expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(body).toContain('TRIGGER:-P1D');
    expect(body).toContain('URL:https://example.com/w/sophie-and-nicholas');
    expect(body.split('\r\n').every((l) => l.length <= 75)).toBe(true);
    expect((await app.request('/api/p/sophie-and-nicholas/calendar/nope.ics', {}, env, ctx)).status).toBe(404);
  });

  it('a private wedding: an event’s file only with a guest’s own link, for an event they’re invited to (stress run)', async () => {
    await t.db.prepare(`UPDATE wedding SET content = json_set(content, '$.private', json('true'))`).run();
    const ev = (await t.db.prepare(`SELECT id, key FROM event ORDER BY sort LIMIT 1`).first<{ id: string; key: string }>())!;
    const inv = (await t.db.prepare(`SELECT i.token FROM invitation i JOIN invite_event ie ON ie.invitation_id = i.id AND ie.event_id = ? LIMIT 1`).bind(ev.id).first<{ token: string }>())!;
    const out = await t.db.prepare(`SELECT i.token FROM invitation i WHERE NOT EXISTS (SELECT 1 FROM invite_event ie WHERE ie.invitation_id = i.id AND ie.event_id = ?) LIMIT 1`).bind(ev.id).first<{ token: string }>();
    const file = (g = '') => app.request(`/api/p/sophie-and-nicholas/calendar/${ev.key}.ics${g ? `?g=${g}` : ''}`, {}, env, ctx);
    expect((await file()).status).toBe(404);
    const mine = await file(inv.token);
    expect(mine.status).toBe(200);
    expect(mine.headers.get('cache-control')).toMatch(/^private/);
    expect(await mine.text()).toContain('BEGIN:VEVENT');
    if (out) expect((await file(out.token)).status).toBe(404);
    expect((await file('a'.repeat(22))).status).toBe(404);
  });

  it('folds long lines by octets, never through a character (accents, other scripts, emoji)', async () => {
    await t.db.prepare(`UPDATE event SET name = ?, venue = ? WHERE key = 'wedding'`).bind('Día dos — ceremonia y fiesta ✨ 🎉 李小龍 with a very long name to fill the line up', 'Glasshouse — Rooftop 🌿, Level 2; Kangaroo Valley').run();
    const body = await (await app.request('/api/p/sophie-and-nicholas/calendar/wedding.ics', {}, env, ctx)).text();
    expect(body).not.toContain('�');
    const enc = new TextEncoder();
    expect(body.split('\r\n').every((l) => enc.encode(l).length <= 75)).toBe(true);
    const summary = body.split('\r\n').reduce<string[]>((a, l) => (l.startsWith(' ') ? [...a.slice(0, -1), a[a.length - 1] + l.slice(1)] : [...a, l]), []).find((l) => l.startsWith('SUMMARY:'));
    expect(summary).toContain('Día dos — ceremonia y fiesta ✨ 🎉 李小龍 with a very long name to fill the line up');
  });

  it("a guest's own calendar: every event they're invited to (not ones they said no to), kept up to date, with reminders", async () => {
    const inv = (await t.db.prepare(`SELECT i.id, i.token FROM invitation i WHERE (SELECT COUNT(*) FROM invite_event ie WHERE ie.invitation_id = i.id) > 1 LIMIT 1`).first<{ id: string; token: string }>())!;
    const feed = () => app.request(`/api/p/sophie-and-nicholas/calendar/mine.ics?g=${inv.token}`, {}, env, ctx);
    const count = async () => ((await (await feed()).text()).match(/BEGIN:VEVENT/g) ?? []).length;
    const invited = (await t.db.prepare(`SELECT COUNT(*) AS n FROM invite_event WHERE invitation_id = ?`).bind(inv.id).first<{ n: number }>())!.n;
    await t.db.prepare(`DELETE FROM rsvp WHERE invitation_id = ?`).bind(inv.id).run();
    const res = await feed();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toMatch(/^private/);
    const body = await res.text();
    expect(body).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT12H');
    expect(body).toContain('TRIGGER:-PT2H');
    expect(body.split('\r\n').every((l) => l.length <= 75)).toBe(true);
    expect(await count()).toBe(invited);
    // Said no to one: it leaves their calendar.
    const ev = (await t.db.prepare(`SELECT event_id FROM invite_event WHERE invitation_id = ? LIMIT 1`).bind(inv.id).first<{ event_id: string }>())!.event_id;
    await t.db.prepare(`INSERT INTO rsvp (invitation_id, event_id, attending, updated_at) VALUES (?, ?, 0, '2027-01-01')`).bind(inv.id, ev).run();
    expect(await count()).toBe(invited - 1);
    // No link, or another wedding's: nothing.
    expect((await app.request('/api/p/sophie-and-nicholas/calendar/mine.ics', {}, env, ctx)).status).toBe(404);
    expect((await app.request(`/api/p/sophie-and-nicholas/calendar/mine.ics?g=${'a'.repeat(22)}`, {}, env, ctx)).status).toBe(404);
  });
});
