import { beforeEach, describe, expect, it } from 'vitest';
import { runAutopilot } from '../src/sms/engine';
import { handleInbound, handleReceipt, type InboundSms } from '../src/sms/inbound';
import { parseInbound, safeEqual, verifySignature } from '../src/sms/webhook';
import { deps } from './support/fakes';
import { ADMIN, phoneOf, SENDER, seedWedding } from './support/fixture';

/** docs/05 test 4: guests texting back. */
describe('inbound replies', () => {
  let t: ReturnType<typeof deps>;
  let n = 0;
  const local = (e164: string) => '0' + e164.slice(3);
  const text = (from: string, body: string, extra: Partial<InboundSms> = {}) =>
    handleInbound(t.d, { from, to: local(SENDER), body, receivedAt: t.clock.now().toISOString(), type: 'inbound', providerId: `p${++n}`, ...extra });
  const toPhone = (e164: string) => t.provider.delivered.filter((m) => m.to === local(e164));

  beforeEach(async () => {
    t = deps();
    seedWedding(t.store);
    t.clock.set('2026-10-20T09:00');
    await runAutopilot(t.d); // invites out
    t.clock.set('2026-10-21T10:00');
  });

  it('single-event YES: RSVP yes for every seat, one confirmation, no extra thank-you later', async () => {
    // i0 is wedding-only with 2 people
    expect(await text(local(phoneOf(0)), 'Yes! Wouldn’t miss it')).toBe('RSVP set to yes');
    const r = t.store.recipient('i0');
    expect(r.rsvp.wedding).toMatchObject({ attending: true, count: 2 });
    expect(toPhone(phoneOf(0)).at(-1)!.message).toContain("You're down as coming to the wedding");

    t.clock.set('2026-10-21T10:30');
    await runAutopilot(t.d);
    expect(toPhone(phoneOf(0))).toHaveLength(2); // invite + confirmation only
  });

  it('single-event NO: RSVP no, kind reply', async () => {
    expect(await text(phoneOf(3), 'Sorry we cannot make it')).toBe('RSVP set to no');
    expect(t.store.recipient('i3').rsvp.wedding?.attending).toBe(false);
    expect(toPhone(phoneOf(3)).at(-1)!.message).toContain("We'll miss you");
  });

  it('both-events YES: sends their link, RSVP unchanged', async () => {
    expect(await text(phoneOf(1), 'yes')).toBe('Sent link');
    expect(t.store.recipient('i1').rsvp).toEqual({});
    expect(toPhone(phoneOf(1)).at(-1)!.message).toContain(`?g=${t.store.recipient('i1').token}`);
  });

  it('a question is forwarded to the couple', async () => {
    expect(await text(phoneOf(2), 'What time should we arrive?')).toBe('Needs you');
    expect(toPhone(ADMIN).at(-1)!.message).toBe('Reply from Guest2 Jones: What time should we arrive?');
  });

  it('an unknown number is forwarded', async () => {
    expect(await text('0499 111 222', 'Who is this?')).toBe('Unknown number');
    expect(toPhone(ADMIN).at(-1)!.message).toBe('Reply from +61499111222: Who is this?');
  });

  it('STOP opts the number out of everything, platform-wide', async () => {
    expect(await text(phoneOf(4), 'STOP')).toBe('Opted out');
    expect(t.store.stopList.has(phoneOf(4))).toBe(true);
    const before = toPhone(phoneOf(4)).length;
    t.clock.set('2027-06-18T10:00');
    await runAutopilot(t.d); // reminder day
    expect(toPhone(phoneOf(4))).toHaveLength(before);
  });

  it('provider "unsubscribe" events opt out too', async () => {
    expect(await text(phoneOf(6), '', { type: 'unsubscribe' })).toBe('Opted out');
  });

  it('a duplicate webhook is recorded and acted on once', async () => {
    const sms = { providerId: 'same' };
    expect(await text(phoneOf(0), 'yes', sms)).toBe('RSVP set to yes');
    expect(await text(phoneOf(0), 'yes', sms)).toBe('Duplicate');
    expect(t.store.inbound).toHaveLength(1);
    expect(toPhone(phoneOf(0))).toHaveLength(2);
  });

  it('replies go out even in quiet hours (the guest texted first)', async () => {
    t.clock.set('2026-10-21T23:00');
    expect(await text(phoneOf(0), 'Y')).toBe('RSVP set to yes');
    expect(toPhone(phoneOf(0))).toHaveLength(2);
  });

  it('delivery receipts mark messages delivered', async () => {
    const o = t.store.sentTo()[0]!;
    await handleReceipt(t.d, o.providerId!, 'delivered');
    expect(t.store.outbox.find((x) => x.id === o.id)!.status).toBe('delivered');
  });
});

describe('webhook security and parsing', () => {
  it('parses the Mobile Message payload and gives retries the same id', async () => {
    const raw = JSON.stringify({ to: '0400000001', message: 'Yes', sender: '0412345678', received_at: '2027-01-01 10:00:00', type: 'inbound', original_message_id: '', original_custom_ref: '' });
    const a = await parseInbound(raw);
    const b = await parseInbound(raw);
    expect(a).toMatchObject({ from: '0412345678', body: 'Yes', type: 'inbound' });
    expect(a!.providerId).toBe(b!.providerId);
    expect(await parseInbound('not json')).toBeNull();
    expect(await parseInbound('{}')).toBeNull();
  });

  it('verifies HMAC signatures and rejects old timestamps', async () => {
    const secret = 's3cret';
    const raw = '{"x":1}';
    const now = new Date('2027-01-01T00:00:00Z');
    const ts = String(now.getTime() / 1000);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${raw}`)))]
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await verifySignature(secret, raw, ts, sig, now)).toBe(true);
    expect(await verifySignature(secret, raw + ' ', ts, sig, now)).toBe(false);
    expect(await verifySignature('wrong', raw, ts, sig, now)).toBe(false);
    expect(await verifySignature(secret, raw, ts, sig, new Date(now.getTime() + 301_000))).toBe(false);
    expect(await verifySignature(secret, raw, null, sig, now)).toBe(false);
  });

  it('compares secrets in constant time', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});
