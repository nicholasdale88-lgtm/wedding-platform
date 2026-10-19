import { CHECK_TEMPLATE, PARTY_TEMPLATE, type CheckItem, type DayChecklist, type PartyItem, type PartyRunsheet } from '@wp/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, plannerApi, type Guest, type PartyData, type PartyMember } from '../../lib/api';
import { useAdmin, useSectionName } from '../Shell';
import { Eyebrow, H2, inputCls, Pill, useToast } from '../ui';

/**
 * Event → Wedding party: who's in it (roles on guests), the party's own run sheet (more detail than the
 * guests', each item for everyone, one side, or one role), and both partners' on-the-day checklists.
 * Each member opens their run sheet from their own link: /w/<slug>/party?g=…
 */

const chip = (on: boolean) =>
  `py-[5px] px-3 rounded-full border text-[13px] cursor-pointer ${on ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794] text-[#33402f] hover:bg-[#efe7d3]'}`;
const BLANK: PartyItem = { time: '', until: '', title: '', detail: '', place: '', who: ['party'] };
/** "9:30am" → minutes, for sorting (unknown times keep their place). */
const minutes = (t: string) => {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if ((m[3] ?? '').toLowerCase() === 'pm') h += 12;
  if (!m[3] && Number(m[1]) >= 12) h = Number(m[1]);
  return h * 60 + Number(m[2] ?? 0);
};

