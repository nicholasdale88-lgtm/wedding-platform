import {
  FeeProposal,
  FeeProposalRevision,
  ProposalAnswer,
  ProposalLine,
  proposalTotal,
  Quote,
  randomToken,
  Vendor,
  VENDOR_SEARCH,
  type ProposalRequest,
  type ProposalStatus,
  type ProposalSummary,
  type ProposalVersion,
  type ProposalView,
} from '@wp/shared';
import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { buttonEmail, emailReady, sendEmail } from '../lib/email';
import { ownerEmails } from '../lib/quoteRequests';
import { allow } from '../lib/rateLimit';
import { afterCommit, readJson } from '../lib/security';
import { jsonWritesOnly, requireUser, type AdminEnv } from './auth';
import { changeDoc } from './planner';
import { firstNames, post } from './vendorCouples';

/**
 * Fee proposals: a listed vendor prices a wedding line by line (often from one of their packages) and sends it
 * to one of their couples or to an enquiry. Each proposal has its own link (/proposal/<token>) where the
 * couple reads it and accepts, declines or asks for changes. All the negotiating happens before an answer:
 * the vendor answers a request for changes with a revision (Revision 2, 3…), and the couple can only accept
 * or decline the latest. Accepted or declined is final.
 *
 * To a linked couple it also lands in their planner, as one quote under this vendor (added to their vendors if
 * they weren't there; a revision updates that same quote), with a note in their conversation. To an enquiry,
 * it's emailed (when email is on) and the enquiry moves to Quoted. Accepting books the vendor in the planner.
 *
 * The row holds the latest revision; earlier ones are kept in `versions`, the couple's requests in `requests`.
 *
 * Vendor: /api/a/vendor/proposals. Public: /api/directory/proposal/:token.
 */
type C = Context<AdminEnv>;
const err = (c: C, status: 400 | 404 | 409 | 429, code: string, message: string) => c.json({ error: { code, message } }, status);
const base = (env: Env) => env.PUBLIC_BASE_URL.replace(/\/+$/, '');
const linkOf = (env: Env, token: string) => `${base(env)}/proposal/${token}`;
const aud = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
const STATUSES: ProposalStatus[] = ['sent', 'changes', 'accepted', 'declined'];
const statusOf = (s: string): ProposalStatus => (STATUSES.includes(s as ProposalStatus) ? (s as ProposalStatus) : 'sent');
const ipOf = (c: C) => c.req.header('CF-Connecting-IP') ?? 'local';
/** What the vendor does, in words ("Florists"), for a planner entry and the proposal page. */
const categoryLabel = (slug: string) => VENDOR_SEARCH[slug]?.label ?? '';

const parse = (s: string | null | undefined): unknown => {
  try {
    return JSON.parse(s ?? '[]') as unknown;
  } catch {
    return [];
  }
};
/** A proposal's lines from the database, dropping anything that isn't a valid line. */
const linesOf = (s: string): ProposalLine[] => {
  const v = parse(s);
  return Array.isArray(v) ? v.flatMap((x) => { const p = ProposalLine.safeParse(x); return p.success ? [p.data] : []; }) : [];
};
const versionsOf = (s: string): ProposalVersion[] => {
  const v = parse(s);
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && Array.isArray((x as ProposalVersion).lines)) as ProposalVersion[]) : [];
};
const requestsOf = (s: string): ProposalRequest[] => {
  const v = parse(s);
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && typeof (x as ProposalRequest).message === 'string') as ProposalRequest[]) : [];
};

/** The columns every proposal read needs. */
interface ProposalRow {
  id: string;
  listing_id: string;
  wedding_id: string | null;
  enquiry_id: string | null;
  token: string;
  title: string;
  lines: string;
  deposit: number;
  valid_until: string;
  note: string;
  status: string;
  revision: number;
  versions: string;
  requests: string;
  created_at: string;
  revised_at: string | null;
  answered_at: string | null;
}
/** The latest revision, as sent. */
const latestOf = (p: ProposalRow): ProposalVersion => {
  const lines = linesOf(p.lines);
  return { revision: p.revision, title: p.title, lines, total: proposalTotal(lines), deposit: p.deposit, validUntil: p.valid_until, note: p.note, at: p.revised_at ?? p.created_at };
};

