import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { Guide30View } from '../generated/Guide30View';
import { GuideView } from '../generated/GuideView';
import { guestApi, type GuidePayload } from '../invitation/api';
import { setPageClass } from './common';
import { useGuide } from './useGuide';
import { useGuide30 } from './useGuide30';
import { MessageUs } from '../MessageUs';
import { BackToInvitation } from '../BackToInvitation';
import { GuideExtras } from './GuideExtras';

/**
 * /w/:slug/tomorrow[/:event]?g=<token>: the night-before guide, linked from the night-before text.
 * Each event has its own guide, in the design its style names (reception or day-out).
 */
export function GuidePage() {
  const { slug = '', event } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const preview = params.get('preview') === '1';
  const share = params.get('share') ?? ''; // a preview link the couple shared for opinions
  const [data, setData] = useState<GuidePayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    guestApi
      .guide(slug, token, event, preview, share)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [slug, token, event, preview, share]);

  // Live: the forecast, tables and meals refresh while the guide is open (every 15 minutes, and on
  // coming back to it). A failed refresh keeps what is on screen.
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 60_000) return;
      last = Date.now();
      guestApi
        .guide(slug, token, event, preview, share)
        .then(setData)
        .catch(() => {});
    };
    const timer = setInterval(() => {
      last = 0;
      refresh();
    }, 15 * 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [slug, token, event, preview, share]);

  if (error) return <GuestMessage message={error} />;
  if (!data) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  return data.guide.style === 'dayout' ? <Dayout data={data} preview={preview} /> : <Reception data={data} preview={preview} />;
}

function usePage(page: string, data: GuidePayload) {
  useEffect(() => setPageClass(page), [page]);
  useEffect(() => {
    document.title = `${data.event.name} · tomorrow`;
  }, [data.event.name]);
}

function Reception({ data, preview }: { data: GuidePayload; preview: boolean }) {
  usePage('gd', data);
  const v = useGuide(data);
  return (
    <>
    <div className="dz">
      <GuideView v={v} t={(k) => data.texts[k] ?? ''} />
    </div>
    {/* The guide's design has its own fixed palette: buttons match it, not the invitation's theme. */}
    <GuideExtras data={data} ink="#33402f" />
    {!preview && data.guest.token && <MessageUs slug={data.wedding.slug} token={data.guest.token} ink="#33402f" side="right" />}
    {!preview && <BackToInvitation slug={data.wedding.slug} token={data.guest.token ?? ''} />}
    </>
  );
}

function Dayout({ data, preview }: { data: GuidePayload; preview: boolean }) {
  usePage('g30', data);
  const v = useGuide30(data);
  return (
    <>
    <div className="dz">
      <Guide30View v={v} t={(k) => data.texts[k] ?? ''} />
    </div>
    <GuideExtras data={data} ink="#2f3d5c" />
    {!preview && data.guest.token && <MessageUs slug={data.wedding.slug} token={data.guest.token} ink="#2f3d5c" side="right" />}
    {!preview && <BackToInvitation slug={data.wedding.slug} token={data.guest.token ?? ''} ink="#2f3d5c" />}
    </>
  );
}
