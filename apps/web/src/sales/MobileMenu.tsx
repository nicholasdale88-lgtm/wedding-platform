import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';

export interface MenuLink {
  label: string;
  /** An in-app path (/vendors) or a link on this page (#pricing). */
  to: string;
  primary?: boolean;
}

/**
 * The header's links on a phone: a Menu button that opens a sheet with every link the computer header
 * shows. The sheet is a modal dialog: focus moves into it and stays there (Tab wraps), Escape or the
 * close button or tapping outside closes it, choosing a link closes it, and focus returns to the button.
 * Hidden from sm (640px) up, where the links sit in the header itself.
 */
export function MobileMenu({ links, ink, paper, title }: { links: MenuLink[]; ink: string; paper: string; title: ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const id = useId();
  const location = useLocation();

  // Any navigation closes it (a link chosen, back, a hash link).
  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = sheet.current?.querySelector<HTMLElement>('a, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !sheet.current) return;
      const items = [...sheet.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
      if (!items.length) return;
      const [a, z] = [items[0]!, items[items.length - 1]!];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const back = button.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = before;
      back?.focus();
    };
  }, [open]);

  const linkCls = 'flex items-center min-h-[52px] px-4 rounded-[14px] no-underline text-[18px]';
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(true)}
        className="sm:hidden inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-3 rounded-full border bg-transparent cursor-pointer text-[15px]"
        style={{ color: ink, borderColor: `${ink}40` }}
      >
        <svg aria-hidden width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M1 1h16M1 7h16M1 13h16" />
        </svg>
        Menu
      </button>
      {open &&
        createPortal(
          <div className="sm:hidden fixed inset-0 z-[80]" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)} style={{ background: 'rgba(27,34,24,.45)' }}>
            <div
              ref={sheet}
              id={id}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="absolute top-0 left-0 right-0 flex flex-col gap-1 p-3 pb-5 rounded-b-[22px] shadow-[0_18px_40px_rgba(0,0,0,.22)]"
              style={{ background: paper, color: ink, paddingTop: 'max(12px, env(safe-area-inset-top))' }}
            >
              <div className="flex items-center justify-between gap-3 px-1 pb-2">
                <span className="text-[15px]">{title}</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full border-0 bg-transparent cursor-pointer text-[26px] leading-none" style={{ color: ink }}>
                  ×
                </button>
              </div>
              <nav aria-label="Main" className="flex flex-col gap-1">
                {links.map((l) => {
                  const style = l.primary ? { background: ink, color: paper, justifyContent: 'center', fontWeight: 600, marginTop: 6 } : { color: ink };
                  return l.to.startsWith('#') ? (
                    <a key={l.to} href={l.to} onClick={() => setOpen(false)} className={linkCls} style={style}>
                      {l.label}
                    </a>
                  ) : (
                    <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className={linkCls} style={style}>
                      {l.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
