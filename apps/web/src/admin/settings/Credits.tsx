import { useEffect, useState } from 'react';
import { api, settingsApi, type SettingsData } from '../../lib/api';
import { fmtWhen } from '../../lib/format';
import { isDemo } from '../../try/demoMode';
import { useAdmin } from '../Shell';
import { SendVia } from '../texts/OwnPhone';
import { SmsSetup, TextCredits } from './SmsSetup';
import { useTools } from './Tools';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Settings → Text credits: always here after sign-up, not only while paying for the plan. The balance (or
 * Unlimited on a founders' wedding), Buy (or Top up) at cost with the total shown before paying, and every
 * purchase. Sending from your own phone or by email stays free. Once texts are showing, their settings (the
 * number, quiet hours, automatic replies) follow underneath.
 */
export function CreditsSection() {
  const { wid, overview } = useAdmin();
  const tools = useTools();
  const [s, setS] = useState<SettingsData | null>(null);
  const [history, setHistory] = useState<{ at: string; credits: number; cents: number | null }[] | null>(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    let live = true;
    settingsApi.get(wid).then(
      (x) => live && setS(x),
      (e) => live && setProblem((e as Error).message),
    );
    if (isDemo()) setHistory([]);
    else
      api.textPurchases(wid).then(
        (h) => live && setHistory(h.purchases),
        () => live && setHistory([]),
      );
    return () => {
      live = false;
    };
  }, [wid]);
  return (
    <div className="flex flex-col gap-6 max-w-[900px]">
      <p className="m-0 text-[15px] text-[var(--adm-muted,#5b6a52)]">
        Sending invitations and reminders from your own phone or by email is always free. Text credits are only for when you’d like us to text your guests for you, charged at cost.
      </p>
      {problem && <p className="m-0 text-[14px] text-[#7a4a37]">{problem}</p>}
      {s ? <TextCredits s={s} wid={wid} unlimited={tools.credits === null && tools.on.texts} /> : !problem && <div aria-busy="true" className="text-[var(--adm-muted,#5b6a52)]">Loading your credits…</div>}
      <section aria-label="Purchase history" className="flex flex-col gap-2">
        <h3 className="m-0 text-[13px] font-semibold tracking-[.14em] uppercase text-[var(--adm-muted,#5b6a52)]">Purchase history</h3>
        {history === null ? (
          <span className="text-[14px] text-[var(--adm-muted,#5b6a52)]">Loading…</span>
        ) : history.length ? (
          <table className="w-full max-w-[560px] text-[14px] border-collapse">
            <thead>
              <tr className="text-left text-[var(--adm-muted,#5b6a52)]">
                <th className="py-2 pr-3 font-semibold">Date</th>
                <th className="py-2 pr-3 font-semibold">Credits</th>
                <th className="py-2 font-semibold">Paid (AUD)</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.at} className="border-t border-[var(--adm-line,#e2d7bc)]">
                  <td className="py-2 pr-3">{fmtWhen(h.at, overview?.wedding.timezone ?? 'Australia/Sydney')}</td>
                  <td className="py-2 pr-3 tabular-nums">{h.credits.toLocaleString('en-AU')}</td>
                  <td className="py-2 tabular-nums">{h.cents === null ? '—' : money(h.cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="text-[14px] text-[var(--adm-muted,#5b6a52)]">No text credits bought yet.</span>
        )}
      </section>
      {tools.on.texts && (
        <section aria-label="Texting settings" className="flex flex-col gap-6">
          <h3 className="m-0 text-[13px] font-semibold tracking-[.14em] uppercase text-[var(--adm-muted,#5b6a52)]">Texting settings</h3>
          <SendVia />
          <SmsSetup credits={false} />
        </section>
      )}
    </div>
  );
}
