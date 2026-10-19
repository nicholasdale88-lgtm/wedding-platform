import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { GuestMessage } from '../GuestMessage';

/**
 * /w/:slug/quiz?g=<token>: "How well do you know the couple?" One question at a time, big and easy to
 * tap; then your score, the right answers and the leaderboard. One go each.
 */
interface Played {
  answers: number[];
  score: number;
  right: number[];
}
interface Data {
  couple: string;
  title: string;
  first: string;
  questions: { id: string; q: string; options: string[] }[];
  played: Played | null;
  leaders: { name: string; score: number }[];
}

export function QuizPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [at, setAt] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    fetch(`/api/p/${encodeURIComponent(slug)}/quiz?g=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const b = (await r.json()) as Data & { error?: { message: string } };
        if (!r.ok) throw new Error(b.error?.message ?? 'The quiz isn’t open yet.');
        setD(b);
      })
      .catch((e: Error) => setErr(e.message));
  }, [slug, token]);
  if (err) return <GuestMessage message={err} />;
  if (!d) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const ink = '#33402f';
  const gold = '#b39563';

  const send = async (answers: number[]) => {
    setSending(true);
    try {
      const r = await fetch(`/api/p/${encodeURIComponent(slug)}/quiz`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, answers }) });
      const b = (await r.json()) as { played?: Played; leaders?: Data['leaders']; error?: { message: string } };
      if (!r.ok || !b.played) throw new Error(b.error?.message ?? 'That didn’t send. Try again.');
      setD({ ...d, played: b.played, leaders: b.leaders ?? [] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  const total = d.questions.length;

  return (
    <main className="min-h-screen flex flex-col items-center px-5 py-10" style={{ background: '#f6f0e2', color: ink, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      <div className="w-full max-w-[520px] flex flex-col gap-5">
        <header className="text-center flex flex-col gap-1">
          <div className="text-[13px] tracking-[.3em] uppercase font-semibold opacity-80" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            {d.couple}
          </div>
          <h1 className="m-0 font-normal text-[40px] leading-[1.1]" style={{ fontFamily: "'Pinyon Script', cursive" }}>
            {d.title}
          </h1>
        </header>

        {d.played ? (
          <section aria-label="Your score" className="flex flex-col gap-4">
            <div className="text-center p-6 rounded-[20px] text-[#fbf8f2]" style={{ background: ink }}>
              <div className="text-[16px] italic opacity-80">{d.first}, you got</div>
              <div className="text-[64px] leading-none">
                {d.played.score}
                <span className="text-[28px] opacity-70"> / {total}</span>
              </div>
              <div className="text-[18px] italic mt-1">{d.played.score === total ? 'Perfect! You really know them.' : d.played.score >= total / 2 ? 'Not bad at all!' : 'Time to catch up with them at the wedding!'}</div>
            </div>
            <ol className="list-none m-0 p-0 flex flex-col gap-2">
              {d.questions.map((q, i) => {
                const mine = d.played!.answers[i];
                const right = d.played!.right[i];
                return (
                  <li key={q.id} className="p-3 rounded-[14px] bg-white/80 text-[17px]">
                    <div className="font-semibold">{q.q}</div>
                    <div>
                      {mine === right ? '✓ ' : '✗ '}
                      {right !== undefined ? q.options[right] : ''}
                      {mine !== right && mine !== undefined && mine >= 0 && <span className="opacity-60"> (you said {q.options[mine]})</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
            {d.leaders.length > 0 && (
              <section aria-label="Leaderboard" className="flex flex-col gap-1 p-4 rounded-[16px] bg-white/80">
                <h2 className="m-0 font-normal text-[26px]">Leaderboard</h2>
                {d.leaders.map((l, i) => (
                  <div key={`${l.name}-${i}`} className="flex justify-between text-[18px]">
                    <span>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {l.name}
                    </span>
                    <span className="opacity-75">{l.score}</span>
                  </div>
                ))}
              </section>
            )}
          </section>
        ) : (
          <section aria-label={`Question ${at + 1} of ${total}`} className="flex flex-col gap-4">
            <div className="h-[6px] rounded-full bg-black/10 overflow-hidden">
              <div className="h-full transition-[width] duration-300" style={{ width: `${(at / total) * 100}%`, background: gold }} />
            </div>
            <div className="text-[14px] tracking-[.2em] uppercase opacity-70 text-center" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              Question {at + 1} of {total}
            </div>
            <h2 className="m-0 font-normal text-[30px] text-center leading-tight">{d.questions[at]!.q}</h2>
            <div className="flex flex-col gap-2">
              {d.questions[at]!.options.map((o, j) => (
                <button
                  key={j}
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    const next = [...picks];
                    next[at] = j;
                    setPicks(next);
                    if (at + 1 < total) setAt(at + 1);
                    else void send(next);
                  }}
                  className="py-4 px-5 rounded-[16px] border-2 bg-white text-[20px] cursor-pointer text-left hover:border-current"
                  style={{ borderColor: 'rgba(0,0,0,.1)', color: ink }}
                >
                  {o}
                </button>
              ))}
            </div>
            {at > 0 && (
              <button type="button" onClick={() => setAt(at - 1)} className="self-center p-0 border-0 bg-transparent underline cursor-pointer text-[16px]" style={{ color: ink }}>
                ← Back
              </button>
            )}
          </section>
        )}
        <a href={`/w/${encodeURIComponent(slug)}?g=${encodeURIComponent(token)}`} className="self-center text-[16px] underline" style={{ color: ink }}>
          Your invitation
        </a>
      </div>
    </main>
  );
}
