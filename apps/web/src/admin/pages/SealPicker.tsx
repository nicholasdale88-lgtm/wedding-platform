import { ENVELOPE_PAPER_INFO, ENVELOPE_PAPERS, SEAL_COLOURS, SEAL_STYLE_INFO, SEAL_STYLES, type InvitationContent, type SealLetters } from '@wp/shared';
import { paperHex, sealWords, WaxSeal } from '../../guest/invitation/WaxSeal';
import { themeOf } from '../../guest/themeKit';
import { inputCls, Label } from '../ui';

/**
 * Setup → Invitation: the wax seal and the envelope's paper, chosen by sight. A small envelope shows the
 * choice as it is now; the wax colours, the seal designs and the papers are swatches drawn the same way
 * as on the invitation. Nothing chosen: the seal and envelope look exactly as they always have.
 */

/** A sample date for the date seal (the real one comes from the wedding's date). */
export const SAMPLE_DATE = '20.03.27';

const radio = (on: boolean) =>
  `flex flex-col items-center gap-1 p-[6px] rounded-[12px] border bg-white cursor-pointer text-[11px] leading-tight text-center text-[var(--adm-ink,#33402f)] ${on ? 'border-[#33402f] shadow-[0_0_0_2px_#33402f]' : 'border-[var(--adm-line,#e2d7bc)] hover:border-[#b39563]'}`;

export function SealPicker({
  inv,
  theme,
  initials,
  setInv,
}: {
  inv: InvitationContent;
  theme: string;
  /** Their two initials (from the monogram). */
  initials: [string, string];
  setInv: (p: Partial<InvitationContent>) => void;
}) {
  const colour = inv.seal ?? 'Sandstone';
  const d = inv.sealDesign ?? {};
  const style = d.style ?? 'classic';
  const letters: SealLetters = d.letters ?? 'script';
  const setD = (p: Partial<NonNullable<InvitationContent['sealDesign']>>) => setInv({ sealDesign: { ...d, ...p } });
  const words = (s = style) => sealWords({ ...d, style: s }, initials, SAMPLE_DATE);
  const look = themeOf(theme, inv.custom);
  const paper = inv.envelope?.paper;
  const env = paperHex(paper) ?? look.e1 ?? '#e6dcc4';
  const usesWords = style !== 'floral' && style !== 'heart';

  return (
    <div className="flex flex-col gap-3">
      {/* The choice as it is now, on a small envelope. */}
      <div className="flex gap-4 items-center flex-wrap">
        <div aria-label="Seal and envelope preview" role="img" className="relative w-[200px] h-[132px] rounded-[6px] overflow-hidden shadow-[0_6px_16px_rgba(40,30,15,.22)]" style={{ background: env }}>
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,.25), rgba(0,0,0,.12))' }} />
          <div className="absolute inset-0" style={{ clipPath: 'polygon(0 0,100% 0,50% 56%)', background: `linear-gradient(180deg, ${look.t1 ?? env}, ${env})`, filter: 'brightness(1.04)' }} />
          <div className="absolute inset-0" style={{ clipPath: 'polygon(0 0,100% 0,50% 56%)', boxShadow: 'inset 0 -1px 0 rgba(0,0,0,.2)' }} />
          <div className="absolute" style={{ left: 'calc(50% - 32px)', top: 'calc(56% - 32px)', width: 64, height: 64, filter: 'drop-shadow(0 3px 4px rgba(50,30,10,.4))' }}>
            <WaxSeal colour={colour} design={d} words={words()} px={64} still />
          </div>
        </div>
        <span className="text-[13px] text-[var(--adm-muted,#5b6a52)] max-w-[260px]">
          {colour} seal · {SEAL_STYLE_INFO[style].label.toLowerCase()}
          {usesWords && words() ? ` · “${words()}”` : ''} · {paper ? ENVELOPE_PAPER_INFO[paper].label.toLowerCase() : 'your look’s own'} envelope. The preview beside follows once it saves.
        </span>
      </div>

      <span className="text-[13px] font-semibold text-[var(--adm-ink,#33402f)]">Wax colour</span>
      <div role="radiogroup" aria-label="Wax colour" className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(64px,1fr))]">
        {SEAL_COLOURS.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={colour === c} aria-label={c} title={c} onClick={() => setInv({ seal: c })} className={radio(colour === c)}>
            <span className="relative block w-[40px] h-[40px]">
              <WaxSeal colour={c} design={d} words={words()} px={40} still />
            </span>
            {c}
          </button>
        ))}
      </div>

      <span className="text-[13px] font-semibold text-[var(--adm-ink,#33402f)]">Seal design</span>
      <div role="radiogroup" aria-label="Seal design" className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(92px,1fr))]">
        {SEAL_STYLES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={style === s} title={SEAL_STYLE_INFO[s].hint} onClick={() => setD({ style: s })} className={radio(style === s)}>
            <span className="relative block w-[52px] h-[52px]">
              <WaxSeal colour={colour} design={{ ...d, style: s }} words={words(s)} px={52} still />
            </span>
            {SEAL_STYLE_INFO[s].label}
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        <div role="radiogroup" aria-label="Letters on the seal" className="flex gap-2">
          {(
            [
              ['script', 'Script'],
              ['serif', 'Serif capitals'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={letters === k} onClick={() => setD({ letters: k })} className={`${radio(letters === k)} min-w-[96px]`}>
              <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, fontStyle: k === 'script' ? 'italic' : 'normal', fontWeight: k === 'script' ? 500 : 600, textTransform: k === 'serif' ? 'uppercase' : undefined }}>
                {initials[0] || 'A'} &amp; {initials[1] || 'B'}
              </span>
              {l}
            </button>
          ))}
        </div>
        <Label text="Words on the seal" className="flex-1 min-w-[180px]">
          <input
            value={d.text ?? ''}
            maxLength={12}
            placeholder={words() || `${initials[0]} & ${initials[1]}`}
            onChange={(e) => setD({ text: e.target.value.slice(0, 12) })}
            className={inputCls}
          />
        </Label>
      </div>
      <span className="text-[12px] text-[#7a7466]">
        {usesWords
          ? 'Leave it empty for your initials (from your monogram); the date seal shows your wedding date, like 20.03.27. Up to 12 letters, e.g. one initial or “2027”.'
          : 'This design has no words: just the pressed motif.'}
      </span>

      <span className="text-[13px] font-semibold text-[var(--adm-ink,#33402f)]">Envelope colour</span>
      <div role="radiogroup" aria-label="Envelope colour" className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(76px,1fr))]">
        <button type="button" role="radio" aria-checked={!paper} onClick={() => setInv({ envelope: { ...inv.envelope, paper: undefined } })} className={radio(!paper)}>
          <span className="block w-[44px] h-[30px] rounded-[4px] border border-black/10" style={{ background: look.e1 ?? '#e6dcc4' }} />
          Your look’s own
        </button>
        {ENVELOPE_PAPERS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={paper === k} onClick={() => setInv({ envelope: { ...inv.envelope, paper: k } })} className={radio(paper === k)}>
            <span className="block w-[44px] h-[30px] rounded-[4px] border border-black/10" style={{ background: `linear-gradient(160deg, rgba(255,255,255,.18), rgba(0,0,0,.08)), ${ENVELOPE_PAPER_INFO[k].hex}` }} />
            {ENVELOPE_PAPER_INFO[k].label}
          </button>
        ))}
      </div>
    </div>
  );
}
