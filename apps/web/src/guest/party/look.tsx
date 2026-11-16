import type { ReactNode } from 'react';
import { isHex, mix, themeOf } from '../themeKit';

/**
 * The wedding party pages' look: warm paper in the wedding's own colours (its invitation theme), elegant
 * serif headings and small spaced capitals, like the invitation and the night-before guide.
 */

export const SANS = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";
export const SERIF = "'Cormorant Garamond', Georgia, serif";

export interface PartyLook {
  paper: string;
  ink: string;
  gold: string;
  soft: string;
  /** Cards: a touch lighter than the paper. */
  card: string;
  /** Hairlines and borders. */
  line: string;
  /** A soft wash of the accent (their own moments, highlights). */
  wash: string;
  /** The run sheet line happening now: a deeper wash. */
  nowWash: string;
  /** Small capitals: the accent, deepened enough to read. */
  label: string;
  /** The page: paper, lit softly from the top. */
  bg: string;
  shadow: string;
}

const pick = (v: string | undefined, fallback: string) => (isHex(v) ? v : fallback);

export function partyLook(theme: string | undefined): PartyLook {
  const t = themeOf(theme);
  const paper = pick(t.b1, '#f6f0e2');
  const ink = pick(t.dg, '#33402f');
  const gold = pick(t.acc, '#b39563');
  const soft = pick(t.b2, mix(paper, gold, 0.25));
  return {
    paper,
    ink,
    gold,
    soft,
    card: mix(paper, '#ffffff', 0.65),
    line: mix(paper, ink, 0.14),
    wash: mix(paper, gold, 0.16),
    nowWash: mix(paper, gold, 0.3),
    label: mix(gold, ink, 0.45),
    bg: `radial-gradient(130% 55% at 50% 0%, ${mix(paper, '#ffffff', 0.6)} 0%, ${paper} 60%), ${paper}`,
    shadow: '0 1px 2px rgba(0,0,0,.04), 0 10px 28px -18px rgba(0,0,0,.28)',
  };
}

/** A fine rule with a diamond at its centre. */
export function Ornament({ gold, width = 120 }: { gold: string; width?: number }) {
  const mid = width / 2;
  return (
    <svg aria-hidden="true" width={width} height="12" viewBox={`0 0 ${width} 12`} className="block mx-auto">
      <line x1="0" y1="6" x2={mid - 10} y2="6" stroke={gold} strokeWidth="1" />
      <path d={`M${mid} 1 L${mid + 5} 6 L${mid} 11 L${mid - 5} 6 Z`} fill={gold} />
      <line x1={mid + 10} y1="6" x2={width} y2="6" stroke={gold} strokeWidth="1" />
    </svg>
  );
}

/** Small spaced capitals above a heading. */
export function Eyebrow({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div className="text-[14px] tracking-[.2em] uppercase font-semibold" style={{ fontFamily: SANS, color }}>
      {children}
    </div>
  );
}

/** A section's heading: what it is in small capitals, then its name in the serif, then the ornament. */
export function Heading({ kicker, title, look }: { kicker?: ReactNode; title: string; look: PartyLook }) {
  return (
    <div className="text-center flex flex-col gap-1">
      {kicker && <Eyebrow color={look.label}>{kicker}</Eyebrow>}
      <h2 className="m-0 font-normal text-[34px] leading-[1.1]">{title}</h2>
      <div className="pt-1">
        <Ornament gold={look.gold} width={84} />
      </div>
    </div>
  );
}
