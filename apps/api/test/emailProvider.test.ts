import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { emailPaid, emailProvider, emailReady, sendEmail } from '../src/lib/email';
import { signV4 } from '../src/lib/ses';
import { mailLeft, mailPerDay, MAIL_PER_DAY_FREE, MAIL_PER_DAY_PAID, takeMail } from '../src/lib/weddingMail';
import { testD1 } from './support/d1';

/** The email provider setting (Resend or Amazon SES) and the daily cap that follows the plan (docs/GROWTH_PLAN.md → Email). */
describe('email provider and plan', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const base = { PUBLIC_BASE_URL: 'https://example.com', EMAIL_FROM: 'The Yes List <hello@site.example>' };
  const ses = { EMAIL_PROVIDER: 'ses', AWS_SES_ACCESS_KEY_ID: 'AKIDEXAMPLE', AWS_SES_SECRET_ACCESS_KEY: 'secret-example', AWS_SES_REGION: 'ap-southeast-2' };
  const msg = { to: 'guest@example.com', subject: 'Our wedding', text: 'Hello', html: '<p>Hello</p>', replyTo: ['sophie-and-nicholas@mail.example'], headers: { 'In-Reply-To': '<m1@x>' } };

  beforeEach(async () => {
    t = await testD1();
    calls = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init!.headers as Record<string, string>, body: JSON.parse(String(init!.body)) });
      return new Response('{"MessageId":"x"}', { status: 200 });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    t.dispose();
  });

  it('SigV4 signing matches the example AWS publishes', async () => {
    // AWS's Signature Version 4 example (IAM ListUsers, 30 Aug 2015, us-east-1).
    const h = await signV4({
      method: 'GET',
      url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body: '',
      service: 'iam',
      region: 'us-east-1',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      now: new Date('2015-08-30T12:36:00Z'),
    });
    expect(h['x-amz-date']).toBe('20150830T123600Z');
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7',
    );
  });

  it('Resend is the default; nothing changes for a site that never picks a provider', async () => {
    const env = { ...base, RESEND_API_KEY: 're_test' } as unknown as Env;
    expect(emailProvider(env)).toBe('resend');
    expect(emailReady(env)).toBe(true);
    expect(await sendEmail(env, msg)).toBe(true);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.body.reply_to).toEqual(msg.replyTo);
  });

  it('with EMAIL_PROVIDER=ses, email goes to Amazon SES (signed), with Reply-To and threading headers kept', async () => {
    const env = { ...base, RESEND_API_KEY: 're_test', ...ses } as unknown as Env;
    expect(emailProvider(env)).toBe('ses');
    expect(await sendEmail(env, { ...msg, from: '"Sophie & Nicholas" <sophie-and-nicholas@mail.example>' })).toBe(true);
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.url).toBe('https://email.ap-southeast-2.amazonaws.com/v2/email/outbound-emails');
    expect(c.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/ap-southeast-2\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect(c.body).toMatchObject({
      FromEmailAddress: '"Sophie & Nicholas" <sophie-and-nicholas@mail.example>',
      Destination: { ToAddresses: ['guest@example.com'] },
      ReplyToAddresses: msg.replyTo,
      Content: { Simple: { Subject: { Data: 'Our wedding' }, Body: { Text: { Data: 'Hello' }, Html: { Data: '<p>Hello</p>' } }, Headers: [{ Name: 'In-Reply-To', Value: '<m1@x>' }] } },
    });
  });

  it('SES picked but its keys missing: email is off (never falls back to sending another way unexpectedly)', async () => {
    const env = { ...base, RESEND_API_KEY: 're_test', EMAIL_PROVIDER: 'ses' } as unknown as Env;
    expect(emailReady(env)).toBe(false);
    expect(await sendEmail(env, msg)).toBe(false);
    expect(calls).toHaveLength(0);
    // A bad region is refused before anything is sent.
    expect(await sendEmail({ ...env, ...ses, AWS_SES_REGION: 'nowhere' } as unknown as Env, msg)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('the daily cap per wedding: 40 on the free Resend plan, 500 on a paid plan or SES', async () => {
    const free = { ...base, DB: t.db, RESEND_API_KEY: 're_test' } as unknown as Env;
    const paid = { ...free, EMAIL_PLAN: 'paid' } as unknown as Env;
    const onSes = { ...free, ...ses } as unknown as Env;
    expect([emailPaid(free), emailPaid(paid), emailPaid(onSes)]).toEqual([false, true, true]);
    expect([mailPerDay(free), mailPerDay(paid), mailPerDay(onSes)]).toEqual([MAIL_PER_DAY_FREE, MAIL_PER_DAY_PAID, MAIL_PER_DAY_PAID]);
    for (let i = 0; i < MAIL_PER_DAY_FREE; i++) expect(await takeMail(free, 'w1')).toBe(true);
    expect(await takeMail(free, 'w1')).toBe(false);
    expect(await mailLeft(free, 'w1')).toBe(0);
    // Moving to a paid plan lifts today's cap straight away.
    // (the refused 41st try was counted too, as the limiter counts every try)
    expect(await mailLeft(paid, 'w1')).toBe(MAIL_PER_DAY_PAID - MAIL_PER_DAY_FREE - 1);
    expect(await takeMail(paid, 'w1')).toBe(true);
    expect(await mailLeft(free, 'w2')).toBe(MAIL_PER_DAY_FREE); // each wedding has its own count
  });
});
