import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { InvitationView } from '../guest/generated/InvitationView';
import { EnvelopeExtras } from '../guest/invitation/EnvelopeExtras';
import { paperHex, SealOverlay } from '../guest/invitation/WaxSeal';
import { useInvitation } from '../guest/invitation/useInvitation';
import { lookOf, sceneOf, THEME_NAMES, themeOf } from '../guest/themeKit';
import { SceneOverlay } from '../guest/invitation/Scene';
import '../guest/looks.css';
import { MotionPortal } from '../guest/invitation/Motion';
import { SAMPLE, SAMPLE_INVITE } from './sample';
import { BRAND } from './SalesPage';

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
  useEffect(() => {
    document.title = `Sample invitation · ${BRAND}`;
  }, []);
  return (
    <>
      <SampleInvitation key={theme ?? ''} theme={theme} />
      {!embed && (
        <div className="fixed z-[60] top-[max(12px,env(safe-area-inset-top))] left-3 right-3 mx-auto max-w-[520px] flex items-center justify-between gap-3 py-2 pl-4 pr-2 rounded-full text-[#fbf8f2] text-[14px] shadow-[0_8px_24px_rgba(0,0,0,.18)]" style={{ background: 'rgba(51,64,47,.92)' }}>
          <Link to={params.get('from') === 'designs' ? '/designs' : '/'} className="flex-none py-[7px] px-3 rounded-full no-underline font-semibold !text-[#fbf8f2] border border-[rgba(251,248,242,.4)]">
            ← {params.get('from') === 'designs' ? 'Designs' : 'Back'}
          </Link>
          <span className="min-w-0 truncate">
            <strong className="font-semibold">A sample.</strong> Replies aren’t saved.
          </span>
          <Link to="/#start" className="flex-none py-[7px] px-4 rounded-full no-underline font-semibold !text-[#1b2218] bg-[#e6cf9e]">
            Make your own
          </Link>
        </div>
      )}
    </>
  );
}

/** The guest invitation for the sample wedding: the generated design view, run by the real invitation logic. */
export function SampleInvitation({ theme }: { theme?: string } = {}) {
  const data = theme ? { ...SAMPLE_INVITE, wedding: { ...SAMPLE_INVITE.wedding, theme } } : SAMPLE_INVITE;
  const { v: core, t, phase, seal } = useInvitation(data.wedding.slug, data, true);
  // No "Add to your calendar" links: there's no real wedding behind them.
  const scene = sceneOf(data.wedding.theme, data.content.scene);
  const v = { ...core, after: () => undefined, ...(scene === 'none' ? {} : { envOp: 0, hintOp: 0 }) };
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
            guestName={SAMPLE.guests}
            opening={data.content.opening}
          />
          {seal && <SealOverlay seal={seal} phase={phase} />}
        </>
      ) : (
        <SceneOverlay
          kind={scene}
          phase={phase}
          colours={{ paper: th.b1 ?? '#fbf8f2', ink: th.dg ?? '#33402f', accent: th.acc ?? '#c8a46a', soft: th.b2 ?? '#efe6d3', envelope: th.e1 ?? '#e6dcc4' }}
          initials="H & T"
          guestName={SAMPLE.guests}
          photo={data.content.images?.backdrop}
        />
      )}
    </>
  );
}
