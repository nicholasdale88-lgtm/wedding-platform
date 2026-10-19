import { IDEA_CATEGORIES, type Ideas, type Pin } from '@wp/shared';
import { useRef, useState } from 'react';
import { paletteOf } from '../../guest/themeKit';
import { plannerApi } from '../../lib/api';
import { useUnsavedChanges } from '../leave';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';
import { useLiveDoc } from './useDocSave';

const newId = () => crypto.randomUUID().slice(0, 10);

/** A photo made small enough to keep (longest side 1600px, JPEG): a phone photo is far bigger than a board needs. */
async function shrink(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/**
 * Wedding planner → Ideas: a board of the looks you love (flowers, dresses, cake, styling), each with a
 * note, sorted by category, and the wedding's colours to send to your florist and stylist.
 */
export function IdeasBoard() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const live = useLiveDoc<Ideas>(wid, 'ideas', '', toast);
  useUnsavedChanges(live.pending);
  const [cat, setCat] = useState('All');
  const [busy, setBusy] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  if (live.error) return <p role="alert" className="text-[#7a4a37]">{live.error}</p>;
  if (!live.doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading your ideas…</div>;
  const d = live.doc.data;
  const shown = d.pins.filter((p) => cat === 'All' || (cat === 'Loved' ? p.love : p.cat === cat));
  const setPin = (id: string, p: Partial<Pin>, now = false) => live.set({ ...d, pins: d.pins.map((x) => (x.id === id ? { ...x, ...p } : x)) }, now);
  const upload = async (files: File[]) => {
    const into = cat === 'All' || cat === 'Loved' ? 'Styling' : cat;
    setBusy(files.length);
    const added: Pin[] = [];
    for (const f of files) {
      try {
        const small = await shrink(f);
        if (small.size > 1.5 * 1024 * 1024) throw new Error(`${f.name} is too big even made smaller.`);
        const r = await plannerApi.uploadFile(wid, small);
        added.push({ id: newId(), fileId: r.id, cat: into, note: '', love: false });
      } catch (e) {
        toast((e as Error).message);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (added.length) live.set({ ...d, pins: [...added, ...d.pins] }, true);
  };
  const theme = paletteOf(overview?.wedding.theme ?? '');
  const palette = d.palette.length ? d.palette : [theme.paper, theme.soft, theme.accent, theme.ink];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>Ideas</H2>
          <div className="text-[13px] text-[#5b6a52]">The looks you love, in one place to show your florist, stylist, cake maker and hairdresser.</div>
        </div>
        <Pill kind="primary" disabled={busy > 0} onClick={() => file.current?.click()}>
          {busy ? `Adding ${busy}…` : 'Add photos'}
        </Pill>
        <input
          ref={file}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (fs.length) void upload(fs.slice(0, 20));
          }}
        />
      </div>

      <section aria-label="Your colours" className="flex items-center gap-3 flex-wrap p-3 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
        <strong className="text-[14px] font-semibold">Your colours</strong>
        {palette.map((c, i) => (
          <label key={i} className="relative">
            <input
              type="color"
              aria-label={`Colour ${i + 1}`}
              value={c}
              onChange={(e) => live.set({ ...d, palette: palette.map((x, j) => (j === i ? e.target.value : x)) })}
              className="w-10 h-10 p-0 border-2 border-white rounded-full shadow-[0_0_0_1px_#d3c6a4] cursor-pointer"
            />
          </label>
        ))}
        {palette.length < 8 && (
          <button type="button" onClick={() => live.set({ ...d, palette: [...palette, '#ffffff'] }, true)} className="w-10 h-10 rounded-full border border-dashed border-[#c6b794] bg-transparent cursor-pointer text-[18px]">
            +
          </button>
        )}
        <button type="button" onClick={() => void navigator.clipboard?.writeText(palette.join(', ')).then(() => toast('Colours copied'))} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
          Copy for a vendor
        </button>
        {!d.palette.length && <span className="text-[12px] text-[#7a7466]">From your invitation’s theme until you change them.</span>}
      </section>

      <div role="radiogroup" aria-label="Show" className="flex gap-2 flex-wrap">
        {['All', 'Loved', ...IDEA_CATEGORIES].map((k) => {
          const n = k === 'All' ? d.pins.length : k === 'Loved' ? d.pins.filter((p) => p.love).length : d.pins.filter((p) => p.cat === k).length;
          if (n === 0 && k !== 'All' && k !== cat) return null;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={cat === k}
              onClick={() => setCat(k)}
              className={`py-[5px] px-3 rounded-full border text-[13px] cursor-pointer ${cat === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794]'}`}
            >
              {k === 'Loved' ? '♥ Loved' : k} · {n}
            </button>
          );
        })}
      </div>

      {shown.length ? (
        <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [column-fill:_balance]">
          {shown.map((p) => (
            <figure key={p.id} className="m-0 mb-3 break-inside-avoid flex flex-col gap-1 p-2 rounded-[14px] border border-[#e2d7bc] bg-white">
              {p.fileId && <img src={plannerApi.fileUrl(wid, p.fileId)} alt={p.note || p.cat} loading="lazy" className="w-full rounded-[10px]" />}
              <div className="flex items-center gap-1">
                <button type="button" aria-pressed={p.love} aria-label={p.love ? 'Loved' : 'Love it'} onClick={() => setPin(p.id, { love: !p.love }, true)} className={`p-0 border-0 bg-transparent cursor-pointer text-[18px] ${p.love ? 'text-[#a5533c]' : 'text-[#c6b794]'}`}>
                  ♥
                </button>
                <select aria-label="Category" value={p.cat} onChange={(e) => setPin(p.id, { cat: e.target.value }, true)} className={`${inputCls} !py-1 !text-[12px] flex-1 min-w-0`}>
                  {IDEA_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button type="button" aria-label="Remove" onClick={() => live.set({ ...d, pins: d.pins.filter((x) => x.id !== p.id) }, true)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px]">
                  ×
                </button>
              </div>
              <input aria-label="Note" placeholder="Why you love it" value={p.note} maxLength={300} onChange={(e) => setPin(p.id, { note: e.target.value })} className="bg-transparent border-0 p-0 text-[13px] text-[#5b6a52]" />
            </figure>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 p-5 rounded-[16px] border border-dashed border-[#c6b794] bg-[#fbf8f0]">
          <strong className="font-display text-[22px] font-medium">{d.pins.length ? 'Nothing here yet' : 'Start your board'}</strong>
          <p className="m-0 text-[14px] text-[#5b6a52]">Add screenshots and photos of what you love: bouquets, dresses, table settings, cakes. They’re made small and kept with your planning files.</p>
        </div>
      )}
    </div>
  );
}