/** In a couple's vendors, this listed vendor: by its directory id, or by the listing's email. */
const entryOf = <V extends { dirId?: string; email?: string }>(list: V[], listing: { id: string; email: string }) =>
  list.find((v) => v.dirId === `v:${listing.id}`) ?? list.find((v) => !!v.email?.trim() && v.email.trim().toLowerCase() === listing.email.trim().toLowerCase());

/** The proposal as a quote in the couple's planner: one per proposal (its id), updated by each revision. */
async function toPlanner(db: D1Database, weddingId: string, listing: { id: string; name: string; email: string; category: string }, proposalId: string, v: ProposalVersion, link: string) {
  await changeDoc(db, weddingId, 'vendors', '', (d) => {
    let entry = entryOf(d.list, listing);
    if (!entry) {
      if (d.list.length >= 200) return false;
      entry = Vendor.parse({ id: crypto.randomUUID().slice(0, 12), name: listing.name.slice(0, 120), category: categoryLabel(listing.category), status: 'quoted', dirId: `v:${listing.id}` });
      d.list.push(entry);
    }
    const was = entry.quotes.find((q) => q.id === proposalId);
    if (!was && entry.quotes.length >= 12) return false;
    const q = Quote.parse({
      ...(was ?? {}),
      id: proposalId,
      amount: v.total,
      deposit: v.deposit,
      date: v.at.slice(0, 10),
      validUntil: v.validUntil,
      includes: v.lines.map((x) => `${x.what}: ${aud(x.amount)}`).join('\n').slice(0, 1500),
      notes: [`Fee proposal: ${v.title}${v.revision > 1 ? ` (revision ${v.revision})` : ''}`, v.note, `Read it, accept it or ask for changes: ${link}`].filter(Boolean).join('\n').slice(0, 1500),
      // Their first price, kept when a revision changes it: what negotiating saved.
      ...(was && was.amount !== v.total ? { before: was.before ?? was.amount } : {}),
    });
    entry.quotes = was ? entry.quotes.map((x) => (x.id === proposalId ? q : x)) : [...entry.quotes, q];
    if (entry.status !== 'booked') {
      entry.status = 'quoted';
      entry.declinedWhy = '';
    }
  });
}

interface ListingRow {
  id: string;
  slug: string;
  name: string;
  email: string;
  category: string;
}

