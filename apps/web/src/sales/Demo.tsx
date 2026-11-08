import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { InvitationView } from '../guest/generated/InvitationView';
import { EnvelopeExtras } from '../guest/invitation/EnvelopeExtras';
import { useInvitation } from '../guest/invitation/useInvitation';
import { themeOf } from '../guest/themeKit';
import { SAMPLE, SAMPLE_INVITE } from './sample';
import { BRAND } from './SalesPage';

/**
 * /demo: the real invitation, exactly as a guest sees it on their phone (the same view and behaviour as
 * /w/<slug>: the wax seal, the envelope opening, the card, the reply), for a made-up wedding (./sample).
 * Nothing is loaded from the server and nothing is saved: it runs as a preview, so a reply is never sent.
 * /demo?embed=1 is the same without the bar, for the phone on the front page.
 */
export function DemoPage() {
  const [params] = useSearchParams();
  const embed = params.get('embed') === '1';
  useEffect(() => {
    document.title = `Sample invitation · ${BRAND}`;
  }, []);
  return (
    <>
      <SampleInvitation />
      {!embed && (
        <div className="fixed z-[60] top-[max(12px,env(safe-area-inset-top))] left-3 right-3 mx-auto max-w-[520px] flex items-center justify-between gap-3 py-2 pl-4 pr-2 rounded-full text-[#fbf8f2] text-[14px] shadow-[0_8px_24px_rgba(0,0,0,.18)]" style={{ background: 'rgba(51,64,47,.92)' }}>
          <span>
            <strong className="font-semibold">A sample.</strong> Replies here aren’t saved.
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
export function SampleInvitation() {
  const data = SAMPLE_INVITE;
  const { v: core, t, phase } = useInvitation(data.wedding.slug, data, true);
  // No "Add to your calendar" links: there's no real wedding behind them.
  const v = { ...core, after: () => undefined };
  const th = themeOf(data.wedding.theme, data.content.custom);
  return (
    <>
      <div className="dz">
        <InvitationView v={v} t={t} />
      </div>
      <EnvelopeExtras
        phase={phase}
        opts={data.content.envelope ?? {}}
        colours={{ paper: th.b1 ?? '#fbf8f2', ink: th.dg ?? '#33402f', accent: th.acc ?? '#c8a46a', soft: th.b2 ?? '#efe6d3', envelope: th.e1 ?? '#e6dcc4' }}
        guestName={SAMPLE.guests}
        opening={data.content.opening}
      />
    </>
  );
}
