import { allows } from '@wp/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import { digestFor } from '../lib/digest';
import { buttonEmail, emailReady, plainHtml, sendEmail } from '../lib/email';
import { weddingPlan } from '../lib/plan';
import { allow } from '../lib/rateLimit';
import { readJson } from '../lib/security';
import { ensureAddress, senderOf } from '../lib/weddingMail';
import { sendTest, type EngineDeps } from '../sms/engine';
import { renderFor } from '../sms/render';
import type { Recipient } from '../sms/types';
import { jsonWritesOnly, requireMember, requireUser, type AdminEnv } from './auth';
import { sendViaOf } from './ownPhone';

/**
 * "Send me a test" for every message the app sends (/api/a/w/:wid/test-send): exactly what a guest would get,
 * filled in with a real sample guest (the first one, or the one chosen) and their own link, marked TEST.
 * - A text goes to the couple's own mobile: through the texting number when it's connected, otherwise as a
 *   "Text from my phone" link to themselves (their own phone sends it).
 * - An email goes to the signed-in person's own email.
 * - Nothing connected: the preview on screen, and what to set up.
 * Tests never touch a guest: nothing is recorded against them, and they have their own small daily
 * allowance (TESTS_PER_DAY), apart from the guests' emails and texts.
 */

export const TESTS_PER_DAY = 20;
const DAY = 24 * 3_600_000;

type C = Context<AdminEnv>;
const wid = (c: C) => c.req.param('wid')!;
const err = (c: C, status: 400 | 404, code: string, message: string) => c.json({ error: { code, message } }, status);

const Body = z
  .object({
    /** campaign: a text message (any channel); invitation: "Email everyone their invitation"; compose: an email you're writing; digest: the daily summary; party: a wedding party invitation. */
    what: z.enum(['campaign', 'invitation', 'compose', 'digest', 'party']),
    campaignId: z.string().max(60).optional(),
    channel: z.enum(['text', 'email', 'phone']).optional(),
    guestId: z.string().max(60).optional(),
    /** The words as they are on screen (not saved yet). */
    body: z.string().max(20000).optional(),
    subject: z.string().max(300).optional(),
  })
  .strict();

type Preview = { kind: 'text' | 'email'; subject?: string; text: string; html?: string };
export type TestResult = {
  /** sent: it went; link: tap to text it to yourself from your phone; preview: shown here only (why says what to set up). */
  result: 'sent' | 'link' | 'preview';
  channel: 'text' | 'email' | 'phone';
  to?: string;
  /** For 'link': your own mobile, and the words (the page opens your Messages app with them). */
  phone?: string;
  message: string;
  preview: Preview;
  sample: string;
};

const SAMPLE: Recipient = { id: 'sample', token: 'TEST', phone: null, optOut: false, people: ['Sam Sample'], seatsHeld: 2, invited: [], rsvp: {}, rsvpUpdatedAt: null, tableName: null };
const masked = (phone: string) => phone.replace(/^\+61/, '0').replace(/^(\d{4})\d+(\d{3})$/, '$1 xxx $2');

