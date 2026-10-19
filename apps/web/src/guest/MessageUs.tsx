import { useCallback, useEffect, useRef, useState } from 'react';
import { guestApi } from './invitation/api';

/**
 * "Message us" on a guest's own pages (invitation, night-before): send the couple a message of support
 * or a question, and see their replies (Messenger-style). Only with the guest's own link. Checks for
 * new replies every 30 seconds while open.
 */
type Kind = 'support' | 'question' | 'song';
interface Msg {
  id: string;
  from: 'guest' | 'couple';
  body: string;
  at: string;
}

/**
 * Cream text needs a dark enough ink behind it (4.5:1): a light theme colour is darkened until it is.
 */
function readableInk(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1]!.slice(i, i + 2), 16));
  const lum = (x: number) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const cream = 0.94; // #fbf8f2
  for (let i = 0; i < 10; i++) {
    const L = 0.2126 * lum(r!) + 0.7152 * lum(g!) + 0.0722 * lum(b!);
    if ((cream + 0.05) / (L + 0.05) >= 4.5) break;
    [r, g, b] = [r!, g!, b!].map((x) => Math.round(x * 0.85));
  }
  return `#${[r!, g!, b!].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

export function MessageUs({ slug, token, ink: themeInk = '#33402f', side = 'left' }: { slug: string; token: string; ink?: string; side?: 'left' | 'right' }) {
  const ink = readableInk(themeInk);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [couple, setCouple] = useState('');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<Kind>('support');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await guestApi.messages(slug, token);
      setMsgs(r.messages);
      setCouple(r.couple);
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [slug, token]);
  useEffect(() => {
    if (!open) return;
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [open, load]);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [msgs?.length, open]);
  // A proper dialog: Escape closes it, the page behind doesn't scroll, focus goes back to the button.
  const opener = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    box.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener('keydown', onKey);
      setTimeout(() => opener.current?.focus(), 0); // the button is back on the page after this render
    };
  }, [open]);

  const [artist, setArtist] = useState('');
  const [songNote, setSongNote] = useState('');
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setErr('');
    setSongNote('');
    try {
      if (kind === 'song') {
        await guestApi.requestSong(slug, token, text.trim(), artist.trim());
        setSongNote(`Added “${text.trim()}” to the list for the DJ. Thank you!`);
        setText('');
        setArtist('');
        return;
      }
      await guestApi.sendMessage(slug, token, text.trim(), kind);
      setText('');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const font = { fontFamily: "'Cormorant Garamond', Georgia, serif" };
  if (!open) {
    return (
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed z-40 bottom-[max(16px,env(safe-area-inset-bottom))] ${side === 'left' ? 'left-4' : 'right-4'} py-[10px] px-4 rounded-full border-0 text-[16px] cursor-pointer shadow-[0_6px_18px_rgba(30,30,30,.2)]`}
        style={{ ...font, background: ink, color: '#fbf8f2' }}
      >
        Message us
      </button>
    );
  }
  return (
    <div role="dialog" aria-modal="true" aria-label="Messages" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35" onClick={() => setOpen(false)}>
      <div
        className="w-full sm:w-[420px] max-h-[86vh] flex flex-col rounded-t-[22px] sm:rounded-[22px] bg-[#fbf8f2] shadow-[0_-10px_30px_rgba(0,0,0,.2)]"
        style={{ ...font, color: ink }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center py-3 px-5 border-b border-[#e2d7bc]">
          <div className="flex flex-col">
            <div className="text-[22px]">{couple || 'Message us'}</div>
            <a href={`/w/${encodeURIComponent(slug)}/board?g=${encodeURIComponent(token)}`} className="text-[15px] underline" style={{ color: ink }}>
              Or write on the message board for everyone →
            </a>
          </div>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="w-9 h-9 rounded-full border-0 bg-transparent text-[24px] cursor-pointer" style={{ color: ink }}>
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col gap-2 p-4 min-h-[180px]">
          {msgs === null && !err && <div className="text-[16px] opacity-70">Opening…</div>}
          {msgs?.length === 0 && <div className="text-[17px] italic opacity-80">Send us a message of support, or ask us anything. We'll reply here.</div>}
          {msgs?.map((m) => (
            <div key={m.id} className={`max-w-[82%] py-2 px-3 rounded-[18px] whitespace-pre-wrap break-words text-[17px] leading-[1.3] ${m.from === 'guest' ? 'self-end rounded-br-[6px]' : 'self-start rounded-bl-[6px] bg-white shadow-[0_1px_2px_rgba(0,0,0,.08)]'}`} style={m.from === 'guest' ? { background: ink, color: '#fbf8f2' } : undefined}>
              {m.body}
            </div>
          ))}
          <div ref={end} />
        </div>
        <div className="flex flex-col gap-2 p-3 border-t border-[#e2d7bc] pb-[max(12px,env(safe-area-inset-bottom))]">
          <div role="radiogroup" aria-label="Kind of message" className="flex gap-2 flex-wrap">
            {(
              [
                ['support', 'Message of support'],
                ['question', 'A question'],
                ['song', 'Request a song'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className="py-[5px] px-3 rounded-full border text-[15px] cursor-pointer"
                style={kind === k ? { background: ink, color: '#fbf8f2', borderColor: ink } : { background: 'transparent', color: ink, borderColor: 'rgba(0,0,0,.2)' }}
              >
                {label}
              </button>
            ))}
          </div>
          {err && <div role="alert" className="text-[15px] text-[#8a5a45]">{err}</div>}
          {songNote && (
            <div role="status" className="text-[15px] italic">
              {songNote}
            </div>
          )}
          {kind === 'song' && (
            <input
              aria-label="Who sings it"
              value={artist}
              maxLength={120}
              placeholder="Who sings it (if you know)"
              onChange={(e) => setArtist(e.target.value)}
              className="py-2 px-3 rounded-[14px] border border-[#d3c6a4] bg-white text-[17px]"
              style={{ ...font, color: ink }}
            />
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={box}
              aria-label={kind === 'song' ? 'The song' : 'Your message'}
              rows={kind === 'song' ? 1 : 2}
              maxLength={kind === 'song' ? 120 : 1000}
              value={text}
              placeholder={kind === 'song' ? 'The song you’d love to dance to' : kind === 'question' ? 'Ask us anything…' : 'Write your message…'}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 min-w-0 py-2 px-3 rounded-[14px] border border-[#d3c6a4] bg-white text-[17px] resize-none"
              style={{ ...font, color: ink }}
            />
            <button type="button" disabled={busy || !text.trim()} onClick={() => void send()} className="py-[10px] px-4 rounded-full border-0 text-[16px] cursor-pointer disabled:opacity-40" style={{ background: ink, color: '#fbf8f2' }}>
              {busy ? '…' : kind === 'song' ? 'Request' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
