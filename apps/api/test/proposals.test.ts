import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { testD1 } from './support/d1';

/**
 * Fee proposals: a vendor prices a wedding and sends it to one of their couples (it lands in the couple's
 * planner as a quote, with a note in their conversation) or to an enquiry (which moves to Quoted). The couple
 * reads it by its link and accepts or declines once; accepting books the vendor in their planner. Nobody
 * else's couples or enquiries are reachable.
 */
describe('fee proposals', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  let ip = 0;
  const call = (path: string, init: RequestInit = {}, cookie = '') =>
    app.request(`/api${path}`, { ...init, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': `8.8.8.${++ip}`, ...(cookie ? { cookie } : {}), ...init.headers } }, env, ctx);
  const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]!;
  const json = async <T>(r: Response | Promise<Response>) => (await (await r).json()) as T;

  beforeEach(async () => {
    t = await testD1();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000' };
  });
  afterEach(() => t.dispose());

  const joinVendor = async (name: string, email: string) => {
    const r = await call('/directory/join', {
      method: 'POST',
      body: JSON.stringify({ name, category: 'florist', region: 'sydney', regions: [], contactName: 'Jess Lee', phone: '0400 000 000', website: '', instagram: '', about: '', priceFrom: 0, photos: [], email, passcode: 'long-enough-1', company: '' }),
    });
    expect(r.status).toBe(200);
    // New listings wait for approval (YL-13): approved here, as the company portal does.
    await t.db.prepare(`UPDATE vendor_listing SET approved_at = created_at WHERE email = ?`).bind(email).run();
    return { cookie: cookieOf(r), slug: ((await r.json()) as { slug: string }).slug };
  };
  const signup = async (firstName: string, email: string, ref = '') => {
    const r = await call('/a/signup', { method: 'POST', body: JSON.stringify({ firstName, partnerName: 'Sam', email, passcode: 'long-enough-1', date: '2027-03-14', plan: 'free', marketing: false, website: '', ref }) });
    expect(r.status).toBe(200);
    return { cookie: cookieOf(r), wid: ((await r.json()) as { weddingId: string }).weddingId };
  };
  const proposal = (to: { couple: string } | { enquiry: string }) => ({
    to,
    title: 'Ceremony and reception flowers',
    lines: [
      { what: 'Bridal bouquet', amount: 450 },
      { what: 'Table centrepieces (10)', amount: 1200 },
    ],
    deposit: 500,
    validUntil: '2027-01-31',
    note: 'Seasonal flowers, delivered and set up.',
  });
  type Doc = { list: { id: string; name: string; status: string; dirId: string; accepted: string; quotes: { id: string; amount: number; deposit: number; validUntil: string; includes: string }[] }[] };
  const vendorsDoc = async (wid: string) => {
    const row = await t.db.prepare(`SELECT data FROM planner_doc WHERE wedding_id = ? AND kind = 'vendors' AND scope = ''`).bind(wid).first<{ data: string }>();
    return JSON.parse(row?.data ?? '{"list":[]}') as Doc;
  };

  it('to a linked couple: a quote in their planner and a message; they accept once, and the vendor is booked', async () => {
    const vendor = await joinVendor('Wildflower Studio', 'jess@wildflower.example');
    const couple = await signup('Ava', 'ava@example.com', vendor.slug);
    const listingId = (await t.db.prepare(`SELECT id FROM vendor_listing WHERE slug = ?`).bind(vendor.slug).first<{ id: string }>())!.id;

    const r = await call('/a/vendor/proposals', { method: 'POST', body: JSON.stringify(proposal({ couple: couple.wid })) }, vendor.cookie);
    expect(r.status).toBe(200);
    const sent = (await r.json()) as { id: string; link: string };
    expect(sent.link).toMatch(/^https:\/\/example\.com\/proposal\/[A-Za-z0-9_-]{24}$/);
    const token = sent.link.split('/').pop()!;

    // In the couple's planner: this vendor (added, from the directory) with the proposal as a quote.
    const doc = await vendorsDoc(couple.wid);
    const v = doc.list.find((x) => x.dirId === `v:${listingId}`)!;
    expect(v).toMatchObject({ name: 'Wildflower Studio', status: 'quoted' });
    expect(v.quotes).toHaveLength(1);
    expect(v.quotes[0]).toMatchObject({ id: sent.id, amount: 1650, deposit: 500, validUntil: '2027-01-31' });
    expect(v.quotes[0]!.includes).toContain('Bridal bouquet');

    // And in their conversation.
    const chat = await json<{ messages: { fromVendor: boolean; body: string }[] }>(call(`/a/w/${couple.wid}/vendor-chat/${listingId}`, {}, couple.cookie));
    expect(chat.messages[0]).toMatchObject({ fromVendor: true });
    expect(chat.messages[0]!.body).toContain('New fee proposal: Ceremony and reception flowers, $1,650');

    // The vendor's list.
    const list = await json<{ proposals: { id: string; to: string; total: number; status: string; kind: string }[]; waiting: number }>(call('/a/vendor/proposals', {}, vendor.cookie));
    expect(list.proposals).toEqual([expect.objectContaining({ id: sent.id, to: 'Ava & Sam', total: 1650, status: 'sent', kind: 'couple' })]);
    expect(list.waiting).toBe(1);

    // The public page, by its link (no sign-in).
    const view = await json<{ vendor: { name: string; phone: string }; title: string; total: number; deposit: number; status: string; to: string; lines: unknown[] }>(call(`/directory/proposal/${token}`));
    expect(view).toMatchObject({ vendor: { name: 'Wildflower Studio', phone: '0400 000 000' }, title: 'Ceremony and reception flowers', total: 1650, deposit: 500, status: 'sent', to: 'Ava & Sam' });
    expect(view.lines).toHaveLength(2);

    // Accept, once.
    expect((await call(`/directory/proposal/${token}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'maybe' }) })).status).toBe(400);
    expect(await json(call(`/directory/proposal/${token}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'accept' }) }))).toEqual({ status: 'accepted' });
    expect((await call(`/directory/proposal/${token}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'decline' }) })).status).toBe(409);
    expect((await json<{ status: string }>(call(`/directory/proposal/${token}`))).status).toBe('accepted');

    const after = (await vendorsDoc(couple.wid)).list.find((x) => x.dirId === `v:${listingId}`)!;
    expect(after.status).toBe('booked');
    expect(after.accepted).toBe(sent.id);
    const booked = await json<{ couples: { status: string }[] }>(call('/a/vendor/couples', {}, vendor.cookie));
    expect(booked.couples[0]!.status).toBe('booked');
    expect((await json<{ proposals: { status: string }[] }>(call('/a/vendor/proposals', {}, vendor.cookie))).proposals[0]!.status).toBe('accepted');
  });

  it('a vendor the couple added by hand (by their email) stays booked after the couple saves their vendor list again; found by the stress run', async () => {
    const vendor = await joinVendor('Wildflower Studio', 'jess@wildflower.example');
    const couple = await signup('Ava', 'ava@example.com');
    await t.db.prepare(`UPDATE wedding SET plan = 'essentials' WHERE id = ?`).bind(couple.wid).run();
    const doc = (path: string, body?: unknown, version?: number) =>
      call(`/a/w/${couple.wid}/planner/doc/${path}`, body === undefined ? {} : { method: 'PUT', body: JSON.stringify(body), headers: { 'If-Match': String(version ?? 0) } }, couple.cookie);
    const entry = { id: 'v-hand', name: 'Wildflower Studio', category: 'Florist', status: 'contacted', email: 'Jess@Wildflower.example' };
    expect((await doc('vendors', { list: [entry] }, 0)).status).toBe(200);
    const sent = await json<{ link: string }>(call('/a/vendor/proposals', { method: 'POST', body: JSON.stringify(proposal({ couple: couple.wid })) }, vendor.cookie));
    expect(await json(call(`/directory/proposal/${sent.link.split('/').pop()}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'accept' }) }))).toEqual({ status: 'accepted' });
    const status = async () => (await json<{ couples: { id: string; status: string }[] }>(call('/a/vendor/couples', {}, vendor.cookie))).couples.find((c) => c.id === couple.wid)?.status;
    expect(await status()).toBe('booked');
    // The couple adds a payment to their list (any save of it): the vendor still sees them as booked.
    const cur = await json<{ version: number; data: { list: { id: string; status: string; payments: unknown[] }[] } }>(doc('vendors'));
    expect(cur.data.list.find((v) => v.id === 'v-hand')?.status).toBe('booked');
    const list = cur.data.list.map((v) => (v.id === 'v-hand' ? { ...v, payments: [{ id: 'p1', label: 'Deposit', amount: 500, due: '2027-01-10', paid: true, paidOn: '2027-01-02' }] } : v));
    expect((await doc('vendors', { ...cur.data, list }, cur.version)).status).toBe(200);
    expect(await status()).toBe('booked');
    // Taken off their list: no longer counted as booked.
    const again = await json<{ version: number; data: { list: unknown[] } }>(doc('vendors'));
    expect((await doc('vendors', { ...again.data, list: [] }, again.version)).status).toBe(200);
    expect(await status()).not.toBe('booked');
  });

  it('accept tried again after "busy" (the first was saved, its follow-ups weren’t): answered as before, booked, the vendor told once; found by the stress run', async () => {
    const vendor = await joinVendor('Wildflower Studio', 'jess@wildflower.example');
    const couple = await signup('Ava', 'ava@example.com', vendor.slug);
    const listingId = (await t.db.prepare(`SELECT id FROM vendor_listing WHERE slug = ?`).bind(vendor.slug).first<{ id: string }>())!.id;
    const sent = (await (await call('/a/vendor/proposals', { method: 'POST', body: JSON.stringify(proposal({ couple: couple.wid })) }, vendor.cookie)).json()) as { id: string; link: string };
    const token = sent.link.split('/').pop()!;
    const answer = (a: string) => call(`/directory/proposal/${token}/answer`, { method: 'POST', body: JSON.stringify({ answer: a, revision: 1 }) });
    // The first accept saved, then the database was busy before the planner and the message: as if it stopped there.
    await t.db.prepare(`UPDATE vendor_proposal SET status = 'accepted', answered_at = ? WHERE id = ?`).bind(new Date().toISOString(), sent.id).run();
    expect((await vendorsDoc(couple.wid)).list.find((x) => x.dirId === `v:${listingId}`)!.status).toBe('quoted');
    // The page tries again: the same answer, finished.
    expect(await json(answer('accept'))).toEqual({ status: 'accepted' });
    expect((await vendorsDoc(couple.wid)).list.find((x) => x.dirId === `v:${listingId}`)).toMatchObject({ status: 'booked', accepted: sent.id });
    // Again: still fine, and the vendor's conversation has the acceptance once.
    expect(await json(answer('accept'))).toEqual({ status: 'accepted' });
    const said = await t.db.prepare(`SELECT COUNT(*) AS n FROM vendor_message WHERE listing_id = ? AND wedding_id = ? AND from_vendor = 0 AND body LIKE 'We accepted%'`).bind(listingId, couple.wid).first<{ n: number }>();
    expect(said!.n).toBe(1);
    // A different answer is still final, and so is the same one much later.
    expect((await answer('decline')).status).toBe(409);
    await t.db.prepare(`UPDATE vendor_proposal SET answered_at = ? WHERE id = ?`).bind(new Date(Date.now() - 3_600_000).toISOString(), sent.id).run();
    expect((await answer('accept')).status).toBe(409);
  });

  it('negotiating before an answer: the couple asks for changes, the vendor revises, the same quote is updated, and only the latest revision can be accepted', async () => {
    const vendor = await joinVendor('Wildflower Studio', 'jess@wildflower.example');
    const couple = await signup('Ava', 'ava@example.com', vendor.slug);
    const listingId = (await t.db.prepare(`SELECT id FROM vendor_listing WHERE slug = ?`).bind(vendor.slug).first<{ id: string }>())!.id;
    const sent = await json<{ id: string; link: string }>(call('/a/vendor/proposals', { method: 'POST', body: JSON.stringify(proposal({ couple: couple.wid })) }, vendor.cookie));
    const token = sent.link.split('/').pop()!;
    const answer = (body: Record<string, unknown>) => call(`/directory/proposal/${token}/answer`, { method: 'POST', body: JSON.stringify(body) });

    // The couple asks for changes (a message is needed).
    expect((await answer({ answer: 'changes', revision: 1, message: '  ' })).status).toBe(400);
    expect(await json(answer({ answer: 'changes', revision: 1, message: 'Could we drop to 8 centrepieces?' }))).toEqual({ status: 'changes' });
    type Summary = { id: string; status: string; revision: number; total: number; request: { message: string; revision: number } | null };
    let list = await json<{ proposals: Summary[]; changes: number }>(call('/a/vendor/proposals', {}, vendor.cookie));
    expect(list.changes).toBe(1);
    expect(list.proposals[0]).toMatchObject({ status: 'changes', revision: 1, request: { message: 'Could we drop to 8 centrepieces?', revision: 1 } });
    // In the vendor's conversation too.
    const thread = await json<{ messages: { fromVendor: boolean; body: string }[] }>(call(`/a/vendor/couples/${couple.wid}/messages`, {}, vendor.cookie));
    expect(thread.messages.at(-1)).toMatchObject({ fromVendor: false });
    expect(thread.messages.at(-1)!.body).toContain('Could we drop to 8 centrepieces?');

    // Revision 2: cheaper; the same quote in the planner, updated (not a second one).
    const rev = { title: 'Ceremony and reception flowers', lines: [{ what: 'Bridal bouquet', amount: 450 }, { what: 'Table centrepieces (8)', amount: 960 }], deposit: 400, validUntil: '2027-02-28', note: 'Eight centrepieces.' };
    expect((await call(`/a/vendor/proposals/${sent.id}/revise`, { method: 'POST', body: JSON.stringify({ ...rev, lines: [] }) }, vendor.cookie)).status).toBe(400);
    expect(await json(call(`/a/vendor/proposals/${sent.id}/revise`, { method: 'POST', body: JSON.stringify(rev) }, vendor.cookie))).toMatchObject({ id: sent.id, revision: 2 });
    const v = (await vendorsDoc(couple.wid)).list.find((x) => x.dirId === `v:${listingId}`)!;
    expect(v.quotes).toHaveLength(1);
    expect(v.quotes[0]).toMatchObject({ id: sent.id, amount: 1410, deposit: 400, validUntil: '2027-02-28' });
    const thread2 = await json<{ messages: { body: string }[] }>(call(`/a/vendor/couples/${couple.wid}/messages`, {}, vendor.cookie));
    expect(thread2.messages.at(-1)!.body).toContain('Revised fee proposal: Ceremony and reception flowers, $1,410 (was $1,650)');

    // The page: revision 2, with revision 1 kept, and the couple's request.
    type View = { revision: number; total: number; status: string; versions: { revision: number; total: number }[]; requests: { message: string }[] };
    const view = await json<View>(call(`/directory/proposal/${token}`));
    expect(view).toMatchObject({ revision: 2, total: 1410, status: 'sent', versions: [{ revision: 1, total: 1650 }], requests: [{ message: 'Could we drop to 8 centrepieces?' }] });

    // A stale page (still on revision 1) can't answer.
    expect((await answer({ answer: 'accept', revision: 1 })).status).toBe(409);
    expect((await answer({ answer: 'changes', revision: 1, message: 'And the bouquet?' })).status).toBe(409);
    // Accept revision 2: final, booked at the new price; no more changes or revisions.
    expect(await json(answer({ answer: 'accept', revision: 2 }))).toEqual({ status: 'accepted' });
    const after = (await vendorsDoc(couple.wid)).list.find((x) => x.dirId === `v:${listingId}`)!;
    expect(after).toMatchObject({ status: 'booked', accepted: sent.id });
    expect((await answer({ answer: 'changes', revision: 2, message: 'One more thing' })).status).toBe(409);
    expect((await call(`/a/vendor/proposals/${sent.id}/revise`, { method: 'POST', body: JSON.stringify(rev) }, vendor.cookie)).status).toBe(409);
    list = await json<{ proposals: Summary[]; changes: number }>(call('/a/vendor/proposals', {}, vendor.cookie));
    expect(list.proposals[0]).toMatchObject({ status: 'accepted', revision: 2, total: 1410 });

    // Another vendor can't revise it.
    const other = await joinVendor('Petal Co', 'pat@petal.example');
    expect((await call(`/a/vendor/proposals/${sent.id}/revise`, { method: 'POST', body: JSON.stringify(rev) }, other.cookie)).status).toBe(404);
  });

  it('to an enquiry: the enquiry moves to Quoted; declining is kept', async () => {
    const vendor = await joinVendor('Wildflower Studio', 'jess@wildflower.example');
    const ask = { name: 'Alex & Sam', email: 'alex@example.com', phone: '', date: '2027-05-01', guests: 90, message: 'Flowers for our wedding, please.', company: '' };
    expect((await call(`/directory/v/${vendor.slug}/enquire`, { method: 'POST', body: JSON.stringify(ask) })).status).toBe(200);
    const enquiryId = (await json<{ enquiries: { id: string }[] }>(call('/a/vendor', {}, vendor.cookie))).enquiries[0]!.id;

    const sent = await json<{ id: string; link: string }>(call('/a/vendor/proposals', { method: 'POST', body: JSON.stringify(proposal({ enquiry: enquiryId })) }, vendor.cookie));
    expect((await json<{ enquiries: { stage: string }[] }>(call('/a/vendor', {}, vendor.cookie))).enquiries[0]!.stage).toBe('quoted');
    const list = await json<{ proposals: { to: string; kind: string }[] }>(call('/a/vendor/proposals', {}, vendor.cookie));
    expect(list.proposals[0]).toMatchObject({ to: 'Alex & Sam', kind: 'enquiry' });

    const token = sent.link.split('/').pop()!;
    expect((await json<{ to: string }>(call(`/directory/proposal/${token}`))).to).toBe('Alex & Sam');
    expect(await json(call(`/directory/proposal/${token}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'decline' }) }))).toEqual({ status: 'declined' });
    expect((await call(`/directory/proposal/${token}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'accept' }) })).status).toBe(409);
  });

  it('only to their own couples and enquiries; a bad link is not found; the form is checked', async () => {
    const vendor = await joinVendor('Wildflower Studio', 'jess@wildflower.example');
    const other = await joinVendor('Petal Co', 'pat@petal.example');
    const theirCouple = await signup('Mia', 'mia@example.com', other.slug);
    const notLinked = await signup('Zoe', 'zoe@example.com');
    const ask = { name: 'Lee & Kim', email: 'lee@example.com', phone: '', date: '', guests: 0, message: 'Flowers for our wedding, please.', company: '' };
    await call(`/directory/v/${other.slug}/enquire`, { method: 'POST', body: JSON.stringify(ask) });
    const theirEnquiry = (await json<{ enquiries: { id: string }[] }>(call('/a/vendor', {}, other.cookie))).enquiries[0]!.id;

    for (const to of [{ couple: theirCouple.wid }, { couple: notLinked.wid }, { enquiry: theirEnquiry }, { enquiry: 'nope' }])
      expect((await call('/a/vendor/proposals', { method: 'POST', body: JSON.stringify(proposal(to)) }, vendor.cookie)).status).toBe(404);
    expect((await vendorsDoc(theirCouple.wid)).list).toEqual([]);
    expect((await json<{ proposals: unknown[] }>(call('/a/vendor/proposals', {}, vendor.cookie))).proposals).toEqual([]);

    // The form: at least one line, whole dollars, a proper date.
    const mine = await signup('Ava', 'ava@example.com', vendor.slug);
    for (const bad of [{ lines: [] }, { lines: [{ what: 'Bouquet', amount: 1.5 }] }, { validUntil: '31/01/2027' }, { title: '' }])
      expect((await call('/a/vendor/proposals', { method: 'POST', body: JSON.stringify({ ...proposal({ couple: mine.wid }), ...bad }) }, vendor.cookie)).status).toBe(400);

    // Not signed in: no list. A made-up link: not found.
    expect((await call('/a/vendor/proposals')).status).toBe(401);
    expect((await call('/directory/proposal/not-a-real-token')).status).toBe(404);
    expect((await call('/directory/proposal/not-a-real-token/answer', { method: 'POST', body: JSON.stringify({ answer: 'accept' }) })).status).toBe(404);
  });
});