export function Party() {
  const { wid, event } = useAdmin();
  const section = useSectionName();
  const toast = useToast();
  const [d, setD] = useState<PartyData | null>(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<PartyRunsheet | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await plannerApi.party(wid, event);
      setD(p);
      setSheet(p.runsheet?.data ?? null);
      setDirty(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid, event]);
  useEffect(() => void load(), [load]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!d || !sheet) return <div aria-busy="true" className="text-[#5b6a52]">Loading the wedding party…</div>;
  const ev = d.events.find((e) => e.key === d.event);

  const edit = (next: PartyRunsheet) => {
    setSheet(next);
    setDirty(true);
  };
  const setItem = (i: number, patch: Partial<PartyItem>) => edit({ ...sheet, items: sheet.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const save = async () => {
    if (!d.event) return;
    setSaving(true);
    try {
      const clean = { ...sheet, items: sheet.items.filter((x) => x.title.trim()) };
      const r = await plannerApi.saveDoc(wid, 'party-runsheet', d.event, clean, d.runsheet?.version ?? 0);
      setD({ ...d, runsheet: r });
      setSheet(r.data);
      setDirty(false);
      toast('Run sheet saved: the wedding party sees it now');
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded. Make your change again.' : (e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setSaving(false);
    }
  };
  const who = (it: PartyItem) => it.who;
  // Who an item can be for: everyone, a side, or any role somebody has.
  const audiences: [string, string][] = [
    ['party', 'Everyone'],
    ['p1', `${d.names.p1}'s side`],
    ['p2', `${d.names.p2}'s side`],
    ...[...new Set(d.members.map((m) => m.role))].sort().map((r) => [r, r] as [string, string]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Eyebrow>{section} · Wedding party</Eyebrow>
        <h1 className="m-0 mt-[6px] font-display font-medium text-[40px] leading-[1.08]">Wedding party</h1>
        <p className="m-0 mt-1 text-[15px] text-[#5b6a52]">
          Give guests a role, build the party's own run sheet for {ev?.name ?? 'this event'}, and keep your on-the-day checklists. Each member sees just their parts on their own link.
        </p>
      </header>

      <Members d={d} onChange={(members) => setD({ ...d, members })} />

      <section aria-label="Run sheet for the wedding party" className="flex flex-col gap-3">
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <div>
            <H2>The party's run sheet</H2>
            <div className="text-[13px] text-[#5b6a52]">More detail than the guests' timeline. Choose who each line is for.</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!sheet.items.length && (
              <Pill kind="dashed" onClick={() => edit({ ...sheet, items: PARTY_TEMPLATE.map((x) => ({ ...x })) })}>
                Start from a typical wedding day
              </Pill>
            )}
            {sheet.items.length > 1 && (
              <Pill
                kind="dashed"
                onClick={() => {
                  // A line without a clock time stays just after the line before it.
                  let last = -1;
                  const keyed = sheet.items.map((x, i) => {
                    last = minutes(x.time) ?? last;
                    return { x, i, m: last };
                  });
                  edit({ ...sheet, items: keyed.sort((a, b) => a.m - b.m || a.i - b.i).map((k) => k.x) });
                }}
              >
                Sort by time
              </Pill>
            )}
            <Pill kind="primary" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : dirty ? 'Save run sheet' : 'Saved'}
            </Pill>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52]">
          A note at the top (dress, where to meet, who to call)
          <textarea rows={2} value={sheet.note} maxLength={1500} onChange={(e) => edit({ ...sheet, note: e.target.value })} className={`${inputCls} resize-y`} />
        </label>
        {sheet.items.map((it, i) => (
          <div key={i} className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <div className="grid grid-cols-[90px_90px_minmax(0,1fr)] gap-2 max-[520px]:grid-cols-2">
              <input aria-label="Time" placeholder="9:30am" value={it.time} onChange={(e) => setItem(i, { time: e.target.value })} className={inputCls} />
              <input aria-label="Until" placeholder="until" value={it.until} onChange={(e) => setItem(i, { until: e.target.value })} className={inputCls} />
              <input aria-label="What" placeholder="What happens" value={it.title} onChange={(e) => setItem(i, { title: e.target.value })} className={`${inputCls} max-[520px]:col-span-2`} />
            </div>
            <input aria-label="Where" placeholder="Where (optional)" value={it.place} onChange={(e) => setItem(i, { place: e.target.value })} className={inputCls} />
            <textarea aria-label="Details" rows={2} placeholder="Details: what to bring, who does what" value={it.detail} onChange={(e) => setItem(i, { detail: e.target.value })} className={`${inputCls} resize-y`} />
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <div role="group" aria-label="Who it's for" className="flex gap-[6px] flex-wrap">
                {audiences.map(([k, label]) => {
                  const on = who(it).includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        const next = on ? who(it).filter((w) => w !== k) : [...who(it).filter((w) => k !== 'party' && w !== 'party'), k];
                        setItem(i, { who: k === 'party' && !on ? ['party'] : next.length ? next : ['party'] });
                      }}
                      className={chip(on)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1">
                <button type="button" aria-label="Move up" disabled={!i} onClick={() => edit({ ...sheet, items: sheet.items.map((x, j) => (j === i - 1 ? sheet.items[i]! : j === i ? sheet.items[i - 1]! : x)) })} className="w-9 h-9 rounded-full border border-[#c6b794] bg-transparent cursor-pointer disabled:opacity-40">
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === sheet.items.length - 1}
                  onClick={() => edit({ ...sheet, items: sheet.items.map((x, j) => (j === i + 1 ? sheet.items[i]! : j === i ? sheet.items[i + 1]! : x)) })}
                  className="w-9 h-9 rounded-full border border-[#c6b794] bg-transparent cursor-pointer disabled:opacity-40"
                >
                  ↓
                </button>
                <button type="button" aria-label="Remove line" onClick={() => edit({ ...sheet, items: sheet.items.filter((_, j) => j !== i) })} className="w-9 h-9 rounded-full border border-[#c6b794] bg-transparent cursor-pointer text-[#7a4a37]">
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
        <Pill kind="dashed" className="self-start" onClick={() => edit({ ...sheet, items: [...sheet.items, { ...BLANK }] })}>
          + Add a line
        </Pill>
      </section>

      {d.event && d.checklist && <Checklists wid={wid} scope={d.event} names={d.names} initial={d.checklist} />}
    </div>
  );
}

function Members({ d, onChange }: { d: PartyData; onChange: (m: PartyMember[]) => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('Bridesmaid');
  useEffect(() => {
    api
      .guests(wid)
      .then((r) => setGuests(r.guests))
      .catch(() => setGuests([]));
  }, [wid]);
  const set = async (personId: string, r: string, done: string) => {
    try {
      onChange((await plannerApi.setRole(wid, personId, r)).members.map((m) => ({ ...m, token: d.members.find((x) => x.personId === m.personId)?.token ?? null })));
      toast(done);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const inParty = new Set(d.members.map((m) => m.personId));
  const needle = q.trim().toLowerCase();
  const found = useMemo(
    () => (needle ? (guests ?? []).flatMap((g) => g.people.filter((p) => !inParty.has(p.id) && p.name.toLowerCase().includes(needle)).map((p) => ({ id: p.id, name: p.name }))).slice(0, 8) : []),
    [guests, needle, d.members], // eslint-disable-line
  );
  const groups: [string, PartyMember[]][] = [
    [`${d.names.p1}'s side`, d.members.filter((m) => m.side === 'p1')],
    [`${d.names.p2}'s side`, d.members.filter((m) => m.side === 'p2')],
    ['Also helping', d.members.filter((m) => !m.side)],
  ];
  return (
    <section aria-label="Who's in the wedding party" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <H2>Who's in it</H2>
      <datalist id="party-roles">
        {d.roles.map((r) => (
          <option key={r.role} value={r.role} />
        ))}
      </datalist>
      {d.members.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {groups.map(([label, ms]) => (
            <div key={label} className="flex flex-col gap-2 min-w-0">
              <div className="text-[12px] font-semibold tracking-[.12em] uppercase text-[#5b6a52]">{label}</div>
              {ms.map((m) => (
                <div key={m.personId} className="flex flex-col gap-1 p-2 rounded-[10px] bg-white border border-[#e2d7bc]">
                  <span className="font-medium truncate">{m.name}</span>
                  <input
                    aria-label={`${m.name}'s role`}
                    list="party-roles"
                    defaultValue={m.role}
                    onBlur={(e) => e.target.value.trim() !== m.role && void set(m.personId, e.target.value.trim(), e.target.value.trim() ? 'Role changed' : `${m.name} is no longer in the party`)}
                    className={`${inputCls} !py-[6px] !text-[14px]`}
                  />
                  <span className="flex gap-3 text-[12px]">
                    {m.token && (
                      <a href={`/w/${d.slug}/party?g=${encodeURIComponent(m.token)}`} target="_blank" rel="noopener" className="!text-[#33402f]">
                        Their page
                      </a>
                    )}
                    <button type="button" onClick={() => void set(m.personId, '', `${m.name} is no longer in the party`)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]">
                      Remove
                    </button>
                  </span>
                </div>
              ))}
              {!ms.length && <span className="text-[13px] text-[#7a7466]">No one yet.</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 text-[14px] text-[#5b6a52]">No one yet. Add your bridesmaids, groomsmen, MC and ushers from your guest list below.</p>
      )}
      <div className="flex gap-2 flex-wrap items-end">
        <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52] flex-1 min-w-[180px]">
          Add a guest
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name from your guest list" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-[#5b6a52] w-[180px]">
          as
          <input list="party-roles" value={role} onChange={(e) => setRole(e.target.value)} className={inputCls} />
        </label>
      </div>
      {found.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {found.map((p) => (
            <Pill
              key={p.id}
              kind="outline"
              disabled={!role.trim()}
              onClick={() => {
                setQ('');
                void set(p.id, role.trim(), `${p.name} is now a ${role.trim().toLowerCase()}`);
              }}
            >
              + {p.name}
            </Pill>
          ))}
        </div>
      )}
      {needle && guests && !found.length && <span className="text-[13px] text-[#7a7466]">No guest by that name. Add them to your guest list first.</span>}
    </section>
  );
}

/** Each partner's own list for the day, ticked off as they go (saved with every tick). */
function Checklists({ wid, scope, names, initial }: { wid: string; scope: string; names: { p1: string; p2: string }; initial: { data: DayChecklist; version: number } }) {
  const toast = useToast();
  const [doc, setDoc] = useState(initial);
  const [adding, setAdding] = useState<Record<'p1' | 'p2', string>>({ p1: '', p2: '' });
  const save = async (data: DayChecklist) => {
    const before = doc;
    setDoc({ ...doc, data }); // show it straight away
    try {
      setDoc(await plannerApi.saveDoc(wid, 'day-checklist', scope, data, before.version));
    } catch (e) {
      setDoc(before);
      toast(e instanceof ApiError && e.status === 409 ? 'Changed on another device: reload to see it.' : (e as Error).message);
    }
  };
  const empty = !doc.data.p1.length && !doc.data.p2.length;
  return (
    <section aria-label="On-the-day checklists" className="flex flex-col gap-3">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>On the day: your checklists</H2>
          <div className="text-[13px] text-[#5b6a52]">One each. Tick things off on your phone as you go.</div>
        </div>
        {empty && (
          <Pill kind="dashed" onClick={() => void save(structuredClone(CHECK_TEMPLATE))}>
            Start with the usual list
          </Pill>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(['p1', 'p2'] as const).map((side) => {
          const list = doc.data[side];
          const set = (items: CheckItem[]) => void save({ ...doc.data, [side]: items });
          const left = list.filter((x) => !x.done).length;
          return (
            <div key={side} className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
              <div className="flex justify-between items-baseline">
                <strong className="font-display text-[22px] font-medium">{names[side]}</strong>
                <span className="text-[12px] text-[#5b6a52]">{list.length ? (left ? `${left} to go` : 'All done ✓') : ''}</span>
              </div>
              {list.map((it, i) => (
                <div key={i} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={it.done}
                    onChange={() => set(list.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                    aria-label={it.text}
                    className="mt-[3px] w-[18px] h-[18px] accent-[#5d6b47] flex-none"
                  />
                  <span className={`flex-1 text-[15px] ${it.done ? 'line-through text-[#7a7466]' : ''}`}>
                    {it.time && <span className="text-[13px] text-[#5b6a52] mr-1">{it.time}</span>}
                    {it.text}
                  </span>
                  <button type="button" aria-label={`Remove ${it.text}`} onClick={() => set(list.filter((_, j) => j !== i))} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[16px]">
                    ×
                  </button>
                </div>
              ))}
              <form
                className="flex gap-2 mt-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = adding[side].trim();
                  if (!text) return;
                  set([...list, { text, time: '', done: false }]);
                  setAdding({ ...adding, [side]: '' });
                }}
              >
                <input aria-label={`Add to ${names[side]}'s list`} placeholder="Add a thing to do" value={adding[side]} onChange={(e) => setAdding({ ...adding, [side]: e.target.value })} className={`${inputCls} flex-1 min-w-0 !py-2`} />
                <Pill type="submit" kind="outline">
                  Add
                </Pill>
              </form>
            </div>
          );
        })}
      </div>
    </section>
  );
}
