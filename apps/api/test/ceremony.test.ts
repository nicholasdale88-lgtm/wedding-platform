import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { plannerNeedsYou } from '../src/routes/planner';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Wedding planner → Ceremony: the couple and their celebrant, the questionnaires, private vows, the paperwork reminders. */
describe('planner: ceremony', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let wid = '';
  const cookies: Record<string, string> = {};
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const as = (who: string, path: string, init: RequestInit = {}) =>
    app.request(`/api/a/w/${wid}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie: cookies[who] ?? '', ...init.headers } }, env, ctx);
  const login = async (email: string, passcode: string) => {
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, passcode }) }, env, ctx);
    return (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  };
  type Doc = { version: number; data: { questionnaires: { id: string; answers: { p1: Record<string, string>; p2: Record<string, string> }; ready: { p1: boolean; p2: boolean } }[]; vows: { p1: { text: string; private: boolean }; p2: { text: string } }; celebrant: { name: string } } };
  const read = async (who: string) => (await (await as(who, '/planner/doc/ceremony')).json()) as Doc;
  const save = (who: string, data: unknown, version: number) => as(who, '/planner/doc/ceremony', { method: 'PUT', headers: { 'If-Match': String(version) }, body: JSON.stringify(data) });

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookies.owner = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    const now = new Date().toISOString();
    await t.db.batch([
      t.db.prepare(`INSERT INTO user (id, email, first_name, last_name, pass_hash, created_at) VALUES ('ucel', 'celebrant@example.com', 'Robin', 'Marsh', ?, ?)`).bind(await hashPasscode('celebrant-pass-1'), now),
      t.db.prepare(`INSERT INTO user (id, email, pass_hash, created_at) VALUES ('uview', 'viewer@example.com', ?, ?)`).bind(await hashPasscode('viewer-pass-1'), now),
      t.db.prepare(`INSERT INTO user (id, email, pass_hash, created_at) VALUES ('uout', 'outsider@example.com', ?, ?)`).bind(await hashPasscode('outsider-pass-1'), now),
      t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role, relation) VALUES (?, 'ucel', 'viewer', 'celebrant')`).bind(wid),
      t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role, relation) VALUES (?, 'uview', 'viewer', 'family')`).bind(wid),
    ]);
    cookies.celebrant = await login('celebrant@example.com', 'celebrant-pass-1');
    cookies.viewer = await login('viewer@example.com', 'viewer-pass-1');
    cookies.outsider = await login('outsider@example.com', 'outsider-pass-1');
  });
  afterEach(() => t.dispose());

  it('members only: the celebrant can read and change it (even as a viewer); other viewers only read', async () => {
    expect((await as('outsider', '/planner/doc/ceremony')).status).toBe(404);
    expect((await as('viewer', '/planner/doc/ceremony')).status).toBe(200);
    expect((await save('viewer', { notes: 'Mine now' }, 0)).status).toBe(403);
    const r = await save('celebrant', { celebrant: { name: 'Robin Marsh' }, notes: 'Rehearsal Friday 5pm' }, 0);
    expect(r.status).toBe(200);
    expect(((await read('owner')).data as unknown as { notes: string }).notes).toBe('Rehearsal Friday 5pm');
    // The celebrant's pass is for the ceremony only: not the budget, nor an event's copy.
    expect((await as('celebrant', '/planner/doc/budget', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ total: 1 }) })).status).toBe(403);
    expect((await as('celebrant', '/planner/doc/ceremony/wedding', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({}) })).status).toBe(403);
    // They can file their questionnaire (a Word document) with the planning files; other viewers can't.
    const docx = { name: 'Questionnaire.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data: btoa('PK\u0003\u0004 rest of the document') };
    const filed = await as('celebrant', '/planner/files', { method: 'POST', body: JSON.stringify(docx) });
    expect(filed.status).toBe(200);
    expect((await as('viewer', '/planner/files', { method: 'POST', body: JSON.stringify(docx) })).status).toBe(403);
    expect((await as('celebrant', '/planner/files', { method: 'POST', body: JSON.stringify({ ...docx, data: btoa('not a word file') }) })).status).toBe(400);
    // The page knows who the celebrant is, to fill in their details.
    const people = (await (await as('owner', '/planner/ceremony/people')).json()) as { role: string; relation: string; celebrants: { name: string; email: string }[] };
    expect(people).toMatchObject({ role: 'owner', celebrants: [{ name: 'Robin Marsh', email: 'celebrant@example.com' }] });
    expect(((await (await as('celebrant', '/planner/ceremony/people')).json()) as { relation: string }).relation).toBe('celebrant');
  });

  it('each partner’s answers are kept on their own, whoever saves', async () => {
    const q = { id: 'q1', title: 'Getting to know you', questions: [{ id: 'a', kind: 'long', text: 'How did you meet?' }, { id: 'b', kind: 'choice', text: 'Feel?', options: ['Relaxed', 'Formal'] }] };
    const first = await save('celebrant', { questionnaires: [q] }, 0);
    expect(first.status).toBe(200);
    let doc = await read('owner');
    doc.data.questionnaires[0]!.answers.p1 = { a: 'At the beach', b: 'Relaxed' };
    doc.data.questionnaires[0]!.ready.p1 = true;
    expect((await save('owner', doc.data, doc.version)).status).toBe(200);
    doc = await read('owner');
    doc.data.questionnaires[0]!.answers.p2 = { a: 'At a wedding' };
    expect((await save('owner', doc.data, doc.version)).status).toBe(200);
    const seen = (await read('celebrant')).data.questionnaires[0]!;
    expect(seen.answers).toEqual({ p1: { a: 'At the beach', b: 'Relaxed' }, p2: { a: 'At a wedding' } });
    expect(seen.ready).toEqual({ p1: true, p2: false });
    // An old version is refused (no one overwrites anyone).
    expect((await save('celebrant', { questionnaires: [q] }, 1)).status).toBe(409);
  });

  it('private vows are seen only by whoever wrote them, and survive others’ saves', async () => {
    expect((await save('owner', { vows: { p1: { text: 'I promise to…', private: true }, p2: { text: 'Shared words' } } }, 0)).status).toBe(200);
    expect((await read('owner')).data.vows.p1.text).toBe('I promise to…');
    const cel = await read('celebrant');
    expect(cel.data.vows.p1).toMatchObject({ text: '', private: true });
    expect(cel.data.vows.p2.text).toBe('Shared words');
    // The celebrant saves what they see (and tries to change the private vows): the owner's stay.
    const r = await save('celebrant', { ...cel.data, vows: { p1: { text: 'Overwritten', private: false }, p2: { text: 'Edited' } } }, cel.version);
    expect(r.status).toBe(200);
    expect(JSON.stringify(await r.json())).not.toContain('I promise');
    const owner = await read('owner');
    expect(owner.data.vows.p1).toMatchObject({ text: 'I promise to…', private: true });
    expect(owner.data.vows.p2.text).toBe('Edited');
  });

  it('the celebrant sees the ceremony first on their overview; the Notice of Intended Marriage reminds the couple', async () => {
    const ov = (await (await as('celebrant', '/overview')).json()) as { needsYou: { kind: string; link: string }[] };
    expect(ov.needsYou[0]).toMatchObject({ kind: 'ceremony-celebrant', link: 'planner?view=ceremony' });
    const own = (await (await as('owner', '/overview')).json()) as { needsYou: { kind: string }[] };
    expect(own.needsYou.some((n) => n.kind === 'ceremony-celebrant')).toBe(false);

    const ev = (await t.db.prepare(`SELECT key, starts_at FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`).bind(wid).first<{ key: string; starts_at: string }>())!;
    const day = Date.parse(ev.starts_at);
    const at = (daysBefore: number) => new Date(day - daysBefore * 86_400_000);
    const kinds = async (now: Date) => (await plannerNeedsYou(t.db, wid, ev, now, 'Australia/Sydney')).map((n) => n.kind);
    expect(await kinds(at(45))).toContain('noim-due');
    expect(await kinds(at(200))).not.toContain('noim-due');
    expect(await kinds(at(10))).toContain('noim-late');
    const doc = await read('owner');
    await save('owner', { ...doc.data, paperwork: { noimLodged: '2027-01-10' } }, doc.version);
    expect(await kinds(at(10))).not.toContain('noim-late');
  });
});
