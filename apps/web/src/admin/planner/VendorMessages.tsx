import { useEffect, useState } from 'react';
import { ChatThread } from '../../lib/ChatThread';
import { vendorChatApi, type LinkedVendor, type VendorChatMessage } from '../../lib/api';
import { H2, Pill, useToast } from '../ui';

/**
 * Messages with your vendors: vendors on The Yes List you signed up through or added to your plan. Each
 * conversation stays here (they get an email that a message is waiting). Stop sharing ends the link: they no
 * longer see your wedding among their couples. Hidden when no vendor is linked.
 */
export function VendorMessages({ wid }: { wid: string }) {
  const toast = useToast();
  const [vendors, setVendors] = useState<LinkedVendor[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [thread, setThread] = useState<VendorChatMessage[]>([]);
  const load = () => vendorChatApi.list(wid).then((r) => setVendors(r.vendors), () => setVendors([]));
  useEffect(() => {
    void load();
  }, [wid]); // eslint-disable-line
  if (!vendors?.length) return null;
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
