import { useCallback, useEffect, useState } from 'react';
import { companyApi, type CompanyTask, type CompanyTaskAction } from '../lib/api';

/**
 * The inbox, at the top of Overview → What needs you: drafts the bots (or the team) have prepared, each with
 * the one thing it would do, waiting for a person's yes. Approve runs that action as you, so your role must
 * allow it and Activity shows your name. A draft's words can be changed first. Reports just need "Got it".
 * Decided ones from the last week fold away underneath.
 */
const btn = 'py-[9px] px-4 rounded-[10px] border border-[#e3cfc6] bg-white text-[14px] font-medium cursor-pointer text-[#2a1c26] hover:bg-[#fbf5f0] disabled:opacity-60';
const primary = 'py-[9px] px-4 rounded-[10px] border-0 bg-[#3a2532] text-[14px] font-semibold cursor-pointer text-[#fbf8f2] disabled:opacity-60';

/** What an action does, in plain words. */
export function actionWords(a: CompanyTaskAction): string {
  const cents = a.body.cents;
  const money = typeof cents === 'number' ? ` ($${(cents / 100).toLocaleString('en-AU', { maximumFractionDigits: 2 })})` : '';
  const p = a.path;
  if (/\/send-link$/.test(p)) return 'Emails the couple their payment link';
  if (/\/paid$/.test(p)) return `Marks it paid and switches the plan on${money}`;
  if (/\/refund$/.test(p)) return `Refunds the couple${money}`;
  if (/^\/feedback\/[^/]+\/reply$/.test(p)) return 'Emails this reply to the couple';
  if (/^\/feedback\//.test(p)) return 'Updates the feedback (status or the note couples see)';
  if (p === '/banner') return 'Changes the front-page banner';
  if (/^\/listings\/[^/]+\/code$/.test(p)) return 'Gives the vendor a partner code';
  if (/^\/listings\//.test(p)) return 'Shows or hides a vendor listing';
  if (p === '/prospects/invite') return 'Emails invitations to the chosen vendors';
  if (p === '/money/expenses') return `Adds an expense${money}`;
  return 'Makes the change';
}

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 60) return m <= 1 ? 'just now' : `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
};

export function Inbox({ onCount, onNote }: { onCount?: (n: number) => void; onNote: (s: string) => void }) {
  const [tasks, setTasks] = useState<CompanyTask[] | null>(null);
  const [problem, setProblem] = useState('');
  const load = useCallback(() => {
    companyApi.tasks().then(
      (r) => setTasks(r.tasks),
      (e: Error) => setProblem(e.message),
    );
  }, []);
  useEffect(load, [load]);
  const waiting = tasks?.filter((t) => t.status === 'waiting') ?? [];
  const decided = tasks?.filter((t) => t.status !== 'waiting') ?? [];
  useEffect(() => onCount?.(waiting.length), [waiting.length, onCount]);
  if (problem) return <p className="m-0 text-[14px] text-[#7a2e2e]">{problem}</p>;
  if (!tasks) return null;
  return (
    <div className="flex flex-col gap-3" aria-label="Inbox">
      {waiting.map((t) => (
        <TaskCard key={t.id} t={t} onDone={(msg) => (onNote(msg), load())} />
      ))}
      {decided.length > 0 && (
        <details className="text-[14px] text-[#6e6068]">
          <summary className="cursor-pointer">Decided this week ({decided.length})</summary>
          <ul className="m-0 mt-2 pl-5 flex flex-col gap-1">
            {decided.map((t) => (
              <li key={t.id}>
                {t.status === 'done' ? '✓' : 'Skipped:'} {t.title} <span className="text-[12px]">· from {t.from || 'the team'}{t.result ? ` · ${t.result}` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function TaskCard({ t, onDone }: { t: CompanyTask; onDone: (msg: string) => void }) {
  const draftText = t.action && typeof t.action.body.text === 'string' ? t.action.body.text : null;
  const [text, setText] = useState(draftText ?? '');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  // The action ran but marking it decided failed: never offer to run it a second time.
  const [ran, setRan] = useState(false);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setProblem('');
    try {
      await fn();
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const approve = () =>
    run('yes', async () => {
      if (t.action && !ran) {
        await companyApi.runTask(draftText === null ? t.action : { ...t.action, body: { ...t.action.body, text } });
        setRan(true);
      }
      await companyApi.decideTask(t.id, 'done', t.action ? actionWords(t.action) : '');
      onDone(t.kind === 'report' ? 'Noted' : `Approved: ${t.title}`);
    });
  const skip = () =>
    run('no', async () => {
      await companyApi.decideTask(t.id, 'skipped');
      onDone(`Skipped: ${t.title}`);
    });
  return (
    <article className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#ecd9ae] bg-[#fbf3e1] text-[#3a2532]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <strong className="text-[16px]">{t.title}</strong>
        <span className="text-[12px] text-[#6e6068]">
          {t.kind === 'report' ? 'Report' : 'Needs your yes'} · from {t.from || 'the team'} · {ago(t.createdAt)}
        </span>
      </div>
      {t.body && <p className="m-0 text-[14px] leading-[1.5] whitespace-pre-wrap">{t.body}</p>}
      {draftText !== null && (
        <label className="flex flex-col gap-1 text-[13px] text-[#6e6068]">
          The draft: change anything before you approve
          <textarea value={text} rows={5} maxLength={3000} onChange={(e) => setText(e.target.value)} className="w-full py-[9px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[15px] text-[#3a2532]" />
        </label>
      )}
      {t.action && <span className="text-[13px] font-semibold text-[#6b4f1d]">Approve: {actionWords(t.action)}</span>}
      <div className="flex gap-2 flex-wrap">
        {t.kind === 'report' ? (
          <button type="button" className={primary} disabled={!!busy} onClick={() => void approve()}>
            {busy ? 'Saving…' : 'Got it'}
          </button>
        ) : (
          <>
            <button type="button" className={primary} disabled={!!busy || (draftText !== null && text.trim().length < 2)} onClick={() => void approve()}>
              {busy === 'yes' ? 'Doing it…' : 'Approve'}
            </button>
            <button type="button" className={btn} disabled={!!busy || ran} onClick={() => void skip()}>
              Skip
            </button>
          </>
        )}
      </div>
      {problem && (
        <p role="alert" className="m-0 text-[13px] text-[#7a2e2e]">
          {problem} {ran ? 'It was done; tap Approve again to clear it from the inbox (it won’t run twice).' : 'Nothing was changed; it’s still waiting.'}
        </p>
      )}
    </article>
  );
}
