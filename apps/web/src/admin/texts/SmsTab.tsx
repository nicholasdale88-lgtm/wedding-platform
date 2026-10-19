import { useSearchParams } from 'react-router-dom';
import { SmsSetup } from '../settings/SmsSetup';
import { SmsMessages } from './SmsMessages';

/** Admin → SMS: the messages and their setup in one place (?view=setup for the setup). */
export function SmsTab() {
  const [params, setParams] = useSearchParams();
  const setup = params.get('view') === 'setup';
  const go = (v: 'messages' | 'setup') =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === 'setup') n.set('view', 'setup');
        else n.delete('view');
        return n;
      },
      { replace: true },
    );
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="SMS" className="flex gap-2">
        {(
          [
            ['messages', 'Messages'],
            ['setup', 'Setup'],
          ] as const
        ).map(([k, label]) => {
          const on = (k === 'setup') === setup;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go(k)}
              className={`py-2 px-4 rounded-full border text-[14px] cursor-pointer ${on ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794] text-[#33402f] hover:bg-[#efe7d3]'}`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {setup ? <SmsSetup /> : <SmsMessages />}
    </div>
  );
}
