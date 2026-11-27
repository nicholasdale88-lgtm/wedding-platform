import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { rememberRef } from '../lib/site';
import { Link, useSearchParams } from 'react-router-dom';
import { InvitationView } from '../guest/generated/InvitationView';
import { EnvelopeExtras } from '../guest/invitation/EnvelopeExtras';
import { paperHex, SealOverlay } from '../guest/invitation/WaxSeal';
import { calendarControl, eventOfSection, useInvitation } from '../guest/invitation/useInvitation';
import { lookOf, sceneOf, THEME_NAMES, themeOf } from '../guest/themeKit';
import { SceneOverlay } from '../guest/invitation/Scene';
import '../guest/looks.css';
import './sample.css';
import { MotionPortal } from '../guest/invitation/Motion';
import { SAMPLE, SAMPLE_INVITE } from './sample';
import { BRAND } from './brand';
import { readableAt } from './tokens';
import { readDemoPages } from '../try/demoMode';

/**
 * /demo: the real invitation, exactly as a guest sees it on their phone (the same view and behaviour as
 * /w/<slug>: the wax seal, the envelope opening, the card, the reply), for a made-up wedding (./sample).
 * Nothing is loaded from the server and nothing is saved: it runs as a preview, so a reply is never sent.
 * /demo?embed=1 is the same without the bar, for the phone on the front page; ?theme=<name> shows it in
 * another design (the Designs page).
 */
export function DemoPage() {
  const [params] = useSearchParams();
  const embed = params.get('embed') === '1';
  const asked = params.get('theme') ?? '';
  const theme = THEME_NAMES.includes(asked) ? asked : undefined;
  // ?cover=1: the closed envelope as a design's cover still (tools/covers): the couple's names, no "tap" hint.
  const cover = params.get('cover') === '1';
  // ?sales=1: the front page's and the designs page's phone. The envelope names the sample couple (never the
  // sample guests), and it waits for a tap.
  const sales = params.get('sales') === '1';
  useEffect(() => {
    if (cover) document.documentElement.dataset.themes = JSON.stringify(THEME_NAMES);
  }, [cover]);
  useEffect(() => {
    document.title = `Sample invitation · ${BRAND}`;
    // From a vendor's link (?ref=, ?code=): kept for sign-up and their code for upgrading.
    rememberRef();
  }, []);
  const props = { theme, play: !sales && params.get('play') === '1', mine: params.get('mine') === '1', cover, sales };
  // The front page's phone and the cover stills: the invitation alone (no bar), and no Music pill in the hero.
  if (embed || cover)
    return (
      <div className={`yl-sample-embed contents${sales ? ' yl-sample-sales' : ''}`}>
        <SampleInvitation key={theme ?? ''} {...props} />
      </div>
    );
  const back = params.get('from') === 'designs';
  return (
    <SampleInvitation
      key={theme ?? ''}
      {...props}
      chrome={(music) => (
        // The bar has its own slot at the top (VS-02): the invitation starts below it, so it never covers the
        // seal, the names or Add to calendar. Music lives here too, never over the reply or the timeline.
        <div
          data-sample-banner
          className="fixed z-[60] top-0 left-0 right-0 flex items-end text-[#fbf8f2] text-[14px]"
          style={{ height: BAR_H, paddingTop: 'env(safe-area-inset-top)', background: '#33402f' }}
        >
          <div className="w-full max-w-[560px] mx-auto h-[56px] flex items-center justify-between gap-2 px-2">
            <Link to={back ? '/designs' : '/'} className="flex-none inline-flex items-center min-h-[44px] px-3 rounded-full no-underline font-semibold !text-[#fbf8f2] border border-[rgba(251,248,242,.4)] whitespace-nowrap">
              ← {back ? 'Designs' : 'Back'}
            </Link>
            {/* Wraps onto short lines on a phone rather than being cut off. */}
            <span className="min-w-0 flex-1 text-center text-[12.5px] leading-[1.2] [overflow-wrap:anywhere]">
              <strong className="font-semibold">A sample.</strong> Replies aren’t saved.
            </span>
            {music && (
              <button
                type="button"
                onClick={music.toggle}
                aria-label={music.label}
                aria-pressed={music.on}
                title={music.label}
                className="flex-none inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-full border border-[rgba(251,248,242,.4)] bg-transparent !text-[#fbf8f2] text-[18px] cursor-pointer"
              >
                <span aria-hidden style={{ opacity: music.on ? 1 : 0.55 }}>♪</span>
              </button>
            )}
            <Link to="/#start" className="flex-none inline-flex items-center min-h-[44px] px-4 rounded-full no-underline font-semibold !text-[#1b2218] bg-[#e6cf9e] whitespace-nowrap">
              Make your own
            </Link>
          </div>
        </div>
      )}
    />
  );
}

/** The sample bar's slot: 56px, below the phone's status bar. */
const BAR_H = 'calc(56px + env(safe-area-inset-top))';

/** The Music control for the bar. */
type Music = { on: boolean; label: string; toggle: (e: MouseEvent) => void };

