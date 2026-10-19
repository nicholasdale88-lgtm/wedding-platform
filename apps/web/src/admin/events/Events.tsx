import { zonedToUtc } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, eventsApi, type EventFull, type EventQuestion, type EventsData } from '../../lib/api';
import { fmtEvent, toLocalInput } from '../../lib/format';
import { useUnsavedChanges } from '../leave';
import { useAdmin } from '../Shell';
import { Eyebrow, inputCls, Label, Pill, useToast } from '../ui';

/**
 * Admin → Events: the celebrations on this invitation (a wedding, a birthday, a brunch…).
 * Each has its own date, place, RSVP, dietary question, seating, texts and night-before guide.
 */

type Draft = Pick<EventFull, 'name' | 'pendingLabel' | 'venue' | 'address' | 'mapUrl' | 'catered' | 'hasSeating' | 'questions'> & { local: string };

const draftOf = (e: EventFull, tz: string): Draft => ({
  name: e.name,
  pendingLabel: e.pendingLabel,
  venue: e.venue,
  address: e.address,
  mapUrl: e.mapUrl,
  catered: e.catered,
  hasSeating: e.hasSeating,
  questions: e.questions,
  local: toLocalInput(e.startsAt, tz),
});

/** "Will you ride?" → "will_you_ride" */
const keyOf = (label: string, taken: string[]) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'question';
  let k = base;
  for (let n = 2; taken.includes(k); n++) k = `${base}_${n}`;
  return k;
};

/**
 * `only`: just that event's card (its Setup page). `addOnly`: just "Add an event" (the Account overview).
 * Neither: the full list (the Events page).
 */
export function Events({ only, addOnly }: { only?: string; addOnly?: boolean } = {}) {
  const { wid, reload: reloadNav, path } = useAdmin();
  const go = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<EventsData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await eventsApi.list(wid));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);

  const done = async (events: EventFull[], msg: string) => {
    setData((d) => (d ? { ...d, events } : d));
    toast(msg);
    await reloadNav(); // the sidebar's dates and the other tabs' event lists
  };
  const fail = async (e: unknown) => {
    toast((e as Error).message);
    if (e instanceof ApiError && e.status === 409) await load();
  };

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!data) return <div aria-busy="true" className="text-[#5b6a52]">Loading your events…</div>;
  const tz = data.timezone;
  const shown = addOnly ? [] : only ? data.events.filter((e) => e.key === only) : data.events;

  return (
    <div className="flex flex-col gap-6">
      {!only && !addOnly && (
      <header>
        <Eyebrow>Events</Eyebrow>
        <h1 className="m-0 mt-[6px] font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">What you're celebrating</h1>
        <p className="m-0 mt-2 text-[15px] text-[#5b6a52] max-w-[680px]">
          Each event has its own date, place and RSVP. Guests only see the events they're invited to; choose who's invited in Guests. The invitation's design has two event
          sections, filled by your first two events in date order; every event gets its own RSVP, texts, seating and night-before guide.
        </p>
      </header>
      )}
      {shown.map((e) => (
        <EventCard
          key={`${e.id}:${e.version}`}
          e={e}
          tz={tz}
          onSave={async (d) => {
            try {
              const r = await eventsApi.save(wid, e.id, e.version, {
                name: d.name,
                pendingLabel: d.pendingLabel,
                venue: d.venue,
                address: d.address,
                mapUrl: d.mapUrl,
                catered: d.catered,
                hasSeating: d.hasSeating,
                questions: d.questions.filter((q) => q.label.trim()),
                startsAt: zonedToUtc(d.local, tz).toISOString(),
              });
              await done(r.events, `${d.name} saved`);
            } catch (err) {
              await fail(err);
            }
          }}
          onRemove={
            data.events.length > 1
              ? async () => {
                  if (!window.confirm(`Remove ${e.name}? It comes off every invitation (${e.invited} ${e.invited === 1 ? 'guest' : 'guests'}) and its tables are emptied.`)) return;
                  try {
                    await done((await eventsApi.remove(wid, e.id, e.version)).events, `${e.name} removed`);
                  } catch (err) {
                    await fail(err);
                  }
                }
              : undefined
          }
        />
      ))}
      {!only && (
      <AddEvent
        tz={tz}
        onAdd={async (name, local, inviteEveryone) => {
          try {
            const r = await eventsApi.add(wid, { name, startsAt: zonedToUtc(local, tz).toISOString(), inviteEveryone });
            await done(r.events, `${name} added`);
            go(path('overview', r.added)); // straight into the new event's own section
            return true;
          } catch (err) {
            await fail(err);
            return false;
          }
        }}
      />
      )}
    </div>
  );
}

