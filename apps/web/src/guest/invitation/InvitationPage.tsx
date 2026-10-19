import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { InvitationView } from '../generated/InvitationView';
import { guestApi, type InvitePayload } from './api';
import { useInvitation } from './useInvitation';

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
  const { v, t } = useInvitation(slug, data, preview);
  useEffect(() => {
    document.title = `${data.wedding.name1.split(' ')[0]} & ${data.wedding.name2.split(' ')[0]}`;
  }, [data.wedding]);
  return (
    <div className="dz">
      <InvitationView v={v} t={t} />
    </div>
  );
}
