import '@fontsource/cormorant-garamond/400.css';
import { themeOf } from '../themeKit';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';
import { InvitationView } from '../generated/InvitationView';
import { guestApi, type InvitePayload } from './api';
import { useInvitation } from './useInvitation';
import { MessageUs } from '../MessageUs';
import { EnvelopeExtras } from './EnvelopeExtras';
import { paperHex, SealOverlay } from './WaxSeal';
import { BirthdayHero, sealFor, SOLO_HIDDEN } from './BirthdayHero';
import { useSite } from '../../lib/site';
import { LiveEditor, markedT, orderCss, useLiveState } from './LiveEdit';

/**
 * /w/:slug/?g=<token>: the invitation. The design view is generated (guest/generated/InvitationView);
 * this page loads the guest's data and runs the behaviour. ?preview=1 is the admin's "Preview as guest".
 */
export function InvitationPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g');
  const preview = params.get('preview') === '1';
  // Straight after signing up: their own invitation first, then "Make it yours".
  const welcome = preview && params.get('welcome') === '1';
  // Setup → "Edit on the invitation": the admin's preview, editable in place.
  const editing = preview && params.get('edit') === '1';
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
  return <Loaded slug={slug} data={data} preview={preview} welcome={welcome} editing={editing} />;
}

function Loaded({ slug, data: saved, preview, welcome = false, editing = false }: { slug: string; data: InvitePayload; preview: boolean; welcome?: boolean; editing?: boolean }) {
  // While editing, the card shows the admin's state as it is now (sent after every change), not the saved page.
  const [live, setLive] = useLiveState(editing);
  const data = useMemo<InvitePayload>(() => (live ? { ...saved, content: { ...saved.content, ...(live.invitation as Partial<InvitePayload['content']>) } } : saved), [saved, live]);
  const { v: core, t: tSaved, phase, guestToken, inParty, seal } = useInvitation(slug, data, preview);
  const keys = useRef<string[]>([]);
  const tLive = (k: string) => live?.texts[k] ?? tSaved(k);
  const t = editing ? markedT(tLive, keys.current) : tSaved;
  // While editing, each photo says which slot it fills (so a photo can be dropped onto it).
  const base = editing ? { ...core, image: (id: string) => `${core.image(id)}#wp-slot=${id}` } : core;
  // Invited only to the second event (the birthday): its own invitation, without the wedding's sections.
  const solo = data.invitation && !data.events.some((e) => e.slot === 0) ? data.events.find((e) => e.slot === 1) : undefined;
  const v = solo ? { ...base, hide: (label: string) => SOLO_HIDDEN.has(label) || base.hide(label), initialsFull: sealFor(solo.name) } : base;
  useEffect(() => {
    document.title = solo ? solo.name : `${data.wedding.name1.split(' ')[0]} & ${data.wedding.name2.split(' ')[0]}`;
  }, [data.wedding, solo]);
  const token = !preview && guestToken;
  const site = useSite();
  const th = themeOf(data.wedding.theme, data.content.custom);
  // Their names, as the envelope is addressed ("Ella & James"); none on the public page.
  const people = data.invitation?.people ?? [];
  const guestName = people.length > 2 ? `${people[0]!.name} & family` : people.map((p) => (people.length > 1 ? p.name.split(' ')[0] : p.name)).join(' & ');
  return (
    <>
      <div className="dz">
        <InvitationView v={v} t={t} />
      </div>
      {/* The couple's own order of the sections (none: the design's). */}
      {orderCss(data.content.order) && <style>{orderCss(data.content.order)}</style>}
      {editing && <LiveEditor keys={keys.current} text={tLive} onText={(k, value) => live && setLive({ ...live, texts: { ...live.texts, [k]: value } })} />}
      {/* The app's quiet advert, on Free plans only, once the envelope is open (switched off for all in the company portal). */}
      {site?.madeWith && data.branded && phase >= 3 && (
        <p className="m-0 py-6 text-center text-[13px]" style={{ color: th.dg ?? '#33402f', opacity: 0.75 }}>
          <a href={`/?ref=${encodeURIComponent(slug)}`} className="no-underline" style={{ color: 'inherit' }}>
            Made with The Yes List · make your own
          </a>
        </p>
      )}
      {solo && (
        <BirthdayHero
          name={solo.name}
          startsAt={solo.startsAt}
          timezone={data.wedding.timezone}
          greet={String(base.greet ?? '')}
          colours={{ bg: 'var(--bdbg,var(--bdtx,#2f3d5c))', ink: 'var(--bdtx,var(--btx,#f3ecd6))', accent: 'var(--bdac,#9fb6d9)' }}
        />
      )}
      <EnvelopeExtras
        phase={phase}
        opts={data.content.envelope ?? {}}
        colours={{ paper: th.b1 ?? '#fbf8f2', ink: th.dg ?? '#33402f', accent: th.acc ?? '#c8a46a', soft: th.b2 ?? '#efe6d3', envelope: paperHex(data.content.envelope?.paper) ?? th.e1 ?? '#e6dcc4' }}
        guestName={guestName}
        music={!!data.content.audioUrl?.trim()}
        opening={data.content.opening}
      />
      {/* A seal other than the design's own: a newer colour or design, or their own words on it. */}
      {seal && <SealOverlay seal={seal} phase={phase} />}
      {/* Once the envelope is open: a guest with their own link can write to the couple (Account → Messages), and
          the wedding party has a link to their own run sheet. */}
      {welcome && phase >= 3 && (
        <div role="status" className="fixed z-50 inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] mx-auto max-w-[520px] flex items-center gap-3 p-4 rounded-[18px] bg-[#33402f] text-[#fbf8f2] shadow-[0_12px_30px_rgba(0,0,0,.3)]">
          <span className="flex-1 text-[15px] leading-snug">
            This is your invitation, as a guest will see it. Change the words, colours, photos and music any time.
          </span>
          <a href="/admin" className="flex-none py-[10px] px-4 rounded-full bg-[#e9c97c] !text-[#1d211b] no-underline font-semibold text-[15px]">
            Make it yours
          </a>
        </div>
      )}
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
