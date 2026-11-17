import { PARTY_ROLES } from '@wp/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, plannerApi, type PartyData, type PartyMember } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, inputCls, useToast } from '../ui';

/**
 * Wedding party → Overview, at the top: the one place to set up who's in it.
 * One row per role (grouped by side), the people in it as chips, and a type-ahead "+ Add" box
 * over the guest list (someone new is added to the guest list too).
 */

type SideKey = 'p1' | 'p2' | '';
/** The roles that usually have one person: once filled, the add box hides behind "Change". */
const SINGLE = new Set(['maid of honour', 'best man', 'mc', 'celebrant']);
/** What the many-people roles are called as a row heading (the stored role stays singular). */
const PLURAL: Record<string, string> = {
  Bridesmaid: 'Bridesmaids',
  'Flower girl': 'Flower girls',
  'Parent of the bride': 'Parents of the bride',
  'Grandparent of the bride': 'Grandparents of the bride',
  'Parent of a bridesmaid': 'Parents of bridesmaids',
  Groomsman: 'Groomsmen',
  'Page boy': 'Page boys',
  'Ring bearer': 'Ring bearers',
  'Parent of the groom': 'Parents of the groom',
  'Grandparent of the groom': 'Grandparents of the groom',
  'Parent of a groomsman': 'Parents of groomsmen',
  Usher: 'Ushers',
  Reader: 'Readers',
};
const lc = (s: string) => s.trim().toLowerCase();
const article = (role: string) => (role === 'MC' || /^[aeiou]/i.test(role) ? 'an' : 'a');
const roleWord = (role: string) => (role === 'MC' ? 'MC' : role.toLowerCase());

/** A change waiting on the server: shown straight away, dropped when it saves (or fails). */
interface Pending {
  key: number;
  personId: string;
  name: string;
  role: string;
  side: SideKey;
}

