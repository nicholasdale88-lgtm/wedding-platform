import { joinDiet } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type GuestDetail, type GuestPatch, type RsvpPut } from '../lib/api';
import { fmtWeekday, fmtWhen, shortLabel } from '../lib/format';
import { Drawer, Eyebrow, inputCls, Label, Pill, useToast } from './ui';

const SEG: [boolean | null, string, string, string][] = [
  [true, 'Attending', '#5d6b47', '#fbf8f2'],
  [false, 'Declined', '#8a5a45', '#fbf8f2'],
  [null, 'Awaiting', '#e6dcc4', '#33402f'],
];
const VIA: Record<string, string> = { invitation: 'Invitation', sms: 'Text reply', admin: 'Entered by you' };

/** design/RSVP Admin.dc.html → guest drawer. Text fields save when you leave them; buttons save straight away. */
export function GuestDrawer({ wid, id, tz, onClose, onChanged }: { wid: string; id: string; tz: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [d, setD] = useState<GuestDetail | null>(null);
  const [error, setError] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [table, setTable] = useState('');
  const [diet, setDiet] = useState('');
  const [message, setMessage] = useState('');
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  const fill = useCallback((x: GuestDetail) => {
    setD(x);
    setNames(x.guest.people.map((p) => p.name));
    setPhone(x.guest.phoneDisplay);
    setTable(x.guest.people.find((p) => p.table)?.table ?? '');
    setDiet(joinDiet(x.guest.people));
    setMessage(Object.values(x.guest.rsvp).map((r) => r.message).find((m) => m.trim()) ?? '');
    setPick((p) => p || x.campaigns[0]?.id || '');
  }, []);

  const load = useCallback(async () => {
    try {
      fill(await api.guest(wid, id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid, id, fill]);
  useEffect(() => {
    void load();
  }, [load]);

  /** Run a save; on success refresh from the server's answer, on a clash reload. */
  async function save(run: () => Promise<GuestDetail>) {
    try {
      fill(await run());
      toast('Saved');
      await onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast('Updated elsewhere, reloaded.');
        await load();
        await onChanged();
      } else {
        toast((e as Error).message);
        await load(); // put the fields back to what's saved
      }
    }
  }
  const patch = (p: GuestPatch) => d && save(() => api.patchGuest(wid, d.guest, p));
  const rsvp = (r: RsvpPut) => d && save(() => api.putRsvp(wid, d.guest, r));

  if (error) {
    return (
      <Drawer onClose={onClose} label="Guest">
        <p role="alert" className="text-[#8a5a45]">{error}</p>
      </Drawer>
    );
  }
  if (!d) return <Drawer onClose={onClose} label="Guest"><div aria-busy="true" /></Drawer>;

  const g = d.guest;
  const events = d.events;
  const invitedEvents = events.filter((e) => g.invited.includes(e.key));
  const count = Math.max(1, ...Object.values(g.rsvp).map((r) => r.count));
  const lastVia = Object.values(g.rsvp).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.via ?? '';
  const peopleNames = names.filter((n) => n.trim());
  const dayOf = (iso: string) => fmtWeekday(iso, tz);
  const savePeople = (next: string[]) => {
    setNames(next);
    void patch({ people: next.map((n) => n.trim()) });
  };

  async function sendNow() {
    if (!d || !pick) return;
    if (!g.phone) return toast('Add a mobile first');
    setBusy(true);
    try {
      const est = await api.estimateOne(wid, g.id, pick);
      const name = d.campaigns.find((c) => c.id === pick)?.name ?? 'this text';
      const cost = (est.costCents / 100).toFixed(2);
      const when = est.quiet ? ' It is quiet hours, so it will go out at 8am.' : '';
      if (!window.confirm(`Send "${name}" to ${g.people[0]?.name ?? 'this guest'}? ${est.parts} SMS ${est.parts === 1 ? 'part' : 'parts'}, about $${cost}.${when}`)) return;
      const res = await api.sendOne(wid, g.id, pick);
      toast(res.stopped ? res.stopped.error : res.sent ? 'Sent' : 'Queued for 8am');
      await load();
      await onChanged();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!d || !window.confirm(`Remove ${g.people[0]?.name || 'this guest'}?`)) return;
    try {
      await api.removeGuest(wid, g.id);
      onClose();
      await onChanged();
      toast('Guest removed', {
        label: 'Undo',
        run: () => void api.restoreGuest(wid, g.id).then(onChanged, (e: Error) => toast(e.message)),
      });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const whatsapp = () => {
    const to = g.phone ? g.phone.replace(/^\+/, '') : '';
    window.open(`https://wa.me/${to}?text=${encodeURIComponent(d.link)}`, '_blank', 'noopener');
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(d.link);
      toast('Link copied');
    } catch {
      toast('Copy did not work. Select the link and copy it.');
    }
  };

  const invitedKey = events.length === 2 ? (g.invited.length === 2 ? 'all' : g.invited[0]) : null;
  const invOptions: [string, string, string[]][] =
    events.length === 2
      ? [['all', 'Both', events.map((e) => e.key)], ...events.map((e) => [e.key, `${shortLabel(e.name)} only`, [e.key]] as [string, string, string[]])]
      : events.map((e) => [e.key, shortLabel(e.name), g.invited.includes(e.key) ? g.invited.filter((k) => k !== e.key) : [...g.invited, e.key]]);

  return (
    <Drawer onClose={onClose} label={`Guest: ${g.people[0]?.name || 'New guest'}`}>
      <div className="flex justify-between items-start gap-3">
        <div>
          <Eyebrow>Guest</Eyebrow>
          <h2 className="mt-1 mb-0 font-display font-medium text-[32px] leading-[1.1]">{g.people[0]?.name || 'New guest'}</h2>
          <div className="mt-1 text-[13px] text-[#5b6a52]">{g.repliedAt ? `Replied ${fmtWhen(g.repliedAt, tz)} · ${VIA[lastVia] ?? lastVia}` : 'No reply yet'}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-full border border-[#c6b794] bg-transparent text-[18px] leading-none cursor-pointer">×</button>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-baseline gap-[10px]">
          <Eyebrow>People on this invitation</Eyebrow>
          <span className="text-[13px] text-[#5b6a52]">{peopleNames.length} {peopleNames.length === 1 ? 'person' : 'people'}</span>
        </div>
        <Label text="Main contact · gets the texts">
          <input value={names[0] ?? ''} onChange={(e) => setNames([e.target.value, ...names.slice(1)])} onBlur={() => names[0] !== g.people[0]?.name && savePeople(names)} className={inputCls} />
        </Label>
        {names.slice(1).map((n, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={n}
              placeholder="Guest name"
              aria-label="Guest name"
              onChange={(e) => setNames(names.map((x, j) => (j === i + 1 ? e.target.value : x)))}
              onBlur={() => n !== g.people[i + 1]?.name && savePeople(names)}
              className={`flex-1 min-w-0 ${inputCls}`}
            />
            <button onClick={() => savePeople(names.filter((_, j) => j !== i + 1))} aria-label="Remove person" className="w-[38px] h-[38px] flex-none rounded-full border border-[#c6b794] bg-transparent text-[16px] cursor-pointer hover:bg-[#efe7d3]">×</button>
          </div>
        ))}
        <Pill kind="dashed" className="self-start" onClick={() => setNames([...names, ''])}>+ Add person</Pill>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <Label text="Main contact's mobile">
            <input value={phone} inputMode="tel" placeholder="04xx xxx xxx" onChange={(e) => setPhone(e.target.value)} onBlur={() => phone !== g.phoneDisplay && void patch({ phone: phone.trim() || null })} className={inputCls} />
          </Label>
          <Label text="Seats held">
            <input type="number" min={1} max={60} defaultValue={g.seatsHeld} key={g.version} onBlur={(e) => Number(e.target.value) !== g.seatsHeld && Number(e.target.value) >= 1 && void patch({ seatsHeld: Number(e.target.value) })} className={inputCls} />
          </Label>
        </div>
        <Label text="Reception table">
          <input value={table} placeholder="e.g. 4" onChange={(e) => setTable(e.target.value)} onBlur={() => table !== (g.people.find((p) => p.table)?.table ?? '') && void patch({ table: table.trim() || null })} className={`${inputCls} max-w-[140px]`} />
        </Label>
        {!g.phone && <div className="text-[13px] text-[#8a5a45]">No mobile, so this guest will not receive any SMS.</div>}
        {g.optOut && <div className="text-[13px] text-[#8a5a45]">Opted out of texts (replied STOP).</div>}
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-[13px] text-[#5b6a52]">Invited to</span>
          {invOptions.map(([k, label, next]) => {
            const on = invitedKey !== null ? invitedKey === k : g.invited.includes(k);
            return (
              <button key={k} aria-pressed={on} onClick={() => void patch({ invited: next })} className="py-[6px] px-[13px] rounded-full border border-[#c6b794] text-[13px] cursor-pointer" style={{ background: on ? '#5d6b47' : 'transparent', color: on ? '#fbf8f2' : '#33402f' }}>
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-[14px] pt-5 border-t border-[#e2d7bc]">
        <Eyebrow>RSVP</Eyebrow>
        {invitedEvents.map((e) => (
          <div key={e.key} className="flex flex-col gap-[6px]" role="group" aria-label={e.name}>
            <span className="text-[13px] text-[#5b6a52]">{e.name} · {dayOf(e.startsAt)}</span>
            <div className="flex gap-[6px]">
              {SEG.map(([val, label, bg, fg]) => {
                const on = (g.rsvp[e.key]?.attending ?? null) === val;
                return (
                  <button key={label} aria-pressed={on} onClick={() => void rsvp({ events: { [e.key]: { attending: val } } })} className="flex-1 py-[9px] px-[10px] rounded-[10px] border border-[#c6b794] text-[14px] cursor-pointer" style={{ background: on ? bg : '#fbf8f2', color: on ? fg : '#33402f' }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
          <Label text="Attending">
            <select value={count} onChange={(e) => void rsvp({ events: {}, count: Number(e.target.value) })} className={inputCls}>
              {Array.from({ length: Math.max(g.seatsHeld, count) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </Label>
          {invitedEvents.flatMap((e) =>
            g.rsvp[e.key]?.attending
              ? e.questions.filter((q) => q.type === 'choice').map((q) => (
                  <Label key={`${e.key}:${q.key}`} text={q.label}>
                    <select value={g.rsvp[e.key]?.answers[q.key] ?? ''} onChange={(ev) => void rsvp({ events: { [e.key]: { attending: true, answers: { ...g.rsvp[e.key]?.answers, [q.key]: ev.target.value } } } })} className={inputCls}>
                      <option value="" disabled>Choose…</option>
                      {q.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Label>
                ))
              : [],
          )}
        </div>
        <Label text="Dietary requirements">
          <textarea rows={2} value={diet} onChange={(e) => setDiet(e.target.value)} onBlur={() => diet !== joinDiet(g.people) && void rsvp({ events: {}, diet })} className={`${inputCls} resize-y`} />
        </Label>
        <Label text="Message for the couple">
          <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} onBlur={() => message !== (Object.values(g.rsvp).map((r) => r.message).find((m) => m.trim()) ?? '') && void rsvp({ events: {}, message })} className={`${inputCls} resize-y`} />
        </Label>
      </section>

      <section className="flex flex-col gap-[10px] pt-5 border-t border-[#e2d7bc]">
        <Eyebrow>Personal link</Eyebrow>
        <div className="flex gap-2 items-center">
          <code className="flex-1 min-w-0 py-[9px] px-3 rounded-[10px] bg-[#fbf8f2] border border-[#e2d7bc] text-[12px] overflow-hidden text-ellipsis whitespace-nowrap">{d.link}</code>
          <Pill className="!py-[9px] !px-[14px] !text-[13px] !font-normal" onClick={copy}>Copy</Pill>
          <Pill className="!py-[9px] !px-[14px] !text-[13px] !font-normal" onClick={whatsapp}>WhatsApp</Pill>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-[13px] text-[#5b6a52]">Preview as this guest</span>
          <a href={previewUrl(d.link)} target="_blank" rel="noopener" className={previewCls}>
            Invitation
          </a>
          {invitedEvents.map((e) => (
            <a key={e.key} href={previewUrl(d.link, `tomorrow/${e.key}`)} target="_blank" rel="noopener" className={previewCls}>
              Night before{invitedEvents.length > 1 ? `: ${shortLabel(e.name)}` : ''}
            </a>
          ))}
          <a href={previewUrl(d.link, 'photos')} target="_blank" rel="noopener" className={previewCls}>
            Photos
          </a>
        </div>
      </section>

      <section className="flex flex-col gap-[10px] pt-5 border-t border-[#e2d7bc]">
        <Eyebrow>Text messages</Eyebrow>
        {d.sms.map((m, i) => (
          <div key={i} className="flex justify-between gap-[10px] text-[13px] py-[7px] border-b border-[#ece3cc]">
            <span>{m.name}</span>
            <span className="text-[#5b6a52]">{fmtWhen(m.at, tz)} · {m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span>
          </div>
        ))}
        {d.sms.length === 0 && <div className="text-[13px] text-[#5b6a52]">Nothing sent yet.</div>}
        <div className="flex gap-2">
          <select aria-label="Message to send" value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 min-w-0 py-[9px] px-3 border border-[#d3c6a4] rounded-[10px] bg-[#fbf8f2] text-[14px]">
            {d.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Pill kind="primary" className="!py-[9px] !px-4 !text-[13px]" disabled={busy} onClick={sendNow}>Send now</Pill>
        </div>
      </section>

      <button onClick={remove} className="self-start p-0 border-0 bg-transparent text-[#8a5a45] text-[13px] underline cursor-pointer">Remove guest</button>
    </Drawer>
  );
}

const previewCls = 'py-[7px] px-[14px] rounded-full border border-dashed border-[#8a9670] text-[13px] no-underline !text-[#33402f] hover:bg-[#efe7d3]';

/**
 * One of the guest's own pages (invitation, a night-before guide, photos), opened in preview mode:
 * it doesn't count as them opening it and never records a reply.
 */
function previewUrl(link: string, page = ''): string {
  try {
    const u = new URL(link);
    if (page) u.pathname = `${u.pathname.replace(/\/+$/, '')}/${page}`;
    u.searchParams.set('preview', '1');
    return `${u.pathname}${u.search}`;
  } catch {
    return link;
  }
}
