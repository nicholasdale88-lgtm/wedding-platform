import { describe, expect, it } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import { D1SmsStore } from '../src/db/smsStore';
import { scheduled } from '../src/index';
import { reminderText } from '../src/routes/paymentReminders';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';
import { fakeClock, FakeProvider } from './support/fakes';

describe('payment reminders', () => {
  it('the text lists what is due, soonest first, with a link', () => {
    const p = (who: string, due: string, amount: number, label = 'Payment') => ({ key: who, vendorId: '', line: 0, who, label, amount, due, paid: false, paidOn: '' });
    const text = reminderText([p('Cake', '2027-03-01', 700, 'Balance'), p('Bloom', '2027-03-04', 1200)], '2027-03-01', 'https://example.com/admin');
    expect(text).toBe('Wedding payments due soon:\n• Cake balance $700, today\n• Bloom $1,200, Thu 4 Mar\nMark them paid: https://example.com/admin');
  });

  it('texts the couple once per payment, only when on, never in quiet hours', async () => {
    const t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'o@example.com', ownerPassHash: 'x', sampleGuests: false });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    await t.db.prepare(`UPDATE wedding SET sms_sender = '+61400000999', admin_mobile = '+61412000777'`).run();
    const w = (await t.db.prepare(`SELECT id FROM wedding`).first<{ id: string }>())!.id;
    const budget = { total: 0, lines: [{ category: 'Cake', item: 'Cake', quote: 900, paid: 200, due: '2027-03-12' }, { category: 'Cars', item: 'Cars', quote: 500, due: '2027-06-01' }] };
    await t.db.prepare(`INSERT INTO planner_doc (wedding_id, kind, scope, data, version, updated_at) VALUES (?, 'budget', '', ?, 1, '2027-01-01')`).bind(w, JSON.stringify(budget)).run();
    const provider = new FakeProvider();
    const clock = fakeClock('2027-03-10T10:00');
    const run = () => scheduled({ DB: t.db, PUBLIC_BASE_URL: 'https://example.com' }, () => ({ store: new D1SmsStore(t.db, 'https://example.com'), provider, now: clock.now, uuid: () => crypto.randomUUID() }));
    const toCouple = () => provider.delivered.filter((m) => m.message.startsWith('Wedding payments'));

    await run();
    expect(toCouple()).toHaveLength(0); // off until switched on
    await t.db.prepare(`UPDATE wedding SET content = json_set(content, '$.payReminders', json('{"on":true,"days":3}'))`).run();
    clock.set('2027-03-10T23:00'); // quiet hours
    await run();
    expect(toCouple()).toHaveLength(0);
    clock.set('2027-03-11T09:30');
    await run();
    expect(toCouple()).toHaveLength(1);
    expect(toCouple()[0]!.message).toContain('Cake balance $700, Fri 12 Mar');
    expect(toCouple()[0]!.message).not.toContain('Cars');
    clock.set('2027-03-11T12:00');
    await run();
    expect(toCouple()).toHaveLength(1); // each payment once
    await t.dispose();
  });
});
