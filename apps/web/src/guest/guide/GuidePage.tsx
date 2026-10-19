import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Guide30View } from '../generated/Guide30View';
import { GuideView } from '../generated/GuideView';
import { guestApi, type GuidePayload } from '../invitation/api';
import { setPageClass } from './common';
import { useGuide } from './useGuide';
import { useGuide30 } from './useGuide30';

/**
 * /w/:slug/tomorrow[/:event]?g=<token>: the night-before guide, linked from the night-before text.
 * Each event has its own guide, in the design its style names (reception or day-out).
 */
export function GuidePage() {
  const { slug = '', event } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [data, setData] = useState<GuidePayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    guestApi
      .guide(slug, token, event)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [slug, token, event]);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-center font-display text-[22px] italic text-[#33402f] bg-[#f6f0e2]">
        <p role="alert">{error}</p>
      </main>
    );
  }
  if (!data) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  return data.guide.style === 'dayout' ? <Dayout data={data} /> : <Reception data={data} />;
}

function usePage(page: string, data: GuidePayload) {
  useEffect(() => setPageClass(page), [page]);
  useEffect(() => {
    document.title = `${data.event.name} · tomorrow`;
  }, [data.event.name]);
}

function Reception({ data }: { data: GuidePayload }) {
  usePage('gd', data);
  const v = useGuide(data);
  return <GuideView v={v} t={(k) => data.texts[k] ?? ''} />;
}

function Dayout({ data }: { data: GuidePayload }) {
  usePage('g30', data);
  const v = useGuide30(data);
  return <Guide30View v={v} t={(k) => data.texts[k] ?? ''} />;
}
