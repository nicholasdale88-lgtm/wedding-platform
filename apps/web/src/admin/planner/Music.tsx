import { useCallback, useEffect, useState } from 'react';
import { songsApi, type SongRow } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Wedding planner → Music: guests' song requests (with who asked) and your own picks, each marked must
 * play, maybe or don't play, then downloaded as a list for the DJ or band.
 */

const STATUS: [SongRow['status'], string][] = [
  ['must', 'Must play'],
  ['maybe', 'Maybe'],
  ['no', 'Don’t play'],
  ['new', 'Not decided'],
];
const COLOUR: Record<SongRow['status'], string> = { must: '#dfe5cc', maybe: '#f1e7c9', no: '#f1e1d6', new: '#e9e2cc' };

export function Music() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  const [error, setError] = useState('');
  const [add, setAdd] = useState({ title: '', artist: '', status: 'must' as 'must' | 'maybe' | 'no' });

  const load = useCallback(async () => {
    try {
      setSongs((await songsApi.list(wid)).songs);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!songs) return <div aria-busy="true" className="text-[#5b6a52]">Loading songs…</div>;
  const act = async (fn: () => Promise<{ songs: SongRow[] }>, done?: string) => {
    try {
      setSongs((await fn()).songs);
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  /** A plain list the DJ can open anywhere (CSV for a spreadsheet, grouped). */
  const download = () => {
    const rows = [['List', 'Song', 'Artist', 'Asked for by', 'Note']];
    for (const [st, label] of STATUS) for (const s of songs.filter((x) => x.status === st)) rows.push([label, s.title, s.artist, s.by, s.note]);
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv' }));
    a.download = `${(overview?.wedding.slug ?? 'wedding').replace(/[^\w-]/g, '')}-songs.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>Music</H2>
          <div className="text-[13px] text-[#5b6a52]">Guests request songs from “Message us” on their invitation. Decide what the DJ plays.</div>
        </div>
        <Pill kind="primary" disabled={!songs.length} onClick={download}>
          Download for the DJ
        </Pill>
      </div>

      <form
        className="flex gap-2 flex-wrap items-end p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!add.title.trim()) return;
          void act(() => songsApi.add(wid, add.title.trim(), add.artist.trim(), add.status), 'Added');
          setAdd({ ...add, title: '', artist: '' });
        }}
      >
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] flex-1 min-w-[160px]">
          Song
          <input value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} placeholder="e.g. your first dance" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] flex-1 min-w-[140px]">
          Artist
          <input value={add.artist} onChange={(e) => setAdd({ ...add, artist: e.target.value })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          List
          <select value={add.status} onChange={(e) => setAdd({ ...add, status: e.target.value as 'must' | 'maybe' | 'no' })} className={inputCls}>
            <option value="must">Must play</option>
            <option value="maybe">Maybe</option>
            <option value="no">Don’t play</option>
          </select>
        </label>
        <Pill type="submit" kind="outline" disabled={!add.title.trim()}>
          Add
        </Pill>
      </form>

      {STATUS.map(([st, label]) => {
        const list = songs.filter((s) => s.status === st);
        if (!list.length) return null;
        return (
          <section key={st} aria-label={label} className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52] pb-1">
              {label} · {list.length}
            </div>
            {list.map((s) => (
              <div key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-2 px-3 rounded-[12px] border border-[#e2d7bc]" style={{ background: COLOUR[s.status] }}>
                <span className="min-w-0">
                  <span className="block font-medium truncate">
                    {s.title}
                    {s.artist && <span className="font-normal text-[#5b6a52]"> · {s.artist}</span>}
                  </span>
                  <span className="block text-[12px] text-[#5b6a52] truncate">{[s.by === 'You' ? 'Your pick' : `Asked for by ${s.by}`, s.note].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="flex gap-1 flex-wrap justify-end">
                  {STATUS.filter(([k]) => k !== 'new' && k !== s.status).map(([k, l]) => (
                    <button key={k} type="button" onClick={() => void act(() => songsApi.mark(wid, s.id, k))} className="py-[3px] px-2 rounded-full border border-[#c6b794] bg-white text-[12px] cursor-pointer">
                      {l}
                    </button>
                  ))}
                  <button type="button" aria-label={`Remove ${s.title}`} onClick={() => void act(() => songsApi.remove(wid, s.id))} className="py-[3px] px-2 rounded-full border-0 bg-transparent text-[14px] cursor-pointer text-[#7a4a37]">
                    ×
                  </button>
                </span>
              </div>
            ))}
          </section>
        );
      })}
      {!songs.length && <p className="m-0 text-[14px] text-[#5b6a52]">No songs yet. Add your must-plays (first dance, entrance, last song), and guests' requests will show up here.</p>}
    </div>
  );
}
