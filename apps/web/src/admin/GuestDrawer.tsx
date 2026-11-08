import { DELIVERY, DELIVERY_LABEL, joinDiet, PARTY_ROLES, printed, TEXT_CREDIT_ALL_IN, toE164, type Delivery } from '@wp/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, partyAccountsApi, plannerApi, type GuestDetail, type GuestPatch, type RsvpPut } from '../lib/api';
import { fmtWeekday, fmtWhen, shortLabel } from '../lib/format';
import { groupSuggestions } from './groups';
import { picker as contactPicker } from './ImportContacts';
import { CirclesInput, RelationSelect, SideSelect } from './GuestTies';
import { canShareNative, fallbackMessage, sendMessenger, sendWhatsApp, shareNative } from './share';
import { useAdmin } from './Shell';
import { Drawer, Eyebrow, inputCls, Label, Pill, useToast } from './ui';

const SEG: [boolean | null, string, string, string][] = [
  [true, 'Attending', '#5d6b47', '#fbf8f2'],
  [false, 'Declined', '#8a5a45', '#fbf8f2'],
  [null, 'Awaiting', '#e6dcc4', '#33402f'],
];
const VIA: Record<string, string> = { invitation: 'Invitation', sms: 'Text reply', admin: 'Entered by you' };

/**
 * design/RSVP Admin.dc.html → guest drawer. Text fields save when you leave them; buttons save straight away.
 * `isNew`: just made by "Add guest", so closing it with nothing filled in removes it again.
 */
