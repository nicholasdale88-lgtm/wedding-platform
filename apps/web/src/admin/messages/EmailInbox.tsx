import { useCallback, useEffect, useMemo, useState } from 'react';
import { inboxApi, plannerApi, type InboxEmail } from '../../lib/api';
import { fmtWhen } from '../../lib/format';
import { useAdmin } from '../Shell';
import { inputCls, Pill, useAutoRefresh, useToast } from '../ui';

type Show = 'all' | 'guest' | 'vendor' | 'other' | 'archived';
const SHOW: [Show, string][] = [
  ['all', 'All'],
  ['guest', 'Guests'],
  ['vendor', 'Vendors'],
  ['other', 'Other'],
  ['archived', 'Archived'],
];
const KIND_LABEL: Record<string, string> = { guest: 'Guest', vendor: 'Vendor', other: 'Other' };

/**
 * Messages → Email: everything sent to the event's own address, sorted into guests, vendors and other.
 * A vendor's quote is filed under them as it arrives; file any other attachment yourself in one tap.
 */
export function EmailInbox() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const [data, setData] = useState<{ address: string; emails: InboxEmail[] } | null>(null);
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [body, setBody] = useState<Record<string, string>>({});
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await inboxApi.list(wid, show === 'archived'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid, show]);
  useEffect(() => void load(), [load]);
  useAutoRefresh(load);
  useEffect(() => {
    plannerApi
      .doc<{ list: { id: string; name: string }[] }>(wid, 'vendors')
      .then((r) => setVendors(r.data.list))
      .catch(() => setVendors([]));
  }, [wid]);

  const shown = useMemo(() => (data?.emails ?? []).filter((e) => show === 'all' || show === 'archived' || e.kind === show), [data, show]);
  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!data) return <div aria-busy="true" className="text-[#5b6a52]">Loading email…</div>;
  if (!data.address) return <AddressSetup onSaved={load} />;

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
  const count = (k: Show) => (k === 'all' ? data.emails.filter((e) => !e.read).length : data.emails.filter((e) => e.kind === k && !e.read).length);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center gap-3 flex-wrap text-[13px] text-[#5b6a52]">
        <span>
          Emails to <strong className="text-[#33402f]">{data.address}</strong> arrive here. Vendors’ quotes are filed under them in Wedding planner → Vendors.
        </span>
      </div>
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
            {k !== 'archived' && count(k) > 0 ? ` · ${count(k)}` : ''}
          </button>
        ))}
      </div>
      <ul className="list-none m-0 p-0 flex flex-col rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
        {shown.map((e) => {
          const isOpen = open === e.id;
          return (
            <li key={e.id} className="border-t border-[#ece3cd] first:border-t-0">
              <button type="button" aria-expanded={isOpen} onClick={() => void expand(e)} className="w-full grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 px-4 bg-transparent border-0 text-left cursor-pointer hover:bg-[#f3ecd6]">
                <span className="min-w-0">
                  <span className={`block truncate ${e.read ? '' : 'font-semibold'}`}>
                    {e.guest ?? e.vendor ?? (e.fromName || e.from)}
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
                  <div className="text-[12px] text-[#5b6a52]">
                    From {e.fromName ? `${e.fromName} <${e.from}>` : e.from}
                  </div>
                  <div className="p-3 rounded-[10px] bg-white border border-[#e2d7bc] text-[14px] whitespace-pre-wrap break-words max-h-[420px] overflow-y-auto">{body[e.id] ?? 'Loading…'}</div>
                  {e.files.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {e.files.map((f) => (
                        <div key={f.id} className="flex items-center gap-3 flex-wrap text-[14px]">
                          <a href={plannerApi.fileUrl(wid, f.id)} target="_blank" rel="noopener" className="!text-[#33402f]">
                            📎 {f.name}
                          </a>
                          {vendors.length > 0 && (
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
                  <div className="flex gap-2 flex-wrap items-center">
                    <a
                      href={`mailto:${encodeURIComponent(e.from)}?subject=${encodeURIComponent(e.subject.startsWith('Re:') ? e.subject : `Re: ${e.subject}`)}`}
                      className="py-[7px] px-[14px] rounded-full bg-[#33402f] text-[13px] no-underline !text-[#f3ecd6]"
                    >
                      Reply
                    </a>
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
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {!shown.length && <li className="py-4 px-4 text-[14px] text-[#7a7466]">{show === 'archived' ? 'Nothing archived.' : 'No emails here yet.'}</li>}
      </ul>
      <AddressSetup current={data.address} onSaved={load} compact />
    </div>
  );
}

/** The event's address, and how to send its email here (Cloudflare Email Routing, free). */
function AddressSetup({ current = '', onSaved, compact }: { current?: string; onSaved: () => Promise<void>; compact?: boolean }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [address, setAddress] = useState(current);
  const [open, setOpen] = useState(!compact);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#5b6a52]">
        Change the address or see how it’s set up
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
        <input type="email" aria-label="The event's email address" placeholder="hello@yourdomain.com" value={address} onChange={(e) => setAddress(e.target.value)} className={`${inputCls} flex-1 min-w-[220px]`} />
        <Pill type="submit" kind="primary">
          Save
        </Pill>
      </form>
      <ol className="m-0 pl-5 text-[13px] text-[#5b6a52] flex flex-col gap-1">
        <li>In Cloudflare, open your domain → Email → Email Routing, and switch it on (free).</li>
        <li>Add a routing rule: this address → “Send to a Worker” → wedding-api.</li>
        <li>Using a Gmail address for the event? In Gmail → Settings → Forwarding, forward it to this address.</li>
      </ol>
    </section>
  );
}
