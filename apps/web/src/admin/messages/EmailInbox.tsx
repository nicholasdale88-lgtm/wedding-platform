import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, inboxApi, plannerApi, type InboxEmail, type InboxSettings } from '../../lib/api';
import { fmtWhen } from '../../lib/format';
import { useAdmin } from '../Shell';
import { inputCls, Label, Pill, useAutoRefresh, useToast } from '../ui';

type Show = 'all' | 'guest' | 'vendor' | 'other' | 'sent' | 'archived';
const SHOW: [Show, string][] = [
  ['all', 'All'],
  ['guest', 'Guests'],
  ['vendor', 'Vendors'],
  ['other', 'Other'],
  ['sent', 'Sent'],
  ['archived', 'Archived'],
];
const KIND_LABEL: Record<string, string> = { guest: 'Guest', vendor: 'Vendor', other: 'Other' };
type Vendor = { id: string; name: string; email: string };
/** What the writing box starts with: a new email, or a reply to one. */
type Draft = { replyTo?: InboxEmail };

/**
 * Messages → Email: the wedding's own email address. Everything sent to it arrives here, sorted into guests,
 * vendors and other (a vendor's quote is filed under them as it arrives). Write or reply from the address,
 * email every guest their own invitation link, and get copies in Outlook or Apple Mail to answer from there.
 */