export function GuestDrawer({ wid, id, tz, isNew = false, onClose, onChanged, circleOptions = [] }: { wid: string; id: string; tz: string; isNew?: boolean; onClose: () => void; onChanged: () => Promise<void>; circleOptions?: string[] }) {
  const toast = useToast();
  const { overview, event: chosen } = useAdmin();
  const [d, setD] = useState<GuestDetail | null>(null);
  const [error, setError] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const [phone, setPhone] = useState('');
  const [phone2, setPhone2] = useState('');
  // "Add their number from my contacts" on a phone without a contact picker: how to use AutoFill Contact.
  const [tip, setTip] = useState(false);
  // Wedding party: each member's email (their own page's sign-in), typed here before choosing their role.
  const [partyEmail, setPartyEmail] = useState<Record<string, string>>({});
  // The wedding party section stays open or closed as you left it (it used to snap shut as you typed).
  const [partyOpen, setPartyOpen] = useState<boolean | null>(null);
  const [roleBusy, setRoleBusy] = useState(''); // whose role is saving (their menu waits, no double changes)
  const phoneBox = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [table, setTable] = useState('');
  const [diet, setDiet] = useState('');
  const [message, setMessage] = useState('');
  // The guest's own words (dietary needs, their message) are locked: "Manual override" unlocks them (remembered here).
  const [override, setOverride] = useState(() => {
    try {
      return localStorage.getItem('wp.admin.override') === '1';
    } catch {
      return false;
    }
  });
  const toggleOverride = (on: boolean) => {
    setOverride(on);
    try {
      localStorage.setItem('wp.admin.override', on ? '1' : '0');
    } catch {
      /* this visit only */
    }
  };
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  // Saves run one after another, each with the version the previous one returned (never a stale one).
  const latest = useRef<GuestDetail | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  // What the boxes last showed from the server: a box still being typed in (its text differs from that) keeps
  // what's typed when another change saves, instead of jumping back (the "glitchy" boxes).
  const shown = useRef<Record<string, string> | null>(null);
  const fill = useCallback((x: GuestDetail) => {
    latest.current = x;
    setD(x);
    const next = {
      names: JSON.stringify(x.guest.people.map((p) => p.name)),
      phone: x.guest.phoneDisplay,
      phone2: x.guest.phone2Display ?? '',
      email: x.guest.email ?? '',
      table: x.guest.people.find((p) => p.table)?.table ?? '',
      diet: joinDiet(x.guest.people),
      message: Object.values(x.guest.rsvp).map((r) => r.message).find((m) => m.trim()) ?? '',
    };
    const was = shown.current;
    shown.current = next;
    const keep = (k: keyof typeof next) => (cur: string) => (!was || cur === was[k] ? next[k] : cur);
    setNames((cur) => JSON.parse(keep('names')(JSON.stringify(cur))) as string[]);
    setPhone(keep('phone'));
    setPhone2(keep('phone2'));
    setEmail(keep('email'));
    setTable(keep('table'));
    setDiet(keep('diet'));
    setMessage(keep('message'));
    setPick((p) => p || x.campaigns[0]?.id || '');
  }, []);
  // The guest list behind refreshes once things settle, not after every single change (that made each
  // choice wait for the whole list to reload).
  const later = useRef<number | undefined>(undefined);
  const changedSoon = () => {
    window.clearTimeout(later.current);
    later.current = window.setTimeout(() => {
      later.current = undefined;
      void onChanged();
    }, 400);
  };
  useEffect(
    () => () => {
      if (later.current !== undefined) {
        window.clearTimeout(later.current);
        void onChanged();
      }
    },
    [], // once, when the drawer closes
  );

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

  /** Queue a save; on success refresh from the server's answer, on a clash reload. */
  function save(run: (g: GuestDetail['guest']) => Promise<GuestDetail>) {
    const next = queue.current.then(() => saveNow(run));
    queue.current = next;
    return next;
  }
  async function saveNow(run: (g: GuestDetail['guest']) => Promise<GuestDetail>) {
    if (!latest.current) return;
    try {
      fill(await run(latest.current.guest));
      toast('Saved');
      changedSoon();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast('Updated elsewhere, reloaded.');
        await load();
        changedSoon();
      } else {
        toast((e as Error).message);
        await load(); // put the fields back to what's saved
      }
    }
  }
  const patch = (p: GuestPatch) => save((g) => api.patchGuest(wid, g, p));
  const rsvp = (r: RsvpPut) => save((g) => api.putRsvp(wid, g, r));

  /** Close once pending saves are sent; a new guest left blank (no name, no mobile) is removed, not kept empty. */
  const close = () => {
    onClose();
    if (!isNew) return;
    void queue.current.then(async () => {
      const g = latest.current?.guest;
      if (!g || g.phone || g.people.some((p) => p.name.trim())) return;
      try {
        await api.removeGuest(wid, g.id);
        await onChanged();
      } catch {
        /* it stays in the list, and can be removed there */
      }
    });
  };

  if (error) {
    return (
      <Drawer onClose={close} label="Guest">
        <p role="alert" className="text-[#8a5a45]">{error}</p>
      </Drawer>
    );
  }
  if (!d) return <Drawer onClose={close} label="Guest"><div aria-busy="true" /></Drawer>;

  const g = d.guest;
  const events = d.events;
  const hasAddress = !!g.address && Object.values(g.address).some((v) => typeof v === 'string' && v.trim());
  /**
   * A guest already on the list: their mobile from the phone's contacts. Android (Chrome) opens the phone's
   * own contact picker; iPhone never lets a website open Contacts, so the mobile box is focused and iPhone's
   * AutoFill Contact (above the keyboard) fills it from the contact you choose.
   */
  const numberFromContacts = async () => {
    const pk = contactPicker();
    if (!pk) {
      phoneBox.current?.focus();
      setTip(true);
      return;
    }
    try {
      const can = (await pk.getProperties?.()) ?? ['tel', 'email'];
      const [c] = await pk.select(['tel', 'email'].filter((x) => can.includes(x)), { multiple: false });
      if (!c) return;
      const tel = c.tel?.find((t) => toE164(t)) ?? c.tel?.[0];
      if (!tel) return toast('That contact has no mobile.');
      const mail = !g.email ? (c.email?.[0] ?? '').trim().toLowerCase() : '';
      setPhone(tel);
      if (mail) setEmail(mail);
      await patch({ phone: tel, ...(mail ? { email: mail } : {}) });
    } catch (e) {
      toast((e as Error).message || 'Your contacts couldn’t be opened.');
    }
  };
  const invitedEvents = events.filter((e) => g.invited.includes(e.key));
  const count = Math.max(1, ...Object.values(g.rsvp).map((r) => r.count));
  const lastVia = Object.values(g.rsvp).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.via ?? '';
  const peopleNames = names.filter((n) => n.trim());
  const dayOf = (iso: string) => fmtWeekday(iso, tz);
  /** Mark someone a child (or an adult again); everyone is an adult unless ticked. */
  const setChild = (idx: number, child: boolean) => void patch({ children: g.people.map((p, j) => (j === idx ? child : !!p.child)) });
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
      if (!window.confirm(`Send "${name}" to ${g.people[0]?.name ?? 'this guest'}? ${est.parts} text ${est.parts === 1 ? 'part' : 'parts'}, about $${cost}.${when}`)) return;
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
    // No "are you sure?": Undo on the note that follows brings them straight back.
    if (!d) return;
    try {
      await api.removeGuest(wid, g.id);
      onClose();
      await onChanged();
      toast(`${g.people[0]?.name || 'Guest'} removed`, {
        label: 'Undo',
        run: () => void api.restoreGuest(wid, g.id).then(onChanged, (e: Error) => toast(e.message)),
      });
    } catch (e) {
      toast((e as Error).message);
    }
  }

  /** Their invitation text (as the SMS would read, without the STOP line), or a friendly default. */
  const inviteText = async () => {
    const inv = d.campaigns.find((x) => /invit/i.test(x.name));
    if (inv && g.phone) {
      try {
        const e = await api.estimateOne(wid, g.id, inv.id);
        if (e.sample) return e.sample.replace(/\s*Reply STOP.*$/i, '').trim();
      } catch {
        /* fall back below */
      }
    }
    const w = overview?.wedding;
    const couple = w ? `${w.name1.split(' ')[0]} & ${w.name2.split(' ')[0]}` : 'We';
    return fallbackMessage(g.people[0]?.name.split(' ')[0] ?? 'there', couple, d.link);
  };
  const whatsapp = async () => sendWhatsApp(g.phone, await inviteText());
  const messenger = async () => {
    if ((await sendMessenger(d.link, await inviteText())) === 'copied') toast('Message copied: paste it into Messenger');
  };
  const share = async () => void (await shareNative(await inviteText(), d.link));
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
    <Drawer onClose={close} label={`Guest: ${g.people[0]?.name || 'New guest'}`}>
      {/* The name and Close stay in view while you scroll the guest's details. */}
      <div className="sticky top-0 z-[2] -mx-[18px] sm:-mx-[26px] -mt-3 px-[18px] sm:px-[26px] pt-3 pb-3 bg-[var(--adm-card,#f6f0e2)] border-b border-[var(--adm-line,#e2d7bc)] flex justify-between items-start gap-3">
        <div className="min-w-0">
          <button type="button" onClick={close} className="sm:hidden -ml-1 mb-1 py-1 px-1 min-h-[36px] border-0 bg-transparent text-[14px] text-[var(--adm-ink,#33402f)] cursor-pointer">
            ← Guests
          </button>
          <Eyebrow className="hidden sm:block">Guest</Eyebrow>
          <h2 className="mt-1 mb-0 font-display font-medium text-[clamp(26px,7vw,32px)] leading-[1.1] truncate">{g.people[0]?.name || 'New guest'}</h2>
          <div className="mt-1 text-[13px] text-[var(--adm-muted,#5b6a52)]">{g.repliedAt ? `Replied ${fmtWhen(g.repliedAt, tz)} · ${VIA[lastVia] ?? lastVia}` : 'No reply yet'}</div>
        </div>
        <button onClick={close} aria-label="Close" className="flex-none w-10 h-10 rounded-full border border-[var(--adm-line,#c6b794)] bg-[var(--adm-card,#fbf8f2)] text-[20px] leading-none cursor-pointer">×</button>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex justify-between items-baseline gap-[10px]">
          <Eyebrow>People on this invitation</Eyebrow>
          <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">{peopleNames.length} {peopleNames.length === 1 ? 'person' : 'people'}</span>
        </div>
        <Label text="Main contact · gets the texts">
          <input value={names[0] ?? ''} onChange={(e) => setNames([e.target.value, ...names.slice(1)])} onBlur={() => names[0] !== g.people[0]?.name && savePeople(names)} className={inputCls} />
        </Label>
        {g.people[0] && <ChildTick on={!!g.people[0].child} name={names[0] || 'the main contact'} onChange={(v) => setChild(0, v)} />}
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
            {g.people[i + 1] && <ChildTick compact on={!!g.people[i + 1]!.child} name={n || 'this guest'} onChange={(v) => setChild(i + 1, v)} />}
            <button onClick={() => savePeople(names.filter((_, j) => j !== i + 1))} aria-label="Remove person" className="w-[38px] h-[38px] flex-none rounded-full border border-[var(--adm-line,#c6b794)] bg-transparent text-[16px] cursor-pointer hover:bg-[var(--adm-tint,#efe7d3)]">×</button>
          </div>
        ))}
        <Pill kind="dashed" className="self-start" onClick={() => setNames([...names, ''])}>+ Add person</Pill>
        {/* The wedding party: a role here puts them in it (and Wedding party → add puts new people here). */}
        {g.people.some((p) => p.name.trim()) && (
          <details
            className="rounded-[12px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]"
            open={partyOpen ?? g.people.some((p) => p.role)}
            onToggle={(e) => setPartyOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer py-2 px-3 text-[14px] font-medium">
              Wedding party{g.people.some((p) => p.role) ? `: ${g.people.filter((p) => p.role).map((p) => `${p.name.split(' ')[0]} (${p.role})`).join(', ')}` : ''}
            </summary>
            <div className="flex flex-col gap-3 px-3 pb-3">
              <span className="text-[12px] text-[var(--adm-muted,#5b6a52)]">
                Choose a role to add them to the wedding party page. Their email comes first: they’re sent a Yes List email with your details and a button to join their page.
              </span>
              {g.people
                .filter((p) => p.name.trim())
                .map((p, i) => {
                  const mail = (partyEmail[p.id] ?? (i === 0 ? (g.email ?? '') : '')).trim().toLowerCase();
                  const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
                  return (
                  <div key={p.id} className="flex flex-col gap-1 text-[14px]">
                  <label className="flex items-center justify-between gap-3">
                    <span className="truncate">{p.name}</span>
                    <select
                      aria-label={`${p.name}'s wedding party role`}
                      value={p.role ?? ''}
                      disabled={roleBusy === p.id || (!p.role && !okMail)}
                      title={!p.role && !okMail ? 'Add their email first' : undefined}
                      onChange={async (e) => {
                        const role = e.target.value;
                        setRoleBusy(p.id);
                        try {
                          await plannerApi.setRole(wid, p.id, role);
                          // Joining: straight onto the wedding party page, and the join email goes to them.
                          let sent = '';
                          if (role && !p.role && okMail) {
                            try {
                              const r = await partyAccountsApi.invite(wid, p.id, mail);
                              sent = r.emailed ? ` Their join email has gone to ${mail}.` : ' Email isn’t switched on yet: copy their join link from Wedding party.';
                            } catch (err) {
                              sent = ` ${(err as Error).message}`;
                            }
                          }
                          await load();
                          changedSoon();
                          toast(role ? `${p.name} is in the wedding party.${sent}` : `${p.name} is no longer in the wedding party`);
                        } catch (err) {
                          toast((err as Error).message);
                        }
                        setRoleBusy('');
                      }}
                      className={`${inputCls} !py-[6px] !text-[14px] w-auto`}
                    >
                      <option value="">Not in the wedding party</option>
                      {[...PARTY_ROLES.map((r) => r.role), ...(p.role && !PARTY_ROLES.some((r) => r.role === p.role) ? [p.role] : [])].map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!p.role && (
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      aria-label={`${p.name}'s email, for the wedding party`}
                      placeholder={`${p.name.split(' ')[0]}’s email (needed for the wedding party)`}
                      value={partyEmail[p.id] ?? (i === 0 ? (g.email ?? '') : '')}
                      onChange={(e) => setPartyEmail({ ...partyEmail, [p.id]: e.target.value })}
                      className={`${inputCls} !py-[6px] !text-[14px]`}
                    />
                  )}
                  </div>
                  );
                })}
            </div>
          </details>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <Label text={g.people.length > 1 && g.people[0]?.name.trim() ? `Mobile (${g.people[0]?.name.trim().split(' ')[0] ?? ''})` : "Main contact's mobile"}>
            <input
              ref={phoneBox}
              type="tel"
              name="phone"
              autoComplete="tel"
              value={phone}
              inputMode="tel"
              placeholder="04xx xxx xxx"
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => {
                setTip(false);
                if (phone !== g.phoneDisplay) void patch({ phone: phone.trim() || null });
              }}
              className={inputCls}
            />
          </Label>
          {/* Already on the list: bring their number in from the phone's contacts (Android's picker; iPhone's AutoFill Contact). */}
          <div className="col-start-1 -mt-1 flex flex-col gap-1">
            <button type="button" onClick={() => void numberFromContacts()} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
              {phone ? 'Use a number from my contacts' : 'Add their number from my contacts'}
            </button>
            {tip && (
              <span role="status" className="text-[12px] text-[var(--adm-muted,#5b6a52)]">
                Tap AutoFill Contact above the keyboard (or the contact icon) and choose them. On a computer, type it in. To open Contacts directly on iPhone, turn on Settings → Apps → Safari → Advanced → Feature Flags → Contact Picker API once, then reload: iPhone asks your permission.
              </span>
            )}
          </div>
          {/* A second mobile (each of a couple): texts go to both; leave it empty for one. */}
          {(g.people.length > 1 || g.phone2) && (
            <Label text={`Mobile (${g.people[1]?.name.trim().split(' ')[0] || 'second'}), optional`} className="col-start-1">
              <input value={phone2} inputMode="tel" placeholder="04xx xxx xxx" onChange={(e) => setPhone2(e.target.value)} onBlur={() => phone2 !== (g.phone2Display ?? '') && void patch({ phone2: phone2.trim() || null })} className={inputCls} />
            </Label>
          )}
          <Label text="Seats held" className="row-start-1 col-start-2">
            <input type="number" min={1} max={60} defaultValue={g.seatsHeld} key={g.version} onBlur={(e) => Number(e.target.value) !== g.seatsHeld && Number(e.target.value) >= 1 && void patch({ seatsHeld: Number(e.target.value) })} className={inputCls} />
          </Label>
        </div>
        <Label text="Main contact's email (optional)">
          <input
            type="email"
            value={email}
            inputMode="email"
            placeholder="name@example.com"
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => email.trim().toLowerCase() !== (g.email ?? '') && void patch({ email: email.trim() || null })}
            className={inputCls}
          />
        </Label>
        <Label text="Send them messages by">
          <select value={g.channel ?? ''} onChange={(e) => void patch({ channel: e.target.value as NonNullable<typeof g.channel> })} className={inputCls}>
            <option value="">{g.phone && g.email ? 'Text and email' : g.phone ? 'Text' : 'Email'} (automatic)</option>
            <option value="text">Text only</option>
            <option value="email">Email only (free)</option>
            <option value="both">Text and email</option>
            <option value="phone">From my own phone (free)</option>
          </select>
        </Label>
        {/* Texts are bought as text credits: one tap to buy them (emails and your own phone are free). */}
        {g.phone && (g.channel ?? '') !== 'email' && (g.channel ?? '') !== 'phone' && (
          <span className="-mt-1 text-[12px] text-[var(--adm-muted,#5b6a52)]">
            Texts use text credits ({TEXT_CREDIT_ALL_IN}c each, all-in).{' '}
            <a href={`/admin/${encodeURIComponent(wid)}/settings?view=texting`} className="underline text-[#33402f]">
              Buy text credits
            </a>
          </span>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3">
          <Label text="Group (for seating)">
            <input
              list="guest-groups"
              defaultValue={g.party}
              key={`party-${g.version}`}
              placeholder="e.g. Wedding party"
              onBlur={(e) => e.target.value.trim() !== g.party && void patch({ party: e.target.value.trim() })}
              className={inputCls}
            />
            <datalist id="guest-groups">
              {groupSuggestions(overview?.wedding).map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Label>
          {/* A table before they reply is pencilled in (the seating plan's concept plan); a no frees it. */}
          <Label text={table && g.invited.some((k) => (g.rsvp[k]?.attending ?? null) === null) && !g.invited.some((k) => g.rsvp[k]?.attending === true) ? 'Reception table · pencilled in' : 'Reception table'}>
            <input value={table} placeholder="e.g. 4" onChange={(e) => setTable(e.target.value)} onBlur={() => table !== (g.people.find((p) => p.table)?.table ?? '') && void patch({ table: table.trim() || null, ...(overview?.events.some((e) => e.key === chosen) ? { tableEvent: chosen } : {}) })} className={inputCls} />
          </Label>
        </div>
        {/* Who they are to you, for seating: side, how they know you, and who they know (circles). */}
        <fieldset className="flex flex-col gap-2 m-0 p-3 rounded-[12px] border border-[var(--adm-line,#e2d7bc)]">
          <legend className="px-1 text-[13px] text-[var(--adm-muted,#5b6a52)]">Who they are to you (for seating)</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SideSelect value={g.side ?? ''} onChange={(side) => void patch({ side })} />
            <RelationSelect value={g.relation ?? ''} onChange={(relation) => void patch({ relation })} />
          </div>
          <span className="text-[12px] text-[var(--adm-muted,#5b6a52)]">Circles: who they know (“Uni crew”, “Acme work”). Guests who share a circle sit together.</span>
          <CirclesInput value={g.circles ?? []} options={circleOptions} onChange={(circles) => void patch({ circles })} />
        </fieldset>
        {/* A printed invitation: their postal address (one per household), and whether they get a digital one too. */}
        <fieldset className="flex flex-col gap-2 m-0 p-3 rounded-[12px] border border-[var(--adm-line,#e2d7bc)]">
          <legend className="px-1 text-[13px] text-[var(--adm-muted,#5b6a52)]">Invitation by</legend>
          <select aria-label="Invitation by" value={g.delivery ?? 'digital'} onChange={(e) => void patch({ delivery: e.target.value as Delivery })} className={inputCls}>
            {DELIVERY.map((k) => (
              <option key={k} value={k}>
                {DELIVERY_LABEL[k]}
              </option>
            ))}
          </select>
          {g.delivery === 'post' && <span className="text-[12px] text-[#8a5a45]">Printed only: no texts or emails go to them. You can still record their reply here, or they can use their link.</span>}
          {/* A digital invitation needs no address: the boxes show only for a printed one (or an address already saved). */}
          {!printed(g.delivery) && !hasAddress && <span className="text-[12px] text-[var(--adm-muted,#5b6a52)]">No postal address needed: the invitation goes by text or email. Choose a printed invitation to add one.</span>}
          {!printed(g.delivery) && hasAddress && <span className="text-[12px] text-[var(--adm-muted,#5b6a52)]">Address saved, only used for a printed invitation.</span>}
          {(printed(g.delivery) || hasAddress) && (
          <>
          <Label text="Postal address">
            <textarea
              rows={2}
              defaultValue={g.address?.street ?? ''}
              key={`street-${g.version}`}
              placeholder="12 Rose Street"
              onBlur={(e) => e.target.value.trim() !== (g.address?.street ?? '') && void patch({ address: { street: e.target.value.trim() } })}
              className={inputCls}
            />
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
            {(
              [
                ['suburb', 'Suburb', 'Newtown'],
                ['state', 'State', 'NSW'],
                ['postcode', 'Postcode', '2042'],
              ] as const
            ).map(([k, label, ph]) => (
              <Label key={k} text={label}>
                <input defaultValue={g.address?.[k] ?? ''} key={`${k}-${g.version}`} placeholder={ph} onBlur={(e) => e.target.value.trim() !== (g.address?.[k] ?? '') && void patch({ address: { [k]: e.target.value.trim() } as NonNullable<GuestPatch['address']> })} className={inputCls} />
              </Label>
            ))}
          </div>
          <Label text="Country (if not Australia)">
            <input defaultValue={g.address?.country ?? ''} key={`country-${g.version}`} onBlur={(e) => e.target.value.trim() !== (g.address?.country ?? '') && void patch({ address: { country: e.target.value.trim() } })} className={inputCls} />
          </Label>
          </>
          )}
        </fieldset>
        {!g.phone && <div className="text-[13px] text-[#8a5a45]">No mobile, so this guest will not receive any texts.</div>}
        {g.optOut && <div className="text-[13px] text-[#8a5a45]">Opted out of texts (replied STOP).</div>}
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">Invited to</span>
          {invOptions.map(([k, label, next]) => {
            const on = invitedKey !== null ? invitedKey === k : g.invited.includes(k);
            return (
              <button key={k} aria-pressed={on} onClick={() => void patch({ invited: next })} className="py-[6px] px-[13px] rounded-full border border-[var(--adm-line,#c6b794)] text-[13px] cursor-pointer" style={{ background: on ? '#5d6b47' : 'transparent', color: on ? '#fbf8f2' : '#33402f' }}>
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-[14px] pt-5 border-t border-[var(--adm-line,#e2d7bc)]">
        <Eyebrow>RSVP</Eyebrow>
        {invitedEvents.map((e) => (
          <div key={e.key} className="flex flex-col gap-[6px]" role="group" aria-label={e.name}>
            <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">{e.name} · {dayOf(e.startsAt)}</span>
            <div className="flex gap-[6px]">
              {SEG.map(([val, label, bg, fg]) => {
                const on = (g.rsvp[e.key]?.attending ?? null) === val;
                return (
                  <button key={label} aria-pressed={on} onClick={() => void rsvp({ events: { [e.key]: { attending: val } } })} className="flex-1 py-[9px] px-[10px] rounded-[10px] border border-[var(--adm-line,#c6b794)] text-[14px] cursor-pointer" style={{ background: on ? bg : '#fbf8f2', color: on ? fg : '#33402f' }}>
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
        <div className="flex justify-between items-center gap-3 pt-1">
          <span className="text-[12px] text-[var(--adm-muted,#5b6a52)]">{override ? 'Manual override is on: you can change what the guest told you.' : 'What the guest told you (locked so it can’t be changed by accident).'}</span>
          <label className="flex items-center gap-2 text-[13px] cursor-pointer flex-none">
            <input type="checkbox" role="switch" checked={override} onChange={(e) => toggleOverride(e.target.checked)} className="w-[18px] h-[18px] accent-[#a5533c]" />
            Manual override
          </label>
        </div>
        <Label text="Dietary requirements">
          {override ? (
            <textarea rows={2} value={diet} onChange={(e) => setDiet(e.target.value)} onBlur={() => diet !== joinDiet(g.people) && void rsvp({ events: {}, diet })} className={`${inputCls} resize-y !border-[#c98a70]`} />
          ) : (
            <div aria-readonly="true" className="min-h-[44px] py-[10px] px-3 rounded-[10px] border border-dashed border-[var(--adm-line,#d3c6a4)] bg-[var(--adm-card,#f6f0e2)] text-[15px] whitespace-pre-wrap">
              {diet.trim() || <span className="text-[#7a7466]">None</span>}
            </div>
          )}
        </Label>
        <Label text="Message for the couple">
          {override ? (
            <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} onBlur={() => message !== (Object.values(g.rsvp).map((r) => r.message).find((m) => m.trim()) ?? '') && void rsvp({ events: {}, message })} className={`${inputCls} resize-y !border-[#c98a70]`} />
          ) : (
            <div aria-readonly="true" className="min-h-[44px] py-[10px] px-3 rounded-[10px] border border-dashed border-[var(--adm-line,#d3c6a4)] bg-[var(--adm-card,#f6f0e2)] text-[15px] italic whitespace-pre-wrap">
              {message.trim() ? `“${message.trim()}”` : <span className="not-italic text-[#7a7466]">No message</span>}
            </div>
          )}
        </Label>
      </section>

      <section className="flex flex-col gap-[10px] pt-5 border-t border-[var(--adm-line,#e2d7bc)]">
        <Eyebrow>Personal link</Eyebrow>
        <div className="flex gap-2 items-center">
          <code className="flex-1 min-w-0 py-[9px] px-3 rounded-[10px] bg-[var(--adm-card,#fbf8f2)] border border-[var(--adm-line,#e2d7bc)] text-[12px] overflow-hidden text-ellipsis whitespace-nowrap">{d.link}</code>
          <Pill className="!py-[9px] !px-[14px] !text-[13px] !font-normal" onClick={copy}>Copy</Pill>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">Send it by</span>
          <Pill className="!py-[7px] !px-[14px] !text-[13px] !font-normal" onClick={() => void whatsapp()}>WhatsApp</Pill>
          <Pill className="!py-[7px] !px-[14px] !text-[13px] !font-normal" onClick={() => void messenger()}>Messenger</Pill>
          {canShareNative() && <Pill className="!py-[7px] !px-[14px] !text-[13px] !font-normal" onClick={() => void share()}>Share…</Pill>}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">Preview as this guest</span>
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

      <section className="flex flex-col gap-[10px] pt-5 border-t border-[var(--adm-line,#e2d7bc)]">
        <Eyebrow>Text messages</Eyebrow>
        {d.sms.map((m, i) => (
          <div key={i} className="flex justify-between gap-[10px] text-[13px] py-[7px] border-b border-[var(--adm-line,#ece3cc)]">
            <span>{m.name}</span>
            <span className="text-[var(--adm-muted,#5b6a52)]">{fmtWhen(m.at, tz)} · {m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span>
          </div>
        ))}
        {d.sms.length === 0 && <div className="text-[13px] text-[var(--adm-muted,#5b6a52)]">Nothing sent yet.</div>}
        <div className="flex gap-2">
          <select aria-label="Message to send" value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 min-w-0 py-[9px] px-3 border border-[var(--adm-line,#d3c6a4)] rounded-[10px] bg-[var(--adm-card,#fbf8f2)] text-[14px]">
            {d.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Pill kind="primary" className="!py-[9px] !px-4 !text-[13px]" disabled={busy} onClick={sendNow}>Send now</Pill>
        </div>
      </section>

      <button onClick={remove} className="self-start p-0 border-0 bg-transparent text-[#8a5a45] text-[13px] underline cursor-pointer">Remove guest</button>
    </Drawer>
  );
}

const previewCls = 'py-[7px] px-[14px] rounded-full border border-dashed border-[#8a9670] text-[13px] no-underline !text-[var(--adm-text,#33402f)] hover:bg-[var(--adm-tint,#efe7d3)]';

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

/** "Child": unticked means an adult (the default); ticked, they count as a child for the caterer and seating. */
function ChildTick({ on, name, compact = false, onChange }: { on: boolean; name: string; compact?: boolean; onChange: (child: boolean) => void }) {
  return (
    <label className={`flex items-center gap-1 text-[13px] text-[var(--adm-muted,#5b6a52)] cursor-pointer select-none ${compact ? 'flex-none' : 'self-start -mt-1'}`}>
      <input type="checkbox" aria-label={`${name} is a child`} checked={on} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#33402f]" />
      Child
    </label>
  );
}
