import type { TimelineIcon, TimelineItem } from '@wp/shared';
import type { ReactNode } from 'react';
import { sx } from '../sx';

/*
 * The couple's own order of events (Admin → Guest pages → Timeline), drawn row for row as the
 * design's "03 Timeline" (design/extracted/invitation.html): time and "to" time, an icon in a ringed
 * circle joined by a dotted line, then the title and a line of detail. "end" is the design's closing diamond.
 */

const ROW = sx('display:grid;grid-template-columns:64px 46px 1fr;gap:0 14px;align-items:start;text-align:left');
const TIME = sx('font-size:22px;color:var(--sg,#4f6b40);text-align:right;padding-top:2px;font-variant-numeric:tabular-nums;line-height:1.1');
const UNTIL = sx('font-size:15px;font-style:italic;opacity:.85;margin-top:4px');
const COL = sx('display:flex;flex-direction:column;align-items:center;align-self:stretch');
const RING = sx(
  'width:46px;height:46px;border-radius:50%;box-sizing:border-box;border:1px solid var(--sg,#4f6b40);background:var(--b1,#fdfcf8);display:flex;align-items:center;justify-content:center;flex:none;box-shadow:0 0 0 4px var(--b2,#e4ead6)',
);
const ICON = sx('fill:none;stroke:var(--mg,#3e4a6b);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round');
const LINE = sx('flex:1;width:0;min-height:30px;border-left:1.5px dotted var(--sg,#4f6b40);opacity:.7;margin:4px 0');
const DIAMOND = sx('width:11px;height:11px;margin-top:9px;background:var(--mg,#3e4a6b);transform:rotate(45deg);flex:none');
const TEXT = sx('display:flex;flex-direction:column;gap:2px;padding-bottom:22px');
const TITLE = sx('font-size:25px;color:var(--mg,#3e4a6b)');
const NOTE = sx('font-size:18px;font-style:italic;color:#6d6680');
const WHERE = sx('font-size:13px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--sg,#4f6b40);margin-top:2px');

/** The design's icons, as drawn in each of its rows. */
const PATHS: Record<Exclude<TimelineIcon, 'end'>, ReactNode> = {
  arrive: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  rings: (
    <>
      <circle cx="9" cy="13" r="5.2" />
      <circle cx="15" cy="13" r="5.2" />
      <path d="M12 3.5l1.3 2.2L12 7.6 10.7 5.7z" />
    </>
  ),
  camera: (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <circle cx="12" cy="13" r="3.6" />
      <path d="M8.5 7l1.2-2.5h4.6L15.5 7" />
    </>
  ),
  drinks: (
    <>
      <path d="M5 4h14l-7 8.5z" />
      <path d="M12 12.5V20M8 20h8" />
      <path d="M8.5 7.5h7" />
    </>
  ),
  sunset: <path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 6V3.5M4.8 9.8L3.2 8.2M19.2 9.8l1.6-1.6M2.5 14H1M23 14h-1.5" />,
  dinner: (
    <>
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M3 4v5.5a2 2 0 0 0 2 2M5 4v16M21 4c-2 1.5-3 4-3 7h3v9" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  // Drawn in the same fine line as the design's own icons.
  speech: <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />,
  cake: <path d="M4 20h16M5 20v-6h14v6M7 14v-3h10v3M12 11V8M12 6.5c-.8-.6-.8-1.6 0-2.5.8.9.8 1.9 0 2.5zM5 17c2 1 3-1 4.7 0s2.6 1 4.6 0 3 1 4.7 0" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  sparkle: <path d="M11 3l1.8 5.4L18 10l-5.2 1.6L11 17l-1.8-5.4L4 10l5.2-1.6zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" />,
  car: (
    <>
      <path d="M3 16v-3l2-5h14l2 5v3zM3 13h18" />
      <circle cx="7.5" cy="16.5" r="1.5" />
      <circle cx="16.5" cy="16.5" r="1.5" />
    </>
  ),
};

export function TimelineIconSvg({ icon, size = 24 }: { icon: Exclude<TimelineIcon, 'end'>; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={ICON} aria-hidden="true">
      {PATHS[icon] ?? PATHS.arrive}
    </svg>
  );
}

/** The design's timeline block (the converter's key for the 03 Timeline rows). */
export const TIMELINE_ROWS = '03 Timeline#rows1';

/** Rows with a title; blank rows (half-typed in the admin) are left out. */
export const shownRows = (items: TimelineItem[]) => items.filter((it) => it.title.trim() || it.time.trim());

export function TimelineRows({ items }: { items: TimelineItem[] }) {
  const rows = shownRows(items);
  return (
    <>
      {rows.map((it, i) => {
        const next = rows[i + 1];
        // As in the design: the dotted line joins each row to the next, but not into the closing diamond.
        const line = it.icon !== 'end' && next && next.icon !== 'end';
        return (
          <div key={i} style={ROW}>
            <div style={TIME}>
              {it.time.trim()}
              {it.until.trim() ? <div style={UNTIL}>{`to ${it.until.trim().replace(/^to\s+/i, '')}`}</div> : null}
            </div>
            <div style={COL}>
              {it.icon === 'end' ? (
                <div style={DIAMOND} />
              ) : (
                <div style={RING}>
                  <TimelineIconSvg icon={it.icon} />
                </div>
              )}
              {line ? <div style={LINE} /> : null}
            </div>
            <div style={TEXT}>
              <div style={TITLE}>{it.title.trim()}</div>
              {it.note.trim() ? <div style={NOTE}>{it.note.trim()}</div> : null}
              {it.where?.trim() ? <div style={WHERE}>{it.where.trim()}</div> : null}
            </div>
          </div>
        );
      })}
    </>
  );
}
