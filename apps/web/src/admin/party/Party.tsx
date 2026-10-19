import { PACK_TEMPLATE, PARTY_TEMPLATE, type PackItem, type PartyItem, type PartyRunsheet, type PartySetup } from '@wp/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, plannerApi, type Guest, type PartyData, type PartyMember } from '../../lib/api';
import { confirmLeave, useUnsavedChanges } from '../leave';
import { useAdmin, useSectionName } from '../Shell';
import { Eyebrow, H2, inputCls, Pill, useToast } from '../ui';
import { CoupleChecklists } from './CoupleChecklists';
import { PartyOverview } from './PartyOverview';
import { SidePage } from './SidePage';
import { Speeches } from './Speeches';

/**
 * Wedding → Wedding party, in five views (the menu shows them under Wedding party):
 * - Overview: both sides at a glance, helpers, the run sheet and your checklists.
 * - Each side (the bride's, the groom's): its people, what they wear, the hens or bucks, its to-dos.
 * - Run sheet: the party's own day, more detailed than the guests', each line for everyone, a side or a role.
 * - Your checklists: each partner's own list from a month out to after the day, and the shared one.
 * Each member opens their part from their own link: /w/<slug>/party?g=…
 */

export type PartyView = 'overview' | 'p1' | 'p2' | 'runsheet' | 'couple';
export const PARTY_VIEWS: PartyView[] = ['overview', 'p1', 'p2', 'runsheet', 'couple'];
/** The menu's name for each view ("Bride's side" uses what the sides are called). */
export const partyViewLabel = (v: PartyView, sides: { p1: string; p2: string }) =>
  v === 'overview' ? 'Overview' : v === 'p1' ? `${sides.p1 || 'Bride'}’s side` : v === 'p2' ? `${sides.p2 || 'Groom'}’s side` : v === 'runsheet' ? 'Run sheet' : 'Your checklists';
export type SideName = (s: 'p1' | 'p2') => string;

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

const INTRO: Record<PartyView, string> = {
  overview: 'Both sides at a glance: who’s in it, what’s done, what’s next.',
  p1: 'Their people, what they wear, the celebration before the day, and their to-dos.',
  p2: 'Their people, what they wear, the celebration before the day, and their to-dos.',
  runsheet: 'The party’s own day, in more detail than the guests’. Each member sees just their lines on their own link.',
  couple: 'Each of yours from a month out to after the day, and the things you do together. Tick them off on your phone.',
};

export function Party() {
  const { wid, event, path } = useAdmin();
  const section = useSectionName();
  const [params, setParams] = useSearchParams();
  const asked = params.get('view') as PartyView | null;
  const view: PartyView = asked && PARTY_VIEWS.includes(asked) ? asked : 'overview';
  const [d, setD] = useState<PartyData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setD(await plannerApi.party(wid, event));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid, event]);
  useEffect(() => void load(), [load]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!d) return <div aria-busy="true" className="text-[#5b6a52]">Loading the wedding party…</div>;
  const sides: PartySetup = d.setup?.data ?? { p1: 'Bride', p2: 'Groom', showOnInvite: false, access: {}, signIn: false };
  const sideName: SideName = (k) => sides[k] || (k === 'p1' ? 'Bride' : 'Groom');
  const go = (v: PartyView) => {
    if (v === view || !confirmLeave()) return;
    const n = new URLSearchParams(params);
    if (v === 'overview') n.delete('view');
    else n.set('view', v);
    setParams(n);
    window.scrollTo?.({ top: 0 });
  };
  const title = view === 'overview' ? 'Wedding party' : partyViewLabel(view, sides);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Eyebrow>{section} · Wedding party</Eyebrow>
        <h1 className="m-0 mt-[6px] font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">{title}</h1>
        <p className="m-0 mt-1 text-[15px] text-[#5b6a52]">
          {view === 'p1' || view === 'p2' ? `${d.names[view]}’s side. ` : ''}
          {INTRO[view]}
        </p>
        <Link to={path('pages?page=party')} className="inline-block mt-2 text-[14px] font-medium !text-[#33402f]">
          Sign-ins and permissions for the wedding party →
        </Link>
      </header>
      <PartyBar view={view} go={go} sides={sides} />
      {view === 'overview' && <PartyOverview d={d} setD={setD} sideName={sideName} go={go} />}
      {(view === 'p1' || view === 'p2') && <SidePage key={view} side={view} d={d} setD={setD} sideName={sideName} go={go} />}
      {view === 'runsheet' && <RunSheet key={d.runsheet?.version ?? 0} d={d} setD={setD} reload={load} sideName={sideName} />}
      {view === 'couple' && <CoupleChecklists d={d} sideName={sideName} />}
    </div>
  );
}

