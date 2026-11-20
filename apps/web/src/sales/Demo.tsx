import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect } from 'react';
import { rememberRef } from '../lib/site';
import { Link, useSearchParams } from 'react-router-dom';
import { InvitationView } from '../guest/generated/InvitationView';
import { EnvelopeExtras } from '../guest/invitation/EnvelopeExtras';
import { paperHex, SealOverlay } from '../guest/invitation/WaxSeal';
import { calendarControl, eventOfSection, useInvitation } from '../guest/invitation/useInvitation';
import { lookOf, sceneOf, THEME_NAMES, themeOf } from '../guest/themeKit';
import { SceneOverlay } from '../guest/invitation/Scene';
import '../guest/looks.css';
import { MotionPortal } from '../guest/invitation/Motion';
import { SAMPLE, SAMPLE_INVITE } from './sample';
import { BRAND } from './SalesPage';
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
  useEffect(() => {
    if (cover) document.documentElement.dataset.themes = JSON.stringify(THEME_NAMES);
  }, [cover]);
  useEffect(() => {
    document.title = `Sample invitation · ${BRAND}`;
    // From a vendor's link (?ref=, ?code=): kept for sign-up and their code for upgrading.
    rememberRef();
  }, []);
  return (
    <>
      <SampleInvitation key={theme ?? ''} theme={theme} play={params.get('play') === '1'} mine={params.get('mine') === '1'} cover={cover} />
      {!embed && !cover && (
        <div
          data-sample-banner
          className="fixed z-[60] top-[max(12px,env(safe-area-inset-top))] left-3 right-3 mx-auto max-w-[520px] flex items-center justify-between gap-2 py-[6px] pl-2 pr-[6px] rounded-[26px] text-[#fbf8f2] text-[14px] shadow-[0_8px_24px_rgba(0,0,0,.18)]"
          style={{ background: 'rgba(51,64,47,.92)' }}
        >
          <Link to={params.get('from') === 'designs' ? '/designs' : '/'} className="flex-none inline-flex items-center min-h-[40px] px-3 rounded-full no-underline font-semibold !text-[#fbf8f2] border border-[rgba(251,248,242,.4)]">
            ← {params.get('from') === 'designs' ? 'Designs' : 'Back'}
          </Link>
          {/* Wraps onto two short lines on a phone rather than being cut off. */}
          <span className="min-w-0 flex-1 text-center text-[13px] leading-[1.25] [overflow-wrap:anywhere]">
            <strong className="font-semibold">A sample.</strong> Replies aren’t saved.
          </span>
          <Link to="/#start" className="flex-none inline-flex items-center min-h-[40px] px-4 rounded-full no-underline font-semibold !text-[#1b2218] bg-[#e6cf9e] whitespace-nowrap">
            Make your own
          </Link>
        </div>
      )}
    </>
  );
}

/** The guest invitation for the sample wedding: the generated design view, run by the real invitation logic. */
export function SampleInvitation({ theme, play = false, mine = false, cover = false }: { theme?: string; play?: boolean; mine?: boolean; cover?: boolean } = {}) {
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
  const v = { ...core, after, ...(scene === 'none' ? (cover ? { hintOp: 0 } : {}) : { envOp: 0, hintOp: 0 }) };
  // A cover shows the sample couple, the same as its seal (H&T); the live sample is addressed to its guests.
  const addressee = cover ? SAMPLE.couple : SAMPLE.guests;
  const th = themeOf(data.wedding.theme, data.content.custom);
  return (
    <>
      <div className={`dz yl-look-${lookOf(data.wedding.theme, data.content.custom)}`}>
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
}
