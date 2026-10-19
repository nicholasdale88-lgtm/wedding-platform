/**
 * Admin building blocks. Every value is copied from design/RSVP Admin.dc.html (DESIGN_LOCK):
 * eyebrows 11px/600/.22em, Cormorant headings, pill buttons, status pills, ruled sections, drawer, toast.
 *
 * Colours that follow the section you're in come from the shell's theme tokens (Shell themeVars):
 * --adm-ink (headings), --adm-accent and --adm-accent-deep (primary buttons, selected tabs and chips),
 * --adm-soft and --adm-bg. The second event is blue, so everything in its section turns blue together.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

const INK = 'text-[var(--adm-ink,#33402f)]';

export const Eyebrow = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`text-[11px] font-semibold tracking-[.22em] uppercase text-[#5b6a52] ${className}`}>{children}</div>
);

export const H2 = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <h2 className={`m-0 font-display font-medium text-[26px] ${INK} ${className}`}>{children}</h2>
);

/** A screen's title block: eyebrow (where you are), the heading, an optional line under it, and actions on the right. */
export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex justify-between items-end gap-4 flex-wrap">
      <div className="flex flex-col gap-[10px] min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className={`m-0 font-display font-medium text-[clamp(32px,6vw,46px)] leading-[1.05] [text-wrap:balance] ${INK}`}>{title}</h1>
        {sub && <p className="m-0 max-w-[620px] text-[15px] text-[#5b6a52]">{sub}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap items-center">{actions}</div>}
    </header>
  );
}