/** The vendor's side, signed in with their listing's account. */
export function vendorProposalRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser);
  const listingOf = (c: C) => c.env.DB.prepare(`SELECT id, slug, name, email, category FROM vendor_listing WHERE user_id = ?`).bind(c.get('user').id).first<ListingRow>();

  app.get('/', async (c) => {
    const l = await listingOf(c);
    if (!l) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    const { results } = await c.env.DB.prepare(
      `SELECT p.*, w.name1, w.name2, e.name AS enquiry_name
         FROM vendor_proposal p
         LEFT JOIN wedding w ON w.id = p.wedding_id
         LEFT JOIN vendor_enquiry e ON e.id = p.enquiry_id
        WHERE p.listing_id = ? ORDER BY COALESCE(p.revised_at, p.created_at) DESC LIMIT 200`,
    )
      .bind(l.id)
      .all<ProposalRow & { name1: string | null; name2: string | null; enquiry_name: string | null }>();
    const proposals = results.map((p): ProposalSummary => {
      const status = statusOf(p.status);
      return {
        ...latestOf(p),
        id: p.id,
        to: p.wedding_id ? firstNames(p.name1 ?? '', p.name2 ?? '') || 'A couple' : (p.enquiry_name ?? 'An enquiry'),
        kind: p.wedding_id ? 'couple' : 'enquiry',
        status,
        sentAt: p.created_at,
        answeredAt: p.answered_at ?? '',
        link: linkOf(c.env, p.token),
        request: requestsOf(p.requests).slice(-1)[0] ?? null,
      };
    });
    // The ones waiting on someone: the couple (sent) and the vendor (asked for changes).
    return c.json({ proposals, waiting: proposals.filter((p) => p.status === 'sent').length, changes: proposals.filter((p) => p.status === 'changes').length });
  });

  app.post('/', async (c) => {
    const l = await listingOf(c);
    if (!l) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    const b = FeeProposal.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the proposal.');
    const f = b.data;
    const db = c.env.DB;
    // Only their own couples (linked and not ended) or their own enquiries.
    const couple =
      'couple' in f.to
        ? await db
            .prepare(`SELECT w.id, w.name1, w.name2 FROM vendor_couple vc JOIN wedding w ON w.id = vc.wedding_id AND w.deleted_at IS NULL WHERE vc.listing_id = ? AND vc.wedding_id = ? AND vc.status = 'active'`)
            .bind(l.id, f.to.couple)
            .first<{ id: string; name1: string; name2: string }>()
        : null;
    const enquiry = 'enquiry' in f.to ? await db.prepare(`SELECT id, name, email, stage FROM vendor_enquiry WHERE id = ? AND listing_id = ?`).bind(f.to.enquiry, l.id).first<{ id: string; name: string; email: string; stage: string }>() : null;
    if (!couple && !enquiry) return err(c, 404, 'not_found', 'That couple or enquiry isn’t yours.');
    if (!(await allow(db, `vendor-proposal:${l.id}`, 60, 3_600_000))) return err(c, 429, 'slow_down', 'That’s a lot of proposals. Try again in a little while.');

    const id = crypto.randomUUID();
    const token = randomToken(24);
    const now = new Date().toISOString();
    const total = proposalTotal(f.lines);
    await db
      .prepare(`INSERT INTO vendor_proposal (id, listing_id, wedding_id, enquiry_id, token, title, lines, deposit, valid_until, note, status, revision, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', 1, ?)`)
      .bind(id, l.id, couple?.id ?? null, enquiry?.id ?? null, token, f.title, JSON.stringify(f.lines), f.deposit, f.validUntil, f.note, now)
      .run();
    const link = linkOf(c.env, token);
    const version: ProposalVersion = { revision: 1, title: f.title, lines: f.lines, total, deposit: f.deposit, validUntil: f.validUntil, note: f.note, at: now };

    if (couple) {
      await toPlanner(db, couple.id, l, id, version, link);
      // And a note in their conversation (the couple gets an email that a message is waiting).
      await post(c.env, l.id, couple.id, true, `New fee proposal: ${f.title}, ${aud(total)}. Read it, accept it or ask for changes here: ${link}`, async () => {
        const m = buttonEmail({ heading: `A fee proposal from ${l.name}`, lines: [`${f.title}: ${aud(total)}${f.deposit ? `, with a ${aud(f.deposit)} deposit` : ''}.`, 'It’s in your planner too, under Vendors.'], button: 'Read the proposal', link, brand: true });
        for (const to of await ownerEmails(db, couple.id)) await sendEmail(c.env, { to, subject: `${l.name} sent you a fee proposal`, ...m });
      });
      return c.json({ id, link, emailed: false });
    }

    // An enquiry: emailed to them (when email is on), and the enquiry moves to Quoted.
    const e = enquiry!;
    if (e.stage !== 'booked') await db.prepare(`UPDATE vendor_enquiry SET stage = 'quoted', read = 1 WHERE id = ? AND listing_id = ?`).bind(e.id, l.id).run();
    let emailed = false;
    if (emailReady(c.env) && e.email) {
      const hello = e.name ? `Hi ${e.name.trim().split(' ')[0]},` : 'Hi,';
      const m = buttonEmail({
        heading: `A fee proposal from ${l.name}`,
        lines: [hello, `Thank you for your enquiry. Here’s ${l.name}’s proposal for your wedding: ${f.title}, ${aud(total)}${f.deposit ? `, with a ${aud(f.deposit)} deposit` : ''}.`, 'Read it on your phone, then accept it, decline it or ask for changes there.'],
        button: 'Read the proposal',
        link,
        footer: `You got this because you asked ${l.name} about your wedding.`,
        brand: true,
      });
      emailed = await sendEmail(c.env, { to: e.email, subject: `${l.name}: your fee proposal`, ...m, replyTo: [l.email] });
    }
    return c.json({ id, link, emailed });
  });

  /** A revision: the next version of a proposal not yet answered (usually after the couple asked for changes). */
  app.post('/:id/revise', async (c) => {
    const l = await listingOf(c);
    if (!l) return err(c, 404, 'no_listing', 'This account has no vendor listing.');
    const b = FeeProposalRevision.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Please check the proposal.');
    const f = b.data;
    const db = c.env.DB;
    const p = await db
      .prepare(`SELECT p.*, e.name AS enquiry_name, e.email AS enquiry_email FROM vendor_proposal p LEFT JOIN vendor_enquiry e ON e.id = p.enquiry_id WHERE p.id = ? AND p.listing_id = ?`)
      .bind(c.req.param('id'), l.id)
      .first<ProposalRow & { enquiry_name: string | null; enquiry_email: string | null }>();
    if (!p) return err(c, 404, 'not_found', 'That proposal isn’t yours.');
    if (p.status === 'accepted' || p.status === 'declined') return err(c, 409, 'final', `This proposal was ${p.status}, so it can’t be changed. Send a new one instead.`);
    if (!(await allow(db, `vendor-proposal:${l.id}`, 60, 3_600_000))) return err(c, 429, 'slow_down', 'That’s a lot of proposals. Try again in a little while.');

    const before = latestOf(p);
    const versions = [...versionsOf(p.versions), before].slice(-20);
    const now = new Date().toISOString();
    const total = proposalTotal(f.lines);
    const next = p.revision + 1;
    // Only if no one answered in between (an accept and a revision at once: the answer wins).
    const res = await db
      .prepare(`UPDATE vendor_proposal SET title = ?, lines = ?, deposit = ?, valid_until = ?, note = ?, status = 'sent', revision = ?, versions = ?, revised_at = ? WHERE id = ? AND revision = ? AND status IN ('sent', 'changes')`)
      .bind(f.title, JSON.stringify(f.lines), f.deposit, f.validUntil, f.note, next, JSON.stringify(versions), now, p.id, p.revision)
      .run();
    if (!res.meta.changes) return err(c, 409, 'changed', 'This proposal changed while you were working on it. Reload to see the latest.');
    const link = linkOf(c.env, p.token);
    const said = `Revised fee proposal: ${f.title}, ${aud(total)} (was ${aud(before.total)}). Revision ${next}: ${link}`;

    if (p.wedding_id) {
      const wid = p.wedding_id;
      // The revision has saved: what follows is tried again when busy, and never turns it into an error (the
      // page would send it again, as a third revision).
      await afterCommit(() => toPlanner(db, wid, l, p.id, { revision: next, title: f.title, lines: f.lines, total, deposit: f.deposit, validUntil: f.validUntil, note: f.note, at: now }, link)).catch((e) => console.error('proposal revise: planner', String(e)));
      await afterCommit(() =>
        post(c.env, l.id, wid, true, said, async () => {
          const m = buttonEmail({ heading: `${l.name} revised their proposal`, lines: [`${f.title}: ${aud(total)} (was ${aud(before.total)}).`], button: 'Read the revision', link, brand: true });
          for (const to of await ownerEmails(db, wid)) await sendEmail(c.env, { to, subject: `${l.name} revised their fee proposal`, ...m });
        }),
      ).catch((e) => console.error('proposal revise: message', String(e)));
      return c.json({ id: p.id, link, revision: next, emailed: false });
    }
    let emailed = false;
    if (emailReady(c.env) && p.enquiry_email) {
      const m = buttonEmail({
        heading: `${l.name} revised their proposal`,
        lines: [`${f.title}: ${aud(total)} (was ${aud(before.total)}).`, 'Read what changed, then accept it, decline it or ask for more changes.'],
        button: 'Read the revision',
        link,
        footer: `You got this because you asked ${l.name} about your wedding.`,
        brand: true,
      });
      emailed = await sendEmail(c.env, { to: p.enquiry_email, subject: `${l.name}: your revised fee proposal`, ...m, replyTo: [l.email] });
    }
    return c.json({ id: p.id, link, revision: next, emailed });
  });

  return app;
}

