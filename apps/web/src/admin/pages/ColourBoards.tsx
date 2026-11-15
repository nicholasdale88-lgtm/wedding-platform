import type { InvitationContent, SealColour } from '@wp/shared';
import type { CSSProperties } from 'react';
import { isHex, NAMES_STYLES, type NamesStyle } from '../../guest/themeKit';
import { sealSwatch } from '../../guest/invitation/WaxSeal';

/**
 * Mood boards: a vision board meets an interior designer's sample board. Each board is a collage pinned to the
 * studio wall: a snapshot of the mood, a paint card of its colours, a fabric swatch, a stone sample, a sprig,
 * and the invitation itself on its envelope with a wax seal, held on with washi tape. Tapping a board puts its
 * colours (and seal) on the invitation; every colour can still be changed on its own below. All drawn here in
 * code (no photos or borrowed artwork).
 */
export interface Board {
  name: string;
  mood: string;
  paper: string;
  soft: string;
  accent: string;
  ink: string;
  envelope: string;
  seal: SealColour;
  names: NamesStyle;
  /** The materials, as a designer would list them on the board. */
  materials: [string, string, string];
}
export const BOARDS: Board[] = [
  { name: 'Sage & champagne', mood: 'Garden, soft daylight', paper: '#f7f3ea', soft: '#dfe6d3', accent: '#c9a96a', ink: '#3e4a36', envelope: '#e8e0cc', seal: 'Sage', names: 'script', materials: ['Washed linen', 'Champagne foil', 'Sage velvet'] },
  { name: 'Blush & gold', mood: 'Romantic, afternoon tea', paper: '#fdf6f3', soft: '#f3dcdc', accent: '#c8a46a', ink: '#5a3e46', envelope: '#f0d9d4', seal: 'Dusty rose', names: 'parisienne', materials: ['Silk chiffon', 'Gilded edge', 'Rose quartz'] },
  { name: 'Dusty blue & silver', mood: 'Coastal chapel, cool morning', paper: '#f5f7f9', soft: '#d6e0ea', accent: '#a7b1bb', ink: '#2f3e52', envelope: '#c9d6e3', seal: 'Daphne blue', names: 'vibes', materials: ['Cotton rag', 'Brushed silver', 'Chambray'] },
  { name: 'Terracotta sunset', mood: 'Desert, warm golden hour', paper: '#fbf3ec', soft: '#ecd2c1', accent: '#c27a52', ink: '#5a3426', envelope: '#e3b79c', seal: 'Terracotta', names: 'playfair', materials: ['Handmade paper', 'Fired clay', 'Raw silk'] },
  { name: 'Navy & gold', mood: 'Black tie, ballroom', paper: '#fbf9f4', soft: '#e4e2dc', accent: '#c6a157', ink: '#1d2a44', envelope: '#22304d', seal: 'Gold', names: 'caps', materials: ['Heavy board', 'Gold leaf', 'Midnight velvet'] },
  { name: 'Lavender fields', mood: 'Country, early summer', paper: '#faf7fb', soft: '#e7dff0', accent: '#b9a06a', ink: '#4a3d5c', envelope: '#ddd2ea', seal: 'Lilac', names: 'script', materials: ['Deckled cotton', 'Antique brass', 'Lilac organza'] },
  { name: 'Olive grove', mood: 'Vineyard, long lunch', paper: '#f6f4ec', soft: '#dfe0c8', accent: '#a58d4f', ink: '#3c4128', envelope: '#cfd0b0', seal: 'Forest green', names: 'playfair', materials: ['Stone paper', 'Aged brass', 'Olive linen'] },
  { name: 'Coastal linen', mood: 'Beach, sea breeze', paper: '#f8f6f1', soft: '#dde9ea', accent: '#b8a27a', ink: '#2e4a52', envelope: '#e6e1d5', seal: 'Pearl white', names: 'vibes', materials: ['Sun-bleached linen', 'Driftwood', 'Sea glass'] },
  { name: 'Burgundy & blush', mood: 'Autumn, candlelight', paper: '#fbf5f2', soft: '#ecd3d0', accent: '#b8925a', ink: '#5c1f2b', envelope: '#6b2533', seal: 'Burgundy', names: 'parisienne', materials: ['Laid paper', 'Burnished gold', 'Wine velvet'] },
  { name: 'Emerald evening', mood: 'Estate, evening garden', paper: '#f6f5ef', soft: '#d5e3da', accent: '#c4a55e', ink: '#1f3d33', envelope: '#21463a', seal: 'Gold', names: 'script', materials: ['Cotton board', 'Gold foil', 'Emerald silk'] },
  { name: 'Ivory minimal', mood: 'Gallery, clean lines', paper: '#ffffff', soft: '#f0eeea', accent: '#b5a58a', ink: '#2b2b2b', envelope: '#f4f1ea', seal: 'Black', names: 'caps', materials: ['Smooth ivory', 'Travertine', 'Blind deboss'] },
  { name: 'Peach & sage', mood: 'Spring, garden party', paper: '#fff8f2', soft: '#fbe1d0', accent: '#c99a63', ink: '#4c5a3f', envelope: '#f6d8c2', seal: 'Champagne', names: 'script', materials: ['Vellum', 'Copper foil', 'Peach crepe'] },
];

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const boardOn = (b: Board, custom: InvitationContent['custom']) => same(custom?.paper, b.paper) && same(custom?.accent, b.accent) && same(custom?.ink, b.ink);

