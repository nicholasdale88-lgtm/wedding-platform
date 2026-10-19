import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { receiveEmail } from '../src/routes/inbox';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** The event's email address: emails are kept, sorted (guest, vendor, other), and a vendor's quote is filed. */
describe('inbox', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  const mail = (raw: string, to = 'hello@ourwedding.example') => {
    const bytes = new TextEncoder().encode(raw.replace(/\n/g, '\r\n'));
    return receiveEmail({ from: 'x@example.com', to, raw: new Blob([bytes]).stream(), headers: new Headers() }, env);
  };

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
  });
  afterEach(() => t.dispose());

  it('keeps emails to the event address only, sorts them, and files a vendor quote under that vendor', async () => {
    // Nothing is set up yet: dropped.
    expect((await mail('From: a@b.com\nSubject: Hi\n\nHello')).stored).toBe(false);
    expect((await call('/inbox/settings/address', { method: 'PUT', body: JSON.stringify({ address: 'Hello@OurWedding.example' }) })).status).toBe(200);
    await call('/planner/doc/vendors', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ list: [{ id: 'v1', name: 'Valley Blooms', category: 'Florist', email: 'sales@valleyblooms.com.au' }] }) });

    const pdf = btoa('%PDF-1.4 a small quote');
    const quote = await mail(
      `From: Jess <jess@valleyblooms.com.au>
Subject: Your florals quote
Message-ID: <q1@valleyblooms>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="b"

--b
Content-Type: text/plain

Hi! Our quote is attached.
--b
Content-Type: application/pdf; name="quote.pdf"
Content-Disposition: attachment; filename="quote.pdf"
Content-Transfer-Encoding: base64

${pdf}
--b--
`,
    );
    expect(quote.stored).toBe(true);
    await mail('From: Ella Thompson <ella@gmail.com>\nSubject: Parking?\n\nIs there parking?');
    await mail('From: Someone <who@example.org>\nSubject: Hello\n\nRandom');
    // The same email again (same Message-ID) is kept once.
    expect((await mail('From: Jess <jess@valleyblooms.com.au>\nSubject: Your florals quote\nMessage-ID: <q1@valleyblooms>\n\nAgain')).stored).toBe(false);

    type List = { address: string; emails: { subject: string; kind: string; vendor: string | null; guest: string | null; filed: string; files: { name: string }[] }[] };
    const list = (await (await call('/inbox')).json()) as List;
    expect(list.address).toBe('hello@ourwedding.example');
    const by = (s: string) => list.emails.find((e) => e.subject === s)!;
    expect(by('Your florals quote')).toMatchObject({ kind: 'vendor', vendor: 'Valley Blooms', filed: 'Valley Blooms' });
    expect(by('Your florals quote').files.map((f) => f.name)).toEqual(['quote.pdf']);
    expect(by('Parking?')).toMatchObject({ kind: 'guest', guest: 'Ella Thompson' });
    expect(by('Hello').kind).toBe('other');
    const vendors = (await (await call('/planner/doc/vendors')).json()) as { data: { list: { status: string; quotes: { fileName: string; notes: string }[] }[] } };
    expect(vendors.data.list[0]!.quotes[0]).toMatchObject({ fileName: 'quote.pdf', notes: 'From email: Your florals quote' });
    expect(vendors.data.list[0]!.status).toBe('quoted');
  });

  it('insights: replies per event (adding up), groups, and what guests are doing', async () => {
    const r = await call('/insights');
    expect(r.status).toBe(200);
    const d = (await r.json()) as { events: { key: string; invited: number; yes: number; no: number; awaiting: number }[]; groups: { invited: number }[]; guests: { photos: number } };
    expect(d.events.map((e) => e.key)).toEqual(['wedding', '30th']);
    for (const e of d.events) expect(e.yes + e.no + e.awaiting).toBe(e.invited);
    expect(d.events[0]!.invited).toBeGreaterThan(0);
    expect(d.guests.photos).toBe(0);
  });

  it('the plan as a private calendar: off until switched on, then every due date; a new link retires the old', async () => {
    expect(((await (await call('/planner-calendar')).json()) as { url: string }).url).toBe('');
    await call('/planner/doc/checklist', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ tasks: [{ id: 't1', text: 'Book the florist', before: 200 }] }) });
    await call('/planner/doc/budget', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ total: 30000, lines: [{ category: 'Cake', item: 'Cake', quote: 900, paid: 200, due: '2027-10-01' }] }) });
    const { url } = (await (await call('/planner-calendar', { method: 'PUT', body: JSON.stringify({ on: true }) })).json()) as { url: string };
    expect(url).toMatch(/\/api\/cal\/[^/]+\/[A-Za-z0-9_-]{20,}\.ics$/);
    const feed = await app.request(url.replace('https://example.com', ''), {}, env, ctx);
    expect(feed.status).toBe(200);
    const ics = await feed.text();
    expect(ics).toContain('SUMMARY:Book the florist');
    expect(ics).toContain('SUMMARY:Pay Cake (balance) ($700)');
    expect(ics).toContain('TRIGGER:-P2DT15H');
    expect(ics).toContain('DTSTART;VALUE=DATE:20271001');
    const again = (await (await call('/planner-calendar', { method: 'PUT', body: JSON.stringify({ on: true }) })).json()) as { url: string };
    expect((await app.request(url.replace('https://example.com', ''), {}, env, ctx)).status).toBe(404);
    expect((await app.request(again.url.replace('https://example.com', ''), {}, env, ctx)).status).toBe(200);
  });

  it('the coordinator link: off until made, then the day for them (suppliers, party, log); a wrong key sees nothing', async () => {
    expect(((await (await call('/coordinator')).json()) as { on: boolean }).on).toBe(false);
    const made = (await (await call('/coordinator', { method: 'PUT', body: JSON.stringify({ on: true, name: 'Jo' }) })).json()) as { url: string };
    const k = new URL(made.url).searchParams.get('k')!;
    const page = (key: string) => app.request(`/api/p/sophie-and-nicholas/coordinator?k=${key}`, {}, env, ctx);
    const d = (await (await page(k)).json()) as { name: string; couple: string; log: unknown[] };
    expect(d.name).toBe('Jo');
    expect(d.log).toEqual([]);
    expect((await page('x'.repeat(24))).status).toBe(404);
    const add = await app.request('/api/p/sophie-and-nicholas/coordinator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, action: 'add', text: 'Florist late' }) }, env, ctx);
    const { log } = (await add.json()) as { log: { id: string; text: string; done: boolean }[] };
    expect(log[0]).toMatchObject({ text: 'Florist late', done: false });
    const done = (await (await app.request('/api/p/sophie-and-nicholas/coordinator', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, action: 'done', id: log[0]!.id }) }, env, ctx)).json()) as { log: { done: boolean }[] };
    expect(done.log[0]!.done).toBe(true);
    await call('/coordinator', { method: 'PUT', body: JSON.stringify({ on: false }) });
    expect((await page(k)).status).toBe(404);
  });

  it('the quiz: closed until switched on; guests see no answers, play once, and get their score and the leaderboard', async () => {
    const tok = (await t.db.prepare(`SELECT i.token FROM invitation i JOIN person p ON p.invitation_id = i.id AND p.idx = 0 WHERE p.name = 'Ella Thompson'`).first<{ token: string }>())!.token;
    const quiz = (path = '') => app.request(`/api/p/sophie-and-nicholas/quiz${path}`, {}, env, ctx);
    expect((await quiz(`?g=${tok}`)).status).toBe(404);
    await call('/planner/doc/quiz', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ on: true, questions: [{ id: 'a', q: 'Who cooks?', options: ['Partner 1', 'Partner 2'], answer: 1 }, { id: 'b', q: 'Where?', options: ['X', 'Y'], answer: 0 }] }) });
    const q = (await (await quiz(`?g=${tok}`)).json()) as { questions: { options: string[] }[]; played: unknown };
    expect(q.played).toBeNull();
    expect(JSON.stringify(q)).not.toContain('"answer"');
    expect(q.questions[0]!.options[0]).not.toBe('Partner 1'); // their names filled in
    const play = (answers: number[]) => app.request('/api/p/sophie-and-nicholas/quiz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok, answers }) }, env, ctx);
    const first = (await (await play([1, 1])).json()) as { played: { score: number }; leaders: { name: string; score: number }[] };
    expect(first.played.score).toBe(1);
    expect(first.leaders[0]).toEqual({ name: 'Ella', score: 1 });
    const again = (await (await play([1, 0])).json()) as { played: { score: number } };
    expect(again.played.score).toBe(1); // one go each
    const admin = (await (await call('/quiz')).json()) as { players: { name: string }[] };
    expect(admin.players.map((p) => p.name)).toEqual(['Ella']);
  });
});
