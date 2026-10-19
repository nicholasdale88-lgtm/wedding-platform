import type { DayoutGuide, GuideContent, InvitationContent, ReceptionGuide } from '@wp/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ThemeGallery } from './ThemeGallery';
import { ApiError, pagesApi, type PageNames, type PagesData, type PagesPut } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Eyebrow, inputCls, Label, Pill, useMedia, useToast } from '../ui';
import { Grid, Lines, Rows, Section, TextField } from './fields';
import { TimelineEditor } from './TimelineEditor';
import { Events } from '../events/Events';
import { PartyAccess } from '../party/PartyAccess';
import { LISTS as INV_LISTS, SECTIONS as INV_SECTIONS } from '../../guest/generated/InvitationView.meta';
import { ORIGINAL, Wording } from './Wording';
import { DevicePicker, DevicePreview, useDevice } from './DevicePreview';

/**
 * Admin → Setup (Account: the shared invitation and photo page; an event: its details, timeline and night-before page and text). Pick a page (the invitation, each
 * event's night-before guide, the photo page), edit it, and watch the real page update beside it.
 * Saves by itself a moment after you stop typing; a clash with another editor reloads.
 */

type Doc = Pick<PagesData, 'names' | 'theme' | 'invitation' | 'guides' | 'texts'>;
type PageKey = 'invitation' | 'photos' | 'details' | 'timeline' | 'party' | `guide:${string}`;
const SAVE_AFTER_MS = 700;

const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s));

