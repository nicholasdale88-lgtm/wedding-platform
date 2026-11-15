import type { InvitationContent, SealColour } from '@wp/shared';
import { isHex, NAMES_STYLES, type NamesStyle } from '../../guest/themeKit';
import { sealSwatch } from '../../guest/invitation/WaxSeal';

/**
 * Colour boards: the look of a designer's studio wall. Each board is a pinned sheet of the invitation's colours
 * (the paper, a soft tint, the metallic, the ink and the envelope) with a wax seal, a ribbon and the names in
 * their lettering, so a couple can see a whole palette together before choosing it. Tapping a board puts its
 * colours (and seal) on the invitation; every colour can still be changed on its own below.
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
}
export const BOARDS: Board[] = [
  { name: 'Sage & champagne', mood: 'Garden, soft daylight', paper: '#f7f3ea', soft: '#dfe6d3', accent: '#c9a96a', ink: '#3e4a36', envelope: '#e8e0cc', seal: 'Sage', names: 'script' },
  { name: 'Blush & gold', mood: 'Romantic, afternoon tea', paper: '#fdf6f3', soft: '#f3dcdc', accent: '#c8a46a', ink: '#5a3e46', envelope: '#f0d9d4', seal: 'Dusty rose', names: 'parisienne' },
  { name: 'Dusty blue & silver', mood: 'Coastal chapel, cool morning', paper: '#f5f7f9', soft: '#d6e0ea', accent: '#a7b1bb', ink: '#2f3e52', envelope: '#c9d6e3', seal: 'Daphne blue', names: 'vibes' },
  { name: 'Terracotta sunset', mood: 'Desert, warm golden hour', paper: '#fbf3ec', soft: '#ecd2c1', accent: '#c27a52', ink: '#5a3426', envelope: '#e3b79c', seal: 'Terracotta', names: 'playfair' },
  { name: 'Navy & gold', mood: 'Black tie, ballroom', paper: '#fbf9f4', soft: '#e4e2dc', accent: '#c6a157', ink: '#1d2a44', envelope: '#22304d', seal: 'Gold', names: 'caps' },
  { name: 'Lavender fields', mood: 'Country, early summer', paper: '#faf7fb', soft: '#e7dff0', accent: '#b9a06a', ink: '#4a3d5c', envelope: '#ddd2ea', seal: 'Lilac', names: 'script' },
  { name: 'Olive grove', mood: 'Vineyard, long lunch', paper: '#f6f4ec', soft: '#dfe0c8', accent: '#a58d4f', ink: '#3c4128', envelope: '#cfd0b0', seal: 'Forest green', names: 'playfair' },
  { name: 'Coastal linen', mood: 'Beach, sea breeze', paper: '#f8f6f1', soft: '#dde9ea', accent: '#b8a27a', ink: '#2e4a52', envelope: '#e6e1d5', seal: 'Pearl white', names: 'vibes' },
  { name: 'Burgundy & blush', mood: 'Autumn, candlelight', paper: '#fbf5f2', soft: '#ecd3d0', accent: '#b8925a', ink: '#5c1f2b', envelope: '#6b2533', seal: 'Burgundy', names: 'parisienne' },
  { name: 'Emerald evening', mood: 'Estate, evening garden', paper: '#f6f5ef', soft: '#d5e3da', accent: '#c4a55e', ink: '#1f3d33', envelope: '#21463a', seal: 'Gold', names: 'script' },
  { name: 'Ivory minimal', mood: 'Gallery, clean lines', paper: '#ffffff', soft: '#f0eeea', accent: '#b5a58a', ink: '#2b2b2b', envelope: '#f4f1ea', seal: 'Black', names: 'caps' },
  { name: 'Peach & sage', mood: 'Spring, garden party', paper: '#fff8f2', soft: '#fbe1d0', accent: '#c99a63', ink: '#4c5a3f', envelope: '#f6d8c2', seal: 'Champagne', names: 'script' },
];

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const boardOn = (b: Board, custom: InvitationContent['custom']) => same(custom?.paper, b.paper) && same(custom?.accent, b.accent) && same(custom?.ink, b.ink);

/** What choosing a board sets on the invitation. */
export const boardPatch = (b: Board, inv: InvitationContent): Partial<InvitationContent> => ({
  custom: { ...inv.custom, paper: b.paper, soft: b.soft, accent: b.accent, ink: b.ink, envelope: b.envelope },
  seal: b.seal,
});

const label = (hex: string) => hex.replace('#', '').toUpperCase();