/** What choosing a board sets on the invitation. */
export const boardPatch = (b: Board, inv: InvitationContent): Partial<InvitationContent> => ({
  custom: { ...inv.custom, paper: b.paper, soft: b.soft, accent: b.accent, ink: b.ink, envelope: b.envelope },
  seal: b.seal,
});

const label = (hex: string) => hex.replace('#', '').toUpperCase();
const mix = (a: string, b: string, pct: number) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;
const HAND = "'Parisienne', cursive";

/** A strip of washi tape, the accent colour, a little see-through. */
const Tape = ({ colour, style }: { colour: string; style: CSSProperties }) => (
  <span aria-hidden className="absolute z-[6] h-[7%] w-[22%]" style={{ background: `repeating-linear-gradient(90deg, ${mix(colour, '#fff', 70)} 0 6%, ${mix(colour, '#fff', 55)} 6% 12%)`, opacity: 0.78, boxShadow: '0 1px 2px rgba(0,0,0,.08)', ...style }} />
);

/**
 * The collage itself. Sized by its width (container units), so the same board works small on the wall and large
 * as the couple's own board.
 */
export function Collage({ b, names }: { b: Board; names: [string, string] }) {
  const style = NAMES_STYLES[b.names];
  const caps = b.names === 'caps';
  return (
    <span aria-hidden className="relative block w-full aspect-[5/4] overflow-hidden rounded-[4px] [container-type:inline-size]" style={{ background: `repeating-linear-gradient(0deg, ${mix(b.paper, '#000', 97)} 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, ${mix(b.paper, '#000', 97)} 0 1px, transparent 1px 3px), ${b.paper}`, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06), inset 0 -30px 40px -30px rgba(0,0,0,.08)' }}>
      {/* The snapshot: the mood as a little landscape (sky, sun, hills), in a white frame. */}
      <span className="absolute z-[2] left-[5%] top-[7%] w-[34%] p-[1.6%] pb-[5%] bg-white rotate-[-6deg] shadow-[0_3px_8px_rgba(0,0,0,.18)]">
        <span className="relative block aspect-square overflow-hidden" style={{ background: `linear-gradient(180deg, ${mix(b.soft, '#fff', 70)}, ${b.paper} 62%)` }}>
          <span className="absolute left-[58%] top-[22%] w-[24%] aspect-square rounded-full" style={{ background: `radial-gradient(circle, ${mix(b.accent, '#fff', 60)}, ${b.accent})`, boxShadow: `0 0 18px ${mix(b.accent, 'transparent', 60)}` }} />
          <span className="absolute left-[-20%] right-[20%] bottom-[-30%] h-[70%] rounded-[50%]" style={{ background: mix(b.soft, b.ink, 70) }} />
          <span className="absolute left-[25%] right-[-30%] bottom-[-40%] h-[72%] rounded-[50%]" style={{ background: mix(b.ink, b.soft, 70) }} />
        </span>
        <span className="absolute left-0 right-0 bottom-[0.5%] text-center whitespace-nowrap overflow-hidden" style={{ fontFamily: HAND, color: b.ink, fontSize: '4.2cqw', lineHeight: 1.1 }}>
          {b.mood.split(',')[0]}
        </span>
      </span>
      <Tape colour={b.accent} style={{ left: '12%', top: '3%', rotate: '-12deg' }} />

      {/* The paint card: three colours, as an interior designer pins them. */}
      <span className="absolute z-[2] right-[5%] top-[5%] w-[19%] flex flex-col bg-white p-[1.2%] gap-[1.2%] rotate-[4deg] shadow-[0_3px_8px_rgba(0,0,0,.16)]">
        {[b.soft, b.accent, b.ink].map((c, i) => (
          <span key={i} className="flex flex-col">
            <span className="block aspect-[5/3]" style={{ background: c }} />
            <span className="text-[#6b6458] tracking-[.06em]" style={{ fontSize: '2.3cqw', lineHeight: 1.4 }}>
              No. {label(c)}
            </span>
          </span>
        ))}
      </span>
      <Tape colour={b.accent} style={{ right: '7%', top: '2%', rotate: '8deg', width: '16%' }} />

      {/* The fabric: pinked edges, a sheen like velvet or silk. */}
      <span className="absolute z-[1] left-[6%] bottom-[7%] w-[30%] h-[30%] rotate-[5deg]" style={{ background: `linear-gradient(125deg, ${mix(b.soft, '#fff', 75)}, ${b.soft} 40%, ${mix(b.soft, '#000', 85)} 75%, ${b.soft})`, clipPath: 'polygon(0 4%,4% 0,8% 4%,12% 0,16% 4%,20% 0,24% 4%,28% 0,32% 4%,36% 0,40% 4%,44% 0,48% 4%,52% 0,56% 4%,60% 0,64% 4%,68% 0,72% 4%,76% 0,80% 4%,84% 0,88% 4%,92% 0,96% 4%,100% 0,100% 100%,0 100%)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.15))' }} />

      {/* A stone sample: a little round of marble in the paper and ink. */}
      <span className="absolute z-[3] left-[30%] bottom-[5%] w-[12%] aspect-square rounded-full shadow-[0_3px_6px_rgba(0,0,0,.22)]" style={{ background: `radial-gradient(ellipse at 30% 25%, #fff, transparent 45%), linear-gradient(115deg, transparent 40%, ${mix(b.ink, 'transparent', 25)} 42%, transparent 46%, transparent 62%, ${mix(b.accent, 'transparent', 40)} 64%, transparent 67%), ${mix(b.paper, b.soft, 50)}` }} />

      {/* A sprig of leaves, drawn. */}
      <svg viewBox="0 0 40 80" className="absolute z-[4] right-[28%] bottom-[4%] w-[11%] rotate-[18deg]">
        <path d="M20 78 C20 55 19 30 22 4" stroke={mix(b.ink, b.soft, 75)} strokeWidth="1.4" fill="none" />
        {[14, 26, 38, 50, 62].map((y, i) => (
          <g key={y} fill={mix(b.ink, b.soft, i % 2 ? 55 : 70)}>
            <ellipse cx="13" cy={y} rx="7" ry="3.2" transform={`rotate(-30 13 ${y})`} />
            <ellipse cx="28" cy={y + 5} rx="7" ry="3.2" transform={`rotate(30 28 ${y + 5})`} />
          </g>
        ))}
      </svg>

      {/* The envelope, and the invitation on it with its seal. */}
      <span className="absolute z-[3] left-[38%] top-[34%] w-[42%] aspect-[7/5] rotate-[-7deg] shadow-[0_4px_10px_rgba(0,0,0,.18)]" style={{ background: b.envelope }}>
        <span className="absolute inset-0" style={{ background: `linear-gradient(32deg, transparent 49.4%, ${mix(b.envelope, '#000', 85)} 50%, transparent 50.6%), linear-gradient(-32deg, transparent 49.4%, ${mix(b.envelope, '#000', 85)} 50%, transparent 50.6%)` }} />
      </span>
      <span className="absolute z-[5] left-[34%] top-[22%] w-[34%] aspect-[5/7] rotate-[3deg] flex flex-col items-center justify-center gap-[4%] shadow-[0_5px_12px_rgba(0,0,0,.2)]" style={{ background: b.paper, outline: `1px solid ${b.accent}`, outlineOffset: '-5%' }}>
        <span className="tracking-[.2em] uppercase" style={{ color: mix(b.ink, b.paper, 70), fontSize: '1.9cqw' }}>
          Together with their families
        </span>
        <span className="whitespace-nowrap" style={{ color: b.ink, fontFamily: style.font, fontSize: caps ? '3.6cqw' : '6.4cqw', letterSpacing: caps ? '.2em' : undefined, textTransform: caps ? 'uppercase' : undefined, lineHeight: 1.1 }}>
          {names[0]} &amp; {names[1]}
        </span>
        <span className="block w-[30%] h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${b.accent}, transparent)` }} />
      </span>
      <span className="absolute z-[6] left-[59%] top-[60%] w-[10%] aspect-square rounded-full shadow-[0_3px_5px_rgba(0,0,0,.3)]" style={{ background: `radial-gradient(circle at 35% 30%, #ffffff66, ${sealSwatch(b.seal)} 55%)` }}>
        <span className="absolute inset-[18%] rounded-full" style={{ boxShadow: 'inset 0 0 0 1.5px rgba(0,0,0,.18)' }} />
      </span>
    </span>
  );
}

/** One board on the wall: the collage, its name and mood, its materials and colours. */
function BoardCard({ b, on, onPick, names }: { b: Board; on: boolean; onPick: () => void; names: [string, string] }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${b.name}: ${b.mood}`}
      onClick={onPick}
      className={`group relative flex flex-col gap-2 p-2 pb-3 rounded-[6px] text-left cursor-pointer transition-transform hover:-translate-y-[2px] hover:rotate-0 ${on ? 'shadow-[0_0_0_2px_#33402f,0_14px_28px_rgba(40,30,20,.2)]' : 'shadow-[0_8px_20px_rgba(40,30,20,.12)]'}`}
      style={{ background: '#fdfcf9' }}
    >
      <span aria-hidden className="absolute z-10 -top-[6px] left-1/2 -translate-x-1/2 w-[13px] h-[13px] rounded-full shadow-[0_2px_3px_rgba(0,0,0,.3)]" style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${b.accent} 45%, ${b.ink})` }} />
      <Collage b={b} names={names} />
      <span className="flex flex-col px-1">
        <span className="text-[13px] font-semibold text-[#2e2a24]">
          {b.name}
          {on ? ' ✓' : ''}
        </span>
        <span className="text-[11px] text-[#7a7466]">{b.mood}</span>
        <span className="text-[11px] italic text-[#8a7a5c]">{b.materials.join(' · ')}</span>
      </span>
      <span aria-hidden className="flex gap-[3px] px-1">
        {[b.paper, b.soft, b.accent, b.ink, b.envelope].map((c, i) => (
          <span key={i} className="flex-1 h-[10px] rounded-[2px] border border-black/10" style={{ background: c }} />
        ))}
      </span>
    </button>
  );
}

