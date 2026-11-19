import { DEFAULT_VENDOR_LOOK, type VendorLook, type VendorMenuKey } from '@wp/shared';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ProfileSwitch } from '../lib/ProfileSwitch';
import { BRAND } from './SalesPage';

/**
 * A vendor's own account, in their colours with their logo: a menu down the side on a computer (grouped: Today,
 * Your work, Grow) and, on a phone, their logo at the top and a bottom bar of the four places they choose, with
 * everything else under More. The look is theirs to set under Your look (colours, a dark or light menu, roomy or
 * compact, the logo's shape, a line under their name, which places show).
 */

export type VendorPlace = VendorMenuKey | 'look';
const INK = '#33402f';
const serif = "'Cormorant Garamond', Georgia, serif";
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";

export const PLACE_LABEL: Record<VendorPlace, string> = {
  home: 'Overview',
  couples: 'Your couples',
  quotes: 'Quotes',
  enquiries: 'Enquiries',
  proposals: 'Proposals',
  calendar: 'Calendar',
  recommend: 'Recommend us',
  listing: 'Your listing',
  look: 'Your look',
};
/** Short names for the phone's bottom bar. */
const SHORT: Record<VendorPlace, string> = { ...PLACE_LABEL, couples: 'Couples', recommend: 'Recommend', listing: 'Listing', look: 'Look' };
const GROUPS: { name: string; keys: VendorPlace[] }[] = [
  { name: 'Today', keys: ['home'] },
  { name: 'Your work', keys: ['couples', 'quotes', 'enquiries', 'proposals', 'calendar'] },
  { name: 'Grow', keys: ['recommend', 'listing'] },
  { name: 'Your account', keys: ['look'] },
];
/** Places whose own page starts with its title: the bar above it shows the group only (the title stays for screen readers). */
const OWN_TITLE: VendorPlace[] = ['home', 'couples', 'quotes', 'enquiries', 'proposals', 'recommend'];
export const groupOf = (k: VendorPlace) => GROUPS.find((g) => g.keys.includes(k))?.name ?? '';

const ICON: Record<VendorPlace | 'more' | 'out' | 'page' | 'close', ReactNode> = {
  home: <path d="M4 11 12 4l8 7M6 9.5V20h4.5v-5h3v5H18V9.5" />,
  couples: <path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5M13.6 15.3c.6-.2 1.2-.3 1.9-.3 2.7 0 4.9 1.7 5.5 5" />,
  quotes: <path d="M7 3.5h7.5L19 8v12.5H7zM14 3.5V8h5M10 12.5h6M10 16h6" />,
  enquiries: <path d="M4 5.5h16v10H9l-5 4zM8 9.5h8M8 12.5h5" />,
  proposals: <path d="M5 4h14v16H5zM8.5 8.5h7M8.5 12h7M8.5 15.5h4M15 15.5l1.2 1.2 2.3-2.4" />,
  calendar: <path d="M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4M8 13.5h2M11 13.5h2M14 13.5h2M8 16.5h2M11 16.5h2" />,
  recommend: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  listing: <path d="M4 20V9l8-5 8 5v11zM9 20v-6h6v6M8.5 10.5h7" />,
  look: <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11h.01M10 7h.01M15 7.5h.01" />,
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
  out: <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />,
  page: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};
const Icon = ({ k, size = 20 }: { k: keyof typeof ICON; size?: number }) => (
  <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="flex-none">
    {ICON[k]}
  </svg>
);

// -------------------------------------------------------------------------------------------------- colours

