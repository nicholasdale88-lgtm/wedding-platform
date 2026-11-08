import { useEffect, useState } from 'react';
import { feedbackApi } from '../lib/api';
import { inputCls } from './ui';

const KINDS = [
  ['idea', 'An idea'],
  ['problem', 'Something’s wrong'],
  ['love', 'Something I love'],
] as const;

/**
 * Tell us: an idea, a problem or a love note, straight to the people who make the app (Company portal →
 * Feedback); and what's coming. On Help, and from the Feedback button on every admin page (`page` says where).
 */
export function TellUs({ wid, page = 'help', autoFocus = false }: { wid: string; page?: string; autoFocus?: boolean }) {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('idea');
  const [text, setText] = useState('');
  const [state, setState] = useState<'' | 'sending' | 'sent'>('');
  const [problem, setProblem] = useState('');
  const [after, setAfter] = useState<{ reward: number; reviewUrl: string } | null>(null);
  const [updates, setUpdates] = useState<{ text: string; done: boolean }[]>([]);
  useEffect(() => {
    feedbackApi.updates(wid).then((r) => setUpdates(r.updates), () => setUpdates([]));
  }, [wid]);
  const send = async () => {
    setState('sending');
    setProblem('');
    try {
      const r = await feedbackApi.send(wid, { kind, text, page: page.slice(0, 60) });
      setAfter({ reward: r.reward ?? 0, reviewUrl: r.reviewUrl ?? '' });
      setText('');
      setState('sent');
    } catch (e) {
      setProblem((e as Error).message);
      setState('');
    }
  };
  return (
    <section aria-label="Tell us" className="flex flex-col gap-3 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <h2 className="m-0 font-display font-medium text-[24px] leading-tight">Tell us</h2>
      <p className="m-0 text-[15px] text-[#5b6a52]">
        An idea, something that’s wrong, or something you love: it goes straight to the people who make the app. Your first feedback earns 100 free text credits, whatever you tell us.
      </p>
      <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="What is it?">
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`py-[7px] px-4 rounded-full border text-[14px] cursor-pointer ${kind === k ? 'border-[#33402f] bg-[#33402f] text-[#fbf8f2]' : 'border-[#c6b794] bg-white text-[#33402f]'}`}>
            {label}
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => (setText(e.target.value), setState(''))} rows={3} maxLength={2000} aria-label="Your message" placeholder="Tell us in a sentence or two" autoFocus={autoFocus} className={inputCls} />
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" disabled={text.trim().length < 3 || state === 'sending'} onClick={() => void send()} className="py-[9px] px-5 rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[15px] cursor-pointer disabled:opacity-50">
          {state === 'sending' ? 'Sending…' : 'Send'}
        </button>
        {state === 'sent' && (
          <span role="status" className="text-[15px]">
            Thank you, we read every one.{after?.reward ? ` ${after.reward} free text credits are now in your account.` : ''}
          </span>
        )}
        {problem && <span role="alert" className="text-[15px] text-[#7a4a37]">{problem}</span>}
      </div>
      {state === 'sent' && after?.reviewUrl && (
        <p className="m-0 text-[15px]">
          Happy with The Yes List? A Google review helps other couples find us.{' '}
          <a href={after.reviewUrl} target="_blank" rel="noopener noreferrer">
            Leave a review
          </a>
          . It’s entirely up to you, and nothing depends on it.
        </p>
      )}
      {updates.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-[13px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">Coming from your feedback</h3>
          <ul className="m-0 pl-5 text-[15px] leading-[1.5]">
            {updates.map((u) => (
              <li key={u.text}>
                {u.text}
                {u.done && <span className="text-[#5b6a52]"> · done</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