export function PartyBuilder({ d, setD }: { d: PartyData; setD: (d: PartyData) => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [guests, setGuests] = useState<{ id: string; name: string }[] | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const seq = useRef(0);
  // The latest party data, so a save that finishes after another one builds on what is there now.
  const latest = useRef(d);
  latest.current = d;

  const loadGuests = useCallback(
    () =>
      api
        .guests(wid)
        .then((r) => setGuests(r.guests.flatMap((g) => g.people.map((p) => ({ id: p.id, name: p.name })))))
        .catch(() => setGuests([])),
    [wid],
  );
  useEffect(() => void loadGuests(), [loadGuests]);

  const members: PartyMember[] = useMemo(() => {
    const touched = new Set(pending.map((p) => p.personId));
    const shown = pending.filter((p) => p.role).map((p) => ({ personId: p.personId, invitationId: '', name: p.name, role: p.role, side: p.side, token: null }) as PartyMember);
    return [...d.members.filter((m) => !touched.has(m.personId)), ...shown];
  }, [d.members, pending]);

  const sideName = (k: 'p1' | 'p2') => d.setup?.data[k] || (k === 'p1' ? 'Bride' : 'Groom');
  const known = new Set(PARTY_ROLES.map((r) => lc(r.role)));
  const custom = [...new Map(members.filter((m) => m.role && !known.has(lc(m.role))).map((m) => [lc(m.role), { role: m.role, side: m.side as SideKey }])).values()];
  const groups: { key: SideKey; title: string; sub: string }[] = [
    { key: 'p1', title: `${sideName('p1')}’s side`, sub: d.names.p1 },
    { key: 'p2', title: `${sideName('p2')}’s side`, sub: d.names.p2 },
    { key: '', title: 'Also helping', sub: '' },
  ];
  const inParty = new Set(members.map((m) => m.personId));
  const free = (guests ?? []).filter((p) => !inParty.has(p.id));

  const keep = (fresh: PartyMember[]) => {
    const cur = latest.current;
    setD({ ...cur, members: fresh.map((m) => ({ ...m, token: cur.members.find((x) => x.personId === m.personId)?.token ?? null })) });
  };
  /** Runs one change: shows it now, saves it, and puts things back if it fails. */
  const run = async (p: Omit<Pending, 'key'>, save: () => Promise<PartyMember[]>, done: string) => {
    const key = ++seq.current;
    setPending((x) => [...x, { ...p, key }]);
    try {
      keep(await save());
      toast(done);
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    } finally {
      setPending((x) => x.filter((y) => y.key !== key));
    }
  };

  const remove = (m: PartyMember) => void run({ personId: m.personId, name: m.name, role: '', side: '' }, async () => (await plannerApi.setRole(wid, m.personId, '')).members, `${m.name.split(' ')[0]} is no longer ${article(m.role)} ${roleWord(m.role)}`);
  const pick = async (person: { id: string; name: string }, role: string, side: SideKey, replacing: PartyMember[]) => {
    const ok = await run({ personId: person.id, name: person.name, role, side }, async () => (await plannerApi.setRole(wid, person.id, role)).members, `${person.name.split(' ')[0]} is now ${article(role)} ${roleWord(role)}`);
    // "Change" on a one-person role: the person who had it steps down (they stay on the guest list).
    if (ok) for (const old of replacing) remove(old);
  };
  const addNew = async (name: string, role: string, side: SideKey, replacing: PartyMember[]) => {
    const ok = await run({ personId: `new-${seq.current + 1}`, name, role, side }, async () => (await plannerApi.addMember(wid, name, '', role)).members, `${name.split(' ')[0]} is now ${article(role)} ${roleWord(role)}, and on your guest list`);
    if (ok) {
      void loadGuests();
      for (const old of replacing) remove(old);
    }
  };

  return (
    <section aria-label="Your wedding party" className="flex flex-col gap-3 p-5 max-[640px]:p-4 rounded-[18px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)] text-[var(--adm-ink,#33402f)]">
      <div>
        <H2>Your wedding party</H2>
        <div className="text-[13px] text-[var(--adm-muted,#5b6a52)]">Add people to each role by typing their name. They come from your guest list; someone new is added to it too.</div>
      </div>
      {groups.map((g) => {
        const roles = [...PARTY_ROLES.filter((r) => r.side === g.key).map((r) => r.role), ...custom.filter((c) => (c.side || '') === g.key).map((c) => c.role)];
        return (
          <div key={g.key || 'help'} className="flex flex-col">
            <h3 className="m-0 mt-2 mb-1 text-[12px] tracking-[.12em] uppercase font-semibold text-[var(--adm-muted,#5b6a52)]">
              {g.title}
              {g.sub ? <span className="font-normal normal-case tracking-normal"> · {g.sub}</span> : null}
            </h3>
            {roles.map((role) => (
              <RoleRow
                key={role}
                role={role}
                people={members.filter((m) => lc(m.role) === lc(role))}
                guests={free}
                loading={!guests}
                onRemove={remove}
                onPick={(p, replacing) => void pick(p, role, g.key, replacing)}
                onNew={(name, replacing) => void addNew(name, role, g.key, replacing)}
              />
            ))}
          </div>
        );
      })}
    </section>
  );
}

function RoleRow({
  role,
  people,
  guests,
  loading,
  onRemove,
  onPick,
  onNew,
}: {
  role: string;
  people: PartyMember[];
  guests: { id: string; name: string }[];
  loading: boolean;
  onRemove: (m: PartyMember) => void;
  onPick: (p: { id: string; name: string }, replacing: PartyMember[]) => void;
  onNew: (name: string, replacing: PartyMember[]) => void;
}) {
  const label = PLURAL[role] ?? role;
  const single = SINGLE.has(lc(role));
  const [changing, setChanging] = useState(false);
  const [q, setQ] = useState('');
  const needle = lc(q);
  const found = needle ? guests.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 6) : [];
  const exact = found.some((p) => lc(p.name) === needle);
  const showBox = !single || !people.length || changing;
  const replacing = single && changing ? people : [];
  const done = () => {
    setQ('');
    setChanging(false);
  };
  const choose = (p: { id: string; name: string }) => {
    onPick(p, replacing);
    done();
  };
  const addNew = () => {
    const name = q.trim();
    if (!name) return;
    onNew(name, replacing);
    done();
  };

  return (
    <div role="group" aria-label={label} className="grid grid-cols-[180px_minmax(0,1fr)] max-[640px]:grid-cols-1 gap-x-4 gap-y-2 py-3 border-t border-[var(--adm-line,#e2d7bc)]">
      <div className="text-[15px] font-medium pt-[9px] max-[640px]:pt-0">{label}</div>
      <div className="flex flex-col gap-2 min-w-0">
        {people.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            {people.map((m) => (
              <span key={m.personId} className="inline-flex items-center max-w-full min-h-[40px] pl-3 rounded-full bg-white border border-[var(--adm-line,#e2d7bc)] text-[14px]">
                <span className="truncate">{m.name}</span>
                <button type="button" aria-label={`Remove ${m.name} as ${role}`} onClick={() => onRemove(m)} className="flex-none w-10 h-10 rounded-full border-0 bg-transparent cursor-pointer text-[18px] text-[var(--adm-muted,#5b6a52)] hover:text-[#7a4a37]">
                  ×
                </button>
              </span>
            ))}
            {single && people.length > 0 && !changing && (
              <button type="button" onClick={() => setChanging(true)} className="min-h-[40px] px-2 border-0 bg-transparent underline cursor-pointer text-[13px] text-[var(--adm-ink,#33402f)]">
                Change
              </button>
            )}
          </div>
        )}
        {showBox && (
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex gap-2 items-center">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (found[0]) choose(found[0]);
                    else if (!loading) addNew();
                  } else if (e.key === 'Escape') done();
                }}
                autoFocus={changing}
                maxLength={80}
                aria-label={`Add ${article(role)} ${role}`}
                placeholder={loading ? 'Loading your guests…' : '+ Add'}
                className={`${inputCls} min-h-[40px] w-full sm:max-w-[280px] min-w-0`}
              />
              {changing && (
                <button type="button" onClick={done} className="min-h-[40px] px-2 border-0 bg-transparent underline cursor-pointer text-[13px] text-[var(--adm-muted,#5b6a52)]">
                  Cancel
                </button>
              )}
            </div>
            {needle && (
              <ul className="m-0 p-0 list-none flex flex-col gap-1 w-full sm:max-w-[280px]">
                {found.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => choose(p)} className="w-full min-h-[40px] text-left py-2 px-3 rounded-[10px] border border-[var(--adm-line,#e2d7bc)] bg-white text-[14px] cursor-pointer text-[var(--adm-ink,#33402f)] hover:bg-[var(--adm-tint,#efe7d3)] truncate">
                      {p.name}
                    </button>
                  </li>
                ))}
                {!exact && !loading && (
                  <li>
                    <button type="button" onClick={addNew} className="w-full min-h-[40px] text-left py-2 px-3 rounded-[10px] border border-dashed border-[var(--adm-line,#c6b794)] bg-transparent text-[14px] cursor-pointer text-[var(--adm-ink,#33402f)] hover:bg-[var(--adm-tint,#efe7d3)] break-words">
                      Add {q.trim()} as a new guest
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
