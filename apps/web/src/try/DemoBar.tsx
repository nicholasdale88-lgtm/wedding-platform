import { useState } from 'react';
import { PLAN_INFO } from '@wp/shared';
import { useAdmin } from '../admin/Shell';
import { demoPlan, setDemoPlan, type DemoPlan } from './demo';

const PLANS: [DemoPlan, string][] = [
  ['free', PLAN_INFO.free.name],
  ['essentials', PLAN_INFO.essentials.name],
  ['complete', PLAN_INFO.complete.name],
];

/**
 * Try the app: along the bottom, what this is (a sample, nothing saved), which plan it's showing (switch to see
 * what each adds: locked parts show what they do), back to the front page, and start your own wedding.
 */
export function DemoBar() {
  const { reload } = useAdmin();
  const [plan, setPlan] = useState<DemoPlan>(demoPlan());
  const choose = (p: DemoPlan) => {
    setDemoPlan(p);
    setPlan(p);
    void reload();
  };
  return (
    <div role="region" aria-label="Sample wedding" className="fixed z-[25] left-0 right-0 bottom-0 px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] bg-[#1b2218] text-[#f3ecd6] shadow-[0_-8px_24px_rgba(0,0,0,.2)] print:hidden">
      <div className="max-w-[1100px] mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px]">
        <a href="/" className="py-[6px] px-3 rounded-full border border-[rgba(243,236,214,.35)] no-underline !text-[#f3ecd6]">
          ← The Yes List
        </a>
        <span className="hidden sm:inline">
          <strong>A sample wedding.</strong> Try anything: nothing is saved or sent.
        </span>
        <span role="radiogroup" aria-label="Plan to try" className="inline-flex p-[3px] rounded-full bg-[rgba(243,236,214,.12)]">
          {PLANS.map(([k, name]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={plan === k}
              onClick={() => choose(k)}
              className={`py-[5px] px-3 rounded-full border-0 text-[13px] font-semibold cursor-pointer ${plan === k ? 'bg-[#e6cf9e] text-[#1b2218]' : 'bg-transparent text-[#f3ecd6]'}`}
            >
              {name}
            </button>
          ))}
        </span>
        <a href="/#start" className="ml-auto py-[7px] px-4 rounded-full no-underline font-semibold !text-[#1b2218] bg-[#e6cf9e]">
          Start your wedding
        </a>
      </div>
    </div>
  );
}
