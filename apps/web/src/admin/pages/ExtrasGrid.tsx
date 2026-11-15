import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

/**
 * Setup → Extras, laid out like the rest of Setup: every extra is a card on a grid (what it is, what's set now,
 * a little picture of it), not a long list of folded rows. Tapping a card opens its settings in a panel right
 * under the grid, one at a time, with Done to close it.
 *
 * `Extra` only carries its props: ExtrasGrid draws it.
 */
export interface ExtraProps {
  title: string;
  now: string;
  /** Open this one to begin with (e.g. "Change your seal" from elsewhere). */
  start?: boolean;
  children: ReactNode;
}
export function Extra(_: ExtraProps): null {
  return null;
}

/** A small line drawing for each extra, in the admin's ink. */
function Glyph({ title }: { title: string }) {
  const t = title.toLowerCase();
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const body = t.includes('scene') ? (
    <>
      <path d="M5 21V9l7-5 7 5v12" {...p} />
      <path d="M9 21v-6h6v6" {...p} />
    </>
  ) : t.includes('moving') ? (
    <>
      <path d="M3 9c3-3 6 3 9 0s6 3 9 0" {...p} />
      <path d="M3 15c3-3 6 3 9 0s6 3 9 0" {...p} />
    </>
  ) : t.includes('envelope') ? (
    <>
      <rect x="3" y="6" width="18" height="13" rx="1.5" {...p} />
      <path d="M3 7l9 7 9-7" {...p} />
      <circle cx="12" cy="14" r="2.4" fill="currentColor" stroke="none" />
    </>
  ) : t.includes('photo behind') ? (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" {...p} />
      <path d="M7 15l3-3 3 3 2-2 3 3" {...p} />
      <circle cx="9" cy="9" r="1.4" {...p} />
    </>
  ) : t.includes('arch') ? (
    <>
      <path d="M6 21V11a6 6 0 0 1 12 0v10" {...p} />
      <path d="M4 21h16" {...p} />
    </>
  ) : t.includes('music') ? (
    <>
      <path d="M9 18V6l10-2v12" {...p} />
      <circle cx="7" cy="18" r="2" {...p} />
      <circle cx="17" cy="16" r="2" {...p} />
    </>
  ) : t.includes('gift') ? (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1" {...p} />
      <path d="M12 9v11M4 13h16M12 9c-2-4-6-3-5-1s5 1 5 1 4-1 5-1-3-3-5 1" {...p} />
    </>
  ) : t.includes('directions') ? (
    <>
      <path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z" {...p} />
      <circle cx="12" cy="10" r="2" {...p} />
    </>
  ) : t.includes('parts') ? (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" {...p} />
      <rect x="13" y="4" width="7" height="7" rx="1" {...p} />
      <rect x="4" y="13" width="7" height="7" rx="1" {...p} />
      <rect x="13" y="13" width="7" height="7" rx="1" {...p} />
    </>
  ) : (
    <>
      <circle cx="12" cy="12" r="8.5" {...p} />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8v.2" {...p} />
    </>
  );
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="w-[22px] h-[22px]">
      {body}
    </svg>
  );
}

export function ExtrasGrid({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter((c): c is ReactElement<ExtraProps> => isValidElement(c) && c.type === Extra);
  const [open, setOpen] = useState<string | null>(() => items.find((i) => i.props.start)?.props.title ?? null);
  const panel = useRef<HTMLDivElement>(null);
  const chosen = items.find((i) => i.props.title === open) ?? null;
  // A link that asks for one (e.g. ?open=seal) opens it, even after the page has loaded.
  const asked = items.find((i) => i.props.start)?.props.title ?? null;
  useEffect(() => {
    if (asked) setOpen(asked);
  }, [asked]);
  // Opening a card brings its settings into view (on a phone they're below the grid).
  useEffect(() => {
    if (open) panel.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [open]);
  return (
    <div className="flex flex-col gap-3">
      <div role="list" aria-label="Extras" className="grid gap-3 grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => {
          const on = open === i.props.title;
          return (
            <div role="listitem" key={i.props.title} className="min-w-0">
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpen(on ? null : i.props.title)}
                className={`w-full h-full flex items-start gap-3 p-4 rounded-[14px] border text-left cursor-pointer transition-shadow ${on ? 'border-[var(--adm-ink,#33402f)] bg-[var(--adm-tint,#f3ecd6)] shadow-[0_0_0_1px_var(--adm-ink,#33402f)]' : 'border-[var(--adm-line,#e2d7bc)] bg-white hover:shadow-[0_6px_16px_rgba(60,40,20,.08)]'}`}
              >
                <span className="flex-none w-[40px] h-[40px] rounded-full grid place-items-center bg-[var(--adm-tint,#efe7d3)] text-[var(--adm-ink,#33402f)]">
                  <Glyph title={i.props.title} />
                </span>
                <span className="flex flex-col gap-[2px] min-w-0">
                  <span className="text-[15px] font-semibold text-[var(--adm-text,#33402f)]">{i.props.title}</span>
                  <span className="text-[13px] text-[var(--adm-muted,#5b6a52)] line-clamp-2">{i.props.now}</span>
                  <span className="text-[13px] underline text-[var(--adm-ink,#33402f)] mt-1">{on ? 'Close' : 'Change'}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {chosen && (
        <div ref={panel} role="region" aria-label={chosen.props.title} className="flex flex-col gap-[14px] p-4 sm:p-5 rounded-[14px] border border-[var(--adm-ink,#33402f)] bg-white">
          <div className="flex justify-between items-center gap-3">
            <strong className="text-[17px] font-semibold text-[var(--adm-text,#33402f)]">{chosen.props.title}</strong>
            <button type="button" onClick={() => setOpen(null)} className="py-[7px] px-4 rounded-full border-0 bg-[var(--adm-ink,#33402f)] text-[#f3ecd6] text-[14px] font-semibold cursor-pointer">
              Done
            </button>
          </div>
          {chosen.props.children}
        </div>
      )}
    </div>
  );
}