/** The guest invitation for the sample wedding: the generated design view, run by the real invitation logic. */
export function SampleInvitation({
  theme,
  play = false,
  mine = false,
  cover = false,
  sales = false,
  chrome,
}: { theme?: string; play?: boolean; mine?: boolean; cover?: boolean; sales?: boolean; chrome?: (music: Music | null) => ReactNode } = {}) {
  // ?mine=1: the sample as changed in the sample app's Setup (kept in this tab), for its preview.
  const own = mine ? readDemoPages() : null;
  const base = own
    ? { ...SAMPLE_INVITE, wedding: { ...SAMPLE_INVITE.wedding, ...(own.names ?? {}), theme: own.theme ?? SAMPLE_INVITE.wedding.theme }, content: (own.invitation ?? SAMPLE_INVITE.content) as typeof SAMPLE_INVITE.content, texts: own.texts ?? SAMPLE_INVITE.texts }
    : SAMPLE_INVITE;
  const data = theme ? { ...base, wedding: { ...base.wedding, theme } } : base;
  const { v: core, t, phase, seal } = useInvitation(data.wedding.slug, data, true);
  // The front page's phone: the seal breaks by itself after a moment, so the envelope opens as people watch.
  const openNow = core.open;
  useEffect(() => {
    if (!play) return;
    const id = window.setTimeout(() => openNow(), 2200);
    return () => window.clearTimeout(id);
  }, [play, openNow]);
  // Under each event: Add to calendar, made here (there's no real wedding behind the sample).
  const scene = sceneOf(data.wedding.theme, data.content.scene);
  const after = (label: string) => {
    const ev = eventOfSection(data, label);
    return ev ? calendarControl(data, ev, undefined, true) : undefined;
  };
  // The hidden card waits at its own size until the tap (it was 1.12x, a 413px-wide box in a 390px screen):
  // it grows to 1.12 out of sight while the envelope opens, then settles exactly as before.
  // In sales mode the sample sits in a phone (even on a computer): it always says "Tap to open", as the still does.
  const v = { ...core, after, cardScale: phase === 0 ? 'none' : core.cardScale, ...(sales ? { hint: t('inv.dyn.hintTap') } : {}), ...(scene === 'none' ? (cover ? { hintOp: 0 } : {}) : { envOp: 0, hintOp: 0 }) };
  // A cover and the marketing pages' phone show the sample couple, the same as its seal (H&T); the live sample
  // (/demo) is addressed to its guests.
  const addressee = cover || sales ? SAMPLE.couple : SAMPLE.guests;
  const th = themeOf(data.wedding.theme, data.content.custom);
  // With the bar (/demo): the whole invitation sits in the space below it. The transform makes this box the
  // frame for the invitation's fixed layers (the card, the envelope, the seal), so they fill it, not the screen.
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!chrome) return;
    let el: HTMLElement | null = null;
    let timer = 0;
    const onScroll = () => {
      if (!el || !frame.current) return;
      if (el.scrollTop > 100) frame.current.dataset.scrolled = '';
      else delete frame.current.dataset.scrolled;
    };
    const find = () => {
      el = document.getElementById('inv-scroll');
      if (el) el.addEventListener('scroll', onScroll, { passive: true });
      else timer = window.setTimeout(find, 250);
    };
    find();
    return () => {
      window.clearTimeout(timer);
      el?.removeEventListener('scroll', onScroll);
    };
  }, [chrome]);
  // The opening has finished (the envelope faded out): its layer can go (./sample.css).
  useEffect(() => {
    if (!chrome || phase < 4) return;
    const id = window.setTimeout(() => {
      if (frame.current) frame.current.dataset.opened = '';
    }, 3000);
    return () => window.clearTimeout(id);
  }, [chrome, phase]);
  const music: Music | null = core.hasAudio ? { on: core.musicIcon === t('inv.dyn.musicOn'), label: core.musicIcon, toggle: (e) => core.toggleMusic(e) } : null;
  // "Tap to open" on the sample reads at AA on its envelope (Sentinel: 4.49:1); real invitations are untouched.
  const hint = readableAt(th.hint ?? '#33402f', paperHex(data.content.envelope?.paper) ?? th.e1 ?? '#e6dcc4', 5.5);
  const body = (
    <>
      <div className={`dz yl-look-${lookOf(data.wedding.theme, data.content.custom)}`} style={{ ['--hint' as string]: hint }}>
        <InvitationView v={v} t={t} />
      </div>
      <MotionPortal motion={data.content.motion} look={lookOf(data.wedding.theme, data.content.custom)} />
      {scene === 'none' ? (
        <>
          <EnvelopeExtras
            phase={phase}
            opts={data.content.envelope ?? {}}
            colours={{ paper: th.b1 ?? '#fbf8f2', ink: th.dg ?? '#33402f', accent: th.acc ?? '#c8a46a', soft: th.b2 ?? '#efe6d3', envelope: paperHex(data.content.envelope?.paper) ?? th.e1 ?? '#e6dcc4' }}
            guestName={addressee}
            opening={data.content.opening}
          />
          {seal && <SealOverlay seal={seal} phase={phase} />}
        </>
      ) : (
        <SceneOverlay
          kind={scene}
          phase={phase}
          colours={{ paper: th.b1 ?? '#fbf8f2', ink: th.dg ?? '#33402f', accent: th.acc ?? '#c8a46a', soft: th.b2 ?? '#efe6d3', envelope: th.e1 ?? '#e6dcc4' }}
          initials={data.wedding.monogram.replace(/\s*&\s*/, ' & ')}
          guestName={addressee}
          hint={!cover}
          photo={data.content.images?.backdrop}
        />
      )}
    </>
  );
  if (!chrome) return body;
  return (
    <>
      <div ref={frame} className="yl-sample fixed left-0 right-0 bottom-0 overflow-hidden" style={{ top: BAR_H, transform: 'translateZ(0)' }}>
        {body}
      </div>
      {chrome(music)}
    </>
  );
}