/** One pinned board: paper swatch, tint, metallic foil, ink, envelope chip, the seal and a ribbon. */
function BoardCard({ b, on, onPick, names }: { b: Board; on: boolean; onPick: () => void; names: [string, string] }) {
  const style = NAMES_STYLES[b.names];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={`${b.name}: ${b.mood}`}
      onClick={onPick}
      className={`group relative flex flex-col gap-2 p-3 pt-4 rounded-[6px] text-left cursor-pointer transition-transform hover:-translate-y-[2px] ${on ? 'shadow-[0_0_0_2px_#33402f,0_14px_28px_rgba(40,30,20,.18)]' : 'shadow-[0_8px_20px_rgba(40,30,20,.12)]'}`}
      style={{ background: '#fdfcf9', rotate: on ? '0deg' : undefined }}
    >
      {/* The pin. */}
      <span aria-hidden className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-[14px] h-[14px] rounded-full shadow-[0_2px_3px_rgba(0,0,0,.3)]" style={{ background: `radial-gradient(circle at 35% 30%, #fff8, ${b.accent} 45%, ${b.ink})` }} />
      <span aria-hidden className="relative block h-[118px] rounded-[3px] overflow-hidden" style={{ background: b.paper, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.06)' }}>
        {/* The envelope behind, the tint as a fabric swatch, the foil strip, the ink as a card of lettering. */}
        <span className="absolute right-[-10px] bottom-[-14px] w-[58%] h-[62%] rotate-[-8deg] rounded-[3px] shadow-[0_4px_10px_rgba(0,0,0,.18)]" style={{ background: b.envelope }}>
          <span className="absolute inset-0" style={{ background: 'linear-gradient(160deg, transparent 49%, rgba(0,0,0,.08) 50%, transparent 51%), linear-gradient(20deg, transparent 49%, rgba(0,0,0,.08) 50%, transparent 51%)' }} />
        </span>
        <span className="absolute left-[8px] top-[10px] w-[44%] h-[56%] rotate-[4deg] rounded-[2px]" style={{ background: `repeating-linear-gradient(45deg, ${b.soft} 0 3px, color-mix(in srgb, ${b.soft} 88%, #000) 3px 4px)` }} />
        <span className="absolute left-[14px] bottom-[16px] w-[52%] h-[8px] rotate-[-3deg]" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${b.accent} 70%, #fff), ${b.accent}, color-mix(in srgb, ${b.accent} 70%, #000))` }} />
        <span className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap" style={{ color: b.ink, fontFamily: style.font, fontSize: b.names === 'caps' ? 13 : 24, letterSpacing: b.names === 'caps' ? '.22em' : undefined, textTransform: b.names === 'caps' ? 'uppercase' : undefined }}>
          {names[0]} &amp; {names[1]}
        </span>
        <span className="absolute right-[18%] top-[56%] w-[26px] h-[26px] rounded-full shadow-[0_3px_5px_rgba(0,0,0,.3)]" style={{ background: `radial-gradient(circle at 35% 30%, #ffffff66, ${sealSwatch(b.seal)} 55%)` }} />
      </span>
      {/* The colour chips, named like a designer's swatches. */}
      <span aria-hidden className="grid grid-cols-5 gap-[3px]">
        {[b.paper, b.soft, b.accent, b.ink, b.envelope].map((c, i) => (
          <span key={i} className="flex flex-col rounded-[2px] overflow-hidden border border-black/5">
            <span className="h-[22px]" style={{ background: c }} />
            <span className="text-[8px] leading-[12px] text-center text-[#6b6458] bg-white tracking-[.04em]">{label(c)}</span>
          </span>
        ))}
      </span>
      <span className="flex flex-col">
        <span className="text-[13px] font-semibold text-[#2e2a24]">
          {b.name}
          {on ? ' ✓' : ''}
        </span>
        <span className="text-[11px] text-[#7a7466]">{b.mood}</span>
      </span>
    </button>
  );
}

/** The studio wall of boards, and the couple's current palette as a board of their own. */
export function ColourBoards({ inv, setInv, names = ['A', 'B'] }: { inv: InvitationContent; setInv: (p: Partial<InvitationContent>) => void; names?: [string, string] }) {
  const custom = inv.custom ?? {};
  const own = ['paper', 'soft', 'accent', 'ink', 'envelope'].every((k) => isHex(custom[k as 'paper'])) && !BOARDS.some((b) => boardOn(b, custom));
  return (
    <section aria-label="Colour boards" className="flex flex-col gap-3 p-4 rounded-[14px]" style={{ background: 'linear-gradient(180deg,#efe9df,#e7dfd2)', boxShadow: 'inset 0 1px 0 #fff8, inset 0 0 0 1px rgba(0,0,0,.05)' }}>
      <div className="flex justify-between items-end gap-2 flex-wrap">
        <span className="flex flex-col">
          <span className="text-[11px] font-semibold tracking-[.22em] uppercase text-[#8a7a5c]">The studio</span>
          <span className="text-[18px] font-display text-[#2e2a24]">Colour boards</span>
        </span>
        <span className="text-[12px] text-[#7a7466]">Tap a board to use its colours and seal. Fine-tune any colour below.</span>
      </div>
      <div role="radiogroup" aria-label="Colour boards" className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 pt-2">
        {BOARDS.map((b) => (
          <BoardCard key={b.name} b={b} names={names} on={boardOn(b, custom)} onPick={() => setInv(boardPatch(b, inv))} />
        ))}
      </div>
      {own && <span className="text-[12px] text-[#5b6a52]">You’re using your own colours.</span>}
    </section>
  );
}
