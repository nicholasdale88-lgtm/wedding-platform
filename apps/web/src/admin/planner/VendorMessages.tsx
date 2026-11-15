import { useEffect, useState } from 'react';
import { ChatThread } from '../../lib/ChatThread';
import { vendorChatApi, type LinkedVendor, type VendorChatMessage } from '../../lib/api';
import { H2, Pill, useToast } from '../ui';

/**
 * Messages with your vendors: vendors on The Yes List you signed up through or added to your plan. Each
 * conversation stays here (they get an email that a message is waiting). Stop sharing ends the link: they no
 * longer see your wedding among their couples. Hidden when no vendor is linked.
 */
export function VendorMessages({ wid, list = [] }: { wid: string; list?: { id: string; name: string; email: string; dirId?: string }[] }) {
  const toast = useToast();
  const [vendors, setVendors] = useState<LinkedVendor[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<VendorChatMessage[]>([]);
  const load = () => vendorChatApi.list(wid).then((r) => setVendors(r.vendors), () => setVendors([]));
  useEffect(() => {
    void load();
  }, [wid]); // eslint-disable-line
  const [asked, setAsked] = useState<Record<string, string>>({});
  // Your vendors with an email who aren't here yet: invite them (free for them; then you message them here,
  // and your quote requests wait in their account).
  const linkedNames = new Set((vendors ?? []).map((v) => v.name.trim().toLowerCase()));
  const invitable = list.filter((v) => /\S+@\S+\.\S+/.test(v.email) && !v.dirId?.startsWith('v:') && !linkedNames.has(v.name.trim().toLowerCase()));
  const invite = async (v: { id: string; name: string }) => {
    try {
      const r = await vendorChatApi.invite(wid, v.id);
      setAsked((a) => ({ ...a, [v.id]: r.linked ? 'Already on The Yes List: linked ✓' : r.sent ? 'Invited ✓' : 'Email isn’t on yet' }));
      if (r.linked) void load();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  if (vendors === null) return null;
  if (!vendors.length && !invitable.length) return null;
  const chosen = vendors.find((v) => v.id === open) ?? null;
  const show = async (id: string) => {
    setOpen(id);
    setThread([]);
    setThread((await vendorChatApi.thread(wid, id)).messages);
    void load();
  };
  const end = async (v: LinkedVendor) => {
    if (!window.confirm(`Stop sharing with ${v.name}? They won’t see your wedding among their couples, and this conversation closes.`)) return;
    await vendorChatApi.end(wid, v.id);
    setOpen(null);
    toast(`${v.name} no longer sees your wedding.`);
    void load();
  };
  const unread = vendors.reduce((n, v) => n + v.unread, 0);
  return (
    <section aria-label="Messages with your vendors" className="flex flex-col gap-3 p-5 rounded-[16px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]">
      <H2>Messages with your vendors{unread ? ` · ${unread} new` : ''}</H2>
      <p className="m-0 text-[14px] text-[var(--adm-muted,#5b6a52)]">Vendors on The Yes List you came through or added to your plan. Write to them here; they see your date and numbers, never your guests’ names.</p>
      {invitable.length > 0 && (
        <div role="group" aria-label="Invite your vendors" className="flex flex-col gap-2 p-3 rounded-[12px] bg-white border border-[var(--adm-line,#e2d7bc)]">
          <strong className="text-[14px]">Invite your vendors</strong>
          <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">Free for them. Then you message each other here, and your quote requests wait in their account.</span>
          {invitable.slice(0, 12).map((v) => (
            <div key={v.id} className="flex justify-between items-center gap-2 flex-wrap text-[14px]">
              <span>{v.name || v.email}</span>
              {asked[v.id] ? <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">{asked[v.id]}</span> : <Pill size="sm" onClick={() => void invite(v)}>Invite to The Yes List</Pill>}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {vendors.map((v) => (
          <button key={v.id} type="button" aria-pressed={open === v.id} onClick={() => void show(v.id)} className={`py-2 px-4 rounded-full border text-[14px] cursor-pointer ${open === v.id ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-white border-[#c6b794] text-[#33402f]'}`}>
            {v.name}
            {v.unread ? ` · ${v.unread} new` : ''}
          </button>
        ))}
      </div>
      {chosen && (
        <div className="flex flex-col gap-2">
          <ChatThread
            messages={thread}
            mine="couple"
            other={chosen.name}
            empty={`No messages yet. Ask ${chosen.name} anything about your day.`}
            onSend={async (body) => {
              setThread((await vendorChatApi.send(wid, chosen.id, body)).messages);
              void load();
            }}
          />
          <Pill className="self-start" onClick={() => void end(chosen)}>Stop sharing with {chosen.name}</Pill>
        </div>
      )}
    </section>
  );
}
