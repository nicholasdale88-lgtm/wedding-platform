import { INV_SCOPES } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import texts from '../../../seed/texts.json';
import dynamicTexts from '../../../seed/texts.dynamic.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { buildSeed } from '../src/seed/build';
import { publishSeating, testD1 } from './support/d1';

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
    expect(Object.keys(p.texts).length).toBe(Object.keys({ ...texts, ...dynamicTexts }).filter((k) => k.startsWith('inv.')).length);
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

  it("a dietary note for two people reaches each person's own place card", async () => {
    const tok = await tokenOf('Margaret Bloor'); // Margaret and Peter
    await post('/rsvp', { token: tok, events: { wedding: { attending: true } }, diet: 'Margaret vegetarian, Peter coeliac' });
    const rows = await t.db.prepare(`SELECT p.name, p.diet FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.token = ? ORDER BY p.idx`).bind(tok).all();
    expect(rows.results).toEqual([
      { name: 'Margaret Bloor', diet: 'Vegetarian' },
      { name: 'Peter Bloor', diet: 'Coeliac' },
    ]);
    const guide = (await (await get(`/guide?g=${tok}&event=wedding`)).json()) as { guest: { people: { name: string; diet: string }[] } };
    expect(guide.guest.people.map((p) => p.diet)).toEqual(['Vegetarian', 'Coeliac']);
    // Editing the reply later shows the same split and keeps it.
    const again = (await (await get(`/invite?g=${tok}&preview=1`)).json()) as Payload;
    expect(again.invitation!.people.map((p) => (p as { diet?: string }).diet)).toEqual(['Vegetarian', 'Coeliac']);
  });

  it('declining everything clears dietary notes and meals; declining one of two keeps them', async () => {
    const tok = await tokenOf('Margaret Bloor'); // invited to both
    const diets = async () => (await t.db.prepare(`SELECT p.diet, p.meal_main FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.token = ? ORDER BY p.idx`).bind(tok).all()).results;
    await post('/rsvp', { token: tok, events: { wedding: { attending: true }, '30th': { attending: true } }, diet: 'Margaret vegetarian' });
    await t.db.prepare(`UPDATE person SET meal_main = 'Risotto' WHERE name = 'Margaret Bloor'`).run();
    await post('/rsvp', { token: tok, events: { wedding: { attending: false }, '30th': { attending: true } } });
    expect((await diets())[0]).toEqual({ diet: 'Vegetarian', meal_main: 'Risotto' }); // still coming to the 30th
    await post('/rsvp', { token: tok, events: { wedding: { attending: false }, '30th': { attending: false } } });
    expect(await diets()).toEqual([{ diet: '', meal_main: '' }, { diet: '', meal_main: '' }]); // not coming to anything
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

  type Guide = {
    event: { key: string };
    guide: { style: string; faq?: unknown[]; bring?: string[] };
    texts: Record<string, string>;
    guest: { people: { name: string; tableId: string | null }[]; answers: Record<string, string> };
    seating: { tables: { id: string }[] } | null;
    mates: Record<string, string[]>;
    photoUrl: string;
    weather: unknown;
  };

  it('night-before guide: needs their own link, and only for an event they are invited to', async () => {
    expect((await get('/guide')).status).toBe(404);
    expect((await get(`/guide?g=${'a'.repeat(22)}`)).status).toBe(404);
    const ella = await tokenOf('Ella Thompson'); // wedding only
    expect((await get(`/guide?g=${ella}&event=30th`)).status).toBe(404);
    const p = (await (await get(`/guide?g=${ella}`)).json()) as Guide;
    expect(p.event.key).toBe('wedding');
    expect(p.guide.style).toBe('reception');
    expect(p.guide.faq!.length).toBeGreaterThan(3);
    expect(Object.keys(p.texts).length).toBeGreaterThan(30);
    expect(Object.keys(p.texts).every((k) => k.startsWith('gd.'))).toBe(true);
    expect(p.photoUrl).toBe(`https://example.com/w/sophie-and-nicholas/photos?g=${ella}`);
    expect(p.weather).toBeNull(); // more than two weeks out: no forecast, never a made-up one
  });

  it('guide seating: their tables, and names of only their own table mates', async () => {
    const before = (await (await get(`/guide?g=${await tokenOf('Margaret Bloor')}&event=wedding`)).json()) as Guide;
    expect(before.seating).toBeNull(); // nothing for guests until the couple publishes
    await publishSeating(t.db);
    const p = (await (await get(`/guide?g=${await tokenOf('Margaret Bloor')}&event=wedding`)).json()) as Guide;
    const mine = new Set(p.guest.people.map((x) => x.tableId).filter(Boolean));
    expect(p.seating!.tables.length).toBeGreaterThan(1);
    for (const id of Object.keys(p.mates)) expect(mine.has(id)).toBe(true);
    const all = Object.values(p.mates).flat();
    expect(all).not.toContain('Margaret Bloor');
    expect(all).not.toContain('Peter Bloor');
  });

  it('the 30th guide is the day-out design, with their own answer', async () => {
    const p = (await (await get(`/guide?g=${await tokenOf('Margaret Bloor')}&event=30th`)).json()) as Guide;
    expect(p.guide.style).toBe('dayout');
    expect(p.guide.bring!.length).toBeGreaterThan(3);
    expect(p.guest.answers).toEqual({ ride: 'No, not riding' });
    expect(Object.keys(p.texts).every((k) => k.startsWith('g30.'))).toBe(true);
  });

  describe('photos', () => {
    const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);
    const put = (tok: string, body: BodyInit, byHeader = '') =>
      app.request(`/api/p/sophie-and-nicholas/photos?g=${tok}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'X-Photo-By': byHeader }, body }, env, ctx);
    let saved: Map<string, { bytes: number; type?: string }>;
    beforeEach(() => {
      saved = new Map();
      env.MEDIA = {
        put: async (k: string, v: Uint8Array, o?: { httpMetadata?: { contentType?: string } }) => void saved.set(k, { bytes: v.byteLength, type: o?.httpMetadata?.contentType }),
      } as unknown as R2Bucket;
    });

    it('page info: their name, and closed without storage or a link', async () => {
      const tok = await tokenOf('Ivy Scott');
      expect(await (await get(`/photos?g=${tok}`)).json()).toMatchObject({ name: 'Ivy Scott', linked: true, open: true });
      expect(await (await get('/photos')).json()).toMatchObject({ name: '', open: false });
      delete env.MEDIA;
      expect(await (await get(`/photos?g=${tok}`)).json()).toMatchObject({ open: false });
      expect((await put(tok, JPEG)).status).toBe(503);
    });

    it('stores a real photo privately, under that wedding, with who sent it', async () => {
      const tok = await tokenOf('Ivy Scott');
      const res = await put(tok, JPEG, encodeURIComponent('Ivy S ✨'));
      expect(res.status).toBe(200);
      const [key, obj] = [...saved.entries()][0]!;
      expect(key).toMatch(/^w\/[^/]+\/photos\/[0-9a-f-]{36}\.jpg$/);
      expect(obj).toEqual({ bytes: JPEG.byteLength, type: 'image/jpeg' });
      const row = await t.db.prepare(`SELECT kind, uploaded_by, bytes FROM media`).first();
      expect(row).toEqual({ kind: 'photo', uploaded_by: 'Ivy S ✨', bytes: JPEG.byteLength });
    });

    it('refuses anything that is not a photo, whatever it claims, and needs a real link', async () => {
      const tok = await tokenOf('Ivy Scott');
      expect((await put(tok, new TextEncoder().encode('<script>alert(1)</script>'))).status).toBe(415);
      expect((await put(tok, new Uint8Array([0x4d, 0x5a, 0x90, 0]))).status).toBe(415); // a Windows program
      expect((await put('a'.repeat(22), JPEG)).status).toBe(404);
      expect((await put(tok, JPEG, '%E0%A4%A')).status).toBe(200); // garbled name: photo kept, name dropped
      expect(saved.size).toBe(1);
    });
  });

  it('an unknown wedding is a friendly 404', async () => {
    const res = await app.request('/api/p/no-such-wedding/invite', {}, env, ctx);
    expect(res.status).toBe(404);
  });
});