/** Their colour sets: the menu's colour, a button colour and a soft highlight. */
export const VENDOR_COLOURS: Record<Exclude<VendorLook['palette'], 'custom'>, { name: string; side: string; accent: string; tint: string }> = {
  forest: { name: 'Forest', side: '#2c3828', accent: '#56653f', tint: '#e5ecd8' },
  midnight: { name: 'Midnight', side: '#1d2840', accent: '#3d5687', tint: '#dee5f2' },
  plum: { name: 'Plum', side: '#37222f', accent: '#7a3b4f', tint: '#f3e1e4' },
  clay: { name: 'Clay', side: '#45291f', accent: '#9c4e38', tint: '#f5e2d9' },
  ocean: { name: 'Ocean', side: '#1b3a3d', accent: '#2c7171', tint: '#daedeb' },
  charcoal: { name: 'Charcoal', side: '#242424', accent: '#52564c', tint: '#e8e8e2' },
  blush: { name: 'Blush', side: '#553640', accent: '#93545f', tint: '#f6e3e5' },
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
const mix = (hex: string, to: number, k: number) => hexOf(rgb(hex).map((v) => v + (to - v) * k));
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
/** Darker until white writing on it is easy to read (contrast 4.5 or more). */
const readableOn = (hex: string, limit: number) => {
  let c = hex;
  for (let i = 0; i < 20 && 1.05 / (lum(c) + 0.05) < limit; i++) c = mix(c, 0, 0.12);
  return c;
};
export function coloursOf(look: VendorLook) {
  if (look.palette === 'custom' && look.colour && /^#[0-9a-f]{6}$/i.test(look.colour)) {
    const accent = readableOn(look.colour.toLowerCase(), 4.6);
    return { side: readableOn(mix(accent, 0, 0.45), 11), accent, tint: mix(look.colour.toLowerCase(), 255, 0.86) };
  }
  return VENDOR_COLOURS[look.palette === 'custom' ? 'forest' : look.palette] ?? VENDOR_COLOURS.forest;
}

// ------------------------------------------------------------------------------------------------------ logo

const initials = (name: string) =>
  name
    .replace(/&/g, ' ')
    .split(/\s+/)
    .filter((w) => /^[\p{L}\p{N}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '·';

/** Their logo on a white tile (logos are made for white), or their initials in their colour. */
export function VendorLogo({ src, name, shape, size, accent }: { src?: string; name: string; shape: VendorLook['logoShape']; size: number; accent: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const wide = shape === 'wide' && src && !broken;
  const box: CSSProperties = { width: wide ? Math.round(size * 2.6) : size, height: size, borderRadius: shape === 'round' ? 999 : Math.round(size * 0.24) };
  if (!src || broken)
    return (
      <span aria-hidden className="flex-none inline-flex items-center justify-center font-semibold" style={{ ...box, background: accent, color: '#fbf8f2', fontFamily: serif, fontSize: Math.round(size * 0.42), boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.25)' }}>
        {initials(name)}
      </span>
    );
  return (
    <span className="flex-none inline-flex items-center justify-center bg-white overflow-hidden" style={{ ...box, padding: Math.round(size * 0.1), boxShadow: '0 1px 2px rgba(0,0,0,.18), 0 4px 12px rgba(0,0,0,.12)' }}>
      <img src={src} alt={`${name} logo`} onError={() => setBroken(true)} className="block max-w-full max-h-full object-contain" />
    </span>
  );
}

// ----------------------------------------------------------------------------------------------------- shell

export interface ShellListing {
  name: string;
  slug: string;
  category: string;
  logo?: string;
  pending?: boolean;
  hidden?: boolean;
}

export function VendorShell({
  listing,
  look = DEFAULT_VENDOR_LOOK,
  place,
  go,
  badges,
  onSignOut,
  children,
}: {
  listing: ShellListing;
  look?: VendorLook;
  place: VendorPlace;
  go: (k: VendorPlace) => void;
  badges: Partial<Record<VendorPlace, number>>;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [more, setMore] = useState(false);
  const c = coloursOf(look);
  const dark = look.side === 'dark';
  const title = PLACE_LABEL[place];
  useEffect(() => {
    document.title = `${title} · ${listing.name}`;
  }, [title, listing.name]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [place]);
  const shown = (k: VendorPlace) => k === 'home' || k === 'listing' || k === 'look' || !look.hidden.includes(k);
  const groups = GROUPS.map((g) => ({ ...g, keys: g.keys.filter(shown) })).filter((g) => g.keys.length);
  const bar = (look.bar.length ? look.bar : DEFAULT_VENDOR_LOOK.bar).filter(shown).slice(0, 4);
  const status = listing.pending ? 'Under review' : listing.hidden ? 'Hidden by the site' : 'Live in the directory';
  const pick = (k: VendorPlace) => {
    setMore(false);
    go(k);
  };
  // The menu's colours: dark (their colour, cream writing) or light (cream, their colour's writing).
  const side: CSSProperties = dark
    ? { background: `linear-gradient(180deg, ${c.side}, ${mix(c.side, 0, 0.25)})`, color: '#f6f0e2' }
    : { background: '#fffdf8', color: c.side, borderRight: `1px solid ${mix(c.tint, 0, 0.08)}` };
  const muted = dark ? 'rgba(246,240,226,.68)' : mix(c.side, 255, 0.35);
  const rowH = look.compact ? 44 : 50;

  const brand = (size: number) => (
    <div className="flex flex-col gap-3 min-w-0">
      <VendorLogo src={listing.logo} name={listing.name} shape={look.logoShape} size={size} accent={c.accent} />
      <div className="min-w-0">
        <strong className="block text-[24px] leading-[1.1] font-normal break-words" style={{ fontFamily: serif }}>
          {listing.name}
        </strong>
        {look.tagline && (
          <span className="block text-[13px] mt-1 break-words" style={{ color: muted }}>
            {look.tagline}
          </span>
        )}
        <span className="mt-2 inline-flex items-center gap-[6px] text-[12px] tracking-[.06em]" style={{ color: muted }}>
          <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: listing.pending || listing.hidden ? '#d6a24a' : '#7fbf7a' }} />
          {status}
        </span>
      </div>
    </div>
  );
  const item = (k: VendorPlace, onPick: (k: VendorPlace) => void, inSheet = false) => {
    const on = place === k;
    const n = badges[k] ?? 0;
    const tone: CSSProperties = inSheet
      ? on
        ? { background: c.tint, color: c.side }
        : { color: INK }
      : on
        ? dark
          ? { background: 'rgba(255,255,255,.13)', color: '#fffaf0', boxShadow: 'inset 3px 0 0 #e3c88f' }
          : { background: c.tint, color: c.side, boxShadow: `inset 3px 0 0 ${c.accent}` }
        : { color: 'inherit' };
    return (
      <li key={k}>
        <button
          type="button"
          aria-current={on ? 'page' : undefined}
          onClick={() => onPick(k)}
          className={`w-full flex items-center gap-3 px-3 rounded-[12px] border-0 bg-transparent text-left cursor-pointer transition-colors duration-150 ${look.compact ? 'text-[14px]' : 'text-[15px]'} ${on ? 'font-semibold' : 'hover:bg-[rgba(127,127,127,.12)]'}`}
          style={{ minHeight: rowH, ...tone }}
        >
          <Icon k={k} size={look.compact ? 18 : 20} />
          <span className="flex-1 min-w-0 truncate">{PLACE_LABEL[k]}</span>
          {n > 0 && (
            <span className="min-w-[22px] h-[22px] px-[6px] rounded-full inline-flex items-center justify-center text-[12px] font-semibold" style={{ background: '#e3c88f', color: '#2b2418' }} aria-label={`${n} waiting`}>
              {n > 99 ? '99+' : n}
            </span>
          )}
        </button>
      </li>
    );
  };
  const footLink = 'flex items-center gap-3 px-3 min-h-[44px] rounded-[12px] no-underline text-[14px] border-0 bg-transparent cursor-pointer text-left hover:bg-[rgba(127,127,127,.12)]';

  return (
    <div className="min-h-screen bg-[#f6f0e2] lg:grid lg:grid-cols-[276px_minmax(0,1fr)]" style={{ color: INK, fontFamily: sans }}>
      {/* A computer: their menu down the side. */}
      <aside className="hidden lg:flex flex-col gap-6 sticky top-0 h-screen overflow-y-auto [scrollbar-width:thin] px-4 pt-7 pb-5" style={side}>
        <div className="px-2">{brand(look.logoShape === 'wide' ? 56 : 64)}</div>
        <nav aria-label="Your vendor account" className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.name} className="flex flex-col gap-1">
              <span className="px-3 text-[11px] tracking-[.16em] uppercase font-semibold" style={{ color: muted }}>
                {g.name}
              </span>
              <ul className="m-0 p-0 list-none flex flex-col gap-[2px]">{g.keys.map((k) => item(k, go))}</ul>
            </div>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-[2px] pt-4" style={{ borderTop: `1px solid ${dark ? 'rgba(246,240,226,.16)' : mix(c.tint, 0, 0.08)}` }}>
          <Link to={`/vendors/${listing.slug}`} className={footLink} style={{ color: 'inherit' }}>
            <Icon k="page" size={18} />
            See your page
          </Link>
          <div className="px-1">
            <ProfileSwitch here="vendor" tone={dark ? 'dark' : 'light'} />
          </div>
          <button type="button" onClick={onSignOut} className={footLink} style={{ color: 'inherit' }}>
            <Icon k="out" size={18} />
            Sign out
          </button>
          <Link to="/" className="px-3 pt-2 text-[12px] no-underline" style={{ color: muted }}>
            Runs on {BRAND}
          </Link>
        </div>
      </aside>

      <div className="min-w-0 flex flex-col">
        {/* A phone: their logo and name at the top. */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-2 min-h-[60px]" style={{ ...side, borderRight: 0, boxShadow: '0 2px 10px rgba(0,0,0,.12)' }}>
          <VendorLogo src={listing.logo} name={listing.name} shape={look.logoShape} size={40} accent={c.accent} />
          <span className="flex-1 min-w-0">
            <strong className="block text-[19px] leading-[1.1] font-normal truncate" style={{ fontFamily: serif }}>
              {listing.name}
            </strong>
            <span className="block text-[12px] truncate" style={{ color: muted }}>
              {look.tagline || status}
            </span>
          </span>
          <button type="button" onClick={() => setMore(true)} aria-label="Open the menu" className="w-11 h-11 inline-flex items-center justify-center rounded-full border-0 cursor-pointer" style={{ background: dark ? 'rgba(255,255,255,.12)' : c.tint, color: 'inherit' }}>
            <Icon k="more" />
          </button>
        </header>

        <main className="w-full max-w-[1120px] mx-auto px-4 lg:px-10 pt-5 lg:pt-9 pb-28 lg:pb-16 min-w-0">
          <div className="flex flex-col gap-1 pb-4">
            <span className="text-[12px] tracking-[.16em] uppercase font-semibold" style={{ color: c.accent }}>
              {groupOf(place)}
            </span>
            <h1 className={OWN_TITLE.includes(place) ? 'sr-only' : 'm-0 text-[clamp(30px,4.5vw,44px)] leading-[1.05] font-normal'} style={{ fontFamily: serif }}>
              {title}
            </h1>
          </div>
          {children}
        </main>

        {/* A phone: the four places they chose, and More. */}
        <nav aria-label="Quick menu" className="lg:hidden fixed bottom-0 inset-x-0 z-30 grid border-t" style={{ gridTemplateColumns: `repeat(${bar.length + 1}, minmax(0, 1fr))`, background: '#fffdf8', borderColor: mix(c.tint, 0, 0.1), paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -4px 18px rgba(0,0,0,.08)' }}>
          {[...bar, 'more' as const].map((k) => {
            const on = k === 'more' ? more : place === k && !more;
            const n = k === 'more' ? 0 : (badges[k] ?? 0);
            return (
              <button
                key={k}
                type="button"
                aria-current={on && k !== 'more' ? 'page' : undefined}
                onClick={() => (k === 'more' ? setMore(true) : pick(k))}
                className="relative flex flex-col items-center justify-center gap-[2px] min-h-[58px] px-1 border-0 bg-transparent cursor-pointer text-[11px]"
                style={{ color: on ? c.accent : '#6b7464', fontWeight: on ? 600 : 400 }}
              >
                <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-8 rounded-b-full" style={{ background: on ? c.accent : 'transparent' }} />
                <Icon k={k} size={22} />
                <span className="max-w-full truncate">{k === 'more' ? 'More' : SHORT[k]}</span>
                {n > 0 && (
                  <span className="absolute top-[6px] left-[calc(50%+6px)] min-w-[18px] h-[18px] px-[5px] rounded-full inline-flex items-center justify-center text-[10px] font-semibold" style={{ background: '#c0553f', color: '#fff' }} aria-label={`${n} waiting`}>
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      {more && <MoreSheet listing={listing} look={look} brand={brand} groups={groups} item={(k) => item(k, pick, true)} onClose={() => setMore(false)} onSignOut={onSignOut} />}
    </div>
  );
}

/** Everything in their account, from the phone's More (or the menu button at the top). */
function MoreSheet({
  listing,
  look,
  brand,
  groups,
  item,
  onClose,
  onSignOut,
}: {
  listing: ShellListing;
  look: VendorLook;
  brand: (size: number) => ReactNode;
  groups: { name: string; keys: VendorPlace[] }[];
  item: (k: VendorPlace) => ReactNode;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const c = coloursOf(look);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // Escape closes it; Tab stays inside it; closing puts focus back where it was.
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const all = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, [tabindex="0"]')].filter((el) => el.offsetParent !== null);
      if (!all.length) return;
      const first = all[0]!;
      const last = all[all.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', key);
    panel.current?.focus();
    const was = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = was;
      opener?.focus?.();
    };
  }, []); // eslint-disable-line
  const row = 'flex items-center gap-3 px-3 min-h-[48px] rounded-[12px] no-underline text-[15px] border-0 bg-transparent cursor-pointer text-left w-full';
  return (
    <div className="lg:hidden fixed inset-0 z-40 flex flex-col justify-end">
      <button type="button" aria-label="Close the menu" onClick={onClose} className="absolute inset-0 border-0 cursor-default" style={{ background: 'rgba(20,24,18,.45)' }} />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Your vendor account"
        className="relative max-h-[88vh] overflow-y-auto rounded-t-[24px] bg-[#fffdf8] px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] outline-none"
      >
        <span aria-hidden className="block mx-auto mb-3 w-10 h-1 rounded-full bg-[#d8ceb6]" />
        <div className="flex items-start gap-3 justify-between p-3 rounded-[16px] mb-3" style={{ background: c.side, color: '#f6f0e2' }}>
          {brand(48)}
          <button type="button" onClick={onClose} aria-label="Close the menu" className="w-11 h-11 flex-none inline-flex items-center justify-center rounded-full border-0 cursor-pointer" style={{ background: 'rgba(255,255,255,.14)', color: 'inherit' }}>
            <Icon k="close" />
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.name} className="flex flex-col gap-1 pb-3">
            <span className="px-3 text-[11px] tracking-[.16em] uppercase font-semibold" style={{ color: '#6b7464' }}>
              {g.name}
            </span>
            <ul className="m-0 p-0 list-none flex flex-col gap-[2px]">{g.keys.map(item)}</ul>
          </div>
        ))}
        <div className="flex flex-col gap-[2px] pt-2 border-t border-[#e8dfca]">
          <Link to={`/vendors/${listing.slug}`} className={row} style={{ color: INK }}>
            <Icon k="page" size={18} />
            See your page
          </Link>
          <div className="px-1">
            <ProfileSwitch here="vendor" tone="light" />
          </div>
          <button type="button" onClick={onSignOut} className={row} style={{ color: INK }}>
            <Icon k="out" size={18} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
