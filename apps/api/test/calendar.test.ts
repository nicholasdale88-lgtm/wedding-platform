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
});
