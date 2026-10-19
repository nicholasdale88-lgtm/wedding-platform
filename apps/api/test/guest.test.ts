import { INV_SCOPES } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import texts from '../../../seed/texts.json';
import dynamicTexts from '../../../seed/texts.dynamic.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** M2: the guest pages' API on the real seed. */
describe('guest API', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const get = (path: string) => app.request(`/api/p/sophie-and-nicholas${path}`, {}, env, ctx);
  const post = (path: string, body: unknown, ip = '9.9.9.9') =>
    app.request(`/api/p/sophie-and-nicholas${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }, env, ctx);
  const tokenOf = async (name: string) =>
    (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = ?`).bind(name).first<{ token: string }>())!.token;
  type Payload = { events: { key: string }[]; texts: Record<string, string>; invitation: { invited: string[]; rsvp: Record<string, { attending: boolean; count: number; answers: Record<string, string> }>; people: { name: string }[] } | null; content: Record<string, unknown> };

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'o@example.com', ownerPassHash: 'x', texts: { ...texts, ...dynamicTexts } });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com' };
  });
  afterEach(() => t.dispose());

  it('without a link: both events, every word, no invitation', async () => {
    const p = (await (await get('/invite')).json()) as Payload;
    expect(p.events.map((e) => e.key)).toEqual(['wedding', '30th']);
    expect(p.invitation).toBeNull();
    expect(Object.keys(p.texts).length).toBe(Object.keys(texts).filter((k) => k.startsWith('inv.')).length + Object.keys(dynamicTexts).length);
    expect(Object.keys(p.texts).some((k) => k.startsWith('gd.'))).toBe(false); // only this page's words
    expect(p.content).toMatchObject({ rsvpBy: 'Kindly reply by 18 August 2027', seal: 'Sandstone' });
  });

  it('a guest not invited to the 30th never receives its event or its wording (docs/09 §J)', async () => {
    const res = await get(`/invite?g=${await tokenOf('Ella Thompson')}`); // wedding only
    const p = (await res.json()) as Payload;
    expect(p.events.map((e) => e.key)).toEqual(['wedding']);
    expect(p.invitation!.invited).toEqual(['wedding']);
    const secondEventKeys = Object.entries(INV_SCOPES).filter(([, s]) => /bSecDisp|bFaqDisp|rideDisp|bDisp/.test(s)).map(([k]) => k);
    expect(secondEventKeys.length).toBeGreaterThan(20);
    for (const k of secondEventKeys) expect(p.texts[k]).toBeUndefined();
    expect(JSON.stringify(p)).not.toMatch(/horse riding|Horse Riding/i);
  });

  it('a guest invited to both gets everything, with their own reply', async () => {
    const p = (await (await get(`/invite?g=${await tokenOf('Margaret Bloor')}`)).json()) as Payload;
    expect(p.events.map((e) => e.key)).toEqual(['wedding', '30th']);
    expect(p.invitation!.people.map((x) => x.name)).toEqual(['Margaret Bloor', 'Peter Bloor']);
    expect(p.invitation!.rsvp['30th']).toMatchObject({ attending: true, answers: { ride: 'No, not riding' } });
  });

  it('opening the link records "opened" once; preview never does', async () => {
    const tok = await tokenOf('Ivy Scott');
    await get(`/invite?g=${tok}&preview=1`);
    const opened = () => t.db.prepare(`SELECT opened_at FROM invitation WHERE token = ?`).bind(tok).first<{ opened_at: string | null }>();
    expect((await opened())!.opened_at).toBeNull();
    await get(`/invite?g=${tok}`);
    const firstOpen = (await opened())!.opened_at;
    expect(firstOpen).not.toBeNull();
    await get(`/invite?g=${tok}`);
    expect((await opened())!.opened_at).toBe(firstOpen);
  });

  it('a bad link still shows the invitation (with the name lookup)', async () => {
    const p = (await (await get('/invite?g=not-a-real-token-at-all')).json()) as Payload;
    expect(p.invitation).toBeNull();
    expect(p.events).toHaveLength(2);
  });

  it('finds an invitation by any name on it, ignoring case and spaces', async () => {
    const res = await post('/find', { name: '  olivia   CHEN ' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Payload).invitation!.people[0]!.name).toBe('James Dale');
    expect((await post('/find', { name: 'Nobody Here' })).status).toBe(404);
  });

  it('name lookups are rate limited', async () => {
    for (let i = 0; i < 10; i++) await post('/find', { name: 'x' }, '7.7.7.7');
    expect((await post('/find', { name: 'x' }, '7.7.7.7')).status).toBe(429);
  });

  it('RSVP: saves per event, clamps numbers, ignores events not invited to, attaches dietary', async () => {
    const tok = await tokenOf('Ella Thompson'); // wedding only, 1 seat
    const res = await post('/rsvp', { token: tok, events: { wedding: { attending: true }, '30th': { attending: true } }, count: 9, diet: 'Coeliac', message: 'Yay' });
    expect(res.status).toBe(200);
    const { invitation } = (await res.json()) as { invitation: { rsvp: Record<string, { attending: boolean; count: number }> } };
    expect(invitation.rsvp).toEqual({ wedding: { attending: true, count: 1, answers: {} } });
    const via = await t.db.prepare(`SELECT via FROM rsvp r JOIN invitation i ON i.id = r.invitation_id WHERE i.token = ?`).bind(tok).first<{ via: string }>();
    expect(via!.via).toBe('invitation');
  });

  it('changing a reply moves the reply time (thank-you); repeating the same answer does not', async () => {
    const tok = await tokenOf('Ivy Scott');
    const at = () => t.db.prepare(`SELECT r.updated_at FROM rsvp r JOIN invitation i ON i.id = r.invitation_id JOIN event e ON e.id = r.event_id WHERE i.token = ? AND e.key = 'wedding'`).bind(tok).first<{ updated_at: string }>();
    await post('/rsvp', { token: tok, events: { wedding: { attending: true }, '30th': { attending: false } } });
    const first = (await at())!.updated_at;
    await new Promise((r) => setTimeout(r, 5));
    await post('/rsvp', { token: tok, events: { wedding: { attending: true }, '30th': { attending: false } }, message: 'Note added' });
    expect((await at())!.updated_at).toBe(first);
    await new Promise((r) => setTimeout(r, 5));
    await post('/rsvp', { token: tok, events: { wedding: { attending: false }, '30th': { attending: false } } });
    expect((await at())!.updated_at).not.toBe(first);
  });

  it('rejects an unknown token and malformed bodies', async () => {
    expect((await post('/rsvp', { token: 'a'.repeat(22), events: { wedding: { attending: true } } })).status).toBe(404);
    expect((await post('/rsvp', { token: 'short', events: {} })).status).toBe(400);
    expect((await post('/rsvp', { nope: 1 })).status).toBe(400);
  });

  it('an unknown wedding is a friendly 404', async () => {
    const res = await app.request('/api/p/no-such-wedding/invite', {}, env, ctx);
    expect(res.status).toBe(404);
  });
});
