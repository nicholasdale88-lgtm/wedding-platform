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
});
