import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/**
 * Quote requests end to end: sent to each vendor by email from the site (replies go to the couple),
 * reminders, a vendor attaching their own quote and giving one total, a vendor saying they can't, and the
 * couple told by email each time.
 */
describe('quote requests: send, remind, attach, one total, decline', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  let wid = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const call = (path: string, init: RequestInit = {}) => app.request(`/api/a/w/${wid}/planner${path}`, { ...init, headers: { 'content-type': 'application/json', cookie, ...init.headers } }, env, ctx);
  let n = 0;
  const pub = (path: string, init: RequestInit = {}) =>
    app.request(`/api/p/sophie-and-nicholas/rfq${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `10.9.0.${++n}`, ...init.headers } }, env, ctx);
  const mail: { to: string[]; subject: string; text: string; reply_to?: string[] }[] = [];

  const keys = { a: 'a'.repeat(12) + 'Lens_Light-01', b: 'b'.repeat(12) + 'Snap_Co-0002x', c: 'c'.repeat(12) + 'NoEmail-00003' };
  type Doc = {
    version: number;
    data: {
      list: { id: string; status: string; askedOn: string; declinedWhy: string; quotes: { id: string; amount: number; before?: number; package?: boolean; fileId: string; fileName: string; lines: unknown[] }[] }[];
      rfqs: { vendors: { vendorId: string; sentOn: string; remindedOn: string; answeredOn: string; declinedOn: string; declinedWhy: string; quoteId: string }[] }[];
    };
  };
  const doc = async () => (await (await call('/doc/vendors')).json()) as Doc;

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', RESEND_API_KEY: 're_test', EMAIL_FROM: 'Weddings <hello@example.com>' };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    wid = ((await res.json()) as { weddings: { id: string }[] }).weddings[0]!.id;
    mail.length = 0;
    vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
      mail.push(JSON.parse(String(init?.body)) as (typeof mail)[number]);
      return new Response('{}', { status: 200 });
    });
    const list = [
      { id: 'va', name: 'Lens & Light', category: 'Photographer', email: 'hello@lens.example' },
      { id: 'vb', name: 'Snap Co', category: 'Photographer', email: 'snap@snap.example' },
      { id: 'vc', name: 'Phone Only Photos', category: 'Photographer', phone: '0400 000 000' },
    ];
    const rfq = {
      id: 'r1',
      title: 'Photographer quotes',
      service: 'photographer',
      lines: [{ id: 'l1', label: 'Coverage (hours)' }, { id: 'l2', label: 'Album' }],
      due: '2099-01-15',
      subject: 'Quote request: {couple}',
      message: 'Hi,\n\nWe are {couple}, marrying on {date} at {venue}. Price it here:\n{link}\n\nBy {due} please!',
      vendors: [{ vendorId: 'va', key: keys.a }, { vendorId: 'vb', key: keys.b }, { vendorId: 'vc', key: keys.c }],
    };
    expect((await call('/doc/vendors', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ list, rfqs: [rfq] }) })).status).toBe(200);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('sends from the site to everyone with an email, each with their own link; replies go to the couple; reminders later', async () => {
    const r = await call('/rfq/r1/send', { method: 'POST', body: JSON.stringify({ vendorIds: ['va', 'vb', 'vc'] }) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ sent: ['va', 'vb'], skipped: ['vc'] });
    expect(mail.map((m) => m.to[0])).toEqual(['hello@lens.example', 'snap@snap.example']);
    expect(mail[0]!.subject).toBe('Quote request: Sophie & Nicholas');
    expect(mail[0]!.text).toContain(`https://example.com/w/sophie-and-nicholas/quote?k=${keys.a}`);
    expect(mail[0]!.text).not.toContain(keys.b); // only their own link
    expect(mail[0]!.text).not.toMatch(/\{(couple|date|venue|link|due)\}/);
    expect(mail[0]!.reply_to).toEqual(['owner@example.com']);
    const d = await doc();
    expect(d.data.rfqs[0]!.vendors.find((v) => v.vendorId === 'va')!.sentOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.data.rfqs[0]!.vendors.find((v) => v.vendorId === 'vc')!.sentOn).toBe('');
    expect(d.data.list.find((v) => v.id === 'va')!).toMatchObject({ status: 'requested' });

    // A reminder: says so, and is recorded; someone who has answered isn't reminded.
    await pub('', { method: 'POST', body: JSON.stringify({ k: keys.b, lines: [{ id: 'l1', amount: 2000 }, { id: 'l2', amount: 500 }] }) });
    mail.length = 0;
    const rem = await call('/rfq/r1/send', { method: 'POST', body: JSON.stringify({ vendorIds: ['va', 'vb'], remind: true }) });
    expect(await rem.json()).toEqual({ sent: ['va'], skipped: [] });
    expect(mail).toHaveLength(1);
    expect(mail[0]!.subject).toMatch(/^Reminder: /);
    expect(mail[0]!.text).toMatch(/friendly reminder/);
    expect((await doc()).data.rfqs[0]!.vendors.find((v) => v.vendorId === 'va')!.remindedOn).not.toBe('');

    // Without email set up, the couple are told to use their own email or text.
    const off = await app.request(`/api/a/w/${wid}/planner/rfq/r1/send`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ vendorIds: ['va'] }) }, { ...env, RESEND_API_KEY: undefined }, ctx);
    expect(off.status).toBe(400);
    expect(((await off.json()) as { error: { code: string } }).error.code).toBe('off');
  });

  it('a vendor attaches their own quote and gives one total; the couple are emailed; it compares as covering everything', async () => {
    const pdf = btoa('%PDF-1.4\n% a quote\n');
    const up = await pub('/file', { method: 'POST', body: JSON.stringify({ k: keys.a, name: 'quote.pdf', type: 'application/pdf', data: pdf }) });
    expect(up.status).toBe(200);
    const file = (await up.json()) as { id: string; name: string };
    expect(file.name).toBe('Lens & Light quote - quote.pdf');
    // Not a PDF at all: refused. A bad key: nothing filed.
    expect((await pub('/file', { method: 'POST', body: JSON.stringify({ k: keys.a, name: 'x.pdf', type: 'application/pdf', data: btoa('hello') }) })).status).toBe(400);
    expect((await pub('/file', { method: 'POST', body: JSON.stringify({ k: 'z'.repeat(24), name: 'x.pdf', type: 'application/pdf', data: pdf }) })).status).toBe(404);

    // One total, nothing priced line by line.
    expect((await pub('', { method: 'POST', body: JSON.stringify({ k: keys.a, lines: [], package: true, total: 0 }) })).status).toBe(400);
    const ok = await pub('', { method: 'POST', body: JSON.stringify({ k: keys.a, lines: [{ id: 'l1', amount: 1 }], package: true, total: 4200, deposit: 1000, fileId: file.id }) });
    expect(ok.status).toBe(200);
    const v = (await doc()).data.list.find((x) => x.id === 'va')!;
    expect(v.status).toBe('quoted');
    expect(v.quotes[0]).toMatchObject({ amount: 4200, package: true, lines: [], fileId: file.id, fileName: 'Lens & Light quote - quote.pdf' });
    // The couple can open the file it came with.
    expect((await call(`/files/${file.id}`)).status).toBe(200);
    // The couple heard about it.
    expect(mail.map((m) => m.to[0])).toEqual(['owner@example.com']);
    expect(mail[0]!.subject).toBe('Lens & Light sent their quote: $4,200');
    // Asked for a better deal, they lower it: their first price is kept (what was saved).
    mail.length = 0;
    expect((await pub('', { method: 'POST', body: JSON.stringify({ k: keys.a, lines: [], package: true, total: 3900, deposit: 1000, fileId: file.id }) })).status).toBe(200);
    expect((await doc()).data.list.find((x) => x.id === 'va')!.quotes[0]).toMatchObject({ amount: 3900, before: 4200 });
    expect(mail[0]!.subject).toBe('Lens & Light updated their quote: $3,900');
    // The page shows what they sent.
    const page = (await (await pub(`?k=${keys.a}`)).json()) as { answer: { package: boolean; amount: number; fileName: string } };
    expect(page.answer).toMatchObject({ package: true, amount: 3900, fileName: 'Lens & Light quote - quote.pdf' });
  });

  it('a vendor can say they can’t quote: the couple stop waiting on them, and are told', async () => {
    const r = await pub('/decline', { method: 'POST', body: JSON.stringify({ k: keys.b, why: 'Booked that day' }) });
    expect(r.status).toBe(200);
    const d = await doc();
    expect(d.data.rfqs[0]!.vendors.find((v) => v.vendorId === 'vb')).toMatchObject({ declinedWhy: 'Booked that day' });
    expect(d.data.list.find((v) => v.id === 'vb')).toMatchObject({ status: 'declined', declinedWhy: 'They said: Booked that day' });
    expect(mail[0]!.subject).toBe('Snap Co can’t quote');
    expect(((await (await pub(`?k=${keys.b}`)).json()) as { declined: { why: string } }).declined.why).toBe('Booked that day');
    // Changed their mind: a quote after all.
    expect((await pub('', { method: 'POST', body: JSON.stringify({ k: keys.b, lines: [{ id: 'l1', amount: 1800 }, { id: 'l2', amount: null }] }) })).status).toBe(200);
    const after = await doc();
    expect(after.data.list.find((v) => v.id === 'vb')!.status).toBe('quoted');
    expect(after.data.rfqs[0]!.vendors.find((v) => v.vendorId === 'vb')!.declinedOn).toBe('');
    // Reminders skip those who said they can't.
    await pub('/decline', { method: 'POST', body: JSON.stringify({ k: keys.a, why: '' }) });
    mail.length = 0;
    expect(await (await call('/rfq/r1/send', { method: 'POST', body: JSON.stringify({ vendorIds: ['va'], remind: true }) })).json()).toEqual({ sent: [], skipped: [] });
  });
});
