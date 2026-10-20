import '@fontsource/cormorant-garamond/400.css';
import { themeOf } from '../themeKit';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { InvitationView } from '../generated/InvitationView';
import { guestApi, type InvitePayload } from './api';
import { useInvitation } from './useInvitation';
import { MessageUs } from '../MessageUs';
import { EnvelopeExtras } from './EnvelopeExtras';

/**
 * /w/:slug/?g=<token>: the invitation. The design view is generated (guest/generated/InvitationView);
 * this page loads the guest's data and runs the behaviour. ?preview=1 is the admin's "Preview as guest".
 */
export function InvitationPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g');
  const preview = params.get('preview') === '1';
  const [data, setData] = useState<InvitePayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    guestApi
      .invite(slug, token, preview)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [slug, token, preview]);

  if (error) return <GuestMessage message={error} />;
  if (!data) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  return <Loaded slug={slug} data={data} preview={preview} />;
}

function Loaded({ slug, data, preview }: { slug: string; data: InvitePayload; preview: boolean }) {
  const { v, t, phase, guestToken, inParty } = useInvitation(slug, data, preview);
  useEffect(() => {
    document.title = `${data.wedding.name1.split(' ')[0]} & ${data.wedding.name2.split(' ')[0]}`;
  }, [data.wedding]);
  const token = !preview && guestToken;
  const th = themeOf(data.wedding.theme, data.content.custom);
  // Their names, as the envelope is addressed ("Ella & James"); none on the public page.
  const people = data.invitation?.people ?? [];
  const guestName = people.length > 2 ? `${people[0]!.name} & family` : people.map((p) => (people.length > 1 ? p.name.split(' ')[0] : p.name)).join(' & ');
  return (
    <>
      <div className="dz">
        <InvitationView v={v} t={t} />
      </div>
      <EnvelopeExtras
        phase={phase}
        opts={data.content.envelope ?? {}}
        colours={{ paper: th.b1 ?? '#fbf8f2', ink: th.dg ?? '#33402f', accent: th.acc ?? '#c8a46a', soft: th.b2 ?? '#efe6d3', envelope: th.e1 ?? '#e6dcc4' }}
        guestName={guestName}
      />
      {/* Once the envelope is open: a guest with their own link can write to the couple (Account → Messages), and
          the wedding party has a link to their own run sheet. */}
      {token && phase >= 3 && <MessageUs slug={slug} token={token} ink={themeOf(data.wedding.theme, data.content.custom).dg} />}
      {token && phase >= 3 && inParty && (
        <a
          href={`/w/${encodeURIComponent(slug)}/party?g=${encodeURIComponent(token)}`}
          className="fixed z-40 top-[max(14px,env(safe-area-inset-top))] right-4 py-[9px] px-4 rounded-full text-[15px] no-underline shadow-[0_6px_18px_rgba(30,30,30,.2)]"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: themeOf(data.wedding.theme, data.content.custom).dg ?? '#33402f', color: '#fbf8f2' }}
        >
          Wedding party run sheet
        </a>
      )}
    </>
  );
}
