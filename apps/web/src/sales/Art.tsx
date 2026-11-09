/**
 * The Yes List's own graphics, drawn as SVG so they stay sharp at any size and weigh almost nothing: the
 * logo (two interlocking gold rings, as on the app icon) and the wordmark. Colours follow the front page (sage ink,
 * gold, cream).
 */
const INK = '#33402f';
const GOLD = '#c8a46a';
const CREAM = '#fbf8f2';

/** The logo mark: two interlocking gold rings on sage, the same as the app icon saved to a phone's home screen. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="9" fill="#2f3b2b" />
      <defs>
        <linearGradient id="yl-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6c98f" />
          <stop offset="1" stopColor="#b8914f" />
        </linearGradient>
      </defs>
      <circle cx="15.6" cy="20" r="7.6" fill="none" stroke="url(#yl-gold)" strokeWidth="2.6" />
      <circle cx="24.4" cy="20" r="7.6" fill="none" stroke="url(#yl-gold)" strokeWidth="2.6" />
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
