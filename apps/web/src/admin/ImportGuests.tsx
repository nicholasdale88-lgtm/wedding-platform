import { useState } from 'react';
import { api, type EventInfo, type ImportResult } from '../lib/api';
import { parseTable } from '../lib/csv';
import { toImportRows, type ImportRow } from './guestImport';
import { useAdmin } from './Shell';
import { inputCls, Pill, useToast } from './ui';

/**
 * Guests → Import: drop a CSV, or copy the rows straight out of Excel or Google Sheets and paste.
 * Shows exactly what will happen (a dry run on the server) before anyone is added.
 */
export function ImportGuests({ events, onClose, onDone }: { events: EventInfo[]; onClose: () => void; onDone: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  const read = async (t: string) => {
    setText(t);
    const { rows: parsed } = toImportRows(parseTable(t), events);
    setRows(parsed);
    setCheck(null);
    if (!parsed.length) return;
    try {
      setCheck(await api.importGuests(wid, parsed, true));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const add = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const r = await api.importGuests(wid, rows, false);
      toast(`Added ${r.added} ${r.added === 1 ? 'invitation' : 'invitations'}${r.skipped.length ? `, skipped ${r.skipped.length} already on your list` : ''}`);
      await onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 p-5 rounded-[14px] border border-[#c6b794] bg-[#fbf8f2]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h2 className="m-0 font-display font-medium text-[26px]">Import guests</h2>
        <button type="button" onClick={onClose} className="p-0 border-0 bg-transparent text-[14px] underline cursor-pointer text-[#33402f]">
          Close
        </button>
      </div>
      <p className="m-0 text-[14px] text-[#5b6a52]">
        One row per invitation. Columns we understand: <strong>Name</strong> (put partners in the same cell with &amp;, or in their own columns), <strong>Mobile</strong>, <strong>Seats</strong>, and a yes/no column for each event (
        {events.map((e) => e.name).join(', ')}). Leave the event columns out to invite everyone to everything.
      </p>
      <div className="flex gap-3 flex-wrap items-center">
        <label className="py-[10px] px-[18px] rounded-full border border-[#c6b794] text-[14px] font-medium cursor-pointer hover:bg-[#efe7d3]">
          Choose a CSV file
          <input type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={async (e) => e.target.files?.[0] && read(await e.target.files[0].text())} />
        </label>
        <span className="text-[13px] text-[#7a7466]">or paste from your spreadsheet below</span>
      </div>
      <textarea rows={5} value={text} onChange={(e) => void read(e.target.value)} placeholder={'Name\tMobile\tSeats\nAlex & Sam Lee\t0412 345 678\t2'} aria-label="Paste guests" className={`${inputCls} font-mono !text-[13px] resize-y`} />

      {rows && (
        <div className="flex flex-col gap-2">
          <div className="text-[14px]">
            {check ? (
              <>
                <strong className="font-semibold">{check.wouldAdd}</strong> new {check.wouldAdd === 1 ? 'invitation' : 'invitations'} to add
                {check.skipped.length ? `, ${check.skipped.length} already on your list (skipped)` : ''}
                {check.problems.length ? <span className="text-[#7a4a37]"> · {check.problems.length} to fix first</span> : ''}
              </>
            ) : (
              `${rows.length} rows read`
            )}
          </div>
          {check?.problems.slice(0, 8).map((p) => (
            <div key={p.row} className="text-[13px] text-[#7a4a37]">
              Row {p.row + 1}
              {p.name ? ` (${p.name})` : ''}: {p.reason}
            </div>
          ))}
          <div className="flex flex-col max-h-[220px] overflow-y-auto text-[13px]">
            {rows.slice(0, 50).map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_120px_60px] gap-2 py-1 border-t border-[#ece3cc]">
                <span className="truncate">{r.people.join(' & ') || '—'}</span>
                <span>{r.phone ?? ''}</span>
                <span>{r.seats ?? r.people.length}</span>
              </div>
            ))}
          </div>
          <Pill kind="primary" className="self-start" disabled={busy || !check || !!check.problems.length || !check.wouldAdd} onClick={() => void add()}>
            {busy ? 'Adding…' : `Add ${check?.wouldAdd ?? 0} ${check?.wouldAdd === 1 ? 'invitation' : 'invitations'}`}
          </Pill>
        </div>
      )}
    </section>
  );
}
