import type { DayoutGuide, GuideContent, InvitationContent, ReceptionGuide } from '@wp/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { THEMES } from '../../guest/generated/themes';
import { ApiError, pagesApi, type PagesData, type PagesPut } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Eyebrow, inputCls, Label, Pill, useMedia, useToast } from '../ui';
import { Grid, Lines, Rows, Section, TextField } from './fields';
import { Wording } from './Wording';

/**
 * Admin → Guest pages: one place for everything guests see. Pick a page (the invitation, each
 * event's night-before guide, the photo page), edit it, and watch the real page update beside it.
 * Saves by itself a moment after you stop typing; a clash with another editor reloads.
 */

type Doc = Pick<PagesData, 'theme' | 'invitation' | 'guides' | 'texts'>;
type PageKey = 'invitation' | 'photos' | `guide:${string}`;
const SAVE_AFTER_MS = 700;

const shortName = (name: string) => name.replace(/^the\s+/i, '').replace(/^\w/, (c) => c.toUpperCase());
const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s));

export function GuestPages() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const wide = useMedia('(min-width: 1100px)');
  const [data, setData] = useState<PagesData | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'saved' | 'saving' | 'waiting' | 'error'>('saved');
  const [previewKey, setPreviewKey] = useState(0);

  // Pending edits: section -> generation, so an edit made while saving is saved next time.
  const dirty = useRef(new Map<string, number>());
  const gen = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saving = useRef(false);
  const docRef = useRef<Doc | null>(null);
  const versionRef = useRef(0);
  docRef.current = doc;

  const load = useCallback(async () => {
    try {
      const d = await pagesApi.get(wid);
      setData(d);
      versionRef.current = d.version;
      setDoc({ theme: d.theme, invitation: d.invitation, guides: d.guides, texts: d.texts });
      dirty.current.clear();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);

  const flush = useCallback(async () => {
    const d = docRef.current;
    if (!d || saving.current || !dirty.current.size) return;
    saving.current = true;
    setStatus('saving');
    const sent = new Map(dirty.current);
    const body: PagesPut = {};
    for (const k of sent.keys()) {
      if (k === 'theme') body.theme = d.theme;
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
      setPreviewKey((n) => n + 1);
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
      if (dirty.current.size) timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
    }
  }, [wid, load, toast]);

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
  // Leaving the tab saves straight away.
  useEffect(() => () => void flush(), [flush]);

  const pages = useMemo(() => {
    if (!data) return [];
    const list: { key: PageKey; label: string }[] = [{ key: 'invitation', label: 'Invitation' }];
    for (const e of data.events) if (doc?.guides[e.key]) list.push({ key: `guide:${e.key}`, label: `Night before: ${shortName(e.name)}` });
    list.push({ key: 'photos', label: 'Photo page' });
    return list;
  }, [data, doc]);
  const page = (pages.find((p) => p.key === params.get('page'))?.key ?? 'invitation') as PageKey;
  const eventKey = page.startsWith('guide:') ? page.slice(6) : null;

  const samples = useMemo(() => (data?.samples ?? []).filter((s) => !eventKey || s.invited.includes(eventKey)), [data, eventKey]);
  const pv = params.get('as') ?? '';
  const sample = samples.find((s) => s.token === pv) ?? (page === 'invitation' ? null : samples[0]) ?? null;

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
  const path = page === 'invitation' ? '/' : page === 'photos' ? '/photos' : `/tomorrow/${eventKey}`;
  const previewUrl = `${base}${path}?${sample ? `g=${encodeURIComponent(sample.token)}&` : ''}preview=1`;
  const shareUrl = `${window.location.origin}${base}${path}${sample ? `?g=${encodeURIComponent(sample.token)}` : ''}`;

  const guide = eventKey ? doc.guides[eventKey] : undefined;
  const setGuide = (g: GuideContent) => mark(`guide:${eventKey}`, (d) => ({ ...d, guides: { ...d.guides, [eventKey!]: g } }));
  const setInv = (patch: Partial<InvitationContent>) => mark('invitation', (d) => ({ ...d, invitation: { ...d.invitation, ...patch } }));
  const setText = (key: string, value: string) => mark(`text:${key}`, (d) => ({ ...d, texts: { ...d.texts, [key]: value } }));

  let n = 0;
  const editor = (
    <div className="flex flex-col gap-6 min-w-0">
      {page === 'invitation' && <InvitationEditor doc={doc} n={() => ++n} setInv={setInv} setTheme={(theme) => mark('theme', (d) => ({ ...d, theme }))} />}
      {guide?.style === 'reception' && <ReceptionEditor g={guide} n={() => ++n} set={setGuide} />}
      {guide?.style === 'dayout' && <DayoutEditor g={guide} n={() => ++n} set={setGuide} />}
      <Wording n={++n} prefix={page === 'invitation' ? 'inv' : page === 'photos' ? 'ph' : guide?.style === 'dayout' ? 'g30' : 'gd'} texts={doc.texts} onChange={setText} />
    </div>
  );

  const preview = (
    <div className={`flex flex-col gap-3 ${wide ? 'sticky top-6' : ''}`}>
      <div className="mx-auto w-[min(390px,100%)] h-[760px] rounded-[30px] border-[10px] border-[#33402f] overflow-hidden bg-[#f6f0e2] shadow-[0_18px_40px_rgba(51,64,47,.25)]">
        <iframe key={`${previewUrl}#${previewKey}`} src={previewUrl} title="Guest page preview" className="w-full h-full border-0" />
      </div>
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
          <Eyebrow>Guest pages</Eyebrow>
          <h1 className="m-0 mt-[6px] font-display font-medium text-[40px] leading-[1.08]">What your guests see</h1>
        </div>
        <span role="status" aria-live="polite" className="text-[13px] text-[#5b6a52]">
          {status === 'saving' ? 'Saving…' : status === 'waiting' ? 'Unsaved changes' : status === 'error' ? 'Not saved. Check your connection.' : 'All changes saved'}
        </span>
      </header>

      <div className="flex gap-2 flex-wrap items-center">
        {pages.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={p.key === page}
            onClick={() => setParam('page', p.key === 'invitation' ? '' : p.key)}
            className={`py-2 px-4 rounded-full border text-[14px] cursor-pointer ${p.key === page ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794] text-[#33402f] hover:bg-[#efe7d3]'}`}
          >
            {p.label}
          </button>
        ))}
        <Label text="Preview as" className="!flex-row items-center gap-2 ml-auto">
          <select value={sample?.token ?? ''} onChange={(e) => setParam('as', e.target.value)} className={`${inputCls} !py-2`}>
            {page === 'invitation' && <option value="">Someone without their link</option>}
            {samples.map((s) => (
              <option key={s.token} value={s.token}>
                {s.label}
              </option>
            ))}
          </select>
        </Label>
      </div>

      {wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-8 items-start">
          {editor}
          {preview}
        </div>
      ) : (
        <>
          {preview}
          {editor}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- invitation

const INV_FIELDS: { key: keyof InvitationContent & string; label: string; ph?: string; hint?: string }[] = [
  { key: 'initials', label: 'Initials on the seal and sign-off', ph: 'A & B' },
  { key: 'rsvpBy', label: 'Reply-by line', ph: 'Kindly reply by 1 August' },
  { key: 'rsvpEmail', label: 'Backup RSVP email', ph: 'you@example.com' },
  { key: 'directionsUrl', label: 'Directions link', ph: 'https://maps.google.com/…' },
  { key: 'registryUrl', label: 'Registry link', ph: 'https://…' },
  { key: 'giftAccountLabel', label: 'Gift account name', ph: 'Wishing well' },
  { key: 'giftAccount', label: 'Gift account details', ph: 'BSB 000-000, Account 0000 0000' },
  { key: 'audioUrl', label: 'Music link (MP3 or YouTube)', ph: 'https://…', hint: 'Plays once when the guest opens the envelope.' },
  { key: 'rideTime', label: 'Activity time (if your second event has one)', ph: '10:00am' },
];

function InvitationEditor({ doc, n, setInv, setTheme }: { doc: Doc; n: () => number; setInv: (p: Partial<InvitationContent>) => void; setTheme: (t: string) => void }) {
  const inv = doc.invitation;
  return (
    <>
      <Section n={n()} title="Look and feel" hint="The colour theme, wax seal and the photo on the invitation.">
        <Grid>
          <Label text="Colour theme">
            <select value={doc.theme} onChange={(e) => setTheme(e.target.value)} className={inputCls}>
              {Object.keys(THEMES).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Label>
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
        <Grid>
          {INV_FIELDS.map((f) => (
            <TextField key={f.key} label={f.label} value={String(inv[f.key] ?? '')} placeholder={f.ph} hint={f.hint} onChange={(v) => setInv({ [f.key]: v })} />
          ))}
        </Grid>
      </Section>
    </>
  );
}

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
