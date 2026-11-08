import { addressLines, contactMobile, displayPhone, toE164, hasAddress, parseContactsFile, type Contact, type PostalAddress } from '@wp/shared';
import { useRef, useState } from 'react';
import { api, type EventInfo, type Guest } from '../lib/api';
import { useAdmin } from './Shell';
import { Pill, useToast } from './ui';

/**
 * Guests → Import contacts, in three taps: Import contacts, then From this phone (the phone's own contact
 * picker, on Android) or From a contacts file (.vcf from iPhone, Google or Android; Google or Outlook
 * .csv), then Add N guests. Everyone is ticked except anyone already on the list.
 */

type PickedContact = { name?: string[]; tel?: string[]; email?: string[]; address?: { addressLine?: string[]; city?: string; region?: string; postalCode?: string; country?: string }[] };
type ContactsManager = { select: (props: string[], opts: { multiple: boolean }) => Promise<PickedContact[]>; getProperties?: () => Promise<string[]> };
const picker = (): ContactsManager | null => {
  if (typeof navigator === 'undefined' || typeof window === 'undefined' || !('ContactsManager' in window)) return null;
  return (navigator as Navigator & { contacts?: ContactsManager }).contacts ?? null;
};

/** One row in the review list. */
export interface ContactRow {
  name: string;
  phone: string | null;
  /** A second Australian mobile on the contact, if it has one. */
  phone2: string | null;
  email: string;
  address: PostalAddress | null;
  /** Why it starts unticked ('' when it's ticked). */
  note: string;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Contacts as review rows: Australian mobiles only, anyone already on the list (same mobile or name) unticked. */
export function reviewRows(contacts: Contact[], guests: Guest[]): ContactRow[] {
  const phones = new Set(guests.map((g) => g.phone).filter(Boolean));
  const names = new Set(guests.flatMap((g) => g.people.map((p) => norm(p.name))).filter(Boolean));
  const seen = new Set<string>();
  return contacts.map((c) => {
    const phone = contactMobile(c);
    const phone2 = c.phones.map((p) => toE164(p)).find((x): x is string => !!x && x !== phone) ?? null;
    const email = (c.emails.find((e) => EMAIL.test(e)) ?? '').toLowerCase();
    const name = (c.name || email.split('@')[0] || '').slice(0, 120);
    const key = phone ?? norm(name);
    const note = !name ? 'No name' : (phone && phones.has(phone)) || names.has(norm(name)) ? 'Already on your list' : seen.has(key) ? 'In the file twice' : '';
    seen.add(key);
    return { name, phone, phone2, email, address: c.address, note };
  });
}

/** The contact picker's answer as contacts (only the properties the phone gave). */
export function fromPicker(list: PickedContact[]): Contact[] {
  return list.map((c) => {
    const a = c.address?.[0];
    const address = a ? { street: (a.addressLine ?? []).join('\n'), suburb: a.city ?? '', state: a.region ?? '', postcode: a.postalCode ?? '', country: a.country ?? '' } : null;
    return { name: (c.name?.[0] ?? '').trim(), phones: c.tel ?? [], emails: (c.email ?? []).map((e) => e.toLowerCase()), address: address && hasAddress(address) ? address : null };
  });
}

export function ImportContacts({ guests, focus, onClose, onDone }: { guests: Guest[]; events: EventInfo[]; focus?: EventInfo; onClose: () => void; onDone: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(() => new Set());
  const [post, setPost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [how, setHow] = useState(false);
  const phone = picker();

  const show = (contacts: Contact[]) => {
    const r = reviewRows(contacts, guests);
    if (!r.length) return toast('No contacts found in that file.');
    setRows(r);
    setTicked(new Set(r.map((x, i) => (x.note ? -1 : i)).filter((i) => i >= 0)));
  };
  const fromPhone = async () => {
    if (!phone) return;
    try {
      const can = (await phone.getProperties?.()) ?? ['name', 'tel', 'email', 'address'];
      const props = ['name', 'tel', 'email', 'address'].filter((p) => can.includes(p));
      show(fromPicker(await phone.select(props, { multiple: true })));
    } catch (e) {
      toast((e as Error).message || 'The contacts couldn’t be opened.');
    }
  };
  const fromFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast('That file is over 10 MB.');
    try {
      show(parseContactsFile(f.name, await f.text()));
    } catch {
      toast('That file couldn’t be read. Export your contacts as a vCard (.vcf) or CSV and try again.');
    }
  };

  const add = async () => {
    if (!rows) return;
    const chosen = rows.filter((_r, i) => ticked.has(i));
    const out = chosen.map((r) => ({
      people: [r.name],
      ...(r.phone ? { phone: r.phone } : {}),
      ...(r.phone2 ? { phone2: r.phone2 } : {}),
      ...(r.email ? { email: r.email } : {}),
      ...(r.address
        ? { street: r.address.street.slice(0, 300), suburb: r.address.suburb.slice(0, 80), state: r.address.state.slice(0, 40), postcode: r.address.postcode.slice(0, 12), country: r.address.country.slice(0, 60) }
        : {}),
      ...(post && r.address ? { delivery: 'both' as const } : {}),
      ...(focus ? { invited: [focus.key] } : {}),
    }));
    setBusy(true);
    try {
      let added = 0;
      for (let i = 0; i < out.length; i += 1000) added += (await api.importGuests(wid, out.slice(i, i + 1000), false)).added;
      toast(`Added ${added} ${added === 1 ? 'guest' : 'guests'}`);
      await onDone();
      onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const n = ticked.size;
  return (
    <section aria-label="Import contacts" className="flex flex-col gap-3 p-4 rounded-[14px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f2)]">
      <div className="flex justify-between items-baseline gap-2">
        <h2 className="m-0 font-display font-medium text-[24px]">Import contacts</h2>
        <button type="button" onClick={onClose} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px]">
          Close
        </button>
      </div>
      {!rows && (
        <>
          <div className="flex gap-2 flex-wrap">
            {phone && (
              <Pill kind="primary" onClick={() => void fromPhone()}>
                From this phone
              </Pill>
            )}
            <Pill kind={phone ? 'secondary' : 'primary'} onClick={() => file.current?.click()}>
              From a contacts file
            </Pill>
            <input ref={file} type="file" hidden aria-label="Contacts file" accept=".vcf,.vcard,.csv,text/vcard,text/x-vcard,text/csv" onChange={(e) => void fromFile(e.target.files?.[0])} />
          </div>
          <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">Names, mobiles, emails and postal addresses come across. Nobody already on your list is added twice.</span>
          <button type="button" aria-expanded={how} onClick={() => setHow((x) => !x)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
            How do I get a contacts file?
          </button>
          {how && (
            <ul className="m-0 pl-5 text-[13px] text-[var(--adm-muted,#5b6a52)] flex flex-col gap-1">
              <li>iPhone: Contacts → select the people (or a list) → Share → save the .vcf to Files, then choose it here.</li>
              <li>Mac: Contacts → select people → File → Export → Export vCard.</li>
              <li>Google: contacts.google.com → tick people (or a label) → Export → vCard or Google CSV.</li>
              <li>Android: Contacts → menu → Export (or Share) → .vcf file. Or use From this phone in Chrome.</li>
              <li>Outlook: People → Manage contacts → Export contacts (CSV).</li>
            </ul>
          )}
        </>
      )}
      {rows && (
        <>
          <div className="flex gap-3 flex-wrap items-center text-[13px]">
            <span>
              {rows.length} {rows.length === 1 ? 'contact' : 'contacts'} · {n} ticked
            </span>
            <button type="button" onClick={() => setTicked(new Set(rows.map((_r, i) => i).filter((i) => rows[i]!.name)))} className="p-0 border-0 bg-transparent underline cursor-pointer">
              Tick all
            </button>
            <button type="button" onClick={() => setTicked(new Set())} className="p-0 border-0 bg-transparent underline cursor-pointer">
              Untick all
            </button>
            {rows.some((r) => r.address) && (
              <label className="flex gap-2 items-center cursor-pointer">
                <input type="checkbox" checked={post} onChange={(e) => setPost(e.target.checked)} className="accent-[#33402f]" />
                Also send a printed invitation to those with an address
              </label>
            )}
          </div>
          <ul className="m-0 p-0 list-none flex flex-col max-h-[50vh] overflow-y-auto border-t border-[var(--adm-line,#e2d7bc)]">
            {rows.map((r, i) => (
              <li key={i} className="border-b border-[var(--adm-line,#ece3cc)]">
                <label className="flex gap-3 items-start py-2 cursor-pointer">
                  <input
                    type="checkbox"
                    aria-label={r.name || 'Contact with no name'}
                    disabled={!r.name}
                    checked={ticked.has(i)}
                    onChange={() =>
                      setTicked((s) => {
                        const x = new Set(s);
                        if (x.has(i)) x.delete(i);
                        else x.add(i);
                        return x;
                      })
                    }
                    className="mt-[3px] accent-[#33402f]"
                  />
                  <span className="min-w-0 text-[14px]">
                    <span className="font-medium">{r.name || '(no name)'}</span>
                    {r.note && <span className="ml-2 text-[12px] text-[#8a5a45]">{r.note}</span>}
                    <span className="block text-[12px] text-[var(--adm-muted,#5b6a52)]">
                      {[r.phone ? displayPhone(r.phone) : 'No Australian mobile', r.phone2 ? displayPhone(r.phone2) : '', r.email, addressLines(r.address).join(', ')].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2 flex-wrap">
            <Pill kind="primary" disabled={!n || busy} onClick={() => void add()}>
              {busy ? 'Adding…' : `Add ${n} ${n === 1 ? 'guest' : 'guests'}`}
            </Pill>
            <Pill onClick={() => setRows(null)}>Choose others</Pill>
          </div>
        </>
      )}
    </section>
  );
}
