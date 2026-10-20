import type { CSSProperties } from 'react';

/**
 * The envelope's finishing touches, drawn over the design's envelope and moving with it:
 * - a patterned liner on the underside of the flap, seen as it swings open (floral, eucalyptus, gold
 *   stripes, confetti, gold foil);
 * - the guest's name written across the front, a postage stamp and a round postmark with the date;
 * - a silk ribbon or twine around it (with a gap for the seal), and a slow gold shimmer across the paper.
 * Phases are the envelope's: 0 closed, 1 tapped, 2 opening, 3 card out, 4 gone.
 */
export interface EnvelopeOptions {
  liner?: 'none' | 'floral' | 'eucalyptus' | 'stripes' | 'confetti' | 'foil';
  name?: boolean;
  stamp?: boolean;
  ribbon?: 'none' | 'silk' | 'twine';
  shimmer?: boolean;
}
interface Colours {
  paper: string;
  ink: string;
  accent: string;
  soft: string;
  envelope: string;
}

const svg = (body: string, w: number, h: number) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${body}</svg>`)}")`;

/** The liner's pattern, in the wedding's colours. */
function linerBackground(kind: NonNullable<EnvelopeOptions['liner']>, c: Colours): string {
  if (kind === 'stripes') return `repeating-linear-gradient(90deg, ${c.accent} 0 10px, ${c.paper} 10px 22px)`;
  if (kind === 'foil') return `linear-gradient(120deg, #a77b2c 0%, #f3dc9a 22%, #b98a36 40%, #f8e7b4 58%, #9c7128 78%, #e9c97c 100%)`;
  if (kind === 'confetti') {
    const dots = [
      [8, 10, c.accent, 3],
      [30, 24, c.soft, 4],
      [50, 6, c.ink, 2],
      [18, 42, c.ink, 2.5],
      [44, 40, c.accent, 3.5],
      [58, 28, c.soft, 2],
    ]
      .map(([x, y, f, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='${f}'/>`)
      .join('');
    return `${svg(dots, 64, 52)}, ${c.paper}`;
  }
  if (kind === 'eucalyptus') {
    const leaf = (x: number, y: number, a: number, f: string) => `<ellipse cx='${x}' cy='${y}' rx='7' ry='3.6' transform='rotate(${a} ${x} ${y})' fill='${f}' opacity='.85'/>`;
    const body = `<path d='M10 70 Q40 40 70 10' stroke='${c.accent}' stroke-width='1' fill='none'/>${leaf(20, 56, -40, c.soft)}${leaf(30, 50, 40, c.ink)}${leaf(38, 40, -40, c.soft)}${leaf(48, 34, 40, c.ink)}${leaf(55, 24, -40, c.soft)}${leaf(64, 18, 40, c.soft)}`;
    return `${svg(body, 80, 80)}, ${c.paper}`;
  }
  // Floral: little five-petal flowers and buds.
  const flower = (x: number, y: number, r: number, f: string) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = (i * 72 * Math.PI) / 180;
      return `<circle cx='${(x + Math.cos(a) * r).toFixed(1)}' cy='${(y + Math.sin(a) * r).toFixed(1)}' r='${(r * 0.75).toFixed(1)}' fill='${f}'/>`;
    }).join('') + `<circle cx='${x}' cy='${y}' r='${(r * 0.5).toFixed(1)}' fill='${c.accent}'/>`;
  const body = `${flower(14, 14, 5, c.soft)}${flower(48, 40, 6, c.soft)}<circle cx='44' cy='12' r='2' fill='${c.accent}'/><circle cx='16' cy='46' r='2.4' fill='${c.ink}' opacity='.5'/>`;
  return `${svg(body, 64, 60)}, ${c.paper}`;
}

/** Light writing on a dark envelope, dark on a light one. */
const lightOn = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1]!, 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 140;
};

export function EnvelopeExtras({ phase, opts, colours, guestName, date, place, initials }: { phase: number; opts: EnvelopeOptions; colours: Colours; guestName: string; date: string; place: string; initials: string }) {
  if (phase >= 4) return null;
  const closed = phase < 2;
  const front: CSSProperties = { opacity: closed ? 1 : 0, transition: 'opacity .6s ease' };
  const writing = lightOn(colours.envelope) ? '#fbf6ea' : colours.ink;
  const liner = opts.liner ?? 'floral';
  const ribbon = opts.ribbon ?? 'none';
  // The stamp has room for initials: "Alex & Sam" → "A&S".
  const short = initials.length <= 7 ? initials : initials.split(/\s*&\s*|\s+and\s+/i).map((w) => w.trim().charAt(0).toUpperCase()).filter(Boolean).join('&');
  // The seal's size in the design (a gap is left for it in the ribbon).
  const seal = 'clamp(96px,24vmin,150px)';
  return (
    <div aria-hidden className="fixed inset-0 z-[1] pointer-events-none overflow-hidden" style={{ perspective: 1100 }}>
      {/* The liner: on the underside of the flap, it swings up into view as the envelope opens. */}
      {liner !== 'none' && (
        <div
          className="absolute inset-0"
          style={{
            transformOrigin: '50% 0',
            transform: closed ? 'rotateX(0deg)' : 'rotateX(-112deg)',
            opacity: closed ? 0 : 1,
            transition: closed ? 'none' : 'transform 2s cubic-bezier(.45,0,.15,1), opacity .9s ease 1.3s',
            transformStyle: 'preserve-3d',
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transform: 'rotateX(180deg)',
              backfaceVisibility: 'hidden',
              clipPath: 'polygon(0 100%,100% 100%,50% 44%)',
              background: linerBackground(liner, colours),
              boxShadow: 'inset 0 0 40px rgba(0,0,0,.18)',
            }}
          />
        </div>
      )}

      {/* A ribbon or twine around the envelope, either side of the seal. */}
      {ribbon !== 'none' &&
        (['left', 'right'] as const).map((side) => (
          <div
            key={side}
            className="absolute"
            style={{
              ...front,
              top: `calc(56% - ${ribbon === 'silk' ? 11 : 3}px)`,
              height: ribbon === 'silk' ? 22 : 6,
              [side]: 0,
              width: `calc(50% - ${seal} / 2 + 6px)`,
              background:
                ribbon === 'silk'
                  ? `linear-gradient(180deg, rgba(255,255,255,.35), ${colours.accent} 35%, ${colours.accent} 65%, rgba(0,0,0,.25))`
                  : `repeating-linear-gradient(115deg, #b89466 0 3px, #8e6c45 3px 6px)`,
              boxShadow: '0 2px 4px rgba(0,0,0,.25)',
              borderRadius: ribbon === 'twine' ? 3 : 0,
            }}
          />
        ))}

      {/* The guest's name, written across the front below the seal. */}
      {opts.name !== false && guestName && (
        <div className="absolute left-0 right-0 text-center px-6" style={{ ...front, top: '74%', color: writing, fontFamily: "'Great Vibes', 'Pinyon Script', cursive", fontSize: 'clamp(26px,6.4vmin,48px)', lineHeight: 1.1, textShadow: '0 1px 1px rgba(0,0,0,.15)' }}>
          {guestName}
        </div>
      )}

      {/* A postage stamp and postmark in the top right. */}
      {opts.stamp !== false && (
        <div className="absolute" style={{ ...front, top: 'max(18px, 4vmin)', right: 'max(18px, 4vmin)', width: 'clamp(96px,24vmin,150px)' }}>
          <svg viewBox="0 0 120 100" className="w-full h-auto overflow-visible">
            {/* Postmark: a ring with the date and place, and wavy lines. */}
            <g transform="translate(-34 30)" opacity=".78" fill="none" stroke={writing} strokeWidth="1.4">
              <circle cx="40" cy="30" r="24" />
              <circle cx="40" cy="30" r="17" strokeDasharray="2 2" />
              {[0, 7, 14].map((dy) => (
                <path key={dy} d={`M66 ${20 + dy} q10 -5 20 0 t20 0 t20 0`} />
              ))}
              <text x="40" y="28" textAnchor="middle" fontSize="7.5" fill={writing} stroke="none" fontFamily="'Cormorant Garamond', Georgia, serif" fontWeight="600" letterSpacing="1">
                {date}
              </text>
              <text x="40" y="38" textAnchor="middle" fontSize="5.5" fill={writing} stroke="none" fontFamily="'Cormorant Garamond', Georgia, serif" letterSpacing="1">
                {place}
              </text>
            </g>
            {/* The stamp: perforated edge, a little artwork with their initials. */}
            <g transform="translate(46 0) rotate(4 37 46)">
              <rect x="0" y="0" width="74" height="92" fill="#fbf8f0" />
              {Array.from({ length: 10 }, (_, i) => (
                <g key={i} fill={colours.envelope}>
                  <circle cx={(i + 0.5) * 7.4} cy="0" r="2.4" />
                  <circle cx={(i + 0.5) * 7.4} cy="92" r="2.4" />
                </g>
              ))}
              {Array.from({ length: 12 }, (_, i) => (
                <g key={`s${i}`} fill={colours.envelope}>
                  <circle cx="0" cy={(i + 0.5) * 7.66} r="2.4" />
                  <circle cx="74" cy={(i + 0.5) * 7.66} r="2.4" />
                </g>
              ))}
              <rect x="7" y="7" width="60" height="78" fill={colours.soft} />
              <circle cx="37" cy="38" r="18" fill={colours.paper} opacity=".9" />
              <path d="M37 30 c-4 -7 -14 -3 -10 5 c2 4 10 9 10 9 s8 -5 10 -9 c4 -8 -6 -12 -10 -5z" fill={colours.accent} />
              <text x="37" y="72" textAnchor="middle" fontSize="11" fill={colours.ink} fontFamily="'Pinyon Script', cursive">
                {short}
              </text>
              <text x="62" y="18" textAnchor="end" fontSize="8" fill={colours.ink} fontFamily="'Cormorant Garamond', Georgia, serif" fontWeight="600">
                $1
              </text>
            </g>
          </svg>
        </div>
      )}

      {/* A slow gold shimmer across the paper while it waits to be opened. */}
      {opts.shimmer !== false && closed && (
        <div className="absolute inset-0 env-shimmer" style={{ mixBlendMode: 'soft-light', background: 'linear-gradient(105deg, transparent 35%, rgba(255,236,190,.55) 48%, rgba(255,255,255,.7) 50%, rgba(255,236,190,.5) 52%, transparent 65%)', backgroundSize: '250% 100%' }} />
      )}
      <style>{`.env-shimmer{animation:envShimmer 5.5s ease-in-out 1.2s infinite}@keyframes envShimmer{0%{background-position:130% 0}55%,100%{background-position:-30% 0}}@media (prefers-reduced-motion: reduce){.env-shimmer{animation:none;opacity:0}}`}</style>
    </div>
  );
}
