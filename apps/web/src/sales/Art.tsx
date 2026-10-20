import type { ReactElement } from 'react';

/**
 * The Yes List's own graphics, drawn as SVG so they stay sharp at any size and weigh almost nothing: the
 * logo (a list card with a gold tick and a ring), an icon for each reason couples choose it, and the
 * "your own Drive" illustration. Colours follow the front page (sage ink, gold, cream).
 */
const INK = '#33402f';
const GOLD = '#c8a46a';
const SAGE = '#8a9670';
const CREAM = '#fbf8f2';

/** The logo mark: a list card, a gold tick on the top line, and a ring tucked at the corner. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect x="6" y="5" width="24" height="30" rx="4" fill={CREAM} stroke={INK} strokeWidth="2" />
      <path d="M10.5 13.5 l2.6 2.6 l5-5.4" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13.5 h5.5 M10.5 21 h16 M10.5 27 h11" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity=".75" />
      <circle cx="31" cy="30" r="6.2" fill="none" stroke={GOLD} strokeWidth="2.4" />
      <path d="M28.6 23.6 l2.4 -2.6 l2.4 2.6" fill={GOLD} />
    </svg>
  );
}

/** The wordmark: the mark and "The Yes List", with "Yes" in gold. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2" style={{ fontSize: size, color: INK }}>
      <LogoMark size={Math.round(size * 1.55)} />
      <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '.01em' }}>
        The <span style={{ color: '#a9843f', fontStyle: 'italic' }}>Yes</span> List
      </span>
    </span>
  );
}

const icon = (body: ReactElement) => (
  <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
    <circle cx="22" cy="22" r="21" fill="#eef1e4" />
    {body}
  </svg>
);
const line = { fill: 'none', stroke: INK, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** An icon for each reason couples choose it, in the same order as the reasons. */
export const FEATURE_ICONS: ReactElement[] = [
  // Replies chase themselves: a speech bubble with a tick.
  icon(
    <>
      <path d="M12 14 h20 a3 3 0 0 1 3 3 v9 a3 3 0 0 1 -3 3 h-11 l-5 4 v-4 h-4 a3 3 0 0 1 -3 -3 v-9 a3 3 0 0 1 3 -3 z" {...line} />
      <path d="M17 21.5 l3 3 l6 -6" {...line} stroke={GOLD} strokeWidth={2.6} />
    </>,
  ),
  // Questions answered while you sleep: a moon and a small bubble.
  icon(
    <>
      <path d="M25 11 a9 9 0 1 0 8 13 a7 7 0 0 1 -8 -13 z" {...line} />
      <circle cx="15" cy="30" r="1.4" fill={GOLD} />
      <circle cx="19.5" cy="31.5" r="1.4" fill={GOLD} />
      <circle cx="24" cy="30" r="1.4" fill={GOLD} />
    </>,
  ),
  // Every dietary need on the right plate: a plate with a leaf.
  icon(
    <>
      <circle cx="22" cy="23" r="10" {...line} />
      <circle cx="22" cy="23" r="6" {...line} opacity=".5" />
      <path d="M19 26 c0 -6 4 -8 8 -8 c0 5 -3 8 -8 8 z M19 26 l5 -5" {...line} stroke={SAGE} />
    </>,
  ),
  // Seating that follows your rules: a round table with chairs.
  icon(
    <>
      <circle cx="22" cy="22" r="6.5" {...line} />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <circle key={a} cx={22 + 11 * Math.cos((a * Math.PI) / 180)} cy={22 + 11 * Math.sin((a * Math.PI) / 180)} r="2.4" fill={a === 0 || a === 60 ? GOLD : SAGE} />
      ))}
    </>,
  ),
  // Every payment, on time: a calendar with a dollar sign.
  icon(
    <>
      <rect x="12" y="13" width="20" height="19" rx="3" {...line} />
      <path d="M12 18.5 h20 M17 10.5 v5 M27 10.5 v5" {...line} />
      <path d="M24.5 22.5 c-1 -1 -5 -1.2 -5 .8 c0 2.4 5 1.2 5 3.6 c0 2 -4 1.8 -5 .8 M22 21 v9" {...line} stroke={GOLD} strokeWidth={1.8} />
    </>,
  ),
  // An invitation they'll remember: an envelope with a wax seal.
  icon(
    <>
      <rect x="10" y="14" width="24" height="17" rx="2.5" {...line} />
      <path d="M10.5 15 l11.5 9 l11.5 -9" {...line} />
      <circle cx="22" cy="24" r="3.6" fill="#b5653f" />
    </>,
  ),
  // Your wedding party, sorted: two figures and a star.
  icon(
    <>
      <circle cx="17" cy="17" r="3.4" {...line} />
      <circle cx="27" cy="17" r="3.4" {...line} />
      <path d="M11 31 c0 -5 3 -8 6 -8 s6 3 6 8 M21 31 c0 -5 3 -8 6 -8 s6 3 6 8" {...line} />
      <path d="M22 9 l1 2.2 l2.4 .3 l-1.8 1.6 l.5 2.3 l-2.1 -1.2 l-2.1 1.2 l.5 -2.3 l-1.8 -1.6 l2.4 -.3 z" fill={GOLD} />
    </>,
  ),
  // Every photo, in your own Drive: a camera and a cloud.
  icon(
    <>
      <rect x="11" y="17" width="18" height="13" rx="2.5" {...line} />
      <circle cx="20" cy="23.5" r="3.6" {...line} />
      <path d="M15 17 l2 -3 h6 l2 3" {...line} />
      <path d="M28 16 a3.4 3.4 0 0 1 6.4 1.2 a2.6 2.6 0 0 1 -.4 5.2 h-5" {...line} stroke={GOLD} />
    </>,
  ),
];

