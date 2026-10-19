import { zonedToUtc } from '@wp/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, textsApi, type Campaign, type Estimate, type TextsData } from '../../lib/api';
import { fmtDay, fmtTime, fmtWhen, shortLabel, toLocalInput } from '../../lib/format';
import { useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../leave';
import { ALL_EVENTS, useAdmin, useSectionName } from '../Shell';
import { Eyebrow, H2, inputCls, Label, Pill, useAutoRefresh, useToast } from '../ui';
import { isNightBefore, NightText } from '../pages/NightText';

/**
 * Admin → SMS messages (design: isSms). Every text the wedding sends: when it goes, to whom, the
 * wording with a live phone preview, its dates, and Send now (always count and cost first).
 * Replies from guests are above; what has been sent is at the bottom.
 */
export function SmsMessages() {
  const { wid, reload: reloadOverview, event: chosen, path } = useAdmin();
  const go = useNavigate();
  const section = useSectionName();
  const toast = useToast();
  const [data, setData] = useState<TextsData | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [histOpen, setHistOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await textsApi.get(wid));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  useAutoRefresh(load);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!data) return <div aria-busy="true" className="text-[#5b6a52]">Loading your messages…</div>;

  const tz = data.timezone;
  // Only this event's messages (and those to every event) count here: the birthday's ride reminder isn't the wedding's.
  const mine = data.campaigns.filter((c) => forEvent(c, chosen, data.events));
  const night = data.events.some((e) => e.key === chosen); // inside an event: its night-before text card
  const auto = mine.filter((c) => c.enabled && c.mode !== 'manual');
  const next = mine
    .filter((c) => c.enabled && c.mode === 'dates')
    .flatMap((c) => c.slots.filter((s) => s.status === 'pending' && s.sendAt > new Date().toISOString()).map((s) => ({ c, at: s.sendAt })))
    .sort((a, b) => a.at.localeCompare(b.at))[0];

  const toggle = async (c: Campaign) => {
    try {
      await textsApi.patch(wid, c, { enabled: !c.enabled });
      toast(c.enabled ? `${c.name} switched off` : `${c.name} is on autopilot`);
      await load();
      void reloadOverview();
    } catch (e) {
      toast((e as Error).message);
      if (e instanceof ApiError && e.status === 409) void load();
    }
  };

  /** One tap: a reminder to everyone still to reply (pick its date), or a message to everyone. */
  const quickAdd = async (kind: 'reminder' | 'everyone') => {
    const aud = data.audiences.find((a) => a.label === (kind === 'reminder' ? 'Still to reply' : 'Everyone with a mobile'));
    if (!aud) return;
    // In an event's section, new messages go to that event's guests only.
    const ev = data.events.find((e) => e.key === chosen);
    const audience = ev ? (kind === 'reminder' ? { ...aud.audience, invitedTo: ev.key } : { invitedTo: ev.key }) : aud.audience;
    const n = data.campaigns.filter((c) => c.custom && /^Reminder/.test(c.name)).length + 1;
    const preset = data.presets.find((p) => /remind/i.test(`${p.k} ${p.label}`))?.text;
    try {
      const { id } = await textsApi.add(
        wid,
        kind === 'reminder' ? `Reminder ${n}${ev ? ` · ${ev.name}` : ''}` : ev ? `Message to ${ev.name} guests` : 'Message to everyone',
        audience,
        kind === 'reminder' ? (preset ?? 'Hi {first}, a gentle reminder to RSVP for {pending} here: {link}') : undefined,
      );
      await load();
      setOpen(id);
      toast(kind === 'reminder' ? 'Reminder added: pick its date, then Save.' : 'Write your message, check the preview, then Send now.');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <Eyebrow>{section} · SMS · {data.live ? (data.paused ? 'Paused' : 'Live') : 'Not set up yet'}</Eyebrow>
          <h1 className="m-0 mt-[6px] font-display font-medium text-[40px] leading-[1.08]">
            {auto.length} {auto.length === 1 ? 'message' : 'messages'} on autopilot
          </h1>
          <div className="mt-1 text-[15px] text-[#5b6a52]">{next ? `Next: ${next.c.name}, ${fmtWhen(next.at, tz)}` : 'Nothing scheduled right now.'}</div>
          {!data.live && <div className="mt-1 text-[14px] text-[#7a4a37]">Texts won't really send until your number is added under Account → Texting setup.</div>}
          {data.invitesFrom && <InvitesFrom data={data} onChanged={load} />}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Pill onClick={() => void quickAdd('reminder')}>+ Add a reminder</Pill>
          <Pill onClick={() => void quickAdd('everyone')}>Message everyone</Pill>
          <Pill kind="primary" onClick={() => setAdding(true)}>
            + New message
          </Pill>
        </div>
      </header>

      {adding && (
        <NewMessage
          data={data}
          onCancel={() => setAdding(false)}
          onAdded={async (id) => {
            setAdding(false);
            await load();
            setOpen(id);
          }}
        />
      )}

      <section className="flex flex-col gap-2 p-5 rounded-[14px] bg-[#efe7d3]">
        <div className="flex justify-between items-baseline gap-3 flex-wrap">
          <h2 className="m-0 font-display font-medium text-[26px]">Texted replies</h2>
          <span className="text-[13px] text-[#5b6a52]">{data.inbox.length ? `${data.inbox.length} received` : ''}</span>
        </div>
        <div className="text-[14px] text-[#5b6a52]">
          YES and NO replies are recorded for you. Questions and messages from guests, texted or written on their page, are in{' '}
          <button
            type="button"
            onClick={() => go(path('messages', ALL_EVENTS))}
            className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f] text-[14px]"
          >
            Account → Messages
          </button>
          , where you can reply.
        </div>
        {data.inbox.slice(0, 12).map((m) => (
          <div key={m.id} className="grid grid-cols-[92px_minmax(0,1fr)] sm:grid-cols-[110px_160px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-2 border-t border-[#e2d7bc] text-[14px] items-baseline">
            <span className="text-[12px] text-[#7a7466]">{fmtWhen(m.at, tz)}</span>
            <strong className="font-semibold">{m.name}</strong>
            <span className="col-span-2 sm:col-span-1 italic">“{m.body}”</span>
            <span className="col-span-2 sm:col-span-1 text-[12px] text-[#55633f]">{m.action}</span>
          </div>
        ))}
        {!data.inbox.length && <div className="text-[14px] text-[#5b6a52]">No replies yet. When a guest texts back YES or NO it is handled for you and shows up here.</div>}
      </section>

      {night && (
        <section aria-label="Night before" className="flex flex-col gap-3">
          <H2>The night before</H2>
          <NightText eventKey={chosen} data={data} onChanged={load} />
        </section>
      )}

      {STAGES.map((stage) => {
        // The sidebar's event: its own messages, plus those that go to everyone.
        // The night-before text has its own card above (preview, time, on/off).
        const list = data.campaigns.filter((c) => stageOf(c) === stage.key && forEvent(c, chosen, data.events) && !(night && isNightBefore(c) && eventOf(c) === chosen));
        if (!list.length) return null;
        return (
          <section key={stage.key} className="flex flex-col">
            <div className="flex items-baseline justify-between gap-3 pb-1">
              <h2 className="m-0 font-display font-medium text-[24px]">{stage.title}</h2>
              <span className="text-[13px] text-[#7a7466]">{stage.hint}</span>
            </div>
            {list.map((c) => (
              <CampaignRow key={c.id} c={c} data={data} open={open === c.id} onOpen={() => setOpen(open === c.id ? null : c.id)} onToggle={() => void toggle(c)} onChanged={load} />
            ))}
          </section>
        );
      })}

      <section className="flex flex-col gap-2">
        <button type="button" onClick={() => setHistOpen((o) => !o)} className="self-start p-0 border-0 bg-transparent text-[14px] underline cursor-pointer text-[#33402f]">
          {histOpen ? 'Hide what has been sent' : `What has been sent (${data.history.reduce((n, h) => n + h.count, 0)})`}
        </button>
        {histOpen &&
          data.history.map((h, i) => (
            <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-1 py-2 border-t border-[#ece3cc] text-[14px]">
              <span className="text-[12px] text-[#7a7466]">{fmtWhen(h.at, tz)}</span>
              <span>
                <strong className="font-semibold">{h.name}</strong> · {h.count} {h.count === 1 ? 'text' : 'texts'}
                {h.failed ? <span className="text-[#7a4a37]"> · {h.failed} did not send</span> : null}
              </span>
              <span className="col-span-2 text-[13px] text-[#5b6a52] truncate">{h.sample}</span>
            </div>
          ))}
      </section>
    </div>
  );
}


// ---------------------------------------------------------------- grouping by stage

type StageKey = 'invite' | 'auto' | 'night' | 'after' | 'own' | 'other';
const STAGES: { key: StageKey; title: string; hint: string }[] = [
  { key: 'invite', title: 'Invitations & reminders', hint: 'before the reply-by date' },
  { key: 'auto', title: 'Thank-yous', hint: 'sent when a guest replies' },
  { key: 'night', title: 'The night before', hint: 'directions, tables, weather' },
  { key: 'after', title: 'Afterwards', hint: 'photos and thanks' },
  { key: 'own', title: 'Your own messages', hint: 'sent when you choose' },
  { key: 'other', title: 'Other messages', hint: '' },
];

/** Which stage a message belongs to, from how it's sent and what it's called. */
export function stageOf(c: Pick<Campaign, 'key' | 'name' | 'custom' | 'trigger'>): StageKey {
  const text = `${c.key} ${c.name}`.toLowerCase();
  if (c.custom) return /remind/.test(text) ? 'invite' : 'own';
  if (c.trigger === 'rsvp_changed' || /thank.*(repl|rsvp)|confirm/.test(text)) return 'auto';
  if (c.trigger === 'invitation_created' || /invit|remind|rsvp|save.?the.?date/.test(text)) return 'invite';
  if (/night|tomorrow|guide|day.?of|morning of/.test(text)) return 'night';
  if (/photo|after|thank/.test(text)) return 'after';
  return 'other';
}


// ---------------------------------------------------------------- one message

function whenOf(c: Campaign, tz: string): [string, string] {
  if (c.mode === 'manual') return ['By hand', 'when you choose'];
  if (c.mode === 'auto') return c.trigger === 'rsvp_changed' ? ['After a reply', 'automatic'] : ['When invited', 'automatic'];
  const next = c.slots.filter((s) => s.status === 'pending').map((s) => s.sendAt).sort()[0];
  return next ? [fmtDay(next, tz), fmtTime(next, tz)] : ['No date', 'add one'];
}

function CampaignRow({ c, data, open, onOpen, onToggle, onChanged }: { c: Campaign; data: TextsData; open: boolean; onOpen: () => void; onToggle: () => void; onChanged: () => Promise<void> }) {
  const [when, whenSub] = whenOf(c, data.timezone);
  // Once opened, the editor stays mounted (hidden when the row is closed), so a half-written text survives.
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return (
    <div className="border-t border-[#e2d7bc]">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-[14px]">
        <button type="button" onClick={onOpen} aria-expanded={open} className="grid grid-cols-[86px_minmax(0,1fr)] sm:grid-cols-[110px_minmax(0,1fr)_70px] gap-3 items-center p-0 border-0 bg-transparent text-left text-[#33402f] cursor-pointer">
          <span className="flex flex-col">
            <span className="text-[15px] font-medium">{when}</span>
            <span className="text-[12px] text-[#7a7466]">{whenSub}</span>
          </span>
          <span className="flex flex-col min-w-0">
            <span className="font-display text-[22px] leading-tight">
              {c.name}
              {!eventOf(c) && data.events.length > 1 && (
                <span className="ml-2 align-middle py-[2px] px-2 rounded-full bg-[#efe7d3] text-[11px] font-sans font-semibold tracking-[.06em] uppercase text-[#5b6a52]">All events</span>
              )}
            </span>
            <span className="text-[13px] text-[#5b6a52] truncate">{c.body || 'No wording yet'}</span>
          </span>
          <span className="hidden sm:block text-[13px] text-[#5b6a52] text-right">{c.count} {c.count === 1 ? 'guest' : 'guests'}</span>
        </button>
        {c.mode === 'manual' ? (
          <span className="text-[12px] py-[3px] px-[9px] rounded-full bg-[#efe7d3] text-[#5e5130]">Manual</span>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={c.enabled}
            aria-label={`Autopilot: ${c.name}`}
            onClick={onToggle}
            className={`relative w-[44px] h-[26px] rounded-full border-0 cursor-pointer transition-colors ${c.enabled ? 'bg-[var(--adm-accent,#5d6b47)]' : 'bg-[#d3c6a4]'}`}
          >
            <span className={`absolute top-[3px] w-[20px] h-[20px] rounded-full bg-[#fbf8f2] transition-all ${c.enabled ? 'left-[21px]' : 'left-[3px]'}`} />
          </button>
        )}
      </div>
      {opened && (
        <div hidden={!open}>
          <Editor c={c} data={data} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

function Editor({ c, data, onChanged }: { c: Campaign; data: TextsData; onChanged: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const tz = data.timezone;
  const [body, setBody] = useState(c.body);
  const [name, setName] = useState(c.name);
  const [audKey, setAudKey] = useState(data.audiences.find((a) => a.label === c.audienceLabel)?.key ?? '');
  const [excluded, setExcluded] = useState<string[]>(c.excluded);
  const [dates, setDates] = useState<string[]>(c.slots.filter((s) => s.status === 'pending').map((s) => toLocalInput(s.sendAt, tz)));
  const [est, setEst] = useState<Estimate | null>(null);
  const [showWho, setShowWho] = useState(false);
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);

  const audience = data.audiences.find((a) => a.key === audKey)?.audience ?? c.audience;
  const datesUtc = dates.filter(Boolean).map((d) => zonedToUtc(d, tz).toISOString());
  const savedDates = c.slots.filter((s) => s.status === 'pending').map((s) => s.sendAt).sort();
  const dirty =
    body !== c.body ||
    (c.custom && name !== c.name) ||
    JSON.stringify(audience) !== JSON.stringify(c.audience) ||
    JSON.stringify(excluded) !== JSON.stringify(c.excluded) ||
    ((c.mode === 'dates' || c.custom) && JSON.stringify([...datesUtc].sort()) !== JSON.stringify(savedDates));
  useUnsavedChanges(dirty);

  // Live count, cost and phone preview for exactly what is on screen (nothing is saved or sent).
  // `live`: an answer for words since changed never lands over the newer one.
  const audJson = JSON.stringify(audience);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      textsApi
        .estimate(wid, c.id, { body, audience: JSON.parse(audJson) as typeof audience, excluded })
        .then((e) => live && setEst(e))
        .catch(() => live && setEst(null));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [wid, c.id, body, audJson, excluded]);

  const insert = (tag: string) => {
    const el = ta.current;
    const at = el ? el.selectionStart : body.length;
    const next = `${body.slice(0, at)}${tag}${body.slice(el ? el.selectionEnd : at)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + tag.length, at + tag.length);
    });
  };

  const save = async () => {
    setBusy(true);
    try {
      await textsApi.patch(wid, c, {
        body,
        ...(c.custom ? { name, audience } : {}),
        excluded,
        ...(c.mode === 'dates' || c.custom ? { dates: datesUtc } : {}),
      });
      toast('Saved');
      await onChanged();
    } catch (e) {
      toast((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await onChanged();
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    if (!arming) return setArming(true);
    setArming(false);
    setBusy(true);
    try {
      const r = await textsApi.sendNow(wid, c.id);
      toast(r.stopped ? `Not sent: ${r.stopped.error}` : r.sent ? `Sent to ${r.sent} ${r.sent === 1 ? 'guest' : 'guests'}` : r.queued ? `${r.queued} queued; they go out after quiet hours` : 'Nobody to send to');
      await onChanged();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      await textsApi.test(wid, est?.sample ?? body);
      toast('Test sent to your mobile');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${c.name}"? Anything it still has waiting to send won't go out.`)) return;
    try {
      await textsApi.remove(wid, c.id);
      toast(`${c.name} deleted`);
      await onChanged();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const textable = data.people.filter((p) => p.phone && !p.optOut);
  const perGuest = est && est.count ? Math.round(est.parts / est.count) : null;
  const tags: [string, string][] = [
    ['+ Names', '{first}'],
    ['+ RSVP link', '{link}'],
    ...data.events.map((e, i): [string, string] => [`+ ${shortLabel(e.name)} guide`, i === 0 ? '{guide}' : `{guide_${e.key}}`]),
    ['+ Photo link', '{photos}'],
  ];

  return (
    <div className="flex flex-col gap-4 pb-6">
      {c.custom && (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <Label text="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </Label>
          <Label text="Send to">
            <select value={audKey} onChange={(e) => setAudKey(e.target.value)} className={inputCls}>
              {!audKey && <option value="">{c.audienceLabel}</option>}
              {data.audiences.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </Label>
          <Pill onClick={() => void remove()}>Delete</Pill>
        </div>
      )}
      {!c.custom && <div className="text-[14px] text-[#5b6a52]">Goes to: {c.audienceLabel}.</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div className="flex flex-col gap-2">
          <textarea ref={ta} rows={6} value={body} onChange={(e) => setBody(e.target.value)} aria-label={`Wording: ${c.name}`} className={`${inputCls} resize-y`} />
          <div className="flex gap-2 flex-wrap">
            {data.presets.length > 0 && (
              <select value="" onChange={(e) => e.target.value && setBody(data.presets.find((p) => p.k === e.target.value)?.text ?? body)} aria-label="Use a preset" className={`${inputCls} !py-[6px] !text-[13px]`}>
                <option value="">Presets…</option>
                {data.presets.map((p) => (
                  <option key={p.k} value={p.k}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}
            {tags.map(([label, tag]) => (
              <Pill key={tag} kind="dashed" onClick={() => insert(tag)}>
                {label}
              </Pill>
            ))}
          </div>
          <span className="text-[12px] text-[#7a7466]">
            {body.length} characters{perGuest ? ` · ${perGuest} ${perGuest === 1 ? 'part' : 'parts'} per guest` : ''}. Words in {'{brackets}'} are filled in for each guest.
          </span>
        </div>
        <div className="flex flex-col gap-2 p-4 rounded-[18px] bg-[#fbf8f2] border border-[#e2d7bc]">
          <div className="text-[12px] text-[#7a7466]">
            <strong className="text-[#33402f]">{data.sender ?? 'Your number'}</strong> to {est?.ids[0] ? data.people.find((p) => p.id === est.ids[0])?.name : 'a guest'}
          </div>
          <div className="self-start max-w-full py-[10px] px-[14px] rounded-[18px] rounded-bl-[6px] bg-[#e9e2cf] text-[14px] whitespace-pre-wrap break-words">{est?.sample ?? (body || '…')}</div>
        </div>
      </div>

      {(c.mode === 'dates' || c.custom) && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-[14px] text-[#5b6a52]">Sends on</span>
          {dates.map((d, i) => (
            <span key={i} className="flex gap-1 items-center">
              <input type="datetime-local" value={d} onChange={(e) => setDates(dates.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Send date ${i + 1}`} className={`${inputCls} !py-[6px]`} />
              <button type="button" aria-label="Remove date" onClick={() => setDates(dates.filter((_, j) => j !== i))} className="w-[30px] h-[30px] rounded-full border border-[#d3c6a4] bg-transparent cursor-pointer">
                ×
              </button>
            </span>
          ))}
          <Pill kind="dashed" onClick={() => setDates([...dates, ''])}>
            + Date
          </Pill>
          <span className="basis-full text-[12px] text-[#7a7466]">
            Times are your wedding's time zone. Texts never go out between {data.quiet.end % 12 || 12}pm and {data.quiet.start}am; they wait for the morning.
          </span>
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <button type="button" onClick={() => setShowWho((s) => !s)} className="p-0 border-0 bg-transparent text-[14px] underline cursor-pointer text-[#33402f]">
          {est ? est.count : '…'} of {textable.length} guests · {showWho ? 'hide' : 'choose who'}
        </button>
        {est && <span className="text-[13px] text-[#5b6a52]">About ${(est.costCents / 100).toFixed(2)}{est.quiet ? ' · quiet hours now, so it would wait for the morning' : ''}</span>}
        <span className="flex-1" />
        <Pill onClick={() => void test()}>Send me a test</Pill>
        {dirty ? (
          <Pill kind="primary" disabled={busy} onClick={() => void save()}>
            Save changes
          </Pill>
        ) : (
          <Pill kind={arming ? 'outline' : 'primary'} disabled={busy || !est?.count} onClick={() => void sendNow()} onBlur={() => setArming(false)}>
            {arming ? `Tap again to send to ${est?.count} now` : 'Send now'}
          </Pill>
        )}
      </div>

      {showWho && (
        <div className="flex gap-2 flex-wrap">
          {data.people.map((p) => {
            const off = excluded.includes(p.id);
            const can = p.phone && !p.optOut;
            return (
              <button
                key={p.id}
                type="button"
                disabled={!can}
                aria-pressed={can && !off}
                onClick={() => setExcluded(off ? excluded.filter((x) => x !== p.id) : [...excluded, p.id])}
                title={!p.phone ? 'No mobile' : p.optOut ? 'Replied STOP' : off ? 'Left out' : 'Included'}
                className={`py-[5px] px-3 rounded-full border text-[13px] ${!can ? 'opacity-50 line-through border-[#d3c6a4]' : off ? 'border-[#d3c6a4] bg-transparent text-[#7a7466]' : 'border-[#5d6b47] bg-[#dfe5cc] text-[#33402f]'} cursor-pointer`}
              >
                {p.name}
              </button>
            );
          })}
          <span className="basis-full text-[12px] text-[#7a7466]">Tap a name to leave them out of this message. Crossed-out names have no mobile or replied STOP.</span>
        </div>
      )}
    </div>
  );
}

function NewMessage({ data, onCancel, onAdded }: { data: TextsData; onCancel: () => void; onAdded: (id: string) => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [name, setName] = useState('');
  const [aud, setAud] = useState(data.audiences[0]?.key ?? '');
  const add = async () => {
    if (!name.trim()) return toast('Give the message a name');
    try {
      const { id } = await textsApi.add(wid, name.trim(), data.audiences.find((a) => a.key === aud)!.audience);
      await onAdded(id);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end p-5 rounded-[14px] border border-[#c6b794]">
      <Label text="Name">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shuttle times" className={inputCls} />
      </Label>
      <Label text="Send to">
        <select value={aud} onChange={(e) => setAud(e.target.value)} className={inputCls}>
          {data.audiences.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </select>
      </Label>
      <Pill kind="primary" onClick={() => void add()}>
        Add
      </Pill>
      <Pill onClick={onCancel}>Cancel</Pill>
    </div>
  );
}

/** "Invitations go out from 18 Mar 2027" — 8 months before the first event unless the couple picks a date. */
function InvitesFrom({ data, onChanged }: { data: TextsData; onChanged: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const tz = data.timezone;
  const from = data.invitesFrom!;
  const open = from <= new Date().toISOString();
  const saved = toLocalInput(from, tz).slice(0, 10);
  // Typing a date only changes the box; it saves when you leave it (not on every keystroke).
  const [day, setDay] = useState(saved);
  useEffect(() => setDay(saved), [saved]);
  const save = async (date: string | null) => {
    try {
      await textsApi.invitesFrom(wid, date);
      toast(date ? 'Invitation date saved' : 'Back to 8 months before');
      await onChanged();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap text-[14px]">
      <span className={open ? 'text-[#55633f]' : 'text-[#33402f]'}>{open ? 'Invitations are going out' : 'Invitations go out from'}</span>
      <input
        type="date"
        aria-label="Invitations go out from"
        value={day}
        onChange={(e) => setDay(e.target.value)}
        onBlur={() => {
          if (!day) setDay(saved);
          else if (day !== saved) void save(zonedToUtc(`${day}T09:00`, tz).toISOString());
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={`${inputCls} !py-[5px] !text-[14px]`}
      />
      <span className="text-[13px] text-[#7a7466]">{data.invitesFromCustom ? 'your date' : '8 months before the first event'}</span>
      {data.invitesFromCustom && (
        <button type="button" onClick={() => void save(null)} className="p-0 border-0 bg-transparent text-[13px] underline cursor-pointer text-[#33402f]">
          Use 8 months before
        </button>
      )}
    </div>
  );
}

/** The event a message is aimed at (by who receives it), or null when it goes to guests of every event. */
export const eventOf = (c: Pick<Campaign, 'audience'>): string | null => {
  const a = c.audience as { invitedTo?: unknown; attending?: unknown; answer?: { event?: unknown } };
  const e = a.invitedTo ?? a.attending ?? a.answer?.event;
  return typeof e === 'string' ? e : null;
};
/** An event's SMS: its own messages, plus the ones that go to guests of every event (marked "All events"). */
const forEvent = (c: Pick<Campaign, 'audience'>, chosen: string, events: { key: string }[]) => {
  const e = eventOf(c);
  return !e || !events.some((x) => x.key === chosen) || e === chosen;
};
