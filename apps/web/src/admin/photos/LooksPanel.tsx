import { useEffect, useRef, useState } from 'react';
import { drawFilter, FILTER_LABEL, filterFontsReady, filtersFor, type FilterInfo, type FilterKey } from '../../guest/photos/filters';
import { LOOK_KEYS, LOOKS, type LookKey } from '../../guest/photos/looks';
import { themeOf } from '../../guest/themeKit';
import { photosApi, type PhotoLooksCfg } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Pill, useToast } from '../ui';

const SAMPLE = '/seed-media/lookout.jpg';

/** One frame drawn over the sample photo, as guests will see it. */
function FramePreview({ img, k, info }: { img: HTMLImageElement | null; k: FilterKey; info: FilterInfo }) {
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const g = c.current?.getContext('2d');
    if (!g || !c.current) return;
    const s = c.current.width;
    g.fillStyle = '#d9cfb8';
    g.fillRect(0, 0, s, s);
    if (img) {
      const k2 = Math.max(s / img.width, s / img.height);
      g.drawImage(img, (s - img.width * k2) / 2, (s - img.height * k2) / 2, img.width * k2, img.height * k2);
    }
    drawFilter(g, s, s, k, info);
  }, [img, k, info]);
  return <canvas ref={c} width={360} height={360} className="w-full aspect-square rounded-[10px]" aria-label={`${FILTER_LABEL[k]} frame`} />;
}

/**
 * Photos → Frames and looks: every frame drawn on a sample photo with your names, and every look; tick
 * the ones guests are offered and choose the look they start on.
 */
export function LooksPanel() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const [cfg, setCfg] = useState<PhotoLooksCfg | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    photosApi.looks(wid).then(setCfg, () => setCfg({}));
    void filterFontsReady();
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = SAMPLE;
  }, [wid]);
  if (!cfg || !overview) return null;
  const first = overview.events[0];
  const th = themeOf(overview.wedding.theme);
  const info: FilterInfo = {
    title: first?.name ?? 'The wedding',
    date: first ? new Date(first.startsAt).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '',
    couple: `${overview.wedding.name1.split(' ')[0]} & ${overview.wedding.name2.split(' ')[0]}`,
    monogram: overview.wedding.monogram?.trim() || `${overview.wedding.name1.charAt(0)}&${overview.wedding.name2.charAt(0)}`,
    ink: th.dg ?? '#33402f',
    gold: th.acc ?? '#c8a46a',
    slot: 0,
  };
  const frames = filtersFor(info).filter((f) => f !== 'none');
  const onFrames = cfg.frames ?? frames;
  const onLooks = cfg.looks ?? LOOK_KEYS.filter((k) => k !== 'original');
  const def = (cfg.def ?? 'original') as LookKey;
  const save = async (next: Required<PhotoLooksCfg>) => {
    setCfg(next);
    try {
      await photosApi.setLooks(wid, next);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const all = { frames: onFrames, looks: onLooks, def };
  const toggle = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  return (
    <section aria-label="Frames and looks" className="flex flex-col gap-3 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <strong className="font-semibold text-[15px]">Frames and looks</strong>
          <p className="m-0 mt-1 text-[13px] text-[#5b6a52]">
            Guests choose a frame (your names, wax seal, Polaroid…) and a look (golden hour, film, black and white…) for each photo or video. {onFrames.length} frames and {onLooks.length} looks on offer.
          </p>
        </div>
        <Pill kind={open ? 'secondary' : 'outline'} onClick={() => setOpen(!open)}>
          {open ? 'Done' : 'Choose'}
        </Pill>
      </div>
      {open && (
        <>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {frames.map((f) => {
              const on = onFrames.includes(f);
              return (
                <label key={f} className={`flex flex-col gap-1 p-2 rounded-[12px] border cursor-pointer ${on ? 'border-[#5d6b47] bg-white' : 'border-[#e2d7bc] opacity-60'}`}>
                  <FramePreview img={img} k={f} info={info} />
                  <span className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={on} onChange={() => void save({ ...all, frames: toggle(onFrames, f) })} className="accent-[#5d6b47]" />
                    {FILTER_LABEL[f]}
                  </span>
                </label>
              );
            })}
          </div>
          <div className="grid gap-3 grid-cols-3 sm:grid-cols-4 lg:grid-cols-8">
            {LOOK_KEYS.filter((k) => k !== 'original').map((k) => {
              const on = onLooks.includes(k);
              return (
                <label key={k} className={`flex flex-col gap-1 p-1 rounded-[10px] border cursor-pointer ${on ? 'border-[#5d6b47] bg-white' : 'border-[#e2d7bc] opacity-60'}`}>
                  <img src={SAMPLE} alt="" className="w-full aspect-square object-cover rounded-[8px]" style={{ filter: LOOKS[k].css }} />
                  <span className="flex items-center gap-1 text-[12px]">
                    <input type="checkbox" checked={on} onChange={() => void save({ ...all, looks: toggle(onLooks, k) })} className="accent-[#5d6b47]" />
                    {LOOKS[k].label}
                  </span>
                </label>
              );
            })}
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            Guests start on
            <select value={def} onChange={(e) => void save({ ...all, def: e.target.value })} className="py-[6px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[14px]">
              {(['original', ...onLooks] as LookKey[]).map((k) => (
                <option key={k} value={k}>
                  {LOOKS[k].label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </section>
  );
}
