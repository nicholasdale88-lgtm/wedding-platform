import { useEffect, useRef, useState } from 'react';
import type { VendorChatMessage } from './api';

/**
 * A conversation between a vendor and a couple: the messages, newest at the bottom, and a box to write.
 * `mine` says which side is reading (their messages sit on the right).
 */
export function ChatThread({
  messages,
  mine,
  other,
  onSend,
  empty,
}: {
  messages: VendorChatMessage[];
  mine: 'vendor' | 'couple';
  other: string;
  onSend: (body: string) => Promise<void>;
  empty: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView?.({ block: 'nearest' }), [messages.length]);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setProblem('');
    try {
      await onSend(text.trim());
      setText('');
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div role="log" aria-label={`Messages with ${other}`} className="flex flex-col gap-2 max-h-[420px] overflow-y-auto p-3 rounded-[14px] bg-white border border-[#e2d7bc]">
        {!messages.length && <p className="m-0 text-[14px] text-[#5b6a52]">{empty}</p>}
        {messages.map((m) => {
          const own = (mine === 'vendor') === m.fromVendor;
          return (
            <div key={m.id} className={`flex flex-col gap-[2px] max-w-[85%] ${own ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className={`py-2 px-3 rounded-[14px] text-[15px] whitespace-pre-line ${own ? 'bg-[#33402f] text-[#fbf8f2]' : 'bg-[#f3ecd6] text-[#33402f]'}`}>{m.body}</div>
              <span className="text-[11px] text-[#7a7466]">
                {own ? 'You' : other} · {new Date(m.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <label className="flex flex-col gap-1 text-[14px]">
        <span className="sr-only">Write to {other}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
          }}
          rows={3}
          maxLength={4000}
          placeholder={`Write to ${other}…`}
          className="w-full py-[10px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[16px]"
        />
      </label>
      {problem && (
        <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">
          {problem}
        </p>
      )}
      <button type="button" disabled={busy || !text.trim()} onClick={() => void send()} className="self-start py-[10px] px-5 rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[15px] cursor-pointer disabled:opacity-60">
        {busy ? 'Sending…' : 'Send'}
      </button>
      <span className="text-[12px] text-[#7a7466]">They get an email that a message is waiting, and reply here.</span>
    </div>
  );
}
