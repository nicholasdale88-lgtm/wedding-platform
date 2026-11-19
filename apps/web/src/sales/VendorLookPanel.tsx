import { DEFAULT_VENDOR_LOOK, VENDOR_MENU, type VendorLook, type VendorMenuKey } from '@wp/shared';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { directoryApi } from '../lib/api';
import { base64Of, logoImage } from '../lib/shrinkFile';
import { coloursOf, PLACE_LABEL, VENDOR_COLOURS, VendorLogo } from './VendorShell';

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";
const card = 'flex flex-col gap-3 p-5 rounded-[18px] bg-[#fbf8f0] border border-[#e2d7bc]';
const chip = 'min-h-[44px] px-4 rounded-full border text-[14px] cursor-pointer inline-flex items-center gap-2';
const ALWAYS: VendorMenuKey[] = ['home', 'listing'];

/**
 * Your look: their logo, their colours (a set or their own brand colour), a dark or light menu, roomy or compact,
 * the line under their name, and which places show in the menu and on their phone's bottom bar. Every choice
 * shows straight away in their menu; Save keeps it.
 */
export function VendorLookPanel({
  name,
  logo,
  saved,
  onPreview,
  onSaved,
  onLogo,
}: {
  name: string;
  logo?: string;
  saved: VendorLook;
  onPreview: (look: VendorLook) => void;
  onSaved: (look: VendorLook) => void;
  onLogo: (url: string | undefined) => void;
}) {
  const [look, setLook] = useState<VendorLook>(saved);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoNote, setLogoNote] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(look) !== JSON.stringify(saved);
  const c = coloursOf(look);
  const put = (patch: Partial<VendorLook>) => {
    const next = { ...look, ...patch };
    setLook(next);
    onPreview(next);
    setNote('');
  };
  const save = async () => {
    setBusy(true);
    setNote('');
    try {
      const r = await directoryApi.setLook(look);
      onSaved(r.look);
      setLook(r.look);
      setNote('Saved. Your account looks like this on every device.');
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setLogoBusy(true);
    setLogoNote('');
    try {
      const img = await logoImage(f);
      const r = await directoryApi.setLogo(img.type, await base64Of(new File([img.blob], 'logo', { type: img.type })));
      onLogo(r.logo);
      setLogoNote('Logo added. It shows in your menu and on your directory page.');
    } catch (e) {
      setLogoNote((e as Error).message);
    } finally {
      setLogoBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  const remove = async () => {
    setLogoBusy(true);
    try {
      await directoryApi.removeLogo();
      onLogo(undefined);
      setLogoNote('Logo taken off: your initials show instead.');
    } catch (e) {
      setLogoNote((e as Error).message);
    } finally {
      setLogoBusy(false);
    }
  };
  const on = (yes: boolean): CSSProperties => (yes ? { background: INK, color: '#fbf8f2', borderColor: INK } : { background: '#fff', color: INK, borderColor: '#c6b794' });
  const choice = <T extends string | boolean>(value: T, options: [T, string][], set: (v: T) => void, label: string) => (
    <div role="radiogroup" aria-label={label} className="flex gap-2 flex-wrap">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => set(v)} className={chip} style={on(value === v)}>
          {l}
        </button>
      ))}
    </div>
  );
  const showsInMenu = (k: VendorMenuKey) => !look.hidden.includes(k);
  const toggleShown = (k: VendorMenuKey) => {
    const hidden = showsInMenu(k) ? [...look.hidden, k] : look.hidden.filter((x) => x !== k);
    put({ hidden, bar: look.bar.filter((x) => !hidden.includes(x)) });
  };
  const toggleBar = (k: VendorMenuKey) => {
    if (look.bar.includes(k)) return put({ bar: look.bar.filter((x) => x !== k) });
    if (look.bar.length >= 4) return setNote('Your phone’s bar holds four: take one off first.');
    put({ bar: VENDOR_MENU.filter((x) => x === k || look.bar.includes(x)) });
  };

  return (
    <div className="flex flex-col gap-5 max-w-[860px]">
      <p className="m-0 text-[15px]" style={{ color: SOFT }}>
        Make your account yours: your logo, your colours, and the places you use most. Changes show in your menu straight away; tap Save to keep them.
      </p>

      <Section title="Your logo" note="PNG, JPEG or WebP. A see-through background looks best. It shows in your menu and on your directory page.">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="p-4 rounded-[16px]" style={{ background: c.side }}>
            <VendorLogo src={logo} name={name} shape={look.logoShape} size={64} accent={c.accent} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="vendor-logo-file" onChange={(e) => void upload(e.target.files?.[0])} />
            <label htmlFor="vendor-logo-file" className={`${chip} font-semibold ${logoBusy ? 'opacity-60 pointer-events-none' : ''}`} style={on(true)}>
              {logoBusy ? 'Working…' : logo ? 'Change logo' : 'Add your logo'}
            </label>
            {logo && (
              <button type="button" disabled={logoBusy} onClick={() => void remove()} className={chip} style={on(false)}>
                Take it off
              </button>
            )}
          </div>
        </div>
        {logoNote && (
          <p role="status" className="m-0 text-[14px]">
            {logoNote}
          </p>
        )}
        <span className="text-[14px] font-semibold">Logo shape</span>
        {choice(look.logoShape, [['square', 'Square'], ['round', 'Round'], ['wide', 'Wide']], (v) => put({ logoShape: v }), 'Logo shape')}
      </Section>

      <Section title="Your colours" note="A colour set, or your own brand colour. Writing on it is always kept easy to read.">
        <div role="radiogroup" aria-label="Colour set" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(VENDOR_COLOURS).map(([k, p]) => (
            <button key={k} type="button" role="radio" aria-checked={look.palette === k} onClick={() => put({ palette: k as VendorLook['palette'] })} className="flex items-center gap-2 p-2 min-h-[52px] rounded-[14px] border cursor-pointer text-left text-[14px]" style={{ background: '#fff', borderColor: look.palette === k ? INK : '#e2d7bc', boxShadow: look.palette === k ? `0 0 0 2px ${INK}` : undefined, color: INK }}>
              <span aria-hidden className="flex flex-none rounded-[10px] overflow-hidden w-10 h-8">
                <span className="flex-1" style={{ background: p.side }} />
                <span className="flex-1" style={{ background: p.accent }} />
                <span className="flex-1" style={{ background: p.tint }} />
              </span>
              {p.name}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-3 flex-wrap p-2 min-h-[52px] rounded-[14px] border cursor-pointer text-[14px] bg-white" style={{ borderColor: look.palette === 'custom' ? INK : '#e2d7bc', boxShadow: look.palette === 'custom' ? `0 0 0 2px ${INK}` : undefined }}>
          <input type="color" value={look.colour ?? '#7a5c3e'} onChange={(e) => put({ palette: 'custom', colour: e.target.value })} className="w-11 h-11 p-0 border-0 bg-transparent cursor-pointer" aria-label="Your own brand colour" />
          <span className="flex-1 min-w-[160px]">
            <strong className="block">Your own colour</strong>
            <span style={{ color: SOFT }}>{look.palette === 'custom' && look.colour ? look.colour.toUpperCase() : 'Pick your brand colour'}</span>
          </span>
        </label>
      </Section>

      <Section title="Your menu" note="How the menu down the side (on a computer) looks.">
        <span className="text-[14px] font-semibold">Menu colour</span>
        {choice(look.side, [['dark', 'Your colour'], ['light', 'Light']], (v) => put({ side: v }), 'Menu colour')}
        <span className="text-[14px] font-semibold">Spacing</span>
        {choice(look.compact, [[false, 'Roomy'], [true, 'Compact']], (v) => put({ compact: v }), 'Spacing')}
        <label className="flex flex-col gap-1 text-[14px] font-semibold">
          A line under your name
          <input
            value={look.tagline}
            maxLength={60}
            onChange={(e) => put({ tagline: e.target.value })}
            placeholder="Garden-style flowers, Sydney and the Blue Mountains"
            className="w-full py-[11px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px] font-normal"
          />
        </label>
      </Section>

      <Section title="Your places" note="Hide the ones you don’t use. Overview and Your listing always show. Pick up to four for your phone’s bottom bar; the rest are under More.">
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {VENDOR_MENU.map((k) => {
            const locked = ALWAYS.includes(k);
            const shown = showsInMenu(k);
            return (
              <li key={k} className="flex items-center gap-3 flex-wrap p-2 pl-4 rounded-[14px] bg-white border border-[#e8dfca]">
                <span className="flex-1 min-w-[140px] text-[15px]" style={{ color: shown ? INK : SOFT }}>
                  {PLACE_LABEL[k]}
                </span>
                <button type="button" aria-pressed={shown} disabled={locked} onClick={() => toggleShown(k)} className={`${chip} disabled:opacity-60 disabled:cursor-default`} style={on(shown)}>
                  {locked ? 'Always shows' : shown ? 'In the menu' : 'Hidden'}
                </button>
                <button type="button" aria-pressed={look.bar.includes(k)} disabled={!shown} onClick={() => toggleBar(k)} className={`${chip} disabled:opacity-40 disabled:cursor-default`} style={on(look.bar.includes(k))} aria-label={`${PLACE_LABEL[k]} on your phone’s bar`}>
                  {look.bar.includes(k) ? 'On phone bar ✓' : 'Phone bar'}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <div className="sticky bottom-[72px] lg:bottom-4 z-10 flex items-center gap-3 flex-wrap p-3 rounded-[16px] bg-[#fffdf8] border border-[#e2d7bc] shadow-[0_6px_20px_rgba(0,0,0,.08)]">
        <button type="button" disabled={!dirty || busy} onClick={() => void save()} className="min-h-[44px] py-2 px-6 rounded-full border-0 text-[16px] font-medium cursor-pointer disabled:opacity-60" style={{ background: INK, color: '#fbf8f2' }}>
          {busy ? 'Saving…' : dirty ? 'Save your look' : 'Saved'}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setLook(saved);
              onPreview(saved);
            }}
            className="min-h-[44px] px-3 border-0 bg-transparent underline cursor-pointer text-[15px]"
            style={{ color: INK }}
          >
            Undo changes
          </button>
        )}
        <button type="button" onClick={() => put({ ...DEFAULT_VENDOR_LOOK })} className="min-h-[44px] px-3 border-0 bg-transparent underline cursor-pointer text-[15px] ml-auto" style={{ color: SOFT }}>
          Back to the standard look
        </button>
        {note && (
          <p role="status" className="m-0 w-full text-[14px]">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={card}>
      <div>
        <h2 className="m-0 text-[26px] font-normal" style={{ fontFamily: serif, color: INK }}>
          {title}
        </h2>
        <p className="m-0 text-[14px]" style={{ color: SOFT }}>
          {note}
        </p>
      </div>
      {children}
    </section>
  );
}