export function testSendRoutes(deps: (env: Env) => EngineDeps) {
  const app = new Hono<AdminEnv>();
  app.use('*', jsonWritesOnly, requireUser, requireMember('owner', 'editor'));

  app.post('/', async (c) => {
    const b = Body.safeParse(await readJson(c.req.raw));
    if (!b.success) return err(c, 400, 'invalid', 'Choose what to test.');
    const d = deps(c.env);
    const w = await d.store.wedding(wid(c));
    if (!w) return err(c, 404, 'not_found', 'Wedding not found.');
    const { events, recipients } = await d.store.audience(w.id);
    // The sample guest: the one chosen, else the first with a name (as Setup's "Preview as"), else a made-up one.
    const r0 = recipients.find((r) => r.id === b.data.guestId) ?? recipients.find((r) => r.people.length) ?? { ...SAMPLE, invited: events.map((e) => e.key) };
    const sample = r0.people.join(' & ') || 'Sam Sample';
    const couple = `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}`;
    const base = (c.env.PUBLIC_BASE_URL ?? new URL(c.req.url).origin).replace(/\/+$/, '');
    const me = c.get('user').email;

    // What a guest would get, in its own words.
    let preview: Preview;
    let channel: TestResult['channel'] = 'email';
    if (b.data.what === 'campaign') {
      const camp = (await d.store.campaigns(w.id)).find((x) => x.id === b.data.campaignId);
      if (!camp && b.data.body === undefined) return err(c, 404, 'not_found', 'Message not found.');
      const m = renderFor(b.data.body ?? camp!.body, w, events, r0);
      channel = b.data.channel ?? ({ service: 'text', email: 'email', phone: 'phone' } as const)[(await sendViaOf(c.env.DB, w.id)).via];
      preview = channel === 'email' ? { kind: 'email', subject: `TEST: ${couple}: ${camp?.name ?? 'Message'}`, text: m.body, html: plainHtml(m.body) } : { kind: 'text', text: `TEST: ${m.body}` };
    } else if (b.data.what === 'invitation') {
      const first = sample.split(/\s+/)[0] ?? '';
      const e = buttonEmail({
        heading: `You’re invited, ${first}!`,
        lines: [`${couple} would love you to celebrate with them.`, 'Your invitation has all the details, and you can reply (RSVP) right there. The link is just for you.'],
        button: 'Open your invitation',
        link: `${base}/w/${w.slug}/?g=${r0.token}`,
        footer: `Questions? Just reply to this email to reach ${couple}.`,
      });
      preview = { kind: 'email', subject: `TEST: ${couple}: you’re invited`, ...e };
    } else if (b.data.what === 'compose') {
      const text = (b.data.body ?? '').trim() || '(Your message goes here.)';
      preview = { kind: 'email', subject: `TEST: ${b.data.subject?.trim() || '(no subject)'}`, text, html: plainHtml(text) };
    } else if (b.data.what === 'digest') {
      const dg = await digestFor(c.env, w.id, new Date(Date.now() - 7 * DAY).toISOString());
      const lines = dg?.lines ?? [`Yes from ${sample.split(/\s+/)[0]} (2 coming).`, '(A sample: your real summary only comes on days with news.)'];
      const e = buttonEmail({ heading: `Today for ${couple}`, lines, button: 'Open your wedding', link: `${base}/admin`, footer: 'A summary once a day, only when there’s news. Turn it off in Settings → System check.' });
      preview = { kind: 'email', subject: `TEST: Your wedding today: ${lines[0]!.slice(0, 60)}`, ...e };
    } else {
      const first = sample.split(/\s+/)[0] ?? '';
      const e = buttonEmail({
        heading: `Welcome to the wedding party, ${first}!`,
        lines: [`${couple} would love you in their wedding party, and have made you your own page: the run sheet for the day, your to-dos, what to bring, and everything else you’ll need.`, 'Tap the button to choose a password. After that you sign in with this email.'],
        button: 'Set up my sign-in',
        link: `${base}/w/${w.slug}/party/join?t=TEST`,
        footer: 'The link works for 14 days. If it runs out, ask them for a new one.',
      });
      preview = { kind: 'email', subject: `TEST: ${couple}: welcome to the wedding party`, ...e };
    }
    const out = (result: TestResult['result'], message: string, extra: Partial<TestResult> = {}) => c.json({ result, channel, message, preview, sample, ...extra } satisfies TestResult);

    // Tests have their own small allowance: never the guests' emails or texts.
    if (!(await allow(c.env.DB, `test:${w.id}`, TESTS_PER_DAY, DAY))) return out('preview', `That’s ${TESTS_PER_DAY} tests today, the most for one day. Here’s what it looks like instead.`);

    if (channel === 'email') {
      if (!emailReady(c.env)) return out('preview', 'Email isn’t switched on yet, so here’s exactly what they’d get.');
      const address = await ensureAddress(c.env, w.id).catch(() => '');
      const from = await senderOf(c.env, w.id, address);
      const ok = await sendEmail(c.env, { to: me, from: from.from, replyTo: from.replyTo, subject: preview.subject ?? 'TEST', text: preview.text, html: preview.html ?? plainHtml(preview.text) });
      return ok ? out('sent', `Test email sent to ${me}.`, { to: me }) : out('preview', 'The email service didn’t take it just now. Here’s what it looks like; try again in a minute.');
    }
    const mobile = w.adminMobile;
    if (!mobile) return out('preview', 'Add your mobile in Settings → Texting (Your numbers) to text yourself a test. Here’s exactly what they’d get.');
    const texts = channel === 'text' && !!w.sender && !w.paused && allows(await weddingPlan(c.env.DB, w.id), 'texts');
    if (texts) {
      const res = await sendTest(d, w.id, mobile, preview.text).catch(() => null);
      if (res?.sent) return out('sent', `Test sent to ${masked(mobile)}.`, { to: masked(mobile) });
    }
    // Your own phone: a link that opens your Messages app, addressed to you.
    channel = 'phone';
    return out('link', texts ? 'The texting service didn’t send it, so text it to yourself from your phone instead.' : 'Tap to text it to yourself from your own phone.', { phone: mobile, to: masked(mobile) });
  });

  return app;
}
