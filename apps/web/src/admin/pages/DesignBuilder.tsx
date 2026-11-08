import {
  OPENING_INFO,
  OPENINGS,
  originalTexts,
  templateOf,
  TEMPLATES,
  toneOf,
  TONES,
  toneTexts,
  wordingChanges,
  type DesignTemplate,
  type InvitationContent,
  type Opening,
} from '@wp/shared';
import { useState } from 'react';
import { isHex, NAMES_STYLES, paletteOf, themeOf, type NamesStyle } from '../../guest/themeKit';
import { inputCls, Label, Pill } from '../ui';
import { Grid, TextField } from './fields';
import { SealPicker } from './SealPicker';
import { sealSwatch } from '../../guest/invitation/WaxSeal';

/**
 * Setup → Invitation → "Design it your way": start from a template, then mix and match each part on its own
 * (Black Tie colours, Coastal words, a script for the names). Six small steps, each offering every template's
 * choice and a choice of your own; the preview beside it follows as it saves. Words the couple typed
 * themselves are never replaced without asking.
 */

type Env = NonNullable<InvitationContent['envelope']>;

/** The parts a "short and sweet" invitation leaves out (the welcome, the day, the timeline and the RSVP stay). */
export const SHORT_HIDDEN = ['01b Countdown', '08 Accommodation', '11 FAQ'];

/** What a template sets on the invitation (its wording is applied separately, so the couple's own words are asked about). */
export function templatePatch(t: DesignTemplate, inv: InvitationContent): Partial<InvitationContent> {
  return {
    custom: { names: t.names }, // the template's own colours, with its names font
    seal: t.envelope.seal,
    // A whole look: the template's seal and its own envelope colour (any paper chosen before is cleared).
    envelope: { ...inv.envelope, liner: t.envelope.liner, ribbon: t.envelope.ribbon, shimmer: t.envelope.shimmer, sprig: t.envelope.sprig, paper: undefined },
    opening: t.opening,
    hidden: sectionsPatch(inv, t.sections === 'short'),
    design: { template: t.name, tone: t.tone },
  };
}
export const sectionsPatch = (inv: InvitationContent, short: boolean) => ({ ...inv.hidden, ...Object.fromEntries(SHORT_HIDDEN.map((s) => [s, short])) });

const STEPS = ['Look', 'Names', 'Envelope & seal', 'Opening', 'Wording', 'Sections & music'] as const;
const LINERS: [Env['liner'] & string, string][] = [
  ['floral', 'Floral'],
  ['eucalyptus', 'Eucalyptus'],
  ['stripes', 'Gold stripes'],
  ['confetti', 'Confetti'],
  ['foil', 'Gold foil'],
  ['none', 'Plain'],
];
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;

const chip = (on: boolean) =>
  `flex flex-col gap-1 p-2 rounded-[12px] border text-left cursor-pointer ${on ? 'border-[#33402f] shadow-[0_0_0_2px_#33402f]' : 'border-[#e2d7bc] hover:border-[#b39563]'}`;

interface Pending {
  what: string;
  next: Record<string, string>;
  replacesOwn: string[];
  tone?: string;
}

