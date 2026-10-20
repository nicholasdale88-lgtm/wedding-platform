import { SIGN_BORDERS, SIGN_FONTS, SIGN_SIZES, type SignBlock, type SignDesign, type SignLook, type Signage } from '@wp/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { plannerApi } from '../../lib/api';
import { useLiveDoc } from '../planner/useDocSave';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';
import { BLOCK_LABEL, blankDesign, BORDERS, drawSign, FONTS, fontsFor, imagesToPdf, newBlock, pageMm, renderPages, TEMPLATES, type Palette, type SignVars } from './kit';

/**
 * Wedding planner → Print → Signs: design any sign (the usual ones to start from, or your own), with a
 * live preview. Every word, size, font and colour can be changed; designs are kept as you go. Print it,
 * or save a print-ready PDF to your linked Google Drive, Dropbox or OneDrive (Photos → Linked storage).
 */
const WHERE: Record<string, string> = { gdrive: 'Google Drive', dropbox: 'Dropbox', onedrive: 'OneDrive' };
const label = 'flex flex-col gap-1 text-[12px] text-[#5b6a52]';

export function SignStudio({ palette, vars, tables }: { palette: Palette; vars: SignVars; tables: string[] }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const live = useLiveDoc<Signage>(wid, 'signage', '', toast);
  const [sel, setSel] = useState<string>('welcome');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState('');
  const [printing, setPrinting] = useState<{ urls: string[]; mm: [number, number] } | null>(null);
  const data = live.doc?.data;
  const tpl = TEMPLATES.find((t) => t.id === sel);
  const own = data?.own.find((o) => o.id === sel);
  const design: SignDesign = useMemo(() => data?.designs[sel] ?? tpl?.design() ?? blankDesign(), [data, sel, tpl]);
  const name = tpl?.name ?? own?.name ?? 'Sign';
  const pal: Palette = { paper: design.look.paper || palette.paper, ink: design.look.ink || palette.ink, accent: design.look.accent || palette.accent, soft: palette.soft };
  const pages: SignVars[] = tpl?.perTable ? (tables.length ? tables : ['1']).map((t) => ({ ...vars, table: t })) : [vars];
  const at = Math.min(page, pages.length - 1);

  // The preview: drawn again on every change, once the fonts are in.
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let off = false;
    void fontsFor(design).then(() => {
      const c = canvas.current;
      if (off || !c) return;
      const [mmW, mmH] = pageMm(design.look);
      const cssW = Math.min(440, c.parentElement?.clientWidth ?? 440);
      const pxPerMm = (cssW / mmW) * (window.devicePixelRatio || 1);
      c.width = Math.round(mmW * pxPerMm);
      c.height = Math.round(mmH * pxPerMm);
      c.style.width = `${cssW}px`;
      c.style.height = `${(cssW * mmH) / mmW}px`;
      drawSign(c.getContext('2d')!, design, pal, pages[at] ?? vars, pxPerMm);
    });
    return () => {
      off = true;
    };
  });

  if (live.error) return <p role="alert" className="text-[#7a4a37]">{live.error}</p>;
  if (!data) return <div aria-busy="true" className="text-[#5b6a52]">Loading your signs…</div>;

  const put = (next: SignDesign) => live.update((d) => ({ ...d, designs: { ...d.designs, [sel]: next } }));
  const setLook = (p: Partial<SignLook>) => put({ ...design, look: { ...design.look, ...p } });
  const setBlock = (i: number, p: Partial<SignBlock>) => put({ ...design, blocks: design.blocks.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const move = (i: number, by: number) => {
    const bs = [...design.blocks];
    const [x] = bs.splice(i, 1);
    bs.splice(Math.max(0, Math.min(bs.length, i + by)), 0, x!);
    put({ ...design, blocks: bs });
  };

  const print = async () => {
    setBusy('print');
    try {
      const out = await renderPages(design, pal, pages, design.look.size === 'A1' || design.look.size === 'A2' ? 120 : 200, 0.92);
      setPrinting({ urls: out.map((p) => p.url), mm: pageMm(design.look) });
    } finally {
      setBusy('');
    }
  };
  /** A print-ready PDF in the linked storage: as sharp as fits in 1.4 MB. */
  const save = async () => {
    setBusy('save');
    try {
      const mm = pageMm(design.look);
      let dpi = Math.min(200, Math.round(5200 / Math.max(...mm) * 25.4 / 2) || 150);
      let pdf: Uint8Array<ArrayBuffer> = new Uint8Array(0);
      for (let i = 0; i < 6; i++) {
        pdf = imagesToPdf(await renderPages(design, pal, pages, dpi, 0.85), mm[0], mm[1]);
        if (pdf.length < 1_400_000) break;
        dpi = Math.round(dpi * 0.78);
      }
      if (pdf.length >= 1_500_000) throw new Error('That sign is too big to save. Try fewer pages.');
      const file = new File([pdf], `${name}${tpl?.perTable ? ` (${pages.length})` : ''} ${design.look.size}.pdf`, { type: 'application/pdf' });
      const r = await plannerApi.uploadFile(wid, file);
      const where = r.where ?? '';
      live.update((d) => ({ ...d, saved: [{ id: r.id, sign: sel, name: r.name, at: new Date().toISOString(), where }, ...d.saved].slice(0, 100) }), true);
      toast(where ? `Saved to your ${WHERE[where] ?? 'linked storage'} ✓` : 'Saved here. Link Google Drive, Dropbox or OneDrive in Photos → Linked storage (planning files on) to save there.');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const addOwn = () => {
    const id = `own-${Date.now().toString(36)}`;
    live.update((d) => ({ ...d, own: [...d.own, { id, name: 'My sign' }], designs: { ...d.designs, [id]: blankDesign() } }), true);
    setSel(id);
  };
  const saved = data.saved.filter((s) => s.sign === sel);

  return (
    <section aria-label="Signs" className="flex flex-col gap-4">
      <div>
        <H2>Signs</H2>
        <div className="text-[13px] text-[#5b6a52]">Start from one of these, or make your own. Change any word, font, colour or size; it’s kept as you go.</div>
      </div>
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Sign">
        {[...TEMPLATES.map((t) => [t.id, t.name] as const), ...data.own.map((o) => [o.id, o.name] as const)].map(([k, n]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={sel === k}
            onClick={() => {
              setSel(k);
              setPage(0);
            }}
            className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${sel === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794]'}${data.designs[k] ? ' font-semibold' : ''}`}
          >
            {n}
          </button>
        ))}
        <button type="button" onClick={addOwn} className="py-[6px] px-3 rounded-full border border-dashed border-[#c6b794] bg-transparent text-[13px] cursor-pointer">
          + Your own sign
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] items-start">
        <div className="flex flex-col gap-3 items-center lg:sticky lg:top-4">
          <canvas ref={canvas} aria-label={`${name} preview`} className="shadow-[0_8px_28px_rgba(51,64,47,.22)] bg-white max-w-full" />
          {pages.length > 1 && (
            <div className="flex items-center gap-3 text-[13px]">
              <button type="button" disabled={at === 0} onClick={() => setPage(at - 1)} className="py-1 px-3 rounded-full border border-[#c6b794] bg-transparent cursor-pointer disabled:opacity-40">
                ‹
              </button>
              Table {pages[at]?.table} · {at + 1} of {pages.length}
              <button type="button" disabled={at === pages.length - 1} onClick={() => setPage(at + 1)} className="py-1 px-3 rounded-full border border-[#c6b794] bg-transparent cursor-pointer disabled:opacity-40">
                ›
              </button>
            </div>
          )}
          <div className="flex gap-2 flex-wrap justify-center">
            <Pill kind="primary" disabled={!!busy} onClick={() => void save()}>
              {busy === 'save' ? 'Saving…' : 'Save to Drive (PDF)'}
            </Pill>
            <Pill kind="outline" disabled={!!busy} onClick={() => void print()}>
              {busy === 'print' ? 'Getting it ready…' : `Print${pages.length > 1 ? ` all ${pages.length}` : ''}`}
            </Pill>
          </div>
          {saved.length > 0 && (
            <div className="w-full flex flex-col gap-1 text-[13px]">
              <span className="text-[12px] font-semibold tracking-[.12em] uppercase text-[#5b6a52]">Saved copies</span>
              {saved.slice(0, 5).map((s) => (
                <a key={s.id} href={plannerApi.fileUrl(wid, s.id)} target="_blank" rel="noopener" className="!text-[#33402f] truncate">
                  {s.name} · {new Date(s.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  {s.where ? ` · ${WHERE[s.where] ?? s.where}` : ''}
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {own && (
            <label className={label}>
              Sign name
              <input value={own.name} maxLength={80} onChange={(e) => live.update((d) => ({ ...d, own: d.own.map((o) => (o.id === sel ? { ...o, name: e.target.value } : o)) }))} className={inputCls} />
            </label>
          )}
          <fieldset className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] m-0">
            <legend className="px-1 text-[12px] font-semibold tracking-[.12em] uppercase text-[#5b6a52]">Look</legend>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
              <label className={label}>
                Paper
                <select value={design.look.size} onChange={(e) => setLook({ size: e.target.value as SignLook['size'] })} className={inputCls}>
                  {SIGN_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Way round
                <select value={design.look.landscape ? 'l' : 'p'} onChange={(e) => setLook({ landscape: e.target.value === 'l' })} className={inputCls}>
                  <option value="p">Portrait</option>
                  <option value="l">Landscape</option>
                </select>
              </label>
              <label className={label}>
                Border
                <select value={design.look.border} onChange={(e) => setLook({ border: e.target.value as SignLook['border'] })} className={inputCls}>
                  {SIGN_BORDERS.map((s) => (
                    <option key={s} value={s}>
                      {BORDERS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Big lines in
                <select value={design.look.heading} onChange={(e) => setLook({ heading: e.target.value as SignLook['heading'] })} className={inputCls}>
                  {SIGN_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {FONTS[f].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Words in
                <select value={design.look.body} onChange={(e) => setLook({ body: e.target.value as SignLook['body'] })} className={inputCls}>
                  {SIGN_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {FONTS[f].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Lined up
                <select value={`${design.look.align}-${design.look.valign}`} onChange={(e) => {
                  const [align, valign] = e.target.value.split('-') as [SignLook['align'], SignLook['valign']];
                  setLook({ align, valign });
                }} className={inputCls}>
                  <option value="center-middle">Centred</option>
                  <option value="center-top">Centred, from the top</option>
                  <option value="left-middle">Left</option>
                  <option value="left-top">Left, from the top</option>
                </select>
              </label>
            </div>
            <div className="flex gap-4 flex-wrap items-center text-[13px] text-[#5b6a52]">
              {(
                [
                  ['paper', 'Paper'],
                  ['ink', 'Words'],
                  ['accent', 'Accent'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="color" aria-label={`${l} colour`} value={pal[k]} onChange={(e) => setLook(k === 'paper' ? { paper: e.target.value } : k === 'ink' ? { ink: e.target.value } : { accent: e.target.value })} className="w-9 h-9 p-0 border border-[#d3c6a4] rounded-[8px] bg-transparent cursor-pointer" />
                  {l}
                </label>
              ))}
              {(design.look.paper || design.look.ink || design.look.accent) && (
                <button type="button" onClick={() => setLook({ paper: '', ink: '', accent: '' })} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
                  Use my invitation’s colours
                </button>
              )}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] m-0">
            <legend className="px-1 text-[12px] font-semibold tracking-[.12em] uppercase text-[#5b6a52]">Words, top to bottom</legend>
            <p className="m-0 text-[12px] text-[#7a7466]">
              Filled in for you: {'{name1}'} {'{name2}'} {'{couple}'} {'{date}'} {'{venue}'} {'{website}'} {'{photos}'} (the photo QR link)
              {tpl?.perTable ? ' {table}' : ''} {'{timeline}'}
            </p>
            {design.blocks.map((x, i) => (
              <div key={x.id} className="flex flex-col gap-2 py-2 border-t border-[#ece3cd]">
                <div className="flex items-center gap-2 text-[12px] text-[#5b6a52]">
                  <strong className="font-semibold text-[#33402f]">{BLOCK_LABEL[x.kind]}</strong>
                  <span className="flex-1" />
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="w-7 h-7 rounded-full border border-[#c6b794] bg-transparent cursor-pointer disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === design.blocks.length - 1} onClick={() => move(i, 1)} className="w-7 h-7 rounded-full border border-[#c6b794] bg-transparent cursor-pointer disabled:opacity-30">
                    ↓
                  </button>
                  <button type="button" aria-label={`Remove ${BLOCK_LABEL[x.kind]}`} onClick={() => put({ ...design, blocks: design.blocks.filter((_, j) => j !== i) })} className="w-7 h-7 rounded-full border border-[#c6b794] bg-transparent cursor-pointer text-[#7a4a37]">
                    ×
                  </button>
                </div>
                {(x.kind === 'text' || x.kind === 'list') && (
                  <textarea rows={x.kind === 'list' ? 4 : 2} value={x.text} maxLength={1200} onChange={(e) => setBlock(i, { text: e.target.value })} className={`${inputCls} resize-y`} />
                )}
                {(x.kind === 'heading' || x.kind === 'small' || x.kind === 'qr') && (
                  <input value={x.text} maxLength={300} placeholder={x.kind === 'qr' ? 'A link, e.g. {website}' : ''} onChange={(e) => setBlock(i, { text: e.target.value })} className={inputCls} />
                )}
                {x.kind !== 'space' && (
                  <div className="flex gap-3 flex-wrap items-center text-[12px] text-[#5b6a52]">
                    <label className="flex items-center gap-2 flex-1 min-w-[160px]">
                      Size
                      <input type="range" min={0.3} max={x.kind === 'heading' ? 2.5 : 4} step={0.05} value={x.size} onChange={(e) => setBlock(i, { size: Number(e.target.value) })} className="flex-1 accent-[#5d6b47]" />
                    </label>
                    {x.kind !== 'rule' && x.kind !== 'qr' && (
                      <>
                        <select aria-label="Font" value={x.font} onChange={(e) => setBlock(i, { font: e.target.value as SignBlock['font'] })} className={`${inputCls} py-[4px] text-[12px]`}>
                          <option value="">The sign’s font</option>
                          {SIGN_FONTS.map((f) => (
                            <option key={f} value={f}>
                              {FONTS[f].label}
                            </option>
                          ))}
                        </select>
                        <select aria-label="Colour" value={x.colour} onChange={(e) => setBlock(i, { colour: e.target.value as SignBlock['colour'] })} className={`${inputCls} py-[4px] text-[12px]`}>
                          <option value="">Words colour</option>
                          <option value="accent">Accent colour</option>
                          <option value="soft">Softer</option>
                        </select>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={x.italic} onChange={() => setBlock(i, { italic: !x.italic })} className="accent-[#5d6b47]" />
                          Italic
                        </label>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className="flex gap-2 flex-wrap pt-1">
              {(['heading', 'small', 'text', 'list', 'rule', 'qr', 'space'] as const).map((k) => (
                <Pill key={k} kind="dashed" size="sm" onClick={() => put({ ...design, blocks: [...design.blocks, newBlock(k)] })}>
                  + {BLOCK_LABEL[k]}
                </Pill>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-4 flex-wrap text-[13px]">
            {tpl && data.designs[sel] && (
              <button type="button" onClick={() => live.update((d) => ({ ...d, designs: Object.fromEntries(Object.entries(d.designs).filter(([k]) => k !== sel)) }), true)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                Start this sign again
              </button>
            )}
            {own && (
              <button
                type="button"
                onClick={() => {
                  live.update((d) => ({ ...d, own: d.own.filter((o) => o.id !== sel), designs: Object.fromEntries(Object.entries(d.designs).filter(([k]) => k !== sel)) }), true);
                  setSel('welcome');
                }}
                className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]"
              >
                Delete this sign
              </button>
            )}
            {live.pending && <span className="text-[#7a7466]">Saving…</span>}
          </div>
        </div>
      </div>

      {printing && <PrintImages urls={printing.urls} mm={printing.mm} onClose={() => setPrinting(null)} />}
    </section>
  );
}

/** The pages, full size, ready to print (only the pages print). */
function PrintImages({ urls, mm, onClose }: { urls: string[]; mm: [number, number]; onClose: () => void }) {
  useEffect(() => {
    document.documentElement.classList.add('printing');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('printing');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const css = `
@media print {
  @page signpage { size: ${mm[0]}mm ${mm[1]}mm; margin: 0; }
  html.printing body * { visibility: hidden !important; }
  html.printing .sp-root, html.printing .sp-root * { visibility: visible !important; }
  html.printing .sp-root { position: absolute !important; inset: 0 !important; overflow: visible !important; background: none !important; }
  html.printing .sp-bar { display: none !important; }
  html.printing .sp-pages { padding: 0 !important; gap: 0 !important; }
  .sp-page { box-shadow: none !important; page: signpage; break-after: page; }
}`;
  return (
    <div className="sp-root fixed inset-0 z-[80] overflow-auto bg-[#77786f]" role="dialog" aria-modal="true" aria-label="Print preview">
      <style>{css}</style>
      <div className="sp-bar sticky top-0 z-10 flex justify-between items-center gap-3 py-3 px-5 bg-[#33402f] text-[#f3ecd6]">
        <span className="text-[14px]">
          {urls.length} {urls.length === 1 ? 'page' : 'pages'}, {mm[0]} × {mm[1]} mm. Print, or choose “Save as PDF”.
        </span>
        <span className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="py-2 px-4 rounded-full border-0 bg-[#f3ecd6] text-[#33402f] text-[14px] font-medium cursor-pointer">
            Print
          </button>
          <button type="button" onClick={onClose} className="py-2 px-4 rounded-full border border-[#f3ecd6] bg-transparent text-[#f3ecd6] text-[14px] cursor-pointer">
            Close
          </button>
        </span>
      </div>
      <div className="sp-pages flex flex-col items-center gap-6 py-6">
        {urls.map((u, i) => (
          <img key={i} src={u} alt={`Page ${i + 1}`} className="sp-page block shadow-[0_6px_24px_rgba(0,0,0,.25)]" style={{ width: `${mm[0]}mm`, height: `${mm[1]}mm`, maxWidth: 'none' }} />
        ))}
      </div>
    </div>
  );
}
