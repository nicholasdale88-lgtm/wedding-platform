import { useState } from 'react';
import { api, type EventInfo, type ImportResult } from '../lib/api';
import { parseTable } from '../lib/csv';
import { readTableFile } from '../lib/xlsx';
import { downloadDressed } from './exportLook';
import { templateSheet, toImportRows, type ImportRow } from './guestImport';
import { useAdmin } from './Shell';
import { inputCls, Pill, useToast } from './ui';

/**
 * Guests → Import: drop a CSV, or copy the rows straight out of Excel or Google Sheets and paste.
 * Shows exactly what will happen (a dry run on the server) before anyone is added.
 */
export function ImportGuests({ events, onClose, onDone, focus }: { events: EventInfo[]; onClose: () => void; onDone: () => Promise<void>; focus?: EventInfo }) {
  const { wid, overview } = useAdmin();
  // From inside an event: rows that don't say which events default to this one (or every event, if chosen).
  const [onlyFocus, setOnlyFocus] = useState(!!focus);
  const scoped = (rs: ImportRow[]) => (focus && onlyFocus ? rs.map((r) => (r.invited?.length ? r : { ...r, invited: [focus.key] })) : rs);
  const toast = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [result, setCheckResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  /** Read rows (from a file or pasted text), then ask the server what would happen. */
  const check = async (table: string[][]) => {
    const { rows: parsed } = toImportRows(table, events);
    setRows(parsed);
    setCheckResult(null);
    if (!parsed.length) return;
    try {
      setCheckResult(await api.importGuests(wid, scoped(parsed), true));
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const read = async (t: string) => {
    setText(t);
    await check(parseTable(t));
  };
  const readFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return toast('That file is over 5 MB. Keep just the guest list sheet and try again.');
    try {
      setText('');
      await check(await readTableFile(file, parseTable));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const add = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const r = await api.importGuests(wid, scoped(rows), false);
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
        One row per invitation. Columns we understand: <strong>Name</strong> (put partners in the same cell with &amp;, or in their own columns), <strong>Mobile</strong>, <strong>Seats</strong>, <strong>Group</strong> (e.g. a side or the wedding party), and a yes/no column for each event (
        {events.map((e) => e.name).join(', ')}). {focus ? '' : 'Leave the event columns out to invite everyone to everything.'}
      </p>
      {focus && (
        <div role="radiogroup" aria-label="Invite them to" className="flex gap-2 flex-wrap items-center text-[14px]">
          <span className="text-[#5b6a52]">Rows without event columns are invited to</span>
          {(
            [
              [true, focus.name],
              [false, 'every event'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={onlyFocus === v}
              onClick={() => {
                setOnlyFocus(v);
                setCheckResult(null);
              }}
              className={`py-[6px] px-3 rounded-full border cursor-pointer ${onlyFocus === v ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794] text-[#33402f]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-3 flex-wrap items-center">
        <label className="py-[10px] px-[18px] rounded-full border border-[#c6b794] text-[14px] font-medium cursor-pointer hover:bg-[#efe7d3]">
          Choose an Excel or CSV file
          <input type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readFile(f); }} />
        </label>
        <Pill kind="dashed" onClick={() => void downloadDressed(wid, overview, 'guest-list-template.xlsx', 'Guest list template', [templateSheet(events)])}>
          Download a template
        </Pill>
        <span className="text-[13px] text-[#7a7466]">or copy rows from your spreadsheet and paste below</span>
      </div>
      <textarea rows={5} value={text} onChange={(e) => void read(e.target.value)} placeholder={'Name\tMobile\tSeats\nAlex & Sam Lee\t0412 345 678\t2'} aria-label="Paste guests" className={`${inputCls} font-mono !text-[13px] resize-y`} />

      {rows && (
        <div className="flex flex-col gap-2">
          <div className="text-[14px]">
            {result ? (
              <>
                <strong className="font-semibold">{result.wouldAdd}</strong> new {result.wouldAdd === 1 ? 'invitation' : 'invitations'} to add
                {result.skipped.length ? `, ${result.skipped.length} already on your list (skipped)` : ''}
                {result.problems.length ? <span className="text-[#7a4a37]"> · {result.problems.length} to fix first</span> : ''}
              </>
            ) : (
              `${rows.length} rows read`
            )}
          </div>
          {result?.problems.slice(0, 8).map((p) => (
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
          <Pill kind="primary" className="self-start" disabled={busy || !result || !!result.problems.length || !result.wouldAdd} onClick={() => void add()}>
            {busy ? 'Adding…' : `Add ${result?.wouldAdd ?? 0} ${result?.wouldAdd === 1 ? 'invitation' : 'invitations'}`}
          </Pill>
        </div>
      )}
    </section>
  );
}