/** The studio wall of mood boards, with the couple's chosen board pinned up large. */
export function ColourBoards({ inv, setInv, names = ['A', 'B'] }: { inv: InvitationContent; setInv: (p: Partial<InvitationContent>) => void; names?: [string, string] }) {
  const custom = inv.custom ?? {};
  const chosen = BOARDS.find((b) => boardOn(b, custom)) ?? null;
  const own = ['paper', 'soft', 'accent', 'ink', 'envelope'].every((k) => isHex(custom[k as 'paper'])) && !chosen;
  // The couple's own colours, as a board of their own.
  const mine: Board | null = own
    ? { name: 'Your own colours', mood: 'Yours, made your way', paper: custom.paper!, soft: custom.soft!, accent: custom.accent!, ink: custom.ink!, envelope: custom.envelope!, seal: (inv.seal as SealColour | undefined) ?? 'Gold', names: (custom.names as NamesStyle | undefined) ?? 'script', materials: ['Your paper', 'Your foil', 'Your ink'] }
    : null;
  const feature = chosen ?? mine;
  return (
    <section
      aria-label="Mood boards"
      className="flex flex-col gap-4 p-4 sm:p-5 rounded-[14px]"
      style={{ background: 'radial-gradient(circle at 20% 10%, #f3ede3, transparent 60%), repeating-linear-gradient(45deg, rgba(120,100,70,.035) 0 2px, transparent 2px 5px), linear-gradient(180deg,#ece5d8,#e3dacb)', boxShadow: 'inset 0 1px 0 #fff8, inset 0 0 0 1px rgba(0,0,0,.05)' }}
    >
      <div className="flex justify-between items-end gap-2 flex-wrap">
        <span className="flex flex-col">
          <span className="text-[11px] font-semibold tracking-[.22em] uppercase text-[#8a7a5c]">The design studio</span>
          <span className="text-[22px] font-display text-[#2e2a24] leading-tight">Mood boards</span>
        </span>
        <span className="text-[12px] text-[#7a7466] max-w-[340px]">A whole look on one board: paper, foil, ink, envelope and seal together. Tap one to use it, then fine-tune any colour below.</span>
      </div>

      {feature && (
        <div className="grid gap-4 items-center sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] p-3 rounded-[8px] bg-[#fdfcf9] shadow-[0_10px_26px_rgba(40,30,20,.14)]">
          <Collage b={feature} names={names} />
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold tracking-[.22em] uppercase text-[#8a7a5c]">Your board</span>
            <span className="text-[26px] leading-tight text-[#2e2a24]" style={{ fontFamily: HAND }}>
              {feature.name}
            </span>
            <span className="text-[13px] text-[#5b6a52]">{feature.mood}</span>
            <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[13px] text-[#2e2a24]">
              {(
                [
                  ['Paper', feature.paper],
                  ['Tint', feature.soft],
                  ['Foil', feature.accent],
                  ['Ink', feature.ink],
                  ['Envelope', feature.envelope],
                ] as const
              ).map(([k, c], i) => (
                <li key={k} className="flex items-center gap-2">
                  <span aria-hidden className="w-[22px] h-[22px] rounded-[3px] border border-black/10" style={{ background: c }} />
                  <span className="flex-1">
                    {k}
                    {feature.materials[i] && i < 3 ? <span className="text-[#8a7a5c] italic"> · {feature.materials[i]}</span> : null}
                  </span>
                  <span className="text-[11px] tracking-[.06em] text-[#7a7466]">{label(c)}</span>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span aria-hidden className="w-[22px] h-[22px] rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, #ffffff66, ${sealSwatch(feature.seal)} 55%)` }} />
                <span className="flex-1">Wax seal · {feature.seal}</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      <div role="radiogroup" aria-label="Mood boards" className="grid gap-4 grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 pt-2">
        {BOARDS.map((b, i) => (
          <span key={b.name} className="block" style={{ rotate: `${[-1.2, 0.8, -0.4, 1.1, -0.9, 0.5][i % 6]}deg` }}>
            <BoardCard b={b} names={names} on={boardOn(b, custom)} onPick={() => setInv(boardPatch(b, inv))} />
          </span>
        ))}
      </div>
    </section>
  );
}
