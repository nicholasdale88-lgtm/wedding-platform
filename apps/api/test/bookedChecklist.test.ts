import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/**
 * The live bug: the celebrant was booked ("Married by the Beard", filed under a category that also names music)
 * and the planner still said the celebrant was to book. A booking now clears its "Book the…" item on the
 * checklist, however the couple recorded it, and old checklists catch up when they're next opened.
 */
describe('a booking ticks its "Book the…" checklist item', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let owner = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  let ip = 0;
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `7.7.7.${++ip}`, cookie: owner, ...init.headers } }, env, ctx);
  const doc = async (kind: string) => (await (await call(`/a/w/${wid}/planner/doc/${kind}`)).json()) as { version: number; data: Record<string, unknown> };
  const put = (kind: string, version: number, data: unknown) => call(`/a/w/${wid}/planner/doc/${kind}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'If-Match': String(version) } });
  const tasks = [
    { id: 'c1', text: 'Book the celebrant', before: 400 },
    { id: 'c2', text: 'Book the photographer and videographer', before: 365 },
    { id: 'c3', text: 'Book hair and makeup (with a trial)', before: 240 },
  ];

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '7.7.7.1' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    owner = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
  });
  afterEach(() => t.dispose());

  it('booking the celebrant under "Celebrant & MC" ticks "Book the celebrant" (and nothing it does not cover)', async () => {
    const cl = await doc('checklist');
    expect((await put('checklist', cl.version, { ...cl.data, tasks })).status).toBe(200);
    const v = await doc('vendors');
    const booked = await put('vendors', v.version, { ...v.data, list: [{ id: 'mbtb', name: 'Married by the Beard', category: 'Celebrant & MC', status: 'booked' }] });
    expect(booked.status, await booked.text()).toBe(200);
    const after = (await doc('checklist')).data.tasks as { id: string; done: boolean; status: string }[];
    expect(after.find((x) => x.id === 'c1')).toMatchObject({ done: true, status: 'done' });
    expect(after.find((x) => x.id === 'c2')!.done).toBe(false);
    expect(after.find((x) => x.id === 'c3')!.done).toBe(false);
  });

  it('a checklist saved before the fix catches up when it is next opened; the celebrant on the Ceremony page counts', async () => {
    const cl = await doc('checklist');
    await put('checklist', cl.version, { ...cl.data, tasks });
    // Written straight to the database, as old data is (no save to trigger the tick).
    await t.db.prepare(`UPDATE planner_doc SET data = json_set(data, '$.celebrant', json('{"name":"Married by the Beard","phone":"","email":"","note":""}')) WHERE wedding_id = ? AND kind = 'ceremony'`).bind(wid).run();
    const has = await t.db.prepare(`SELECT 1 FROM planner_doc WHERE wedding_id = ? AND kind = 'ceremony'`).bind(wid).first();
    if (!has) await t.db.prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?, 'ceremony', '', ?, 1, ?)`).bind(wid, JSON.stringify({ celebrant: { name: 'Married by the Beard' } }), new Date().toISOString()).run();
    const after = (await doc('checklist')).data.tasks as { id: string; done: boolean }[];
    expect(after.find((x) => x.id === 'c1')!.done).toBe(true);
    // Booking the hair and makeup artist ticks its item too (the "(with a trial)" is only advice).
    const v = await doc('vendors');
    await put('vendors', v.version, { ...v.data, list: [{ id: 'g', name: 'Glow', category: 'MUA', status: 'booked' }] });
    expect(((await doc('checklist')).data.tasks as { id: string; done: boolean }[]).find((x) => x.id === 'c3')!.done).toBe(true);
  });
});