function EventCard({ e, tz, onSave, onRemove }: { e: EventFull; tz: string; onSave: (d: Draft) => Promise<void>; onRemove?: () => Promise<void> }) {
  const [d, setD] = useState<Draft>(() => draftOf(e, tz));
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(draftOf(e, tz));
  useUnsavedChanges(dirty);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setQ = (i: number, patch: Partial<EventQuestion>) => set({ questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={e.name} className="flex flex-col gap-4 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h2 className="m-0 font-display font-medium text-[28px]">{e.name}</h2>
        <span className="text-[14px] text-[#5b6a52]">
          {fmtEvent(e.startsAt, tz)} · {e.invited} invited · {e.coming} coming
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
        <Label text="Name">
          <input value={d.name} onChange={(x) => set({ name: x.target.value })} className={inputCls} />
        </Label>
        <Label text="Date and start time">
          <input type="datetime-local" value={d.local} onChange={(x) => x.target.value && set({ local: x.target.value })} className={inputCls} />
        </Label>
        <Label text="Venue">
          <input value={d.venue} onChange={(x) => set({ venue: x.target.value })} className={inputCls} />
        </Label>
        <Label text="Address">
          <input value={d.address} onChange={(x) => set({ address: x.target.value })} className={inputCls} />
        </Label>
        <Label text="Map link">
          <input value={d.mapUrl} placeholder="https://maps.google.com/…" onChange={(x) => set({ mapUrl: x.target.value })} className={inputCls} />
        </Label>
        <Label text={'How texts name it ("Will you join us for …?")'}>
          <input value={d.pendingLabel} placeholder="the wedding" onChange={(x) => set({ pendingLabel: x.target.value })} className={inputCls} />
        </Label>
      </div>
      <div className="flex gap-6 flex-wrap text-[15px]">
        <Switch on={d.catered} label="Ask dietary needs" onChange={(catered) => set({ catered })} />
        <Switch on={d.hasSeating} label="Has a seating plan" onChange={(hasSeating) => set({ hasSeating })} />
      </div>
      <div className="flex flex-col gap-2">
        <strong className="text-[15px] font-semibold">Extra RSVP questions</strong>
        {d.questions.map((q, i) => (
          <div key={i} className="flex gap-2 items-start flex-wrap">
            <input aria-label="Question" placeholder="Question, e.g. Will you ride?" value={q.label} onChange={(x) => setQ(i, { label: x.target.value })} className={`${inputCls} min-w-0 flex-[2]`} />
            <select aria-label="Answer type" value={q.type} onChange={(x) => setQ(i, { type: x.target.value as EventQuestion['type'], options: x.target.value === 'choice' ? (q.options ?? ['Yes', 'No']) : undefined })} className={inputCls}>
              <option value="choice">Pick one</option>
              <option value="text">Write an answer</option>
            </select>
            {q.type === 'choice' && (
              <input
                aria-label="Choices"
                placeholder="Choices, separated by commas"
                value={(q.options ?? []).join(', ')}
                onChange={(x) => setQ(i, { options: x.target.value.split(',').map((s) => s.trimStart()).slice(0, 10) })}
                className={`${inputCls} min-w-0 flex-[2]`}
              />
            )}
            <button type="button" aria-label="Remove question" onClick={() => set({ questions: d.questions.filter((_, j) => j !== i) })} className="w-[38px] h-[42px] rounded-[10px] border border-[#d3c6a4] bg-transparent text-[18px] text-[#7a4a37] cursor-pointer">
              ×
            </button>
          </div>
        ))}
        {d.questions.length < 6 && (
          <button
            type="button"
            onClick={() => set({ questions: [...d.questions, { key: keyOf('question', d.questions.map((q) => q.key)), label: '', type: 'choice', options: ['Yes', 'No'] }] })}
            className="self-start py-[7px] px-[14px] rounded-full border border-dashed border-[#8a9670] bg-transparent text-[13px] cursor-pointer hover:bg-[#efe7d3]"
          >
            + Add a question
          </button>
        )}
      </div>
      <div className="flex gap-2 justify-between flex-wrap">
        {onRemove ? (
          <button type="button" disabled={busy} onClick={() => void run(onRemove)} className="p-0 border-0 bg-transparent text-[14px] underline text-[#7a4a37] cursor-pointer">
            Remove this event
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          {dirty && (
            <Pill kind="secondary" disabled={busy} onClick={() => setD(draftOf(e, tz))}>
              Undo changes
            </Pill>
          )}
          <Pill
            kind="primary"
            disabled={busy || !dirty || !d.name.trim()}
            onClick={() => void run(() => onSave({ ...d, questions: d.questions.map((q) => ({ ...q, options: q.options?.map((o) => o.trim()).filter(Boolean) })) }))}
          >
            {busy ? 'Saving…' : 'Save'}
          </Pill>
        </div>
      </div>
    </section>
  );
}

function AddEvent({ tz, onAdd }: { tz: string; onAdd: (name: string, local: string, inviteEveryone: boolean) => Promise<boolean> }) {
  const [name, setName] = useState('');
  const [local, setLocal] = useState(() => toLocalInput(new Date(Date.now() + 180 * 86_400_000).toISOString(), tz).slice(0, 11) + '12:00');
  const [everyone, setEveryone] = useState(true);
  const [busy, setBusy] = useState(false);
  return (
    <section aria-label="Add an event" className="flex flex-col gap-3 p-5 rounded-[16px] border border-dashed border-[#8a9670]">
      <h2 className="m-0 font-display font-medium text-[24px]">Add an event</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
        <Label text="Name">
          <input value={name} placeholder="Recovery brunch" onChange={(x) => setName(x.target.value)} className={inputCls} />
        </Label>
        <Label text="Date and start time">
          <input type="datetime-local" value={local} onChange={(x) => x.target.value && setLocal(x.target.value)} className={inputCls} />
        </Label>
      </div>
      <Switch on={everyone} label="Invite everyone already on my list" onChange={setEveryone} />
      <Pill
        kind="primary"
        className="self-start"
        disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true);
          if (await onAdd(name.trim(), local, everyone)) setName('');
          setBusy(false);
        }}
      >
        {busy ? 'Adding…' : 'Add event'}
      </Pill>
    </section>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" role="switch" checked={on} onChange={() => onChange(!on)} className="w-[18px] h-[18px] accent-[#5d6b47]" />
      {label}
    </label>
  );
}