/**
 * Your own Drive: photos, contracts and a daily backup flowing from the wedding into your own Google Drive
 * or OneDrive folder. For "What you bring".
 */
export function DriveArt() {
  const doc = (x: number, y: number, r: number, kind: 'photo' | 'doc' | 'backup') => (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect x="-13" y="-16" width="26" height="32" rx="3" fill="#fff" stroke="#d3c6a4" strokeWidth="1.4" />
      {kind === 'photo' ? (
        <>
          <rect x="-9" y="-12" width="18" height="14" rx="1.5" fill="#e6ecd8" />
          <path d="M-9 1 l5 -6 l4 4 l3 -3 l6 5" fill="none" stroke={SAGE} strokeWidth="1.4" />
          <circle cx="4" cy="-7" r="2" fill={GOLD} />
        </>
      ) : kind === 'doc' ? (
        <path d="M-8 -10 h16 M-8 -5 h16 M-8 0 h11 M-8 5 h14" stroke="#9a9284" strokeWidth="1.6" strokeLinecap="round" />
      ) : (
        <path d="M-6 -2 a6 6 0 1 1 1.6 4.6 M-6 -2 v-4 M-6 -2 h4" fill="none" stroke={SAGE} strokeWidth="1.8" strokeLinecap="round" />
      )}
    </g>
  );
  return (
    <svg viewBox="0 0 320 150" className="w-full max-w-[420px] h-auto" role="img" aria-label="Photos, contracts and daily backups going into your own Google Drive or OneDrive">
      <path d="M70 75 C 130 40, 170 110, 228 78" fill="none" stroke={GOLD} strokeWidth="2" strokeDasharray="5 6" />
      {doc(48, 58, -10, 'photo')}
      {doc(78, 92, 8, 'doc')}
      {doc(40, 104, -4, 'backup')}
      <g transform="translate(250 78)">
        <path d="M-46 22 h92 a6 6 0 0 0 6 -6 v-34 a6 6 0 0 0 -6 -6 h-40 l-8 -9 h-38 a6 6 0 0 0 -6 6 v43 a6 6 0 0 0 6 6 z" fill="#eef1e4" stroke={INK} strokeWidth="2" />
        <path d="M-14 -2 l5 5 l11 -11" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <text x="0" y="40" textAnchor="middle" fontSize="11" fill={INK} fontFamily="DM Sans, system-ui, sans-serif">
          Your Drive
        </text>
      </g>
    </svg>
  );
}
