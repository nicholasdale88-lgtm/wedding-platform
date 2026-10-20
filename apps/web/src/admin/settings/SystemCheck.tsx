import { useCallback, useEffect, useState } from 'react';
import { backupsApi, type CheckItem } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Pill } from '../ui';

/**
 * Settings → System check: every outside service the wedding relies on (texting, your Google Drive,
 * Dropbox or OneDrive, daily backups, the assistant, photo storage, sign-in), each working or not, with
 * what to do. Linked storage is tried for real, and its "<A & B> wedding" folders are made if missing.
 */
export function SystemCheck() {
  const { wid } = useAdmin();
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const run = useCallback(async () => {
    setBusy(true);
    setProblem('');
    try {
      setItems((await backupsApi.check(wid)).items);
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [wid]);
  useEffect(() => void run(), [run]);
  const mark = { ok: ['✓', 'bg-[#e7eedb] text-[#2f3d24]'], warn: ['!', 'bg-[#f6e3c9] text-[#6b4e12]'], off: ['–', 'bg-[#efe9da] text-[#5b6a52]'] } as const;
  const bad = items?.filter((i) => i.state === 'warn').length ?? 0;
  return (
    <section className="flex flex-col gap-4 max-w-[720px]">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <p className="m-0 text-[15px] text-[#5b6a52]">
          {!items ? (problem ? 'The check couldn’t finish.' : 'Checking each service…') : bad ? `${bad} ${bad === 1 ? 'thing needs' : 'things need'} attention.` : 'Everything that’s set up is working.'}
        </p>
        <Pill kind="outline" disabled={busy} onClick={() => void run()}>
          {busy ? 'Checking…' : 'Check again'}
        </Pill>
      </div>
      {problem && (
        <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">
          {problem}
        </p>
      )}
      <ul className="list-none m-0 p-0 flex flex-col gap-2">
        {items?.map((i) => (
          <li key={i.key} className="flex gap-3 p-4 rounded-[14px] bg-white border border-[#e2d7bc]">
            <span aria-hidden className={`flex-none w-8 h-8 rounded-full flex items-center justify-center text-[15px] font-semibold ${mark[i.state][1]}`}>
              {mark[i.state][0]}
            </span>
            <span className="flex flex-col gap-1 min-w-0">
              <strong className="text-[15px] font-semibold">
                {i.name}
                <span className="sr-only">: {i.state === 'ok' ? 'working' : i.state === 'warn' ? 'needs attention' : 'not set up'}</span>
              </strong>
              <span className="text-[14px] text-[#33402f]">{i.detail}</span>
              {i.fix && <span className="text-[13px] text-[#5b6a52]">{i.fix}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
