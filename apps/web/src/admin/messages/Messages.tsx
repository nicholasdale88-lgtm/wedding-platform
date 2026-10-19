import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { messagesApi, type Conversation, type MessageThread, type ThreadMessage } from '../../lib/api';
import { fmtWhen } from '../../lib/format';
import { useAdmin } from '../Shell';
import { BoardAdmin } from './Board';
import { Eyebrow, inputCls, Pill, useAutoRefresh, useMedia, useToast } from '../ui';

/**
 * Account → Messages: guests' messages of support and questions, Messenger-style. Conversations on the
 * left (newest first, unread marked), the chat on the right: their messages, their RSVP note and texts
 * they sent, and your replies. A reply shows on their page and can also go as a text.
 */

type Filter = 'all' | 'unread' | 'question' | 'support';
const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['unread', 'Unread'],
  ['question', 'Questions'],
  ['support', 'Support'],
];
const VIA: Record<ThreadMessage['via'], string> = { page: '', rsvp: 'With their RSVP', sms: 'By text', reply: '' };

export function Messages() {
  const { wid, overview, reload: reloadNav } = useAdmin();
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const wide = useMedia('(min-width: 900px)');
  const [params, setParams] = useSearchParams();
  const open = params.get('c');
  const [threads, setThreads] = useState<MessageThread[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      setThreads((await messagesApi.list(wid)).threads);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  useAutoRefresh(load); // new messages appear by themselves

  const shown = useMemo(
    () => (threads ?? []).filter((t) => (filter === 'all' ? true : filter === 'unread' ? t.unread > 0 : t.kinds.includes(filter))),
    [threads, filter],
  );
  const setOpen = (inv: string | null) => {
    const n = new URLSearchParams(params);
    if (inv) n.set('c', inv);
    else n.delete('c');
    setParams(n, { replace: true });
  };

  const board = params.get('view') === 'board';
  const setView = (v: 'chats' | 'board') => {
    const n = new URLSearchParams();
    if (v === 'board') n.set('view', 'board');
    setParams(n, { replace: true });
  };
  const tabs = (
    <div role="tablist" aria-label="Messages" className="flex gap-6 border-b border-[#e2d7bc]">
      {(
        [
          ['chats', 'Conversations'],
          ['board', 'Message board'],
        ] as const
      ).map(([k, label]) => {
        const sel = (k === 'board') === board;
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={sel}
            onClick={() => setView(k)}
            className={`py-2 px-0 border-0 border-b-2 bg-transparent text-[15px] cursor-pointer -mb-px ${sel ? 'border-[#33402f] font-semibold text-[#33402f]' : 'border-transparent text-[#5b6a52]'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
  if (board) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <Eyebrow>Account · Messages</Eyebrow>
          <h1 className="m-0 mt-[6px] font-display font-medium text-[40px] leading-[1.08]">Message board</h1>
        </header>
        {tabs}
        <BoardAdmin />
      </div>
    );
  }
  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!threads) return <div aria-busy="true" className="text-[#5b6a52]">Loading messages…</div>;
  const unread = threads.reduce((n, t) => n + t.unread, 0);

  const list = (
    <div className="flex flex-col min-w-0">
      <div role="radiogroup" aria-label="Show" className="flex gap-2 flex-wrap pb-3">
        {FILTERS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={filter === k}
            onClick={() => setFilter(k)}
            className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${filter === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794] text-[#33402f]'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.map((t) => (
        <button
          key={t.invitationId}
          type="button"
          onClick={() => setOpen(t.invitationId)}
          aria-current={open === t.invitationId ? 'true' : undefined}
          className={`grid grid-cols-[38px_minmax(0,1fr)_auto] gap-3 items-center py-3 px-2 border-0 border-t border-solid border-[#e2d7bc] text-left cursor-pointer ${open === t.invitationId ? 'bg-[#efe7d3]' : 'bg-transparent hover:bg-[#f3ecd6]'}`}
        >
          <span aria-hidden className="w-[38px] h-[38px] rounded-full bg-[#33402f] text-[#f3ecd6] flex items-center justify-center font-display text-[18px]">
            {t.name.charAt(0)}
          </span>
          <span className="min-w-0">
            <span className={`block truncate ${t.unread ? 'font-semibold' : ''}`}>{t.name}</span>
            <span className="block truncate text-[13px] text-[#5b6a52]">
              {t.last.from === 'couple' ? 'You: ' : ''}
              {t.last.body}
            </span>
          </span>
          <span className="flex flex-col items-end gap-1">
            <span className="text-[12px] text-[#7a7466] whitespace-nowrap">{fmtWhen(t.last.at, tz)}</span>
            {t.unread > 0 && <span className="min-w-[20px] h-[20px] px-[6px] rounded-full bg-[#7a4a37] text-white text-[12px] flex items-center justify-center">{t.unread}</span>}
          </span>
        </button>
      ))}
      {!shown.length && (
        <div className="py-6 border-t border-[#e2d7bc] text-[14px] text-[#5b6a52]">
          {threads.length ? 'Nothing here with this filter.' : 'No messages yet. When guests write to you from their invitation or night-before page, or leave a note with their RSVP, it shows up here.'}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Eyebrow>Account · Messages{unread ? ` · ${unread} unread` : ''}</Eyebrow>
        <h1 className="m-0 mt-[6px] font-display font-medium text-[40px] leading-[1.08]">Messages from guests</h1>
      </header>
      {tabs}
      {wide ? (
        <div className="grid grid-cols-[minmax(260px,360px)_minmax(0,1fr)] gap-6 items-start">
          {list}
          {open ? (
            <Chat key={open} inv={open} tz={tz} onChanged={() => void Promise.all([load(), reloadNav()])} />
          ) : (
            <div className="p-8 rounded-[16px] border border-dashed border-[#c6b794] text-[#5b6a52]">Choose a conversation to read and reply.</div>
          )}
        </div>
      ) : open ? (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setOpen(null)} className="self-start p-0 border-0 bg-transparent text-[14px] underline cursor-pointer text-[#33402f]">
            ← All messages
          </button>
          <Chat key={open} inv={open} tz={tz} onChanged={() => void Promise.all([load(), reloadNav()])} />
        </div>
      ) : (
        list
      )}
    </div>
  );
}

function Chat({ inv, tz, onChanged }: { inv: string; tz: string; onChanged: () => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [c, setC] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [sms, setSms] = useState(false);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const conv = await messagesApi.open(wid, inv);
      setC(conv);
      onChanged(); // opening it read it: the unread counts update
    } catch (e) {
      toast((e as Error).message);
    }
  }, [wid, inv]); // eslint-disable-line
  useEffect(() => void load(), [load]);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [c?.messages.length]);

  const send = async () => {
    if (!text.trim() || !c) return;
    setBusy(true);
    try {
      const r = await messagesApi.reply(wid, inv, text.trim(), sms && c.canText);
      setC({ ...c, messages: r.messages });
      setText('');
      toast(r.sentSms ? 'Reply sent, and texted to them' : 'Reply sent: they will see it on their page');
      onChanged();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!c) return <div aria-busy="true" className="text-[#5b6a52]">Opening…</div>;
  return (
    <section aria-label={`Conversation with ${c.name}`} className="flex flex-col rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] min-h-[420px]">
      <div className="py-3 px-4 border-b border-[#e2d7bc] font-display text-[22px]">{c.name}</div>
      <div className="flex-1 flex flex-col gap-2 p-4 overflow-y-auto max-h-[60vh]">
        {c.messages.map((m) => (
          <div key={m.id} className={`flex flex-col max-w-[80%] ${m.from === 'couple' ? 'self-end items-end' : 'self-start items-start'}`}>
            <div
              className={`py-2 px-3 rounded-[18px] whitespace-pre-wrap break-words text-[15px] leading-[1.35] ${
                m.from === 'couple' ? 'bg-[#33402f] text-[#f3ecd6] rounded-br-[6px]' : 'bg-white text-[#33402f] rounded-bl-[6px] shadow-[0_1px_2px_rgba(0,0,0,.08)]'
              }`}
            >
              {m.body}
            </div>
            <span className="mt-[2px] text-[11px] text-[#7a7466]">
              {[fmtWhen(m.at, tz), VIA[m.via], m.kind === 'question' ? 'Question' : m.kind === 'support' ? 'Support' : '', m.sentSms ? 'Also texted' : ''].filter(Boolean).join(' · ')}
            </span>
          </div>
        ))}
        {!c.messages.length && <div className="text-[14px] text-[#5b6a52]">No messages yet. Write the first one.</div>}
        <div ref={end} />
      </div>
      <div className="flex flex-col gap-2 p-3 border-t border-[#e2d7bc]">
        <textarea
          aria-label="Your reply"
          rows={2}
          value={text}
          placeholder="Write a reply…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
          }}
          className={`${inputCls} resize-y`}
        />
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <label className={`flex items-center gap-2 text-[13px] ${c.canText ? 'cursor-pointer' : 'opacity-50'}`} title={c.canText ? '' : 'They have no mobile, opted out of texts, or texting isn’t set up yet'}>
            <input type="checkbox" disabled={!c.canText} checked={sms && c.canText} onChange={() => setSms((x) => !x)} className="w-[16px] h-[16px] accent-[#5d6b47]" />
            Also send as a text
          </label>
          <Pill kind="primary" disabled={busy || !text.trim()} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Send'}
          </Pill>
        </div>
      </div>
    </section>
  );
}
