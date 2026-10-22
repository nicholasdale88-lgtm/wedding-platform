import { mergeImport, readBudgetSheets, type Budget as BudgetDoc, type BudgetImport as Imported, type Vendors as VendorsDoc } from '@wp/shared';
import { useRef, useState } from 'react';
import { plannerApi } from '../../lib/api';
import { readWorkbook } from '../../lib/workbook';
import { useAdmin } from '../Shell';
import { Pill, useToast } from '../ui';

/**
 * Money → Budget: bring in a budget kept in a spreadsheet (.xlsx). It finds the tracker (Item, Vendor,
 * Estimate, Agreed, Paid), the payments (Vendor, Instalment, Amount, Due date, Paid?) and the savings
 * (Date, Amount, Note) by their headings, shows what it found, and only then puts it in: booked vendors
 * with their payment schedules (Vendors and Payments), the budget lines, and the savings log. Running it
 * again with an updated spreadsheet updates the same vendors and lines, without duplicates.
 */

const aud = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const newId = () => crypto.randomUUID().slice(0, 12);

export function BudgetImport({ budget, prominent, onDone }: { budget: BudgetDoc; prominent: boolean; onDone: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [found, setFound] = useState<{ name: string; imp: Imported } | null>(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProblem('');
    setFound(null);
    setBusy('Reading it…');
    try {
      const imp = readBudgetSheets(await readWorkbook(file));
      if (!imp.lines.length && !imp.vendors.length && !imp.savings.length) {
        setProblem('Nothing to bring in found. The sheets need headings like Item, Vendor, Estimate, Agreed, Paid; or Vendor, Amount, Due Date, Paid?; or Date, Amount, Note.');
      } else setFound({ name: file.name, imp });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  };

  const bringIn = async () => {
    if (!found) return;
    setBusy('Bringing it in…');
    setProblem('');
    try {
      // The latest of both, so nothing typed elsewhere is lost.
      const [b, v] = await Promise.all([plannerApi.doc<BudgetDoc>(wid, 'budget'), plannerApi.doc<VendorsDoc>(wid, 'vendors')]);
      const m = mergeImport({ ...b.data, total: b.data.total || budget.total }, v.data, found.imp, newId);
      await plannerApi.saveDoc(wid, 'vendors', '', m.vendors, v.version);
      await plannerApi.saveDoc(wid, 'budget', '', m.budget, b.version);
      toast(`Brought in: ${m.counts.vendors} vendors with ${m.counts.payments} payments, ${m.counts.lines} budget lines, ${m.counts.savings} savings`);
      setFound(null);
      await onDone();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const imp = found?.imp;
  const unbooked = imp ? imp.lines.filter((l) => !l.vendor) : [];
  const saved = imp ? imp.savings.reduce((a, s) => a + s.amount, 0) : 0;
  return (
    <section aria-label="Bring in a spreadsheet" className={`flex flex-col gap-3 p-4 rounded-[16px] border ${prominent || found ? 'border-[#8a9670] bg-[#f3f6ea]' : 'border-[#e2d7bc] bg-[#fbf8f0]'}`}>
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <span className="w-full lg:w-auto lg:flex-1 min-w-0">
          <strong className="block text-[16px]">Keeping your budget in a spreadsheet?</strong>
          <span className="text-[13px] text-[#5b6a52]">Bring it in: your booked vendors and their payment schedules, the budget lines and your savings. Run it again whenever the spreadsheet changes.</span>
        </span>
        <Pill kind={prominent ? 'primary' : 'secondary'} disabled={!!busy} onClick={() => input.current?.click()}>
          {busy === 'Reading it…' ? busy : 'Choose the spreadsheet (.xlsx)'}
        </Pill>
        <input ref={input} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      {problem && (
        <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">
          {problem}
        </p>
      )}
      {imp && (
        <div className="flex flex-col gap-3 p-3 rounded-[12px] bg-white border border-[#e2d7bc] text-[14px]">
          <strong>From {found!.name}:</strong>
          {imp.vendors.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[12px] font-semibold tracking-[.12em] uppercase text-[#5b6a52]">Booked vendors</span>
              <ul className="m-0 p-0 list-none flex flex-col">
                {imp.vendors.map((v) => {
                  const paid = v.payments.filter((p) => p.paid).reduce((a, p) => a + p.amount, 0);
                  return (
                    <li key={v.name} className="flex justify-between gap-3 py-1 border-b border-[#efe6d0] flex-wrap">
                      <span>
                        <strong>{v.name}</strong>
                        {v.category && <span className="text-[#5b6a52]"> · {v.category}</span>}
                      </span>
                      <span className="tabular-nums text-[#5b6a52]">
                        {aud(v.quote)} · {v.payments.length} {v.payments.length === 1 ? 'payment' : 'payments'} · {aud(paid)} paid
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {unbooked.length > 0 && (
            <span>
              <strong>Still to book:</strong> {unbooked.map((l) => `${l.item} (${aud(l.estimate)})`).join(', ')}
            </span>
          )}
          {imp.savings.length > 0 && (
            <span>
              <strong>Savings:</strong> {imp.savings.length} deposits, {aud(saved)} put away
            </span>
          )}
          <span className="text-[13px] text-[#5b6a52]">
            Vendors already in your planner with the same name are updated, not doubled; budget lines for the same vendor or item are replaced.{budget.total ? '' : ` Your budget total is set to ${aud(imp.total)} (change it any time).`}
          </span>
          <div className="flex gap-2 flex-wrap">
            <Pill kind="primary" disabled={!!busy} onClick={() => void bringIn()}>
              {busy === 'Bringing it in…' ? busy : 'Bring it in'}
            </Pill>
            <Pill onClick={() => setFound(null)}>Cancel</Pill>
          </div>
        </div>
      )}
    </section>
  );
}