type Kind = 'primary' | 'secondary' | 'dashed' | 'outline' | 'danger';
const PILL: Record<Kind, string> = {
  primary: 'border border-[var(--adm-accent,#5d6b47)] bg-[var(--adm-accent,#5d6b47)] text-[#fbf8f2] font-medium hover:bg-[var(--adm-accent-deep,#46543a)]',
  secondary: 'border border-[#c6b794] bg-transparent font-medium hover:bg-[#efe7d3]',
  dashed: 'border border-dashed border-[#8a9670] bg-transparent hover:bg-[#efe7d3]',
  outline: 'border border-[var(--adm-ink,#33402f)] bg-transparent font-medium whitespace-nowrap hover:bg-[var(--adm-ink,#33402f)] hover:text-[#f3ecd6]',
  danger: 'border border-[#a4553c] bg-transparent text-[#8a3f2a] font-medium hover:bg-[#a4553c] hover:text-[#fbf8f2]',
};
const SIZE: Record<Kind, string> = {
  primary: 'py-[10px] px-[18px] text-[14px]',
  secondary: 'py-[10px] px-[18px] text-[14px]',
  dashed: 'py-[7px] px-[14px] text-[13px]',
  outline: 'py-2 px-[14px] text-[13px]',
  danger: 'py-2 px-[14px] text-[13px]',
};
/** Pill button. size="sm" is the compact one for rows and toolbars; disabled shows not-allowed (aria-busy shows wait). */
export function Pill({ kind = 'secondary', size, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; size?: 'sm' }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-full cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed aria-busy:cursor-wait ${PILL[kind]} ${size === 'sm' ? 'py-[5px] px-3 text-[12px]' : SIZE[kind]} ${className}`}
    />
  );
}

/** One row of underlined tabs (Guest planning, Setup pages…): each is a button or a link the caller renders. */
export function Tabs<K extends string>({ label, items, value, onChange }: { label: string; items: readonly { key: K; label: ReactNode }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 border-b border-[#e2d7bc] overflow-x-auto [scrollbar-width:none]">
      {items.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={t.key === value} onClick={() => onChange(t.key)} className={tabCls(t.key === value)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
/** The look of one tab, for tabs that are links (NavLink) rather than buttons. */
export const tabCls = (on: boolean) =>
  `flex-none py-2 px-0 bg-transparent border-0 border-b-2 border-solid no-underline text-[15px] -mb-px cursor-pointer whitespace-nowrap ${
    on ? 'border-[var(--adm-ink,#33402f)] font-semibold !text-[var(--adm-ink,#33402f)]' : 'border-transparent !text-[#5b6a52] hover:!text-[var(--adm-ink,#33402f)]'
  }`;

/** Filter chips: one choice from a few (quick filters, the photo album's people, the device preview…). */
export function Chips<K extends string>({ label, items, value, onChange }: { label: string; items: readonly { key: K; label: ReactNode }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 flex-wrap">
      {items.map((c) => (
        <button key={c.key} type="button" aria-pressed={c.key === value} onClick={() => onChange(c.key)} className={chipCls(c.key === value)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
export const chipCls = (on: boolean) =>
  `py-[6px] px-3 rounded-full border text-[13px] cursor-pointer whitespace-nowrap ${
    on ? 'bg-[var(--adm-accent,#5d6b47)] border-[var(--adm-accent,#5d6b47)] text-[#fbf8f2]' : 'bg-transparent border-[#c6b794] text-[#33402f] hover:bg-[#efe7d3]'
  }`;

/** While a screen's data loads: keeps the space and tells screen readers. */
export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <div aria-busy="true" className="min-h-[40vh] text-[14px] text-[#5b6a52]">
    <span className="sr-only">{label}</span>
  </div>
);

/** A load that failed: what went wrong and a way to try again. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-4">
      <p className="m-0 text-[15px] text-[#8a3f2a]">{message || 'Something went wrong.'}</p>
      {onRetry && (
        <Pill size="sm" onClick={onRetry}>
          Try again
        </Pill>
      )}
    </div>
  );
}

/** Nothing here yet: a short line in the design's italic, and what to do next. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-5 border-t border-[#e2d7bc]">
      <p className="m-0 font-display text-[22px] italic">{children}</p>
      {action}
    </div>
  );
}

/** Reply status pill: Attending / Declined / Awaiting / Not invited (design pill()). */
export function replyPill(invited: boolean, attending: boolean | null | undefined): { text: string; bg: string; fg: string } {
  if (!invited) return { text: 'Not invited', bg: 'transparent', fg: '#7a7466' };
  if (attending === true) return { text: 'Attending', bg: '#dfe5cc', fg: '#3d4a2f' };
  if (attending === false) return { text: 'Declined', bg: '#f1e1d6', fg: '#7a4a37' };
  return { text: 'Awaiting', bg: '#f1e7c9', fg: '#5e5130' };
}
export function StatusPill({ invited, attending }: { invited: boolean; attending: boolean | null | undefined }) {
  const p = replyPill(invited, attending);
  return (
    <span className="justify-self-start py-[3px] px-[9px] rounded-full text-[12px] font-medium whitespace-nowrap" style={{ background: p.bg, color: p.fg }}>
      {p.text}
    </span>
  );
}

export const inputCls = 'py-[10px] px-3 border border-[#d3c6a4] rounded-[10px] bg-[#fbf8f2] text-[15px] text-[#33402f]';
export const Label = ({ text, children, className = '' }: { text: ReactNode; children: ReactNode; className?: string }) => (
  <label className={`flex flex-col gap-[5px] text-[13px] text-[#5b6a52] ${className}`}>
    {text}
    {children}
  </label>
);

// ---------------------------------------------------------------- toast

interface ToastAction {
  label: string;
  run: () => void;
}
type ShowToast = (text: string, action?: ToastAction) => void;
const ToastCtx = createContext<ShowToast>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; action?: ToastAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback<ShowToast>((text, action) => {
    clearTimeout(timer.current);
    setToast({ text, action });
    // Undo stays up for 10 seconds (docs/10 §4); plain messages for 2.6.
    timer.current = setTimeout(() => setToast(null), action ? 10_000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div role="status" className="fixed left-1/2 bottom-[26px] -translate-x-1/2 z-40 py-3 px-5 rounded-full bg-[#33402f] text-[#f3ecd6] text-[14px] shadow-[0_8px_24px_rgba(51,64,47,.25)] flex items-center gap-4">
          {toast.text}
          {toast.action && (
            <button
              onClick={() => {
                toast.action!.run();
                setToast(null);
              }}
              className="p-0 border-0 bg-transparent text-[#f3ecd6] font-semibold underline cursor-pointer"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- drawer

/** Right-side drawer, 480px, dimmed backdrop; Escape and backdrop close it. */
export function Drawer({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Leave the field first, so what was typed in it saves (fields save when you leave them).
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex justify-end">
      <div onClick={onClose} className="absolute inset-0 bg-[rgba(51,64,47,.32)]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative w-[min(480px,100%)] h-full overflow-y-auto bg-[#f6f0e2] shadow-[-12px_0_40px_rgba(51,64,47,.18)] pt-[26px] px-[26px] pb-10 flex flex-col gap-6"
      >
        {children}
      </aside>
    </div>
  );
}

export function useMedia(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

/**
 * Keeps a screen current without reloading: runs `refresh` every `ms` while the page is visible, and
 * straight away when you come back to it (new RSVPs, replies and photos appear by themselves).
 */
export function useAutoRefresh(refresh: () => unknown, ms = 30_000, enabled = true) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    const run = () => {
      if (document.visibilityState === 'visible') void latest.current();
    };
    const timer = setInterval(run, ms);
    document.addEventListener('visibilitychange', run);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [ms, enabled]);
}