export function EmailInbox() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const [data, setData] = useState<{ address: string; emails: InboxEmail[] } | null>(null);
  const [settings, setSettings] = useState<InboxSettings | null>(null);
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [body, setBody] = useState<Record<string, string>>({});
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await inboxApi.list(wid, show === 'archived' ? 'archived' : show === 'sent' ? 'sent' : 'inbox'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid, show]);
  const loadSettings = useCallback(async () => {
    try {
      setSettings(await inboxApi.settings(wid));
    } catch {
      setSettings(null);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  useEffect(() => void loadSettings(), [loadSettings]);
  useAutoRefresh(load);
  useEffect(() => {
    plannerApi
      .doc<{ list: Vendor[] }>(wid, 'vendors')
      .then((r) => setVendors(r.data.list))
      .catch(() => setVendors([]));
  }, [wid]);

  const shown = useMemo(() => (data?.emails ?? []).filter((e) => show === 'all' || show === 'archived' || show === 'sent' || e.kind === show), [data, show]);
  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!data) return <div aria-busy="true" className="text-[#5b6a52]">Loading email…</div>;
  if (!data.address) return <AddressSetup domain={settings?.domain ?? ''} onSaved={load} />;

  const canWrite = settings?.canWrite ?? false;
  const canSend = !!settings?.canSend && canWrite;
  const expand = async (e: InboxEmail) => {
    if (open === e.id) return setOpen(null);
    setOpen(e.id);
    if (!body[e.id]) {
      try {
        const r = await inboxApi.get(wid, e.id);
        setBody((b) => ({ ...b, [e.id]: r.body }));
        if (!e.read) setData((d) => (d ? { ...d, emails: d.emails.map((x) => (x.id === e.id ? { ...x, read: true } : x)) } : d));
      } catch (err) {
        toast((err as Error).message);
      }
    }
  };
  const update = async (e: InboxEmail, patch: Parameters<typeof inboxApi.update>[2], done: string) => {
    try {
      await inboxApi.update(wid, e.id, patch);
      toast(done);
      await load();
    } catch (err) {
      toast((err as Error).message);
    }
  };
  const count = (k: Show) => (k === 'sent' || k === 'archived' ? 0 : data.emails.filter((e) => (k === 'all' || e.kind === k) && !e.read && !e.sent).length);
  const sent = async () => {
    setDraft(null);
    await Promise.all([load(), loadSettings()]);
  };

  return (
    <div className="flex flex-col gap-4">
      <YourAddress address={data.address} settings={settings} canSend={canSend} onWrite={() => setDraft({})} onSent={sent} />
      {draft && <Compose start={draft} vendors={vendors} address={data.address} onClose={() => setDraft(null)} onSent={sent} />}
      <div role="radiogroup" aria-label="Show" className="flex gap-2 flex-wrap">
        {SHOW.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={show === k}
            onClick={() => setShow(k)}
            className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${show === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794] text-[#33402f]'}`}
          >
            {label}
            {count(k) > 0 ? ` · ${count(k)}` : ''}
          </button>
        ))}
      </div>
      <ul className="list-none m-0 p-0 flex flex-col rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
        {shown.map((e) => {
          const isOpen = open === e.id;
          const who = e.sent ? `To ${e.guest ?? e.vendor ?? e.to ?? ''}` : (e.guest ?? e.vendor ?? (e.fromName || e.from));
          return (
            <li key={e.id} className="border-t border-[#ece3cd] first:border-t-0">
              <button type="button" aria-expanded={isOpen} onClick={() => void expand(e)} className="w-full grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 px-4 bg-transparent border-0 text-left cursor-pointer hover:bg-[#f3ecd6]">
                <span className="min-w-0">
                  <span className={`block truncate ${e.read ? '' : 'font-semibold'}`}>
                    {who}
                    <span className="ml-2 py-[1px] px-2 rounded-full bg-[#efe7d3] text-[11px] font-normal align-middle">{e.vendor ? `Vendor · ${e.vendor}` : KIND_LABEL[e.kind]}</span>
                    {e.filed && <span className="ml-1 py-[1px] px-2 rounded-full bg-[#dfe5cc] text-[11px] font-normal align-middle">Quote filed ✓</span>}
                  </span>
                  <span className={`block truncate text-[14px] ${e.read ? 'text-[#5b6a52]' : 'text-[#33402f]'}`}>{e.subject || '(no subject)'}</span>
                  {!isOpen && <span className="block truncate text-[13px] text-[#7a7466]">{e.preview}</span>}
                </span>
                <span className="text-[12px] text-[#7a7466] whitespace-nowrap">
                  {e.files.length > 0 && '📎 '}
                  {fmtWhen(e.receivedAt, tz)}
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-3 px-4 pb-4">
                  <div className="text-[12px] text-[#5b6a52] break-words">{e.sent ? `From ${data.address} to ${e.to ?? ''}` : `From ${e.fromName ? `${e.fromName} <${e.from}>` : e.from}`}</div>
                  <div className="p-3 rounded-[10px] bg-white border border-[#e2d7bc] text-[14px] whitespace-pre-wrap break-words max-h-[420px] overflow-y-auto">{body[e.id] ?? 'Loading…'}</div>
                  {e.files.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {e.files.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 flex-wrap text-[14px]">
                          <a href={plannerApi.fileUrl(wid, f.id)} target="_blank" rel="noopener" className="!text-[#33402f]">
                            📎 {f.name}
                          </a>
                          {vendors.length > 0 && canWrite && (
                            <select
                              aria-label={`File ${f.name} as a quote`}
                              value=""
                              onChange={(ev) =>
                                ev.target.value &&
                                void inboxApi
                                  .file(wid, e.id, ev.target.value, f.id)
                                  .then(() => {
                                    toast(`Filed under ${vendors.find((v) => v.id === ev.target.value)?.name ?? 'the vendor'}`);
                                    return load();
                                  })
                                  .catch((err: Error) => toast(err.message))
                              }
                              className={`${inputCls} !py-[5px] !text-[13px]`}
                            >
                              <option value="">File as a quote under…</option>
                              {vendors.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {!e.sent && (
                    <div className="flex gap-2 flex-wrap items-center">
                      {canSend ? (
                        <Pill kind="primary" size="sm" onClick={() => setDraft({ replyTo: e })}>
                          Reply
                        </Pill>
                      ) : (
                        <a
                          href={`mailto:${encodeURIComponent(e.from)}?subject=${encodeURIComponent(e.subject.startsWith('Re:') ? e.subject : `Re: ${e.subject}`)}`}
                          className="py-[7px] px-[14px] rounded-full bg-[#33402f] text-[13px] no-underline !text-[#f3ecd6]"
                        >
                          Reply
                        </a>
                      )}
                      {canWrite && (
                        <>
                          <select aria-label="Sort as" value={e.kind} onChange={(ev) => void update(e, { kind: ev.target.value as InboxEmail['kind'] }, 'Moved')} className={`${inputCls} !py-[6px] !text-[13px]`}>
                            <option value="guest">A guest</option>
                            <option value="vendor">A vendor</option>
                            <option value="other">Other</option>
                          </select>
                          {e.kind === 'vendor' && vendors.length > 0 && (
                            <select aria-label="Which vendor" value={e.vendorId ?? ''} onChange={(ev) => void update(e, { vendorId: ev.target.value || null }, 'Saved')} className={`${inputCls} !py-[6px] !text-[13px]`}>
                              <option value="">Which vendor?</option>
                              {vendors.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <Pill kind="outline" onClick={() => void update(e, { archived: show !== 'archived' }, show === 'archived' ? 'Back in the inbox' : 'Archived')}>
                            {show === 'archived' ? 'Unarchive' : 'Archive'}
                          </Pill>
                          <button type="button" onClick={() => void update(e, { read: false }, 'Marked unread')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#5b6a52]">
                            Mark unread
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!shown.length && (
          <li className="py-4 px-4 text-[14px] text-[#7a7466]">{show === 'archived' ? 'Nothing archived.' : show === 'sent' ? 'Nothing sent from here yet.' : 'No emails here yet.'}</li>
        )}
      </ul>
      {settings?.replyByEmail && <Copies settings={settings} canWrite={canWrite} onSaved={loadSettings} />}
      {canWrite && <AddressSetup current={data.address} domain={settings?.domain ?? ''} onSaved={load} compact />}
    </div>
  );
}

/** The address, big, with Copy; and the two things to do with it: write an email, and email every guest their invitation. */
function YourAddress({ address, settings, canSend, onWrite, onSent }: { address: string; settings: InboxSettings | null; canSend: boolean; onWrite: () => void; onSent: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; without: string[] } | null>(null);
  const copy = () =>
    void navigator.clipboard
      ?.writeText(address)
      .then(() => toast('Address copied'))
      .catch(() => toast(address));

  const emailEveryone = async () => {
    setBusy(true);
    try {
      const n = await inboxApi.invitations(wid);
      if (!n.ready) {
        toast(n.already ? 'Everyone with an email has had their invitation.' : 'No guests have an email yet. Add them in Guests (open a guest → their email).');
        setResult(n.without.length ? { text: '', without: n.without } : null);
        return;
      }
      const skip = n.without.length ? `\n\n${n.without.length} ${n.without.length === 1 ? 'guest has' : 'guests have'} no email and will be skipped.` : '';
      const later = n.ready > n.left ? `\n\nUp to ${n.left} can go today; press this again tomorrow for the rest.` : '';
      if (!window.confirm(`Email ${n.ready} ${n.ready === 1 ? 'guest' : 'guests'} their own invitation link, from ${address}?${skip}${later}`)) return;
      const r = await inboxApi.sendInvitations(wid);
      const text = r.message ?? `Sent ${r.sent} ${r.sent === 1 ? 'invitation' : 'invitations'}${r.failed ? ` (${r.failed} didn’t go: try again later)` : ''}.`;
      toast(text);
      setResult({ text, without: r.without });
      await onSent();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Your wedding email" className="flex flex-col gap-3 p-5 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <span className="text-[13px] text-[#5b6a52]">Your wedding email</span>
      <div className="flex items-center gap-3 flex-wrap">
        <strong className="font-display text-[24px] font-medium break-all">{address}</strong>
        <Pill size="sm" onClick={copy}>
          Copy
        </Pill>
      </div>
      <p className="m-0 text-[14px] text-[#5b6a52]">Give it to guests and vendors. Everything sent to it comes in here, sorted for you, and vendors’ quotes are filed under them in Wedding planner → Vendors.</p>
      {canSend && (
        <div className="flex gap-2 flex-wrap">
          <Pill kind="primary" onClick={onWrite}>
            Write an email
          </Pill>
          <Pill onClick={() => void emailEveryone()} disabled={busy} aria-busy={busy}>
            Email everyone their invitation
          </Pill>
        </div>
      )}
      {settings && !settings.canSend && settings.canWrite && <p className="m-0 text-[13px] text-[#7a7466]">Sending from here switches on once the site’s email is set up. Until then, Reply opens your own email app.</p>}
      {settings?.canSend && settings.left < settings.perDay && (
        <p className="m-0 text-[13px] text-[#7a7466]">
          {settings.left} of {settings.perDay} emails left today.
        </p>
      )}
      {result && (
        <div role="status" className="text-[13px] text-[#5b6a52] flex flex-col gap-1">
          {result.text && <span>{result.text}</span>}
          {result.without.length > 0 && (
            <span>
              No email yet, so not sent: {result.without.slice(0, 12).join(', ')}
              {result.without.length > 12 ? ` and ${result.without.length - 12} more` : ''}. Text them instead, or add their email in Guests.
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/** Writing an email (or a reply) from the wedding's address: to any addresses, or picked guests and vendors. */
function Compose({ start, vendors, address, onClose, onSent }: { start: Draft; vendors: Vendor[]; address: string; onClose: () => void; onSent: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const r = start.replyTo;
  const [to, setTo] = useState(r ? r.from : '');
  const [subject, setSubject] = useState(r ? (/^re:/i.test(r.subject) ? r.subject : `Re: ${r.subject}`) : '');
  const [text, setText] = useState('');
  const [guests, setGuests] = useState<{ id: string; name: string; email: string }[]>([]);
  const [pickedGuests, setPickedGuests] = useState<string[]>([]);
  const [pickedVendors, setPickedVendors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (r) return;
    api
      .guests(wid)
      .then((d) => setGuests(d.guests.filter((g) => g.email).map((g) => ({ id: g.id, name: g.people.map((p) => p.name).filter(Boolean).join(' & ') || g.email!, email: g.email! }))))
      .catch(() => setGuests([]));
  }, [wid, r]);
  const withEmail = vendors.filter((v) => /@/.test(v.email ?? ''));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const typed = to
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!typed.length && !pickedGuests.length && !pickedVendors.length) return toast('Add who it’s to.');
    if (!text.trim()) return toast('Write your message.');
    setBusy(true);
    try {
      const res = await inboxApi.send(wid, { to: typed, guests: pickedGuests, vendors: pickedVendors, subject: subject.trim(), body: text, ...(r ? { replyTo: r.id } : {}) });
      toast(`Sent${res.sent > 1 ? ` to ${res.sent} people` : ''} ✓${res.failed.length ? ` (${res.failed.length} didn’t go)` : ''}`);
      await onSent();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const chip = (label: string, remove: () => void) => (
    <span key={label} className="inline-flex items-center gap-1 py-[3px] pl-3 pr-1 rounded-full bg-[#efe7d3] text-[13px]">
      {label}
      <button type="button" aria-label={`Remove ${label}`} onClick={remove} className="w-6 h-6 rounded-full border-0 bg-transparent cursor-pointer">
        ×
      </button>
    </span>
  );

  return (
    <form onSubmit={(e) => void submit(e)} aria-label={r ? 'Reply' : 'Write an email'} className="flex flex-col gap-3 p-5 rounded-[14px] border border-[#c6b794] bg-white">
      <div className="flex justify-between items-center gap-2">
        <strong className="font-display text-[20px] font-medium">{r ? `Reply to ${r.fromName || r.from}` : 'Write an email'}</strong>
        <button type="button" onClick={onClose} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#5b6a52]">
          Cancel
        </button>
      </div>
      <span className="text-[13px] text-[#5b6a52]">From {address}. Their answers come back here.</span>
      <Label text="To (email addresses)">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, another@example.com" className={inputCls} inputMode="email" />
      </Label>
      {!r && (guests.length > 0 || withEmail.length > 0) && (
        <div className="flex gap-2 flex-wrap items-center">
          {guests.length > 0 && (
            <select aria-label="Add a guest" value="" onChange={(e) => e.target.value && setPickedGuests((p) => [...new Set([...p, e.target.value])])} className={`${inputCls} !py-[6px] !text-[13px]`}>
              <option value="">Add a guest…</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          {withEmail.length > 0 && (
            <select aria-label="Add a vendor" value="" onChange={(e) => e.target.value && setPickedVendors((p) => [...new Set([...p, e.target.value])])} className={`${inputCls} !py-[6px] !text-[13px]`}>
              <option value="">Add a vendor…</option>
              {withEmail.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          {pickedGuests.map((id) => chip(guests.find((g) => g.id === id)?.name ?? 'Guest', () => setPickedGuests((p) => p.filter((x) => x !== id))))}
          {pickedVendors.map((id) => chip(withEmail.find((v) => v.id === id)?.name ?? 'Vendor', () => setPickedVendors((p) => p.filter((x) => x !== id))))}
        </div>
      )}
      <Label text="Subject">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} className={inputCls} />
      </Label>
      <Label text="Message">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} maxLength={20000} className={`${inputCls} resize-y`} />
      </Label>
      <div className="flex gap-2 items-center">
        <Pill kind="primary" type="submit" disabled={busy} aria-busy={busy}>
          {busy ? 'Sending…' : 'Send'}
        </Pill>
        <span className="text-[12px] text-[#7a7466]">Each person gets their own copy (nobody sees the others’ addresses).</span>
      </div>
    </form>
  );
}

/** Copies to your own inbox, to read and answer in Outlook, Apple Mail or Gmail. */
function Copies({ settings, canWrite, onSaved }: { settings: InboxSettings; canWrite: boolean; onSaved: () => Promise<void> }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const toggle = async (id: string, on: boolean) => {
    const ids = settings.copies.filter((p) => (p.id === id ? on : p.on)).map((p) => p.id);
    try {
      await inboxApi.setCopies(wid, ids);
      toast(on ? 'Copies on' : 'Copies off');
      await onSaved();
    } catch (err) {
      toast((err as Error).message);
    }
  };
  return (
    <section aria-label="Send copies to my email" className="flex flex-col gap-2 p-5 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <strong className="font-display text-[20px] font-medium">Send copies to my email</strong>
      <p className="m-0 text-[14px] text-[#5b6a52]">Read and reply from Outlook or Apple Mail: copies come to your email; your replies go out from your wedding address.</p>
      {settings.copies.map((p) => (
        <label key={p.id} className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" checked={p.on} disabled={!canWrite} onChange={(e) => void toggle(p.id, e.target.checked)} />
          {p.name ? `${p.name} (${p.email})` : p.email}
        </label>
      ))}
    </section>
  );
}

/** Choosing their own address instead (or none), and how to send its email here (Cloudflare Email Routing, free). */
function AddressSetup({ current = '', domain, onSaved, compact }: { current?: string; domain: string; onSaved: () => Promise<void>; compact?: boolean }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [address, setAddress] = useState(current);
  const [open, setOpen] = useState(!compact);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#5b6a52]">
        Use a different address
      </button>
    );
  }
  return (
    <section aria-label="Email address" className="flex flex-col gap-3 p-5 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <strong className="font-display text-[22px] font-medium">Your event’s email</strong>
      <p className="m-0 text-[14px] text-[#5b6a52]">Emails to your event’s own address come in here, sorted into guests, vendors and other. Quotes from your vendors are filed under them automatically.</p>
      <form
        className="flex gap-2 flex-wrap"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await inboxApi.setAddress(wid, address.trim());
            toast(address.trim() ? 'Saved' : 'Email is off');
            await onSaved();
          } catch (err) {
            toast((err as Error).message);
          }
        }}
      >
        <input type="email" aria-label="The event's email address" placeholder={domain ? `you@${domain}` : 'hello@yourdomain.com'} value={address} onChange={(e) => setAddress(e.target.value)} className={`${inputCls} flex-1 min-w-[220px]`} />
        <Pill type="submit" kind="primary">
          Save
        </Pill>
      </form>
      {domain ? (
        <p className="m-0 text-[13px] text-[#5b6a52]">Any address ending in @{domain} works straight away, as long as no one else has it.</p>
      ) : (
        <ol className="m-0 pl-5 text-[13px] text-[#5b6a52] flex flex-col gap-1">
          <li>In Cloudflare, open your domain → Email → Email Routing, and switch it on (free).</li>
          <li>Add a routing rule: this address → “Send to a Worker” → wedding-api.</li>
          <li>Using a Gmail address for the event? In Gmail → Settings → Forwarding, forward it to this address.</li>
        </ol>
      )}
    </section>
  );
}
