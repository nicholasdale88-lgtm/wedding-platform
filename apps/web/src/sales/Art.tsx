/**
 * The Yes List's own graphics, drawn as SVG so they stay sharp at any size and weigh almost nothing: the
 * logo (a list card with a gold tick and a ring) and the wordmark. Colours follow the front page (sage ink,
 * gold, cream).
 */
const INK = '#33402f';
const GOLD = '#c8a46a';
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
