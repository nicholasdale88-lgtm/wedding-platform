import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import texts from '../../../seed/texts.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Admin → Guest pages: read and edit everything guests see. */
describe('guest pages API', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (init: RequestInit = {}) => app.request(`/api/a/w/${wid}/pages`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const put = (body: unknown, version: number) => call({ method: 'PUT', body: JSON.stringify(body), headers: { 'If-Match': String(version) } });
  type Pages = { version: number; theme: string; events: { key: string }[]; invitation: Record<string, unknown>; guides: Record<string, { style: string; runsheet?: unknown[]; date?: string }>; texts: Record<string, string>; samples: { token: string; label: string; invited: string[] }[] };

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027'), texts });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
  });
  afterEach(() => t.dispose());

  it('reads every page: invitation, a guide per event, every word, and guests to preview as', async () => {
    const p = (await (await call()).json()) as Pages;
    expect(p.events.map((e) => e.key)).toEqual(['wedding', '30th']);
    expect(p.guides.wedding!.style).toBe('reception');
    expect(p.guides['30th']!.style).toBe('dayout');
    expect(p.invitation).toMatchObject({ seal: 'Sandstone' });
    expect(Object.keys(p.texts).length).toBe(Object.keys(texts).length);
    expect(p.samples.length).toBe(22);
    expect(p.samples.find((s) => s.label.startsWith('Margaret Bloor'))!.invited).toEqual(expect.arrayContaining(['wedding', '30th']));
  });

  it('saves wording, guide and theme together; the guest pages show it straight away', async () => {
    const p = (await (await call()).json()) as Pages;
    const key = Object.keys(p.texts).find((k) => k.startsWith('inv.'))!;
    const guide = { ...p.guides.wedding!, date: 'Friday 19 November 2027' };
    const res = await put({ texts: { [key]: 'Our new words' }, guides: { wedding: guide }, theme: 'Bridgerton Blush', invitation: { rsvpBy: 'Reply by 1 July' } }, p.version);
    expect(res.status).toBe(200);
    const saved = (await res.json()) as Pages;
    expect(saved.version).toBe(p.version + 1);
    expect(saved.texts[key]).toBe('Our new words');
    expect(saved.theme).toBe('Bridgerton Blush');
    expect(saved.invitation).toMatchObject({ rsvpBy: 'Reply by 1 July', seal: 'Sandstone' }); // other settings kept

    const guest = (await (await app.request('/api/p/sophie-and-nicholas/invite', {}, env, ctx)).json()) as { texts: Record<string, string>; content: { rsvpBy: string }; wedding: { theme: string } };
    expect(guest.texts[key]).toBe('Our new words');
    expect(guest.content.rsvpBy).toBe('Reply by 1 July');
    expect(guest.wedding.theme).toBe('Bridgerton Blush');
  });

  it('two people editing: the second save is refused, not silently overwritten', async () => {
    const p = (await (await call()).json()) as Pages;
    expect((await put({ theme: 'Cream & Sage' }, p.version)).status).toBe(200);
    expect((await put({ theme: 'Bridgerton Blush' }, p.version)).status).toBe(409);
    expect((await call({ method: 'PUT', body: '{}' })).status).toBe(428);
  });

  it('refuses bad input: unknown events, non-guest wording keys, broken guides', async () => {
    const p = (await (await call()).json()) as Pages;
    expect((await put({ guides: { brunch: { style: 'reception' } } }, p.version)).status).toBe(400);
    expect((await put({ texts: { 'admin.secret': 'x' } }, p.version)).status).toBe(400);
    expect((await put({ texts: { '__proto__': 'x' } }, p.version)).status).toBe(400);
    expect((await put({ guides: { wedding: { style: 'reception', runsheet: 'nope' } } }, p.version)).status).toBe(400);
    expect((await put({ texts: { 'inv.x': 'y'.repeat(5000) } }, p.version)).status).toBe(400);
    expect((await put({ nope: 1 }, p.version)).status).toBe(400);
  });

  it('needs a session and a writer role; viewers can look but not save', async () => {
    const saved = cookie;
    cookie = '';
    expect((await call()).status).toBe(401);
    cookie = saved;
    await t.db.prepare(`UPDATE membership SET role = 'viewer'`).run();
    const p = (await (await call()).json()) as Pages;
    expect((await put({ theme: 'Cream & Sage' }, p.version)).status).toBe(403);
  });
});
