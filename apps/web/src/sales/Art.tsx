/**
 * The Yes List's own graphics, drawn as SVG so they stay sharp at any size and weigh almost nothing: the
 * logo (two interlocking gold rings, as on the app icon) and the wordmark. Colours follow the front page (sage ink,
 * gold, cream).
 */
import { useId } from 'react';

const INK = '#33402f';

/**
 * The logo mark, as on the app icon: two interlocking gold rings (one with a small diamond) on deep sage,
 * inside a fine gold border. The right ring passes over the left at the bottom, so the two read as linked.
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  const g = `yl-g-${id}`;
  const bg = `yl-bg-${id}`;
  const clip = `yl-c-${id}`;
  const fine = size >= 28; // the border and the stone's glint only where they can be seen
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#344230" />
          <stop offset="1" stopColor="#212b1e" />
        </linearGradient>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5e1aa" />
          <stop offset=".38" stopColor="#d6b270" />
          <stop offset=".62" stopColor="#a0783a" />
          <stop offset=".85" stopColor="#d6b270" />
          <stop offset="1" stopColor="#e8cd91" />
        </linearGradient>
        <clipPath id={clip}>
          <rect x="43" y="61" width="14" height="14" />
        </clipPath>
      </defs>
      <rect width="100" height="100" rx="22" fill={`url(#${bg})`} />
      {fine && <rect x="7" y="7" width="86" height="86" rx="16" fill="none" stroke="#d6b270" strokeOpacity=".65" strokeWidth=".9" />}
      <circle cx="38" cy="54" r="20" fill="none" stroke={`url(#${g})`} strokeWidth="6.2" />
      <circle cx="62" cy="54" r="20" fill="none" stroke={`url(#${g})`} strokeWidth="6.2" />
      {/* the right ring over the left at the bottom crossing, with a hairline gap */}
      <g clipPath={`url(#${clip})`}>
        <circle cx="62" cy="54" r="20" fill="none" stroke="#1e271b" strokeWidth="8" />
        <circle cx="62" cy="54" r="20" fill="none" stroke={`url(#${g})`} strokeWidth="6.2" />
      </g>
      <path d="M43.5 47 A17 17 0 0 1 55 40" fill="none" stroke="#fff4d0" strokeOpacity=".45" strokeWidth="1.2" />
      <path d="M67.5 47 A17 17 0 0 1 79 40" fill="none" stroke="#fff4d0" strokeOpacity=".45" strokeWidth="1.2" />
      {/* the stone */}
      <path d="M56.5 29.5 L58.8 25.4 L65.2 25.4 L67.5 29.5 L62 36 Z" fill="#e6eeec" />
      <path d="M56.5 29.5 L67.5 29.5 L62 36 Z" fill="#c9d6d4" />
      <path d="M58.8 25.4 L62 29.5 L56.5 29.5 Z" fill="#ffffff" />
      {fine && <path d="M70 19.5 h7 M73.5 16 v7" stroke="#fff6dc" strokeWidth="1" strokeLinecap="round" />}
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