export function DesignBuilder({
  theme,
  inv,
  texts,
  original,
  initials = ['A', 'B'],
  setTheme,
  setInv,
  setTexts,
}: {
  theme: string;
  inv: InvitationContent;
  texts: Record<string, string>;
  /** The design's own wording (the starting words). */
  original: Record<string, string>;
  /** Their two initials, for the seal's swatches. */
  initials?: [string, string];
  setTheme: (t: string) => void;
  setInv: (p: Partial<InvitationContent>) => void;
  setTexts: (changes: Record<string, string>) => void;
}) {
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const custom = inv.custom ?? {};
  const started = templateOf(inv.design?.template);
  const toneNow = inv.design?.tone ?? '';

  /** Words in: straight away, or ask first if it would replace words they typed. */
  const words = (what: string, next: Record<string, string>, tone: string, noteTone = true) => {
    const plan = wordingChanges(next, texts, original);
    if (plan.replacesOwn.length) {
      setPending({ what, next, replacesOwn: plan.replacesOwn, tone });
      return;
    }
    if (Object.keys(plan.changes).length) setTexts(plan.changes);
    if (noteTone) setInv({ design: { ...inv.design, tone } });
  };
  const settle = (keepOwn: boolean) => {
    if (!pending) return;
    const { changes } = wordingChanges(pending.next, texts, original, keepOwn);
    if (Object.keys(changes).length) setTexts(changes);
    setInv({ design: { ...inv.design, tone: pending.tone ?? '' } });
    setPending(null);
  };
  const toneWords = (id: string) => {
    const tone = toneOf(id);
    if (tone) words(`the ${tone.label.toLowerCase()} wording`, toneTexts(tone), tone.id);
    else words('the design’s own wording', originalTexts(original), '');
  };

  const startFrom = (t: DesignTemplate) => {
    setTheme(t.name);
    setInv(templatePatch(t, inv));
    const tone = toneOf(t.tone)!;
    words(`${t.name}’s wording`, toneTexts(tone), tone.id, false); // the template's patch already notes its tone
  };
  const lookOf = (t: DesignTemplate) => {
    setTheme(t.name);
    setInv({ custom: { names: custom.names } }); // a new look starts from its own colours
  };
  const envelopeOf = (t: DesignTemplate) => setInv({ seal: t.envelope.seal, envelope: { ...inv.envelope, liner: t.envelope.liner, ribbon: t.envelope.ribbon, shimmer: t.envelope.shimmer, sprig: t.envelope.sprig } });
  /** Every part from a different template, at random. */
  const surprise = () => {
    const tone = pick(TONES);
    const look = pick(TEMPLATES);
    setTheme(look.name);
    const env = pick(TEMPLATES).envelope;
    setInv({
      custom: { names: pick(Object.keys(NAMES_STYLES) as NamesStyle[]) },
      seal: env.seal,
      envelope: { ...inv.envelope, liner: env.liner, ribbon: env.ribbon, shimmer: env.shimmer, sprig: env.sprig },
      opening: pick(OPENINGS),
      design: { template: '', tone: tone.id },
    });
    words(`the ${tone.label.toLowerCase()} wording`, toneTexts(tone), tone.id, false);
  };

  const p = paletteOf(theme);
  const colour = (k: 'paper' | 'ink' | 'accent' | 'soft' | 'envelope', label: string) => (
    <label key={k} className="flex items-center gap-2 text-[13px] text-[#5b6a52]">
      <input
        type="color"
        aria-label={label}
        value={isHex(custom[k]) ? custom[k] : p[k]}
        onChange={(e) => setInv({ custom: { ...custom, [k]: e.target.value } })}
        className="w-9 h-9 p-0 border border-[#d3c6a4] rounded-[8px] bg-transparent cursor-pointer"
      />
      {label}
    </label>
  );
  const short = SHORT_HIDDEN.every((s) => inv.hidden?.[s]);
  const shortSome = !short && SHORT_HIDDEN.some((s) => inv.hidden?.[s]);
  const opening: Opening = inv.opening ?? 'classic';
  const seal = inv.seal ?? 'Sandstone';
  const sameEnvelope = (t: DesignTemplate) => t.envelope.seal === seal && t.envelope.liner === (inv.envelope?.liner ?? 'floral') && t.envelope.ribbon === (inv.envelope?.ribbon ?? 'none');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <span className="text-[13px] font-semibold text-[#33402f]">Start from{started ? `: ${started.name}` : '…'}</span>
          <Pill kind="dashed" onClick={surprise}>
            Surprise me
          </Pill>
        </div>
        <div role="group" aria-label="Start from a template" className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {TEMPLATES.map((t) => {
            const th = themeOf(t.name);
            const on = started?.name === t.name;
            return (
              <button key={t.name} type="button" aria-pressed={on} onClick={() => startFrom(t)} className={chip(on)} style={{ background: th.b1 }}>
                <span className="flex flex-col items-center justify-center gap-1 h-[58px] rounded-[8px]" style={{ background: th.b2 }}>
                  <span style={{ color: th.dg, fontFamily: NAMES_STYLES[t.names].font, fontSize: t.names === 'caps' ? 13 : 20, letterSpacing: t.names === 'caps' ? '.2em' : undefined, textTransform: t.names === 'caps' ? 'uppercase' : undefined }}>A &amp; B</span>
                  <span className="w-8 h-[2px]" style={{ background: th.acc }} />
                </span>
                <span className="text-[12px] font-medium leading-tight" style={{ color: th.dg }}>
                  {t.name}
                  {on ? ' ✓' : ''}
                </span>
                <span className="text-[11px] leading-tight opacity-75" style={{ color: th.dg }}>
                  {toneOf(t.tone)!.label} words · {OPENING_INFO[t.opening].label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {pending && (
        <div role="alertdialog" aria-label="Replace your wording?" className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#b39563] bg-[#fbf3e1]">
          <strong className="text-[15px]">Replace your wording?</strong>
          <span className="text-[14px] text-[#5b6a52]">
            You’ve written {pending.replacesOwn.length === 1 ? 'one of these sentences' : `${pending.replacesOwn.length} of these sentences`} yourself. Use {pending.what} for those too, or keep yours and change only the rest?
          </span>
          <div className="flex gap-2 flex-wrap">
            <Pill kind="primary" onClick={() => settle(true)}>
              Keep my words
            </Pill>
            <Pill onClick={() => settle(false)}>Replace them</Pill>
            <Pill kind="dashed" onClick={() => setPending(null)}>
              Cancel
            </Pill>
          </div>
        </div>
      )}

      <nav aria-label="Design steps" className="flex gap-[6px] flex-wrap">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            aria-pressed={step === i}
            onClick={() => setStep(i)}
            className={`px-3 py-[5px] rounded-full border text-[12px] cursor-pointer ${step === i ? 'bg-[#33402f] border-[#33402f] text-[#fbf8f0]' : 'bg-transparent border-[#d3c6a4] text-[#33402f] hover:border-[#b39563]'}`}
          >
            {i + 1} {s}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-3 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
        {step === 0 && (
          <>
            <span className="text-[13px] text-[#5b6a52]">Any template’s colours, or your own. More looks are under the Theme list below.</span>
            <div role="radiogroup" aria-label="Look" className="flex gap-2 flex-wrap">
              {TEMPLATES.map((t) => (
                <button key={t.name} type="button" role="radio" aria-checked={theme === t.name} title={t.style} onClick={() => lookOf(t)} className={`flex items-center gap-2 py-[5px] px-3 rounded-full border text-[12px] cursor-pointer ${theme === t.name ? 'border-[#33402f] shadow-[0_0_0_2px_#33402f]' : 'border-[#d3c6a4]'} bg-white`}>
                  <span aria-hidden className="flex">
                    {[t.palette.paper, t.palette.soft, t.palette.accent, t.palette.ink].map((c) => (
                      <span key={c} className="w-3 h-3 rounded-full -ml-1 first:ml-0 border border-white" style={{ background: c }} />
                    ))}
                  </span>
                  {t.name}
                </button>
              ))}
            </div>
            <span className="text-[13px] font-semibold text-[#33402f]">Or your own colours</span>
            <div className="flex gap-4 flex-wrap">
              {colour('paper', 'Paper')}
              {colour('ink', 'Ink')}
              {colour('accent', 'Gold or metallic')}
              {colour('soft', 'Soft tint')}
              {colour('envelope', 'Envelope')}
            </div>
          </>
        )}

        {step === 1 && (
          <div role="radiogroup" aria-label="Names font" className="flex gap-2 flex-wrap text-[13px]">
            {(Object.keys(NAMES_STYLES) as NamesStyle[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={(custom.names ?? 'script') === k}
                onClick={() => setInv({ custom: { ...custom, names: k } })}
                className={`flex flex-col items-center py-[6px] px-3 rounded-[12px] border cursor-pointer ${(custom.names ?? 'script') === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-white border-[#c6b794]'}`}
              >
                <span style={{ fontFamily: NAMES_STYLES[k].font, fontSize: k === 'caps' ? 14 : 22, letterSpacing: k === 'caps' ? '.2em' : undefined, textTransform: k === 'caps' ? 'uppercase' : undefined }}>A &amp; B</span>
                <span className="text-[11px] opacity-80">{NAMES_STYLES[k].label}</span>
                <span className="text-[10px] opacity-70">{TEMPLATES.filter((t) => t.names === k).map((t) => t.name).slice(0, 2).join(', ')}</span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <>
            <div role="radiogroup" aria-label="Envelope from a template" className="flex gap-2 flex-wrap">
              {TEMPLATES.map((t) => (
                <button key={t.name} type="button" role="radio" aria-checked={sameEnvelope(t)} onClick={() => envelopeOf(t)} className={`flex items-center gap-2 py-[5px] px-3 rounded-full border text-[12px] cursor-pointer bg-white ${sameEnvelope(t) ? 'border-[#33402f] shadow-[0_0_0_2px_#33402f]' : 'border-[#d3c6a4]'}`}>
                  <span aria-hidden className="w-3 h-3 rounded-full" style={{ background: sealSwatch(t.envelope.seal) }} />
                  {t.name}: {LINERS.find(([k]) => k === t.envelope.liner)?.[1].toLowerCase()}
                  {t.envelope.ribbon !== 'none' ? `, ${t.envelope.ribbon === 'silk' ? 'silk ribbon' : 'twine'}` : ''}
                </button>
              ))}
            </div>
            <span className="text-[13px] font-semibold text-[#33402f]">Or your own</span>
            <SealPicker inv={inv} theme={theme} initials={initials} setInv={setInv} />
            <Grid>
              <Label text="Envelope liner">
                <select value={inv.envelope?.liner ?? 'floral'} onChange={(e) => setInv({ envelope: { ...inv.envelope, liner: e.target.value as Env['liner'] } })} className={inputCls}>
                  {LINERS.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text="Ribbon">
                <select value={inv.envelope?.ribbon ?? 'none'} onChange={(e) => setInv({ envelope: { ...inv.envelope, ribbon: e.target.value as Env['ribbon'] } })} className={inputCls}>
                  <option value="none">None</option>
                  <option value="silk">Silk ribbon</option>
                  <option value="twine">Twine</option>
                </select>
              </Label>
            </Grid>
            <div className="flex gap-5 flex-wrap text-[14px]">
              {(
                [
                  ['sprig', 'Gold leaves above the seal'],
                  ['shimmer', 'Gold shimmer'],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={inv.envelope?.[k] !== false} onChange={(e) => setInv({ envelope: { ...inv.envelope, ...(k === 'sprig' ? { sprig: e.target.checked } : { shimmer: e.target.checked }) } })} className="w-[18px] h-[18px] accent-[#5d6b47]" />
                  {l}
                </label>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div role="radiogroup" aria-label="Envelope opening" className="grid gap-2 grid-cols-1 sm:grid-cols-2">
              {OPENINGS.map((o) => (
                <button key={o} type="button" role="radio" aria-checked={opening === o} onClick={() => setInv({ opening: o })} className={`${chip(opening === o)} bg-white`}>
                  <span className="text-[13px] font-medium">
                    {OPENING_INFO[o].label}
                    {opening === o ? ' ✓' : ''}
                  </span>
                  <span className="text-[12px] text-[#5b6a52]">{OPENING_INFO[o].hint}</span>
                </button>
              ))}
            </div>
            <span className="text-[12px] text-[#7a7466]">To watch it, open the preview full screen and tap the envelope. Guests whose phone asks for less motion see a gentle fade instead.</span>
          </>
        )}

        {step === 4 && (
          <>
            <span className="text-[13px] text-[#5b6a52]">Sets the main lines: above your names, the RSVP, the thank-you and the night-before sign-off. Every other word stays as it is, and words you’ve written yourself are only replaced if you say so.</span>
            <div role="radiogroup" aria-label="Wording tone" className="grid gap-2 grid-cols-1 sm:grid-cols-2">
              {TONES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={toneNow === t.id} onClick={() => toneWords(t.id)} className={`${chip(toneNow === t.id)} bg-white`}>
                  <span className="text-[13px] font-medium">
                    {t.label} <span className="font-normal text-[#7a7466]">· {t.feel}</span>
                    {toneNow === t.id ? ' ✓' : ''}
                  </span>
                  <span className="text-[12px] italic text-[#5b6a52]">“{t.words.invite} …” · “{t.words.rsvp}” · “{t.words.thanksYes}”</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={!toneNow} onClick={() => toneWords('')} className={`${chip(!toneNow)} bg-white`}>
                <span className="text-[13px] font-medium">The design’s own wording</span>
                <span className="text-[12px] text-[#5b6a52]">Back to the words every invitation starts with.</span>
              </button>
            </div>
            <span className="text-[12px] text-[#7a7466]">Or write your own: every sentence is under “Every word guests read” below.</span>
          </>
        )}

        {step === 5 && (
          <>
            <div role="radiogroup" aria-label="Sections" className="flex gap-2 flex-wrap">
              <button type="button" role="radio" aria-checked={!short && !shortSome} onClick={() => setInv({ hidden: sectionsPatch(inv, false) })} className={`${chip(!short && !shortSome)} bg-white`}>
                <span className="text-[13px] font-medium">Everything</span>
                <span className="text-[12px] text-[#5b6a52]">Every part of the invitation</span>
              </button>
              <button type="button" role="radio" aria-checked={short} onClick={() => setInv({ hidden: sectionsPatch(inv, true) })} className={`${chip(short)} bg-white`}>
                <span className="text-[13px] font-medium">Short and sweet</span>
                <span className="text-[12px] text-[#5b6a52]">No countdown, places to stay or questions</span>
              </button>
            </div>
            <span className="text-[12px] text-[#7a7466]">Or choose part by part under “Which parts guests see” below.</span>
            <TextField label="Music (MP3 or YouTube link)" value={inv.audioUrl ?? ''} placeholder="https://…" onChange={(v) => setInv({ audioUrl: v })} hint="Plays once when the guest opens the envelope. It’s checked under Extras → Music." />
          </>
        )}

        <div className="flex justify-between gap-2">
          <Pill kind="dashed" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Pill>
          {step < STEPS.length - 1 && (
            <Pill kind="primary" onClick={() => setStep((s) => s + 1)}>
              Next: {STEPS[step + 1]}
            </Pill>
          )}
        </div>
      </div>
    </div>
  );
}