/** The five views as a switcher at the top (on a phone it scrolls sideways). */
function PartyBar({ view, go, sides }: { view: PartyView; go: (v: PartyView) => void; sides: { p1: string; p2: string } }) {
  return (
    <nav aria-label="Wedding party" className="flex gap-1 overflow-x-auto [scrollbar-width:none] p-1 rounded-full bg-[#efe7d3] self-start max-w-full">
      {PARTY_VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          aria-current={v === view ? 'page' : undefined}
          onClick={() => go(v)}
          className={`flex-none whitespace-nowrap py-[7px] px-4 rounded-full border-0 text-[14px] cursor-pointer ${v === view ? 'bg-[#33402f] text-[#f3ecd6] font-medium' : 'bg-transparent text-[#33402f] hover:bg-[#e2d7bc]'}`}
        >
          {partyViewLabel(v, sides)}
        </button>
      ))}
    </nav>
  );
}

/** The party's run sheet and packing lists: edited here, saved together. */
function RunSheet({ d, setD, reload, sideName }: { d: PartyData; setD: (d: PartyData) => void; reload: () => Promise<void>; sideName: SideName }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [sheet, setSheet] = useState<PartyRunsheet>(d.runsheet?.data ?? { items: [], note: '', packing: [] });
  const [dirty, setDirty] = useState(false);
  useUnsavedChanges(dirty);
  const [saving, setSaving] = useState(false);

  const edit = (next: PartyRunsheet) => {
    setSheet(next);
    setDirty(true);
  };
  const setItem = (i: number, patch: Partial<PartyItem>) => edit({ ...sheet, items: sheet.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const save = async () => {
    if (!d.event) return;
    setSaving(true);
    try {
      const clean = { ...sheet, items: sheet.items.filter((x) => x.title.trim()), packing: sheet.packing.filter((x) => x.text.trim()) };
      const r = await plannerApi.saveDoc(wid, 'party-runsheet', d.event, clean, d.runsheet?.version ?? 0);
      setD({ ...d, runsheet: r });
      setSheet(r.data);
      setDirty(false);
      toast('Run sheet saved: the wedding party sees it now');
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded. Make your change again.' : (e as Error).message);
      if (e instanceof ApiError && e.status === 409) await reload();
    } finally {
      setSaving(false);
    }
  };
  // Who an item can be for: everyone, a side, or any role in use (or usual for the day).
  const audiences: [string, string][] = [
    ['party', 'Everyone'],
    ['p1', `${sideName('p1')}'s side`],
    ['p2', `${sideName('p2')}'s side`],
    ...[...new Set([...d.members.map((m) => m.role), 'Best man', 'Maid of honour', 'MC'])].sort().map((r) => [r, r] as [string, string]),
  ];
  /** Toggle who something is for ("Everyone" on its own, or any mix of sides and roles). */
  const toggleWho = (list: string[], k: string) => {
    const on = list.includes(k);
    if (k === 'party') return ['party'];
    const next = on ? list.filter((w) => w !== k) : [...list.filter((w) => w !== 'party'), k];
    return next.length ? next : ['party'];
  };
  const whoChips = (list: string[], onPick: (next: string[]) => void, label: string) => (
    <div role="group" aria-label={label} className="flex gap-[6px] flex-wrap">
      {audiences.map(([k, text]) => (
        <button key={k} type="button" aria-pressed={list.includes(k)} onClick={() => onPick(toggleWho(list, k))} className={chip(list.includes(k))}>
          {text}
        </button>
      ))}
    </div>
  );
  const setPack = (i: number, patch: Partial<PackItem>) => edit({ ...sheet, packing: sheet.packing.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <div className="flex flex-col gap-6">
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
              {whoChips(it.who, (next) => setItem(i, { who: next }), "Who it's for")}
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

      <section aria-label="What to pack" className="flex flex-col gap-3">
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <div>
            <H2>What to pack</H2>
            <div className="text-[13px] text-[#5b6a52]">Each person sees their own list (everyone's things, their side's and their role's) and ticks it off on their phone.</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!sheet.packing.length && (
              <Pill kind="dashed" onClick={() => edit({ ...sheet, packing: PACK_TEMPLATE.map((x) => ({ ...x, who: [...x.who] })) })}>
                Start with the usual list
              </Pill>
            )}
            <Pill kind="primary" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
            </Pill>
          </div>
        </div>
        {sheet.packing.map((p, i) => (
          <div key={i} className="flex flex-col gap-2 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <div className="flex gap-2">
              <input aria-label="Thing to bring" value={p.text} placeholder="e.g. Phone charger" onChange={(e) => setPack(i, { text: e.target.value })} className={`${inputCls} flex-1 min-w-0`} />
              <button type="button" aria-label="Remove" onClick={() => edit({ ...sheet, packing: sheet.packing.filter((_, j) => j !== i) })} className="w-9 h-9 flex-none rounded-full border border-[#c6b794] bg-transparent cursor-pointer text-[#7a4a37]">
                ×
              </button>
            </div>
            {whoChips(p.who, (next) => setPack(i, { who: next }), 'Who brings it')}
          </div>
        ))}
        <Pill kind="dashed" className="self-start" onClick={() => edit({ ...sheet, packing: [...sheet.packing, { text: '', who: ['party'] }] })}>
          + Add a thing to bring
        </Pill>
      </section>

      {d.event && <Speeches event={d.event} names={[...d.members.map((m) => m.name), ...d.members.map((m) => m.role)].filter((x, i, a) => a.indexOf(x) === i)} />}
    </div>
  );
}

/** Who's in the wedding party: the two sides side by side, each with its own roles and "add", then helpers. */
export function Members({ d, onChange, sideName, only }: { d: PartyData; onChange: (m: PartyMember[]) => void; sideName: SideName; only?: 'p1' | 'p2' | '' }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [guests, setGuests] = useState<Guest[] | null>(null);
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
  const people = useMemo(() => (guests ?? []).flatMap((g) => g.people.map((p) => ({ id: p.id, name: p.name }))), [guests]);
  const all: { key: 'p1' | 'p2' | ''; title: string; sub: string }[] = [
    { key: 'p1', title: `${sideName('p1')}'s side`, sub: d.names.p1 },
    { key: 'p2', title: `${sideName('p2')}'s side`, sub: d.names.p2 },
    { key: '', title: 'Also helping', sub: 'MC, ushers, readers' },
  ];
  const columns = all.filter((c) => only === undefined || c.key === only);
  return (
    <section aria-label="Who's in the wedding party" className="flex flex-col gap-3">
      <H2>{only === '' ? 'Also helping' : "Who's in it"}</H2>
      <div className={`grid gap-4 ${only === undefined ? 'lg:grid-cols-3' : ''}`}>
        {columns.map((col) => {
          const ms = d.members.filter((m) => m.side === col.key);
          const roles = d.roles.filter((r) => r.side === col.key).map((r) => r.role);
          return (
            <div key={col.key || 'help'} className={`flex flex-col gap-2 p-4 rounded-[16px] border ${col.key ? 'border-[#c6b794] bg-[#fbf8f0]' : 'border-[#e2d7bc] bg-[#f6f0e2]'}`}>
              <div>
                <div className="font-display text-[24px] leading-tight">{col.title}</div>
                <div className="text-[12px] tracking-[.12em] uppercase text-[#5b6a52]">
                  {col.sub} · {ms.length} {ms.length === 1 ? 'person' : 'people'}
                </div>
              </div>
              {ms.map((m) => (
                <div key={m.personId} className="flex flex-col gap-1 p-2 rounded-[10px] bg-white border border-[#e2d7bc]">
                  <span className="font-medium truncate">{m.name}</span>
                  <select
                    aria-label={`${m.name}'s role`}
                    value={roles.includes(m.role) ? m.role : '__other'}
                    onChange={(e) => e.target.value !== '__other' && void set(m.personId, e.target.value, 'Role changed')}
                    className={`${inputCls} !py-[6px] !text-[14px]`}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    {!roles.includes(m.role) && <option value="__other">{m.role}</option>}
                    {d.roles
                      .filter((r) => r.side !== col.key)
                      .map((r) => (
                        <option key={`move-${r.role}`} value={r.role}>
                          Move: {r.role}
                        </option>
                      ))}
                  </select>
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
              <AddToSide
                roles={roles.length ? roles : ['MC']}
                people={people.filter((p) => !inParty.has(p.id))}
                loading={!guests}
                label={col.key ? `Add to the ${sideName(col.key).toLowerCase()}'s side` : 'Add a helper'}
                onAdd={(p, role) => void set(p.id, role, `${p.name} is now ${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role.toLowerCase()}`)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** What the two sides are called (Bride and Groom unless you change them). */
export function SideNames({ d, onSaved }: { d: PartyData; onSaved: (s: { data: PartySetup; version: number }) => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const cur = d.setup?.data ?? { p1: 'Bride', p2: 'Groom', showOnInvite: false, access: {}, signIn: false };
  const save = async (next: PartySetup) => {
    if (next.p1 === cur.p1 && next.p2 === cur.p2 && next.showOnInvite === cur.showOnInvite) return;
    try {
      onSaved(await plannerApi.saveDoc(wid, 'party-setup', '', next, d.setup?.version ?? 0));
      toast('Saved');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <div className="flex items-center gap-2 flex-wrap text-[13px] text-[#5b6a52]">
      The two sides are called
      <input aria-label={`${d.names.p1}'s side is called`} defaultValue={cur.p1} maxLength={30} onBlur={(e) => void save({ ...cur, p1: e.target.value.trim() || 'Bride' })} className={`${inputCls} !py-[5px] w-[110px]`} />
      <span>({d.names.p1}) and</span>
      <input aria-label={`${d.names.p2}'s side is called`} defaultValue={cur.p2} maxLength={30} onBlur={(e) => void save({ ...cur, p2: e.target.value.trim() || 'Groom' })} className={`${inputCls} !py-[5px] w-[110px]`} />
      <span>({d.names.p2})</span>
      <label className="flex items-center gap-2 basis-full mt-1 cursor-pointer">
        <input type="checkbox" checked={!!cur.showOnInvite} onChange={(e) => void save({ ...cur, showOnInvite: e.target.checked })} />
        Show “Who’s who” on the invitation (names and roles, under the wedding’s details)
      </label>
    </div>
  );
}

function AddToSide({ roles, people, loading, label, onAdd }: { roles: string[]; people: { id: string; name: string }[]; loading: boolean; label: string; onAdd: (p: { id: string; name: string }, role: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [role, setRole] = useState(roles[0] ?? '');
  const needle = q.trim().toLowerCase();
  const found = needle ? people.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 6) : [];
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start mt-1 py-[6px] px-3 rounded-full border border-dashed border-[#8a9670] bg-transparent text-[13px] cursor-pointer hover:bg-[#efe7d3]">
        + {label}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 mt-1">
      <div className="flex gap-2">
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className={`${inputCls} !py-[6px] !text-[14px]`}>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="w-9 h-9 flex-none rounded-full border border-[#c6b794] bg-transparent cursor-pointer">
          ×
        </button>
      </div>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={loading ? 'Loading your guests…' : 'Type a guest’s name'} aria-label="Guest's name" className={`${inputCls} !py-[7px]`} />
      {found.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => {
            onAdd(p, role);
            setQ('');
          }}
          className="text-left py-[6px] px-3 rounded-[8px] border border-[#e2d7bc] bg-white text-[14px] cursor-pointer hover:bg-[#efe7d3]"
        >
          + {p.name}
        </button>
      ))}
      {needle && !loading && !found.length && <span className="text-[12px] text-[#7a7466]">No guest by that name. Add them to your guest list first.</span>}
    </div>
  );
}
