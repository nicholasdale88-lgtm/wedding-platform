import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Me } from './api';
import { placesOf, rememberPlace, type Place } from './places';

/** The signed-in account, asked once per visit (every header shares it). */
let meCache: Promise<Me | null> | null = null;
export const resetMeCache = () => {
  meCache = null;
};

/**
 * "Switch to…": the other places this account can go (another wedding, the company portal, a vendor
 * listing), from any header. Shown only when there's somewhere else to go.
 */
export function ProfileSwitch({ here, tone = 'dark' }: { here: Place['kind'] | string; tone?: 'dark' | 'light' }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    meCache ??= api.me().catch(() => null);
    let live = true;
    void meCache.then((m) => live && m && setPlaces(placesOf(m)));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  // `here` is a place key (w:<id>, company, vendor) or a kind.
  const others = places.filter((p) => p.key !== here && p.kind !== here);
  if (!others.length) return null;
  const dark = tone === 'dark';
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${dark ? 'border-[rgba(243,236,214,.35)] bg-transparent text-[#f3ecd6]' : 'border-[#c6b794] bg-white text-[#33402f]'}`}
      >
        Switch to… ▾
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-[30] min-w-[240px] flex flex-col p-2 rounded-[14px] bg-[#fbf8f2] border border-[#e2d7bc] shadow-[0_10px_28px_rgba(0,0,0,.18)] text-left">
          {others.map((p) => (
            <Link key={p.key} role="menuitem" to={p.to} onClick={() => rememberPlace(p.key)} className="flex flex-col py-2 px-3 rounded-[10px] no-underline hover:bg-[#efe7d3] !text-[#33402f]">
              <span className="text-[15px] font-semibold">{p.title}</span>
              <span className="text-[12px] text-[#5b6a52]">{p.detail}</span>
            </Link>
          ))}
          <Link role="menuitem" to="/admin?choose=1" className="mt-1 pt-2 px-3 pb-1 border-t border-[#e2d7bc] text-[13px] underline !text-[#5b6a52]">
            All my places
          </Link>
        </div>
      )}
    </div>
  );
}
