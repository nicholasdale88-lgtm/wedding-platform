import { useCallback, useEffect, useState } from 'react';
import { boardApi, type AdminBoard, type AdminBoardPost } from '../../lib/api';
import { fmtWhen } from '../../lib/format';
import { useAdmin } from '../Shell';
import { inputCls, Pill, useAutoRefresh, useToast } from '../ui';

/**
 * Account → Messages → Message board: the public wall on guests' pages. Turn it on or off, choose whether
 * posts wait for approval, then approve, hide, pin, delete and reply (as the couple) from here.
 */
type Show = 'all' | 'pending' | 'hidden';

export function BoardAdmin() {
  const { wid, overview } = useAdmin();
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const toast = useToast();
  const [b, setB] = useState<AdminBoard | null>(null);
  const [error, setError] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setB(await boardApi.get(wid));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  useAutoRefresh(load);

  const act = async (fn: () => Promise<AdminBoard>, done?: string) => {
    setBusy(true);
    try {
      setB(await fn());
      if (done) toast(done);
      return true;
    } catch (e) {
      toast((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!b) return <div aria-busy="true" className="text-[#5b6a52]">Loading the board…</div>;
  const { on, approve } = b.settings;
  const hidden = b.posts.filter((p) => p.status === 'hidden').length;
  const shown = b.posts.filter((p) => (show === 'all' ? p.status !== 'hidden' : p.status === show) || p.replies.some((r) => r.status === show));

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Board settings" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={on} disabled={busy} onChange={() => void act(() => boardApi.settings(wid, !on, approve), on ? 'Message board closed' : 'Message board open')} className="w-[18px] h-[18px] accent-[#5d6b47]" />
          <span>
            <span className="block font-medium">Message board is {on ? 'open' : 'closed'}</span>
            <span className="block text-[13px] text-[#5b6a52]">Guests reach it from “Message us” on their invitation and night-before page.</span>
          </span>
        </label>
        <label className={`flex items-center gap-3 ${on ? 'cursor-pointer' : 'opacity-50'}`}>
          <input type="checkbox" checked={approve} disabled={busy || !on} onChange={() => void act(() => boardApi.settings(wid, on, !approve), approve ? 'Posts now appear straight away' : 'New posts now wait for you')} className="w-[18px] h-[18px] accent-[#5d6b47]" />
          <span>
            <span className="block font-medium">Approve posts before they appear</span>
            <span className="block text-[13px] text-[#5b6a52]">Until you approve a post, only the guest who wrote it sees it.</span>
          </span>
        </label>
      </section>

      <section aria-label="Post to the board" className="flex flex-col gap-2">
        <textarea aria-label="Post to the board as the couple" rows={2} maxLength={800} value={text} placeholder="Post a message to everyone (as the couple)…" onChange={(e) => setText(e.target.value)} className={`${inputCls} resize-y`} />
        <Pill
          kind="primary"
          className="self-end"
          disabled={busy || !text.trim()}
          onClick={async () => {
            if (await act(() => boardApi.post(wid, text.trim()), 'Posted to the board')) setText('');
          }}
        >
          Post
        </Pill>
      </section>

      <div role="radiogroup" aria-label="Show" className="flex gap-2 flex-wrap">
        {(
          [
            ['all', 'On the board'],
            ['pending', `Waiting${b.pending ? ` (${b.pending})` : ''}`],
            ['hidden', `Hidden${hidden ? ` (${hidden})` : ''}`],
          ] as [Show, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={show === k}
            onClick={() => setShow(k)}
            className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${show === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794] text-[#33402f]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.map((p) => (
        <BoardItem key={p.id} p={p} tz={tz} busy={busy} act={act} />
      ))}
      {!shown.length && (
        <div className="py-6 border-t border-[#e2d7bc] text-[14px] text-[#5b6a52]">
          {show === 'pending' ? 'Nothing waiting for you.' : show === 'hidden' ? 'No hidden posts.' : 'No posts yet. When guests write on the board, their messages appear here.'}
        </div>
      )}
    </div>
  );
}

const STATUS: Record<AdminBoardPost['status'], string> = { shown: '', pending: 'Waiting for you', hidden: 'Hidden' };

function BoardItem({ p, tz, busy, act }: { p: AdminBoardPost; tz: string; busy: boolean; act: (fn: () => Promise<AdminBoard>, done?: string) => Promise<boolean> }) {
  const { wid } = useAdmin();
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const remove = (id: string, what: string) => {
    if (window.confirm(`Delete this ${what} for good?${what === 'post' ? ' Its replies go too.' : ''}`)) void act(() => boardApi.remove(wid, id), 'Deleted');
  };
  const controls = (x: AdminBoardPost, top: boolean) => (
    <div className="flex gap-3 flex-wrap text-[13px]">
      {x.status !== 'shown' && (
        <button type="button" disabled={busy} onClick={() => void act(() => boardApi.update(wid, x.id, { status: 'shown' }), 'On the board')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#3d4a2f] font-medium">
          {x.status === 'pending' ? 'Approve' : 'Show again'}
        </button>
      )}
      {x.status !== 'hidden' && (
        <button type="button" disabled={busy} onClick={() => void act(() => boardApi.update(wid, x.id, { status: 'hidden' }), 'Hidden from guests')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
          Hide
        </button>
      )}
      {top && (
        <button type="button" disabled={busy} onClick={() => void act(() => boardApi.update(wid, x.id, { pinned: !x.pinned }), x.pinned ? 'Unpinned' : 'Pinned to the top')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
          {x.pinned ? 'Unpin' : 'Pin'}
        </button>
      )}
      {top && (
        <button type="button" onClick={() => setReplying((r) => !r)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
          Reply
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => remove(x.id, top ? 'post' : 'reply')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]">
        Delete
      </button>
    </div>
  );
  const meta = (x: AdminBoardPost) => [fmtWhen(x.at, tz), x.likes ? `♥ ${x.likes}` : '', x.pinned ? 'Pinned' : '', STATUS[x.status]].filter(Boolean).join(' · ');

  return (
    <article className={`flex flex-col gap-2 p-4 rounded-[16px] border ${p.status === 'pending' ? 'border-[#c8a46a] bg-[#fdf6e6]' : p.status === 'hidden' ? 'border-dashed border-[#c6b794] opacity-70' : 'border-[#e2d7bc] bg-[#fbf8f0]'}`}>
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <span className="font-display text-[20px]">{p.couple ? `${p.author} (you)` : p.author}</span>
        <span className="text-[12px] text-[#7a7466]">{meta(p)}</span>
      </div>
      <p className="m-0 whitespace-pre-wrap break-words text-[15px] leading-[1.4]">{p.body}</p>
      {controls(p, true)}
      {p.replies.length > 0 && (
        <div className="flex flex-col gap-3 mt-1 pl-4 border-l-2 border-[#c8a46a]">
          {p.replies.map((r) => (
            <div key={r.id} className={`flex flex-col gap-1 ${r.status === 'hidden' ? 'opacity-60' : ''}`}>
              <span className="text-[13px] font-semibold">
                {r.couple ? `${r.author} (you)` : r.author} <span className="font-normal text-[#7a7466]">· {meta(r)}</span>
              </span>
              <span className="whitespace-pre-wrap break-words text-[14px]">{r.body}</span>
              {controls(r, false)}
            </div>
          ))}
        </div>
      )}
      {replying && (
        <div className="flex flex-col gap-2">
          <textarea aria-label={`Reply to ${p.author}`} rows={2} maxLength={800} value={reply} onChange={(e) => setReply(e.target.value)} className={`${inputCls} resize-y`} />
          <Pill
            kind="primary"
            className="self-end"
            disabled={busy || !reply.trim()}
            onClick={async () => {
              if (await act(() => boardApi.post(wid, reply.trim(), p.id), p.status === 'pending' ? 'Replied, and the post is approved' : 'Replied')) {
                setReply('');
                setReplying(false);
              }
            }}
          >
            Reply
          </Pill>
        </div>
      )}
    </article>
  );
}