type PublicRow = ProposalRow & {
  l_name: string;
  l_email: string;
  l_category: string;
  l_slug: string;
  l_contact: string;
  l_phone: string;
  name1: string | null;
  name2: string | null;
  enquiry_name: string | null;
};

/** The couple's side: the proposal by its link, and their answer. No sign-in: the link is the key. */
export function proposalPublicRoutes() {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly);
  const find = (c: C) =>
    c.env.DB.prepare(
      `SELECT p.*, l.name AS l_name, l.email AS l_email, l.category AS l_category, l.slug AS l_slug, l.contact_name AS l_contact, l.phone AS l_phone,
              w.name1, w.name2, e.name AS enquiry_name
         FROM vendor_proposal p
         JOIN vendor_listing l ON l.id = p.listing_id
         LEFT JOIN wedding w ON w.id = p.wedding_id
         LEFT JOIN vendor_enquiry e ON e.id = p.enquiry_id
        WHERE p.token = ?`,
    )
      .bind(c.req.param('token') ?? '')
      .first<PublicRow>();
  const toOf = (p: PublicRow) => (p.wedding_id ? firstNames(p.name1 ?? '', p.name2 ?? '') : (p.enquiry_name ?? '').trim());
  const gone = (c: C) => err(c, 404, 'not_found', 'That proposal link doesn’t work. Ask the vendor to send it again.');
  const tellVendor = async (env: Env, p: PublicRow, subject: string, lines: string[]) => {
    if (!emailReady(env)) return;
    const m = buttonEmail({ heading: subject, lines, button: 'Open your vendor page', link: `${base(env)}/vendors/me?tab=proposals`, brand: true });
    await sendEmail(env, { to: p.l_email, subject, ...m }).catch(() => false);
  };

  app.get('/:token', async (c) => {
    if (!(await allow(c.env.DB, `proposal:${ipOf(c)}`, 300, 3_600_000))) return err(c, 429, 'slow_down', 'Please wait a minute.');
    const p = await find(c);
    if (!p) return gone(c);
    const view: ProposalView = {
      ...latestOf(p),
      vendor: { name: p.l_name, category: categoryLabel(p.l_category), slug: p.l_slug, contactName: p.l_contact, phone: p.l_phone },
      status: statusOf(p.status),
      to: toOf(p),
      versions: versionsOf(p.versions),
      requests: requestsOf(p.requests),
    };
    return c.json(view);
  });

  app.post('/:token/answer', async (c) => {
    if (!(await allow(c.env.DB, `proposal-answer:${ipOf(c)}`, 30, 3_600_000))) return err(c, 429, 'slow_down', 'Please wait a minute.');
    const b = ProposalAnswer.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', b.error.issues[0]?.message ?? 'Choose accept, decline or ask for changes.');
    const p = await find(c);
    if (!p) return gone(c);
    const revision = b.data.revision ?? p.revision;
    // The same answer again within a few minutes is the page trying again after "busy" (the first one may have
    // been saved before the busy): it finishes what the first may not have (booked in the planner, the vendor's
    // message) and answers as before, instead of "already accepted".
    const asked: ProposalStatus | null = b.data.answer === 'accept' ? 'accepted' : b.data.answer === 'decline' ? 'declined' : null;
    const again = !!asked && p.status === asked && revision === p.revision && !!p.answered_at && Date.now() - Date.parse(p.answered_at) < 10 * 60_000;
    // Final once accepted or declined; and only the latest revision can be answered.
    if (!again && (p.status === 'accepted' || p.status === 'declined')) return err(c, 409, 'answered', `This proposal has already been ${p.status}.`);
    if (revision !== p.revision) return err(c, 409, 'stale', 'There’s a newer version of this proposal. Reload the page to see it.');
    const now = new Date().toISOString();
    const who = toOf(p) || 'A couple';
    const latest = latestOf(p);

    if (b.data.answer === 'changes') {
      const message = b.data.message;
      const requests = [...requestsOf(p.requests), { revision, message, at: now }].slice(-30);
      const res = await c.env.DB.prepare(`UPDATE vendor_proposal SET status = 'changes', requests = ? WHERE id = ? AND revision = ? AND status IN ('sent', 'changes')`).bind(JSON.stringify(requests), p.id, revision).run();
      if (!res.meta.changes) return err(c, 409, 'stale', 'This proposal just changed. Reload the page to see the latest.');
      const said = `Asked for changes to your fee proposal (${p.title}, revision ${revision}): ${message}`;
      if (p.wedding_id) {
        await post(c.env, p.listing_id, p.wedding_id, false, said.slice(0, 4000), () => tellVendor(c.env, p, `${who} asked for changes to your proposal`, [message.slice(0, 600)]));
      } else {
        await tellVendor(c.env, p, `${who} asked for changes to your proposal`, [`${p.title}, revision ${revision}:`, message.slice(0, 600), 'Send them a revision from your Proposals.']);
      }
      return c.json({ status: 'changes' as ProposalStatus });
    }

    const status: ProposalStatus = b.data.answer === 'accept' ? 'accepted' : 'declined';
    // Once only: whoever answers first wins (and never an older revision).
    if (!again) {
      const res = await c.env.DB.prepare(`UPDATE vendor_proposal SET status = ?, answered_at = ? WHERE id = ? AND revision = ? AND status IN ('sent', 'changes')`).bind(status, now, p.id, revision).run();
      if (!res.meta.changes) return err(c, 409, 'answered', 'This proposal was just answered or changed. Reload the page to see it.');
    }

    if (p.wedding_id) {
      const wid = p.wedding_id;
      if (status === 'accepted') {
        // Booked in their planner, with this proposal as the accepted quote.
        await changeDoc(c.env.DB, wid, 'vendors', '', (d) => {
          const v = entryOf(d.list, { id: p.listing_id, email: p.l_email });
          if (!v) return false;
          v.status = 'booked';
          v.declinedWhy = '';
          if (v.quotes.some((q) => q.id === p.id)) v.accepted = p.id;
        });
        await c.env.DB.prepare(
          `INSERT INTO vendor_use (wedding_id, dir_id, booked, amount, updated_at) VALUES (?, ?, 1, ?, ?)
           ON CONFLICT (wedding_id, dir_id) DO UPDATE SET booked = 1, amount = excluded.amount, updated_at = excluded.updated_at`,
        )
          .bind(wid, `v:${p.listing_id}`, latest.total, now)
          .run();
      }
      // The vendor sees the answer in the conversation (and gets an email that a message is waiting).
      const said = status === 'accepted' ? `We accepted your fee proposal: ${p.title}, ${aud(latest.total)}${p.revision > 1 ? ` (revision ${p.revision})` : ''}.` : `We’ve decided not to go ahead with your fee proposal: ${p.title}.`;
      const told = again && (await c.env.DB.prepare(`SELECT 1 FROM vendor_message WHERE listing_id = ? AND wedding_id = ? AND from_vendor = 0 AND body = ? LIMIT 1`).bind(p.listing_id, wid, said).first());
      if (!told) await post(c.env, p.listing_id, wid, false, said, () => tellVendor(c.env, p, `${who} ${status} your proposal`, [said]));
    } else if (p.enquiry_id) {
      if (status === 'accepted') await c.env.DB.prepare(`UPDATE vendor_enquiry SET stage = 'booked', read = 0 WHERE id = ? AND listing_id = ?`).bind(p.enquiry_id, p.listing_id).run();
      // (The vendor's email once only: on a try-again it may already have gone.)
      if (!again) await tellVendor(c.env, p, `${who} ${status} your proposal`, [`${p.title}: ${aud(latest.total)}.`, status === 'accepted' ? 'Get in touch to confirm the booking and the deposit.' : 'It’s marked declined in your proposals.']);
    }
    return c.json({ status });
  });

  return app;
}