export function GuestPages() {
  const { wid, event: chosen, reload: reloadOverview } = useAdmin();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const wide = useMedia('(min-width: 1100px)');
  const [data, setData] = useState<PagesData | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'waiting' | 'error'>('saved');
  const [previewKey, setPreviewKey] = useState(0);
  const [sharing, setSharing] = useState(false);
  const [device, setDevice] = useDevice();

  // Pending edits: section -> generation, so an edit made while saving is saved next time.
  const dirty = useRef(new Map<string, number>());
  const gen = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saving = useRef(false);
  const again = useRef(false); // an edit asked to save while a save was in flight: send it straight after
  const previewTimer = useRef<ReturnType<typeof setTimeout>>();
  const docRef = useRef<Doc | null>(null);
  const versionRef = useRef(0);
  docRef.current = doc;

  const load = useCallback(async () => {
    try {
      const d = await pagesApi.get(wid);
      setData(d);
      versionRef.current = d.version;
      setDoc({ names: d.names, theme: d.theme, invitation: d.invitation, guides: d.guides, texts: d.texts });
      dirty.current.clear();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);

  const flush = useCallback(async () => {
    const d = docRef.current;
    if (saving.current) {
      again.current = true;
      return;
    }
    if (!d || !dirty.current.size) return;
    clearTimeout(timer.current);
    saving.current = true;
    setStatus('saving');
    const sent = new Map(dirty.current);
    const body: PagesPut = {};
    for (const k of sent.keys()) {
      if (k === 'theme') body.theme = d.theme;
      else if (k === 'names' && d.names && d.names.name1.trim() && d.names.name2.trim()) body.names = d.names; // never blank names
      else if (k === 'invitation') body.invitation = d.invitation;
      else if (k.startsWith('guide:')) (body.guides ??= {})[k.slice(6)] = d.guides[k.slice(6)]!;
      else if (k.startsWith('text:')) (body.texts ??= {})[k.slice(5)] = d.texts[k.slice(5)] ?? '';
    }
    try {
      const res = await pagesApi.save(wid, versionRef.current, body);
      versionRef.current = res.version;
      setData(res);
      for (const [k, g] of sent) if (dirty.current.get(k) === g) dirty.current.delete(k);
      setStatus(dirty.current.size ? 'waiting' : 'saved');
      // The preview reloads once typing settles, not after every save.
      clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => setPreviewKey((n) => n + 1), 1200);
      if (sent.has('names') || sent.has('theme')) void reloadOverview(); // the admin's title and colours follow
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast('Updated elsewhere, reloaded.');
        await load();
        setStatus('saved');
      } else {
        setStatus('error');
        toast((e as Error).message);
      }
    } finally {
      saving.current = false;
      if (again.current && dirty.current.size) {
        again.current = false;
        void flush();
      } else if (dirty.current.size) timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
    }
  }, [wid, load, toast, reloadOverview]);

  const mark = useCallback(
    (section: string, next: (d: Doc) => Doc) => {
      setDoc((d) => (d ? next(d) : d));
      dirty.current.set(section, ++gen.current);
      setStatus('waiting');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
    },
    [flush],
  );
  // Leaving the tab saves straight away (after any save in flight); closing the browser with edits unsent asks first.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(previewTimer.current);
      void flush();
    },
    [flush],
  );
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current.size || saving.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const pages = useMemo(() => {
    if (!data) return [];
    // Each event's own pages. The invitation lives with the first event (the other events have their
    // section and timeline in it); every event has its own photo page.
    const ev = data.events.find((e) => e.key === chosen) ?? data.events[0];
    if (!ev) return [{ key: 'invitation', label: 'Invitation' }] as { key: PageKey; label: string }[];
    const list: { key: PageKey; label: string }[] = [];
    if (data.events.indexOf(ev) === 0) list.push({ key: 'invitation', label: 'Invitation' });
    list.push({ key: 'details', label: 'Details' }, { key: 'timeline', label: 'Timeline' });
    if (doc?.guides[ev.key]) list.push({ key: `guide:${ev.key}`, label: 'Night-before page' });
    list.push({ key: 'photos', label: 'Photo page' });
    if (data.events.indexOf(ev) === 0) list.push({ key: 'party', label: 'Wedding party access' });
    return list;
  }, [data, doc, chosen]);
  const page = (pages.find((p) => p.key === params.get('page'))?.key ?? pages[0]?.key ?? 'invitation') as PageKey;
  const eventKey = page.startsWith('guide:') ? page.slice(6) : null;
  const ev = data?.events.find((e) => e.key === chosen) ?? data?.events[0];
  const evSlot = ev && data ? data.events.indexOf(ev) : 0;

  const samples = useMemo(() => (data?.samples ?? []).filter((s) => !eventKey || s.invited.includes(eventKey)), [data, eventKey]);
  const pv = params.get('as') ?? '';
  // No guest picked: the invitation as a stranger sees it, the guides and photo page with a stand-in guest.
  const sample = samples.find((s) => s.token === pv) ?? null;

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!data || !doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading your pages…</div>;

  const setParam = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  const base = `/w/${data.slug}`;
  const path = page === 'photos' ? `/photos${ev ? `/${ev.key}` : ''}` : eventKey ? `/tomorrow/${eventKey}` : '/';
  const previewUrl = `${base}${path}?${sample ? `g=${encodeURIComponent(sample.token)}&` : ''}preview=1`;
  const shareUrl = `${window.location.origin}${base}${path}${sample ? `?g=${encodeURIComponent(sample.token)}` : ''}`;

  const guide = eventKey ? doc.guides[eventKey] : undefined;
  const setGuide = (g: GuideContent) => mark(`guide:${eventKey}`, (d) => ({ ...d, guides: { ...d.guides, [eventKey!]: g } }));
  const setInv = (patch: Partial<InvitationContent>) => mark('invitation', (d) => ({ ...d, invitation: { ...d.invitation, ...patch } }));
  const setText = (key: string, value: string) => mark(`text:${key}`, (d) => ({ ...d, texts: { ...d.texts, [key]: value } }));
  /** The timeline's moments onto an event's night-before run sheet (none when that event has no guide). */
  const copyToGuide = (key: string | undefined) =>
    key && doc.guides[key]
      ? (runsheet: { t: string; what: string; where: string }[]) => {
          mark(`guide:${key}`, (d) => ({ ...d, guides: { ...d.guides, [key]: { ...d.guides[key]!, runsheet } as GuideContent } }));
          toast('Copied to the night-before run sheet');
        }
      : undefined;

  let n = 0;
  const editor = (
    <div className="flex flex-col gap-6 min-w-0">
      {page === 'invitation' && <InvitationEditor doc={doc} n={() => ++n} setInv={setInv} setNames={(names) => mark('names', (d) => ({ ...d, names }))} setTheme={(theme) => mark('theme', (d) => ({ ...d, theme }))} />}
      {page === 'details' && ev && <Events only={ev.key} />}
      {page === 'timeline' && ev && (
        <Section
          n={++n}
          title={`${ev.name}: timeline`}
          hint={evSlot === 0 ? "The invitation's order of events: add your own moments, reorder them, change the times, words and icons." : "This event's moments, shown at the end of its section of the invitation in its own colours."}
        >
          <TimelineEditor eventKey={ev.key} slot={evSlot} inv={doc.invitation} texts={doc.texts} setInv={setInv} setText={setText} onCopyToGuide={copyToGuide(ev.key)} />
        </Section>
      )}
      {guide?.style === 'reception' && <ReceptionEditor g={guide} n={() => ++n} set={setGuide} />}
      {guide?.style === 'dayout' && <DayoutEditor g={guide} n={() => ++n} set={setGuide} />}
      {(page === 'invitation' || page === 'photos' || guide) && (
        <Wording n={++n} prefix={page === 'invitation' ? 'inv' : page === 'photos' ? 'ph' : guide?.style === 'dayout' ? 'g30' : 'gd'} texts={doc.texts} onChange={setText} />
      )}
    </div>
  );

  const preview = (
    <div className={`flex flex-col gap-3 ${wide ? 'sticky top-6' : ''}`}>
      <DevicePicker device={device} onChange={setDevice} />
      <DevicePreview device={device} src={previewUrl} url={shareUrl.replace(/^https?:\/\//, '')} title="Guest page preview" frameKey={`${previewUrl}#${previewKey}`} />
      <div className="flex gap-2 flex-wrap justify-center">
        <a href={previewUrl} target="_blank" rel="noopener" className="py-[7px] px-[14px] rounded-full border border-[#c6b794] text-[13px] no-underline !text-[#33402f] hover:bg-[#efe7d3]">
          Open full screen
        </a>
        <Pill kind="dashed" onClick={() => void navigator.clipboard?.writeText(shareUrl).then(() => toast('Link copied'))} disabled={!sample && page !== 'invitation'}>
          Copy {sample ? 'their' : 'the'} link
        </Pill>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <Eyebrow>{ev ? `${ev.name} · Setup` : 'Setup'}</Eyebrow>
          <h1 className="m-0 mt-[6px] font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">{ev ? `Set up ${ev.name}` : 'Your invitation'}</h1>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span role="status" aria-live="polite" className="text-[13px] text-[#5b6a52]">
            {page === 'details' ? 'Event details save with the Save button' : status === 'saving' ? 'Saving…' : status === 'waiting' ? 'Unsaved changes' : status === 'error' ? 'Not saved. Check your connection.' : 'All changes saved'}
          </span>
          <Pill onClick={() => setSharing((x) => !x)}>Share a preview</Pill>
        </div>
      </header>
      {sharing && (
        <SharePreview
          data={data}
          onChange={(res) => {
            versionRef.current = res.version;
            setData(res);
          }}
        />
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {pages.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={p.key === page}
            onClick={() => setParam('page', p.key === pages[0]?.key ? '' : p.key)}
            className={`py-2 px-4 rounded-full border text-[14px] cursor-pointer ${p.key === page ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794] text-[#33402f] hover:bg-[#efe7d3]'}`}
          >
            {p.label}
          </button>
        ))}
        <Label text="Preview as" className="!flex-row items-center gap-2 ml-auto">
          <select value={sample?.token ?? ''} onChange={(e) => setParam('as', e.target.value)} className={`${inputCls} !py-2`}>
            <option value="">{page === 'invitation' ? 'Someone without their link' : 'A sample guest'}</option>
            {samples.map((s) => (
              <option key={s.token} value={s.token}>
                {s.label}
              </option>
            ))}
          </select>
        </Label>
      </div>

      {page === 'party' ? (
        <PartyAccess />
      ) : wide ? (
        <div className={`grid ${device === 'phone' ? 'grid-cols-[minmax(0,1fr)_420px]' : 'grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]'} gap-8 items-start`}>
          {editor}
          {preview}
        </div>
      ) : (
        // On a phone or tablet the fields come first; the preview follows them.
        <>
          {editor}
          {preview}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- invitation

const INV_FIELDS: { key: keyof InvitationContent & string; label: string; ph?: string; hint?: string; type?: 'date' }[] = [
  { key: 'initials', label: 'Initials on the seal and sign-off', ph: 'A & B' },
  { key: 'rsvpBy', label: 'Reply-by line', ph: 'Kindly reply by 1 August' },
  { key: 'rsvpClose', label: 'Replies close on', type: 'date', hint: 'Guests can change their reply online until the end of this day. After it, they’re asked to email you (the backup RSVP email).' },
  { key: 'rsvpEmail', label: 'Backup RSVP email', ph: 'you@example.com' },
  { key: 'directionsUrl', label: 'Directions link', ph: 'https://maps.google.com/…' },
  { key: 'registryUrl', label: 'Registry link', ph: 'https://…' },
  { key: 'giftAccountLabel', label: 'Gift account name', ph: 'Wishing well' },
  { key: 'giftAccount', label: 'Gift account details', ph: 'BSB 000-000, Account 0000 0000' },
  { key: 'audioUrl', label: 'Music link (MP3 or YouTube)', ph: 'https://…', hint: 'Plays once when the guest opens the envelope.' },
  { key: 'rideTime', label: 'Activity time (if your second event has one)', ph: '10:00am' },
];

function InvitationEditor({
  doc,
  n,
  setInv,
  setNames,
  setTheme,
}: {
  doc: Doc;
  n: () => number;
  setInv: (p: Partial<InvitationContent>) => void;
  setNames: (names: PageNames) => void;
  setTheme: (t: string) => void;
}) {
  const inv = doc.invitation;
  return (
    <>
      <Section n={n()} title="Look and feel" hint="The colour theme, wax seal and the photo on the invitation.">
        <Grid>
          <div className="sm:col-span-2">
            <ThemeGallery theme={doc.theme} custom={inv.custom ?? {}} onTheme={(t) => {
              setTheme(t);
              if (inv.custom && (inv.custom.paper || inv.custom.ink || inv.custom.accent || inv.custom.soft || inv.custom.envelope)) setInv({ custom: { names: inv.custom.names } }); // a new theme starts from its own colours
            }} onCustom={(custom) => setInv({ custom })} />
          </div>
          <Label text="Wax seal">
            <select value={inv.seal ?? 'Sandstone'} onChange={(e) => setInv({ seal: e.target.value as InvitationContent['seal'] })} className={inputCls}>
              {['Sandstone', 'Dusty rose', 'Daphne blue'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Label>
          <TextField label="Photo (link)" value={inv.images?.lookout ?? ''} placeholder="/seed-media/lookout.jpg" onChange={(v) => setInv({ images: { ...inv.images, lookout: v } })} hint="Photo uploads arrive with the Photos tab." />
        </Grid>
      </Section>
      <Section n={n()} title="Names, date and links" hint="Fill in what you have; anything left empty keeps the design's default. Event names, dates and times come from your events.">
        {doc.names && (
          <Grid>
            <TextField label="Your name" value={doc.names.name1} onChange={(v) => setNames({ ...doc.names!, name1: v })} hint="As on the invitation. The admin and texts use these too." />
            <TextField label="Your partner's name" value={doc.names.name2} onChange={(v) => setNames({ ...doc.names!, name2: v })} />
            <TextField label="Monogram" value={doc.names.monogram} placeholder="A&B" onChange={(v) => setNames({ ...doc.names!, monogram: v.slice(0, 12) })} />
          </Grid>
        )}
        <Grid>
          {INV_FIELDS.map((f) => (
            <TextField key={f.key} label={f.label} value={String(inv[f.key] ?? '')} placeholder={f.ph} hint={f.hint} type={f.type} onChange={(v) => setInv({ [f.key]: v })} />
          ))}
        </Grid>
      </Section>
      <Section n={n()} title="Sections" hint="Switch off any part of the invitation you don't need. Guests won't see it; your wording is kept if you switch it back on.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {INV_SECTIONS.filter((s) => !ALWAYS_ON.test(s)).map((s) => {
            const on = !inv.hidden?.[s];
            return (
              <label key={s} className="flex items-center justify-between gap-3 py-2 border-b border-[#ece3cc] text-[15px] cursor-pointer">
                <span>{sectionName(s)}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={on}
                  aria-label={`Show ${sectionName(s)}`}
                  onChange={() => setInv({ hidden: { ...inv.hidden, [s]: on } })}
                  className="w-[20px] h-[20px] accent-[#5d6b47]"
                />
              </label>
            );
          })}
        </div>
      </Section>
      <Section n={n()} title="Questions & answers" hint="Write your own questions for any of the invitation's question lists, or keep the design's. One answer point per line.">
        {INV_LISTS.map((l, i) => {
          const own = inv.lists?.[l.key];
          const label = `${sectionName(l.section)}${INV_LISTS.filter((x) => x.section === l.section).length > 1 ? `, list ${INV_LISTS.filter((x) => x.section === l.section).indexOf(l) + 1}` : ''}`;
          const setList = (rows: { q: string; a: string[] }[] | null) => {
            const next = { ...inv.lists };
            if (rows) next[l.key] = rows;
            else delete next[l.key];
            setInv({ lists: next });
          };
          const fromDesign = () =>
            l.defaults.map((d) => ({
              q: d.q.map((k) => doc.texts[k] ?? ORIGINAL[k] ?? '').join('').trim(),
              a: d.a.map((line) => line.map((k) => doc.texts[k] ?? ORIGINAL[k] ?? '').join('').trim()).filter(Boolean),
            }));
          return (
            <div key={l.key} className={`flex flex-col gap-2 ${i ? 'pt-4 border-t border-[#ece3cc]' : ''}`}>
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <strong className="font-semibold text-[15px]">{label}</strong>
                <label className="flex items-center gap-2 text-[14px] cursor-pointer">
                  <input type="checkbox" role="switch" checked={!!own} onChange={() => setList(own ? null : fromDesign())} className="w-[18px] h-[18px] accent-[#5d6b47]" />
                  Use my own questions
                </label>
              </div>
              {own ? (
                <Rows
                  rows={own.map((r) => ({ q: r.q, a: r.a.join('\n') }))}
                  cols={[
                    { key: 'q', label: 'Question' },
                    { key: 'a', label: 'Answer (one point per line)', long: true },
                  ]}
                  blank={{ q: '', a: '' }}
                  addLabel="+ Add a question"
                  onChange={(rows) => setList(rows.map((r) => ({ q: r.q, a: r.a.split('\n') })))} // kept as typed; the invitation skips blanks
                />
              ) : (
                <span className="text-[13px] text-[#7a7466]">Showing the design's {l.defaults.length} questions. Edit their words under "Every word", or switch on to write your own.</span>
              )}
            </div>
          );
        })}
      </Section>
    </>
  );
}

/** "11 FAQ" → "FAQ" */
const sectionName = (s: string) => s.replace(/^\d+\w?\s+/, '');
/** The welcome and the RSVP are the invitation itself: they can't be switched off. */
const ALWAYS_ON = /^\d+\w?\s+(welcome|rsvp)$/i;

// ---------------------------------------------------------------- guides

const RUN = { cols: [{ key: 't', label: 'Time', width: 'w-[96px]' }, { key: 'what', label: 'What' }, { key: 'where', label: 'Where' }], blank: { t: '', what: '', where: '' } } as const;
const CONTACT = { cols: [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'phone', label: 'Phone or email' }], blank: { name: '', role: '', phone: '' } } as const;

function PlaceFields<G extends ReceptionGuide | DayoutGuide>({ g, set }: { g: G; set: (g: G) => void }) {
  return (
    <>
      <TextField label="Address" value={g.address ?? ''} onChange={(address) => set({ ...g, address })} />
      <TextField label="Map link" value={g.mapUrl ?? ''} placeholder="https://maps.google.com/…" onChange={(mapUrl) => set({ ...g, mapUrl })} />
      <TextField label="Weather link (Bureau of Meteorology)" value={g.bomUrl ?? ''} placeholder="https://www.bom.gov.au/places/…" onChange={(bomUrl) => set({ ...g, bomUrl })} />
      <div className="grid grid-cols-2 gap-[14px]">
        <TextField label="Latitude" value={g.lat === undefined ? '' : String(g.lat)} placeholder="-33.37" onChange={(v) => set({ ...g, lat: num(v) })} hint="For the live forecast." />
        <TextField label="Longitude" value={g.lon === undefined ? '' : String(g.lon)} placeholder="151.19" onChange={(v) => set({ ...g, lon: num(v) })} hint="Right-click the venue in Google Maps." />
      </div>
      <TextField
        label="Wet-weather plan"
        long
        value={g.wetPlan ?? ''}
        placeholder="If it rains, the ceremony moves undercover to… Same times; follow the signs from the car park."
        onChange={(wetPlan) => set({ ...g, wetPlan })}
        hint="Pops up on the page when the forecast says rain, and is always in the quick answers."
      />
      <div className="grid grid-cols-2 gap-[14px]">
        <TextField label="Music (MP3 or YouTube link)" value={g.music ?? ''} placeholder="https://youtu.be/…" onChange={(music) => set({ ...g, music })} hint="Guests tap to play it; it loops until they pause." />
        <TextField label="Music button wording" value={g.musicTitle ?? ''} placeholder="Play our music" onChange={(musicTitle) => set({ ...g, musicTitle })} />
      </div>
    </>
  );
}

function ReceptionEditor({ g, n, set }: { g: ReceptionGuide; n: () => number; set: (g: ReceptionGuide) => void }) {
  const f = (key: keyof ReceptionGuide & string, label: string, long = false, ph = '') => (
    <TextField key={key} label={label} long={long} placeholder={ph} value={String(g[key] ?? '')} onChange={(v) => set({ ...g, [key]: v })} />
  );
  return (
    <>
      <Section n={n()} title="Arrival and parking" hint="What guests read first: when to arrive, where to park, how to get home. The forecast fills itself in from the week before.">
        <Grid>
          {f('date', 'Date line', false, 'Thursday 18 November 2027')}
          {f('arrive', 'Arrive from', false, '1:30pm')}
          {f('start', 'Ceremony starts', false, '2:00pm')}
          <PlaceFields g={g} set={set} />
        </Grid>
        {f('parkDirections', 'Finding the ceremony', true)}
        {f('parking', 'Parking', true)}
        {f('transport', 'Getting home', true)}
        {f('tableNote', 'Note under the seating plan', true)}
        <Grid>
          {f('parkVideo', 'Parking video (YouTube or Google Drive link)', false, 'https://youtu.be/…')}
          {f('photoUrl', 'Photo album link (empty = your own photo page)', false, 'https://…')}
        </Grid>
      </Section>
      <Section n={n()} title="Run sheet" hint="The times guests see for the day. The forecast uses these times.">
        <Rows rows={(g.runsheet ?? []).map((r) => ({ t: r.t, what: r.what, where: r.where ?? '' }))} cols={[...RUN.cols]} blank={{ ...RUN.blank }} addLabel="+ Add item" onChange={(runsheet) => set({ ...g, runsheet })} />
      </Section>
      <Section n={n()} title="Menu" hint="The set menu by course. Guests with dietary needs also see their own meal.">
        <Rows
          rows={(g.menu ?? []).map((m) => ({ course: m.course, a: m.a, b: m.b ?? '' }))}
          cols={[{ key: 'course', label: 'Course', width: 'w-[120px]' }, { key: 'a', label: 'Dish one' }, { key: 'b', label: 'Dish two (optional)' }]}
          blank={{ course: '', a: '', b: '' }}
          addLabel="+ Add course"
          onChange={(menu) => set({ ...g, menu })}
        />
      </Section>
      <Section n={n()} title="Contacts on the day" hint="Who guests call on the day, such as the couple, the venue and the local taxi company.">
        <Rows rows={(g.contacts ?? []).map((c) => ({ name: c.name, role: c.role ?? '', phone: c.phone }))} cols={[...CONTACT.cols]} blank={{ ...CONTACT.blank }} addLabel="+ Add contact" onChange={(contacts) => set({ ...g, contacts })} />
      </Section>
      <Section n={n()} title="Quick answers" hint="The questions guests ask the night before.">
        <Rows rows={(g.faq ?? []).map((q) => ({ q: q.q, a: q.a }))} cols={[{ key: 'q', label: 'Question' }, { key: 'a', label: 'Answer', long: true }]} blank={{ q: '', a: '' }} addLabel="+ Add question" onChange={(faq) => set({ ...g, faq })} />
      </Section>
    </>
  );
}

function DayoutEditor({ g, n, set }: { g: DayoutGuide; n: () => number; set: (g: DayoutGuide) => void }) {
  const f = (key: keyof DayoutGuide & string, label: string, long = false, ph = '') => (
    <TextField key={key} label={label} long={long} placeholder={ph} value={String(g[key] ?? '')} onChange={(v) => set({ ...g, [key]: v })} />
  );
  return (
    <>
      <Section n={n()} title="Photo and key times" hint="The photo at the top of the guide, plus the times and place every guest sees.">
        <Grid>
          {f('hero', 'Photo (link)', false, '/seed-media/valley-30th.jpg')}
          {f('date', 'Date line', false, 'Saturday 20 November 2027')}
          {f('arriveBy', 'Arrive by (activity)', false, '9:30am')}
          {f('activityTime', 'Activity starts', false, '10:00am')}
          {f('picnicTime', 'Main gathering time', false, '12:00pm')}
          {f('picnicWhere', 'Where everyone meets', false, 'By the river')}
          {f('dress', 'Dress', false, 'Country casual')}
          {f('signoff', 'Sign-off', false, 'Happy trails')}
          <PlaceFields g={g} set={set} />
        </Grid>
        {f('transport', 'Getting there and home', true)}
      </Section>
      <Section n={n()} title="Your plan follows their answer" hint="Guests who answered yes to the activity see the activity plan; everyone else sees the gathering plan.">
        <Grid>
          {f('choiceKey', 'RSVP question key', false, 'ride')}
          {f('yesAnswer', 'The "yes" answer', false, 'Yes, I will ride')}
          {f('unsureAnswer', 'The "not sure" answer', false, 'Not sure yet')}
        </Grid>
      </Section>
      <Section n={n()} title="The day" hint="The run of the day. The forecast uses these times.">
        <Rows rows={(g.runsheet ?? []).map((r) => ({ t: r.t, what: r.what, where: r.where ?? '' }))} cols={[...RUN.cols]} blank={{ ...RUN.blank }} addLabel="+ Add item" onChange={(runsheet) => set({ ...g, runsheet })} />
      </Section>
      <Section n={n()} title="What to bring" hint="The packing list guests tick off.">
        <Lines items={g.bring ?? []} label="Item" addLabel="+ Add item" onChange={(bring) => set({ ...g, bring })} />
      </Section>
      <Section n={n()} title="Contacts on the day" hint="Who guests can call.">
        <Rows rows={(g.contacts ?? []).map((c) => ({ name: c.name, role: c.role ?? '', phone: c.phone }))} cols={[...CONTACT.cols]} blank={{ ...CONTACT.blank }} addLabel="+ Add contact" onChange={(contacts) => set({ ...g, contacts })} />
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- share a preview

/**
 * Links to send people for their opinion before anything goes out: the invitation (as someone without
 * their link sees it) and each event's night-before page with a stand-in guest. Nothing is sent to
 * guests and no reply is recorded. The night-before links carry a secret code; turning sharing off
 * makes every link sent so far stop working.
 */
function SharePreview({ data, onChange }: { data: PagesData; onChange: (d: PagesData) => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const origin = window.location.origin;
  const base = `${origin}/w/${data.slug}`;
  const links = [
    { label: 'The invitation', url: `${base}/?preview=1` },
    ...(data.share ? data.events.filter((e) => data.guides[e.key]).map((e) => ({ label: `${e.name}: the night-before page`, url: `${base}/tomorrow/${encodeURIComponent(e.key)}?preview=1&share=${encodeURIComponent(data.share!)}` })) : []),
  ];
  const set = async (on: boolean) => {
    setBusy(true);
    try {
      onChange(await pagesApi.share(wid, on));
      toast(on ? 'Preview links ready' : 'Sharing turned off: the links sent so far no longer work');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copy = (url: string) => void navigator.clipboard?.writeText(url).then(() => toast('Link copied'));
  return (
    <section aria-label="Share a preview" className="flex flex-col gap-3 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div>
        <h2 className="m-0 font-display font-medium text-[24px]">Share a preview</h2>
        <p className="m-0 mt-1 text-[14px] text-[#5b6a52] max-w-[640px]">
          Send these to family or friends for their opinion. They see the pages exactly as guests will, with a stand-in guest. No texts are sent and nothing they tap is saved.
        </p>
      </div>
      {links.map((l) => (
        <div key={l.url} className="flex gap-2 items-center flex-wrap py-2 border-t border-[#ece3cc]">
          <span className="font-medium min-w-[220px]">{l.label}</span>
          <a href={l.url} target="_blank" rel="noopener" className="text-[13px] !text-[#33402f]">
            Open
          </a>
          <Pill kind="dashed" onClick={() => copy(l.url)}>
            Copy link
          </Pill>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`What do you think? ${l.url}`)}`}
            target="_blank"
            rel="noopener"
            className="py-[7px] px-[14px] rounded-full border border-[#c6b794] text-[13px] no-underline !text-[#33402f] hover:bg-[#efe7d3]"
          >
            WhatsApp
          </a>
        </div>
      ))}
      {data.share ? (
        <button type="button" disabled={busy} onClick={() => void set(false)} className="self-start p-0 border-0 bg-transparent text-[13px] underline cursor-pointer text-[#7a4a37]">
          Turn off the night-before preview links
        </button>
      ) : (
        <Pill kind="primary" className="self-start" disabled={busy} onClick={() => void set(true)}>
          Make night-before preview links
        </Pill>
      )}
    </section>
  );
}
