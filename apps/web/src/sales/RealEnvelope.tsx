import { ENVELOPE_PAPER_INFO, type EnvelopePaper, type SealColour } from '@wp/shared';
import { WaxSeal } from '../guest/invitation/WaxSeal';
import { SAMPLE } from './sample';

/**
 * The envelope a guest actually opens, for the front page: drawn from the invitation's own parts (the same
 * wax seal, the same envelope papers, the same layout: the top flap to a point at the seal, a gold laurel sprig,
 * "Tap to open" and the guest's names), so the picture is exactly what we provide, and sharp at any size.
 */
const mix = (a: string, b: string, t: number) => {
  const h = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const A = h(a);
  const B = h(b);
  return `#${A.map((v, i) => Math.round(v + (B[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

const GRAIN = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .3  0 0 0 0 .25  0 0 0 0 .17  0 0 0 .1 0'/></filter><rect width='200' height='200' filter='url(#n)'/></svg>")}")`;

export function RealEnvelope({
  paper = 'cream',
  wax = 'Sandstone',
  ink = '#3f5a3a',
  label,
  className = '',
  compact = false,
  bare = false,
}: {
  paper?: EnvelopePaper;
  wax?: SealColour;
  /** The guest's names on the front. */
  ink?: string;
  label?: string;
  className?: string;
  /** Smaller type (a tile). */
  compact?: boolean;
  /** Just the envelope and seal, without "Tap to open" and the names (when a caption sits over it). */
  bare?: boolean;
}) {
  const env = ENVELOPE_PAPER_INFO[paper].hex;
  const darkPaper = ['navy', 'midnight', 'eucalyptus', 'terracotta'].includes(paper);
  const text = darkPaper ? mix(env, '#ffffff', 0.78) : mix(env, '#000000', 0.55);
  const names = darkPaper ? mix(env, '#ffffff', 0.85) : ink;
  const crease = darkPaper ? 'rgba(0,0,0,.35)' : 'rgba(80,60,30,.22)';
  const lit = 'rgba(255,255,255,.55)';
  const seal = compact ? 72 : 112;
  // Positioned by the caller (absolute inset-0 in a phone) or relative: never both, or it collapses to no height.
  return (
    <div role="img" aria-label={label ?? `A sealed envelope: ${ENVELOPE_PAPER_INFO[paper].label.toLowerCase()} paper and a ${wax.toLowerCase()} wax seal pressed with H & T`} className={`${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative '}overflow-hidden ${className}`} style={{ background: env, containerType: 'size' }}>
      {/* Fine paper: a soft, irregular grain and the light from the top left. */}
      <div className="absolute inset-0" style={{ background: `${GRAIN}, radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.35), rgba(255,255,255,0) 60%), linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,.08))` }} />
      {/* The side and bottom flaps, then the top flap to its point at the seal, each with a lit edge and a crisp shadow. */}
      <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M0 100 L50 62 L100 100Z" fill="rgba(0,0,0,.04)" />
        <path d="M0 100 L50 62 L100 100" fill="none" stroke={crease} strokeWidth=".35" vectorEffect="non-scaling-stroke" />
        <path d="M0 0 L50 50 L0 100" fill="rgba(255,255,255,.05)" />
        <path d="M100 0 L50 50 L100 100" fill="rgba(0,0,0,.03)" />
        <path d="M0 0 L50 50 L100 0Z" fill={`url(#flap-${paper})`} />
        <defs>
          <linearGradient id={`flap-${paper}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".22" />
            <stop offset="1" stopColor="#fff" stopOpacity=".04" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0" style={{ clipPath: 'polygon(0 0,100% 0,50% 50%)', filter: 'drop-shadow(0 3px 3px rgba(40,25,10,.28))' }}>
        <div className="absolute inset-0" style={{ background: env }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.28), rgba(255,255,255,.06))' }} />
      </div>
      <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M0 0 L50 50 L100 0" fill="none" stroke={crease} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <path d="M.5 0 L50 49.2 L99.5 0" fill="none" stroke={lit} strokeWidth=".9" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The gold laurel above the seal. */}
      <svg aria-hidden className="absolute left-1/2 -translate-x-1/2" style={{ top: `calc(50% - ${seal * 0.95}px)`, width: seal * 2, height: seal * 0.5 }} viewBox="0 0 200 50">
        <defs>
          <linearGradient id={`gold-${paper}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fbe7a6" />
            <stop offset=".5" stopColor="#d4ad53" />
            <stop offset="1" stopColor="#8a6a22" />
          </linearGradient>
        </defs>
        <path d="M14 10 Q60 30 100 40 Q140 30 186 10" fill="none" stroke={`url(#gold-${paper})`} strokeWidth="1.6" />
        {[0, 1, 2, 3, 4, 5].flatMap((i) =>
          [-1, 1].map((s) => {
            const x = 100 + s * (16 + i * 14);
            const y = 38 - i * 4.4 - i * i * 0.2;
            return <ellipse key={`${i}${s}`} cx={x} cy={y} rx="7.5" ry="3" transform={`rotate(${s * (18 + i * 5)} ${x} ${y})`} fill={`url(#gold-${paper})`} stroke="#7a5a1a" strokeWidth=".4" />;
          }),
        )}
        <circle cx="100" cy="41" r="3.2" fill={`url(#gold-${paper})`} />
      </svg>
      {/* The wax seal: the invitation's own. */}
      <div className="absolute left-1/2 top-1/2" style={{ width: seal, height: seal, marginLeft: -seal / 2, marginTop: -seal / 2, filter: 'drop-shadow(0 2px 2px rgba(40,25,10,.45)) drop-shadow(0 10px 14px rgba(40,25,10,.25))' }}>
        <WaxSeal colour={wax} words="H & T" px={seal} still />
      </div>
      {!bare && (
        <>
      <span className="absolute left-0 right-0 text-center uppercase" style={{ top: `calc(50% + ${seal * 0.62}px)`, color: text, fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '.32em', fontSize: compact ? 11 : 14 }}>
        Tap to open
      </span>
      <span className="absolute left-0 right-0 text-center" style={{ top: `calc(50% + ${seal * 1.12}px)`, color: names, fontFamily: "'Pinyon Script', cursive", fontSize: compact ? 26 : 38, lineHeight: 1 }}>
        {SAMPLE.guests}
      </span>
        </>
      )}
    </div>
  );
}
