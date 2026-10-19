/**
 * Admin building blocks. Every value is copied from design/RSVP Admin.dc.html (DESIGN_LOCK):
 * eyebrows 11px/600/.22em, Cormorant headings, pill buttons, status pills, ruled sections, drawer, toast.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

export const Eyebrow = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`text-[11px] font-semibold tracking-[.22em] uppercase text-[#5b6a52] ${className}`}>{children}</div>
);

export const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="m-0 font-display font-medium text-[26px]">{children}</h2>
);

type Kind = 'primary' | 'secondary' | 'dashed' | 'outline';
const PILL: Record<Kind, string> = {
  primary: 'py-[10px] px-[18px] border border-[#5d6b47] bg-[#5d6b47] text-[#fbf8f2] text-[14px] font-medium hover:bg-[#46543a]',
  secondary: 'py-[10px] px-[18px] border border-[#c6b794] bg-transparent text-[14px] font-medium hover:bg-[#efe7d3]',
  dashed: 'py-[7px] px-[14px] border border-dashed border-[#8a9670] bg-transparent text-[13px] hover:bg-[#efe7d3]',
  outline: 'py-2 px-[14px] border border-[#33402f] bg-transparent text-[13px] font-medium whitespace-nowrap hover:bg-[#33402f] hover:text-[#f3ecd6]',
};
export function Pill({ kind = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind }) {
  return <button type="button" {...props} className={`rounded-full cursor-pointer disabled:opacity-60 disabled:cursor-wait ${PILL[kind]} ${className}`} />;
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
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
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
