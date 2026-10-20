import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { seal, unseal } from '../src/lib/seal';
import { runCopies } from '../src/photos/store';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/**
 * Linked photo storage (Dropbox standing in for all four): linking checks the one-time state and the
 * signed-in person; tokens are sealed; with no site storage the photo is saved in Dropbox before the
 * guest hears it worked; the couple can open it; failed copies are retried.
 */
describe('photo links', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}, ck = cookie) => app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', cookie: ck, ...init.headers } }, env, ctx);
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7, 7]);
  let dropboxDown = false;
  const sent: { url: string; arg?: string }[] = [];

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = {
      DB: t.db,
      PUBLIC_BASE_URL: 'https://example.com',
      SESSION_SECRET: 'test-secret-for-sessions-000000',
      DROPBOX_APP_KEY: 'key',
      DROPBOX_APP_SECRET: 'secret',
    };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    dropboxDown = false;
    sent.length = 0;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const arg = (init?.headers as Record<string, string> | undefined)?.['Dropbox-API-Arg'];
      sent.push({ url, arg });
      const ok = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.includes('/oauth2/token')) return ok({ access_token: 'access-1', refresh_token: 'refresh-secret-1' });
      if (url.includes('get_current_account')) return ok({ email: 'couple@example.com' });
      if (url.includes('/files/upload')) return dropboxDown ? new Response('busy', { status: 503 }) : ok({ id: `id:${sent.length}` });
      if (url.includes('/files/download')) return new Response(JPEG, { status: 200 });
      if (url.includes('/files/create_folder_v2')) return dropboxDown ? new Response('busy', { status: 503 }) : ok({ metadata: { path_display: JSON.parse(String(init?.body ?? '{}')).path } });
      return new Response('unexpected', { status: 500 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  const link = async () => {
    const { url } = (await (await call(`/a/w/${wid}/photo-links/connect`, { method: 'POST', body: JSON.stringify({ provider: 'dropbox' }) })).json()) as { url: string };
    const state = new URL(url).searchParams.get('state')!;
    return call(`/oauth/callback?code=abc&state=${state}`);
  };
  const guestToken = async () =>
    (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = 'Ella Thompson'`).first<{ token: string }>())!.token;

  it('lists the providers; only set-up ones can be linked', async () => {
    const d = (await (await call(`/a/w/${wid}/photo-links`)).json()) as { providers: { key: string; ready: boolean }[]; redirectUri: string; siteStorage: boolean };
    expect(d.providers.find((p) => p.key === 'dropbox')!.ready).toBe(true);
    expect(d.providers.find((p) => p.key === 'gdrive')!.ready).toBe(false);
    expect(d.redirectUri).toBe('https://example.com/api/oauth/callback');
    expect((await call(`/a/w/${wid}/photo-links/connect`, { method: 'POST', body: JSON.stringify({ provider: 'gdrive' }) })).status).toBe(503);
  });

  it('links an account: the token is sealed, the state works once, and only for the person who started it', async () => {
    const res = await link();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`https://example.com/admin/${wid}/photos?linked=dropbox`);
    const row = (await t.db.prepare(`SELECT account, refresh_enc FROM photo_link`).first<{ account: string; refresh_enc: string }>())!;
    expect(row.account).toBe('couple@example.com');
    expect(row.refresh_enc).not.toContain('refresh-secret-1');
    expect(await unseal(env.SESSION_SECRET!, 'photo-link', row.refresh_enc)).toBe('refresh-secret-1');

    // Someone else finishing a link someone started: refused.
    const { url } = (await (await call(`/a/w/${wid}/photo-links/connect`, { method: 'POST', body: JSON.stringify({ provider: 'dropbox' }) })).json()) as { url: string };
    const state = new URL(url).searchParams.get('state')!;
    expect((await call(`/oauth/callback?code=abc&state=${state}`, {}, '')).headers.get('location')).toContain('link_error=signed_out');
    // A used or made-up state: refused.
    expect((await call(`/oauth/callback?code=abc&state=${state}`)).headers.get('location')).toContain('link_error=expired');
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM photo_link`).first<{ n: number }>())!.n).toBe(1);
  });

  it('with no site storage, a guest photo is saved in Dropbox (filed in Photos, in its event folder) and the couple can open it', async () => {
    const g = await guestToken();
    // Nothing linked: closed.
    expect((await call(`/p/sophie-and-nicholas/photos?g=${g}&event=wedding`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: JPEG })).status).toBe(503);
    await link();
    const up = await call(`/p/sophie-and-nicholas/photos?g=${g}&event=wedding`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'X-Photo-By': 'Ella' }, body: JPEG });
    expect(up.status).toBe(200);
    const arg = JSON.parse(sent.find((s) => s.url.includes('/files/upload'))!.arg!) as { path: string };
    expect(arg.path).toMatch(/^\/[^/]+ wedding\/Photos\/[^/]+\/\d{4}-\d\d-\d\d \d\d-\d\d Ella\.jpg$/);
    const list = (await (await call(`/a/w/${wid}/photos`)).json()) as { enabled: boolean; items: { url: string }[] };
    expect(list.enabled).toBe(true);
    const img = await call(list.items[0]!.url.replace('/api', ''));
    expect(img.status).toBe(200);
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(JPEG);
    const links = (await (await call(`/a/w/${wid}/photo-links`)).json()) as { links: { copied: number }[] };
    expect(links.links[0]!.copied).toBe(1);
  });

  it('when Dropbox is down and there is no other home, the guest is told to try again; nothing half-saved', async () => {
    await link();
    dropboxDown = true;
    const res = await call(`/p/sophie-and-nicholas/photos?g=${await guestToken()}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: JPEG });
    expect(res.status).toBe(502);
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM media WHERE deleted_at IS NULL`).first<{ n: number }>())!.n).toBe(0);
  });

  it('with site storage on, failed copies are retried by the cron', async () => {
    const bucket = new Map<string, Uint8Array>();
    env.MEDIA = {
      put: async (k: string, v: Uint8Array) => void bucket.set(k, v),
      get: async (k: string) => (bucket.has(k) ? { body: new Blob([bucket.get(k)!]).stream() } : null),
      delete: async (k: string) => void bucket.delete(k),
    } as unknown as R2Bucket;
    await link();
    dropboxDown = true;
    let later: Promise<unknown> = Promise.resolve();
    const ctxLater = { waitUntil: (p: Promise<unknown>) => void (later = p), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
    const res = await app.request(`/api/p/sophie-and-nicholas/photos?g=${await guestToken()}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: JPEG }, env, ctxLater);
    expect(res.status).toBe(200); // the site kept it; the copy can wait
    await later;
    expect((await t.db.prepare(`SELECT status FROM photo_copy`).first<{ status: string }>())!.status).toBe('failed');
    dropboxDown = false;
    await t.db.prepare(`UPDATE photo_copy SET updated_at = '2000-01-01T00:00:00.000Z'`).run();
    expect(await runCopies(env)).toEqual({ tried: 1, done: 1 });
    expect((await t.db.prepare(`SELECT status FROM photo_copy`).first<{ status: string }>())!.status).toBe('done');
  });

  it('planning files go to the linked Dropbox when chosen (and still open from the planner)', async () => {
    await link();
    const { links } = (await (await call(`/a/w/${wid}/photo-links`)).json()) as { links: { id: string; docs: boolean }[] };
    expect(links[0]!.docs).toBe(false);
    expect((await call(`/a/w/${wid}/photo-links/${links[0]!.id}/docs`, { method: 'PUT', body: JSON.stringify({ on: true }) })).status).toBe(200);
    const up = await call(`/a/w/${wid}/planner/files`, { method: 'POST', body: JSON.stringify({ name: 'Florist quote.pdf', type: 'application/pdf', data: btoa('%PDF-1.4 quote') }) });
    expect(up.status).toBe(200);
    const { id } = (await up.json()) as { id: string };
    const row = await t.db.prepare(`SELECT remote, length(data) AS n FROM planner_file WHERE id = ?`).bind(id).first<{ remote: string | null; n: number }>();
    expect(row!.remote).toMatch(/^link:/);
    expect(row!.n).toBe(0); // nothing kept on the site
    const arg = JSON.parse(sent.filter((s) => s.url.includes('/files/upload')).pop()!.arg!) as { path: string };
    expect(arg.path).toMatch(/ wedding\/Planning files\/Florist quote\.pdf$/);
    expect((await call(`/a/w/${wid}/planner/files/${id}`)).status).toBe(200);
  });

  it('a new link is filed straight away (Photos per event, Planning files, Signs and print, Backups), and a backup goes to Backups', async () => {
    await link();
    const { links } = (await (await call(`/a/w/${wid}/photo-links`)).json()) as { links: { id: string; filed: boolean }[] };
    const made = (await (await call(`/a/w/${wid}/photo-links/${links[0]!.id}/folders`, { method: 'POST', body: '{}' })).json()) as { folders: string[] };
    expect(made.folders).toEqual(expect.arrayContaining(['Photos', 'Planning files', 'Signs and print', 'Backups']));
    expect(made.folders[0]).toMatch(/ wedding$/);
    const folders = sent.filter((x) => x.url.includes('create_folder_v2')).length;
    expect(folders).toBeGreaterThanOrEqual(5);
    expect(((await (await call(`/a/w/${wid}/photo-links`)).json()) as { links: { filed: boolean }[] }).links[0]!.filed).toBe(true);
    const st = (await (await call(`/a/w/${wid}/settings/backups`)).json()) as { linked: string | null };
    expect(st.linked).toBe('Dropbox');
    const now = await call(`/a/w/${wid}/settings/backups/now`, { method: 'POST', body: '{}' });
    expect(now.status).toBe(200);
    const arg = JSON.parse(sent.filter((x) => x.url.includes('/files/upload')).pop()!.arg!) as { path: string };
    expect(arg.path).toMatch(/ wedding\/Backups\/\d{4}-\d\d-\d\d sophie-and-nicholas backup\.json$/);
    expect(((await (await call(`/a/w/${wid}/settings/backups`)).json()) as { last: string | null }).last).not.toBeNull();
    // The cron doesn't back up again the same day.
    const { runBackups } = await import('../src/lib/backup');
    expect(await runBackups(env)).toEqual({ due: 0, done: 0 });
  });

  it('the system check signs in to the linked storage for real, files the wedding folder, and says what else is set up', async () => {
    type Check = { items: { key: string; state: string; detail: string }[] };
    const before = (await (await call(`/a/w/${wid}/settings/check`)).json()) as Check;
    expect(before.items.find((i) => i.key === 'storage')).toMatchObject({ state: 'off' });
    expect(before.items.find((i) => i.key === 'texts')?.state).toBe('off'); // no texting keys in tests
    await link();
    const after = (await (await call(`/a/w/${wid}/settings/check`)).json()) as Check;
    const storage = after.items.find((i) => i.key.startsWith('storage:'))!;
    expect(storage.state).toBe('ok');
    expect(storage.detail).toMatch(/ wedding”: Photos, .*Planning files, Signs and print, Backups\./);
    expect(sent.filter((x) => x.url.includes('create_folder_v2')).length).toBeGreaterThanOrEqual(5);
    expect(after.items.find((i) => i.key === 'backups')?.state).toBe('warn'); // linked, no backup yet
    // Storage that can't be reached is flagged, with what to do.
    dropboxDown = true;
    await t.db.prepare(`UPDATE photo_link SET folders = '{}'`).run();
    const down = (await (await call(`/a/w/${wid}/settings/check`)).json()) as Check;
    expect(down.items.find((i) => i.key.startsWith('storage:'))).toMatchObject({ state: 'warn' });
  });

  it('a token sealed under another secret is useless', async () => {
    const sealed = await seal('one-secret-000000000000000000', 'photo-link', 'x');
    expect(await unseal('another-secret-0000000000000000', 'photo-link', sealed)).toBeNull();
  });
});
