import { useState, type ReactNode } from 'react';

/** Links in a text, drawn as the phone draws them (blue, underlined). */
function withLinks(text: string, colour: string): ReactNode[] {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <span key={i} style={{ color: colour, textDecoration: 'underline', wordBreak: 'break-all' }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * A text message as the guest will see it: on an iPhone (Messages) or an Android phone (Google Messages),
 * from your sender name, with links drawn as links and the time it arrives.
 */
export function SmsPhone({ sender, to, text, parts }: { sender: string; to: string; text: string; parts?: number | null }) {
  const [kind, setKind] = useState<'iphone' | 'android'>(() => (/android/i.test(navigator.userAgent) ? 'android' : 'iphone'));
  const now = new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
  const initial = (sender.trim()[0] ?? '?').toUpperCase();
  const ios = kind === 'iphone';
  return (
    <div className="flex flex-col items-center gap-2">
      <div role="radiogroup" aria-label="Phone" className="flex gap-1 p-1 rounded-full bg-[#efe7d3] text-[12px]">
        {(
          [
            ['iphone', 'iPhone'],
            ['android', 'Android'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`py-1 px-3 rounded-full border-0 cursor-pointer ${kind === k ? 'bg-[#33402f] text-[#f3ecd6]' : 'bg-transparent text-[#33402f]'}`}>
            {label}
          </button>
        ))}
      </div>
      <figure aria-label={`Text preview on ${ios ? 'an iPhone' : 'an Android phone'}`} className="m-0 relative w-[270px] rounded-[44px] p-[10px] shadow-[0_18px_40px_rgba(0,0,0,.25)]" style={{ background: ios ? '#1d1d1f' : '#202124' }}>
        <div className="relative rounded-[34px] overflow-hidden flex flex-col h-[500px]" style={{ background: ios ? '#ffffff' : '#f8f9fc', fontFamily: ios ? "-apple-system, 'SF Pro Text', system-ui, sans-serif" : "Roboto, 'Google Sans', system-ui, sans-serif" }}>
          {/* Status bar */}
          <div className="flex justify-between items-center px-6 pt-3 pb-1 text-[12px] font-semibold text-black">
            <span>{now.replace(/(am|pm)$/, '')}</span>
            {ios ? <span className="absolute left-1/2 -translate-x-1/2 top-[9px] w-[84px] h-[24px] rounded-full bg-black" /> : <span className="absolute left-1/2 -translate-x-1/2 top-[10px] w-[10px] h-[10px] rounded-full bg-black" />}
            <span className="flex items-center gap-1 text-[11px]">
              <span aria-hidden>▂▄▆</span>
              <span aria-hidden className="inline-block w-[20px] h-[10px] rounded-[3px] border border-black/70 relative">
                <span className="absolute inset-[1px] right-[5px] bg-black rounded-[1px]" />
              </span>
            </span>
          </div>
          {/* Conversation header */}
          {ios ? (
            <div className="flex flex-col items-center gap-1 pt-2 pb-2 border-b border-black/10 bg-[#f6f6f8]">
              <span className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-white text-[18px] font-semibold" style={{ background: 'linear-gradient(#a1a6b4,#868a96)' }}>
                {initial}
              </span>
              <span className="text-[11px] text-black">{sender} ›</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-3 border-b border-black/5">
              <span aria-hidden className="text-[18px] text-[#444]">←</span>
              <span className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-white text-[15px] font-medium bg-[#7b61b5]">{initial}</span>
              <span className="text-[15px] text-[#1f1f1f] truncate">{sender}</span>
            </div>
          )}
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-1">
            <div className="text-center text-[10px] text-[#8e8e93] mb-1">{ios ? `Text Message · Today ${now}` : `Today · ${now}`}</div>
            <div
              className="self-start max-w-[82%] py-[8px] px-[12px] text-[14px] leading-[1.3] whitespace-pre-wrap break-words"
              style={ios ? { background: '#e9e9eb', color: '#000', borderRadius: '18px 18px 18px 6px' } : { background: '#e8eaf0', color: '#1f1f1f', borderRadius: '20px 20px 20px 6px' }}
            >
              {text ? withLinks(text, ios ? '#0a63d6' : '#1a5fd0') : '…'}
            </div>
            {!ios && <div className="text-[10px] text-[#5f6368] ml-2">{now}</div>}
          </div>
          {/* Reply box */}
          <div className="flex items-center gap-2 px-3 pb-4 pt-2">
            <span className="flex-1 py-[7px] px-3 rounded-full text-[12px]" style={ios ? { border: '1px solid #d1d1d6', color: '#8e8e93' } : { background: '#e8eaf0', color: '#5f6368' }}>
              {ios ? 'Text Message' : 'RCS message'}
            </span>
          </div>
        </div>
      </figure>
      <div className="text-[12px] text-[#7a7466] text-center">
        To {to}
        {parts ? ` · ${parts} ${parts === 1 ? 'part' : 'parts'} (each part is charged)` : ''}
      </div>
    </div>
  );
}
