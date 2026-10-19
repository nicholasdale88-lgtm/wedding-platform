import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { THEMES } from '../generated/themes';
import { GuestMessage } from '../GuestMessage';
import { guestApi, type BoardPayload, type BoardPost } from '../invitation/api';

/**
 * /w/:slug/board?g=<token>: the message board. Guests leave messages of support for everyone to read,
 * heart each other's posts and reply; the couple's replies and pinned posts stand out. New posts may
 * wait for the couple's approval (only the author sees them meanwhile). Refreshes every 30 seconds.
 */
const when = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
};

export function BoardPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [data, setData] = useState<BoardPayload | null>(null);
  const [theme, setTheme] = useState<Record<string, string | undefined>>({});
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await guestApi.board(slug, token));
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [slug, token]);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);
  // The wedding's colours (from the invitation's theme).
  useEffect(() => {
    guestApi
      .invite(slug, token || null, true)
      .then((p) => setTheme(THEMES[p.wedding.theme] ?? {}))
      .catch(() => {});
  }, [slug, token]);
  useEffect(() => {
    if (data) document.title = `${data.couple} · message board`;
  }, [data]);

  if (err && !data) return <GuestMessage message={err} />;
  if (!data) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  const ink = theme.dg ?? '#33402f';
  const bg = theme.iv ?? '#f6f0e2';
  const gold = theme.acc ?? '#b39563';

  const post = async (body: string, parent?: string) => {
    setBusy(true);
    try {
      const r = await guestApi.boardPost(slug, token, body, parent);
      setNote(r.pending ? 'Thank you! Your message will appear once the couple has seen it.' : '');
      await load();
      return true;
    } catch (e) {
      setNote((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen" style={{ background: bg, color: ink, fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      <div className="max-w-[640px] mx-auto px-5 pt-12 pb-24 flex flex-col gap-6">
        <header className="text-center flex flex-col gap-2">
          <div className="text-[13px] tracking-[.3em] uppercase font-semibold opacity-80">{data.couple}</div>
          <h1 className="m-0 font-normal text-[52px] leading-[1.1]" style={{ fontFamily: "'Pinyon Script', cursive" }}>
            Message board
          </h1>
          <span aria-hidden className="mx-auto w-16 h-[2px]" style={{ background: gold }} />
          <p className="m-0 text-[19px] italic opacity-85">Leave a message for {data.couple} and everyone celebrating.</p>
          <a href={`/w/${encodeURIComponent(slug)}?g=${encodeURIComponent(token)}`} className="text-[16px] underline" style={{ color: ink }}>
            ← Back to your invitation
          </a>
        </header>

        {!data.on ? (
          <p className="text-center text-[20px] italic">The message board is closed for now.</p>
        ) : (
          <>
            <section aria-label="Write a message" className="flex flex-col gap-2 p-4 rounded-[18px] bg-white/70 border" style={{ borderColor: 'rgba(0,0,0,.08)' }}>
              <label className="text-[13px] tracking-[.2em] uppercase font-semibold opacity-80" htmlFor="board-new">
                From {data.me || 'you'}
              </label>
              <textarea
                id="board-new"
                rows={3}
                maxLength={800}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Your message of love and support…"
                className="w-full py-2 px-3 rounded-[12px] border bg-white text-[19px] resize-y"
                style={{ borderColor: 'rgba(0,0,0,.15)', color: ink, fontFamily: 'inherit' }}
              />
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <span className="text-[15px] italic opacity-75">{data.approve ? 'The couple will see it before it appears.' : 'Everyone with an invitation can read it.'}</span>
                <button
                  type="button"
                  disabled={busy || !text.trim()}
                  onClick={async () => {
                    if (await post(text.trim())) setText('');
                  }}
                  className="py-[10px] px-6 rounded-full border-0 text-[18px] cursor-pointer disabled:opacity-40"
                  style={{ background: ink, color: '#fbf8f2' }}
                >
                  {busy ? 'Posting…' : 'Post'}
                </button>
              </div>
              {note && (
                <div role="status" className="text-[16px] italic">
                  {note}
                </div>
              )}
            </section>

            {data.posts.map((p) => (
              <Post key={p.id} p={p} ink={ink} gold={gold} onReply={(body) => post(body, p.id)} slug={slug} token={token} onChanged={load} />
            ))}
            {!data.posts.length && <p className="text-center text-[19px] italic opacity-75">Be the first to leave a message.</p>}
          </>
        )}
      </div>
    </main>
  );
}

function Post({
  p,
  ink,
  gold,
  onReply,
  slug,
  token,
  onChanged,
}: {
  p: BoardPost;
  ink: string;
  gold: string;
  onReply: (body: string) => Promise<boolean>;
  slug: string;
  token: string;
  onChanged: () => Promise<void>;
}) {
  const [likes, setLikes] = useState({ n: p.likes, mine: p.liked });
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const like = async () => {
    try {
      const r = await guestApi.boardLike(slug, token, p.id);
      setLikes({ n: r.likes, mine: r.liked });
    } catch {
      /* try again later */
    }
  };
  const remove = async () => {
    if (!window.confirm('Remove your message from the board?')) return;
    try {
      await guestApi.boardRemove(slug, token, p.id);
      await onChanged();
    } catch {
      /* already gone */
    }
  };
  return (
    <article
      className="flex flex-col gap-2 p-5 rounded-[18px] border"
      style={{ background: p.couple ? ink : 'rgba(255,255,255,.82)', color: p.couple ? '#fbf8f2' : ink, borderColor: p.pinned ? gold : 'rgba(0,0,0,.08)' }}
    >
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <span className="text-[22px]" style={p.couple ? { fontFamily: "'Pinyon Script', cursive", fontSize: 28 } : undefined}>
          {p.author}
        </span>
        <span className="text-[14px] opacity-70">
          {p.pinned ? '📌 ' : ''}
          {when(p.at)}
        </span>
      </div>
      <p className="m-0 text-[20px] leading-[1.35] whitespace-pre-wrap break-words">{p.body}</p>
      {p.pending && <div className="text-[15px] italic opacity-80">Waiting for the couple to see it. Only you can see it for now.</div>}
      {!p.pending && (
        <div className="flex gap-4 items-center text-[16px]">
          <button type="button" onClick={() => void like()} aria-pressed={likes.mine} className="p-0 border-0 bg-transparent cursor-pointer text-[17px]" style={{ color: 'inherit' }}>
            {likes.mine ? '♥' : '♡'} {likes.n || ''}
          </button>
          <button type="button" onClick={() => setReplying((x) => !x)} className="p-0 border-0 bg-transparent cursor-pointer underline text-[16px]" style={{ color: 'inherit' }}>
            Reply
          </button>
          {p.mine && (
            <button type="button" onClick={() => void remove()} className="p-0 border-0 bg-transparent cursor-pointer underline text-[15px] opacity-75" style={{ color: 'inherit' }}>
              Remove
            </button>
          )}
        </div>
      )}
      {p.replies.length > 0 && (
        <div className="flex flex-col gap-2 mt-1 pl-4 border-l-2" style={{ borderColor: gold }}>
          {p.replies.map((r) => (
            <div key={r.id} className="flex flex-col">
              <span className="text-[15px] font-semibold">{r.couple ? `${r.author} ♥` : r.author}</span>
              <span className="text-[18px] whitespace-pre-wrap break-words">{r.body}</span>
              {r.pending && <span className="text-[14px] italic opacity-75">Waiting for the couple to see it.</span>}
            </div>
          ))}
        </div>
      )}
      {replying && (
        <div className="flex gap-2 items-end mt-1">
          <textarea
            rows={2}
            maxLength={800}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={`Reply to ${p.author}`}
            className="flex-1 min-w-0 py-2 px-3 rounded-[12px] border bg-white text-[17px] resize-none"
            style={{ borderColor: 'rgba(0,0,0,.15)', color: ink, fontFamily: 'inherit' }}
          />
          <button
            type="button"
            disabled={!text.trim()}
            onClick={async () => {
              if (await onReply(text.trim())) {
                setText('');
                setReplying(false);
              }
            }}
            className="py-2 px-4 rounded-full border-0 text-[16px] cursor-pointer disabled:opacity-40"
            style={p.couple ? { background: '#fbf8f2', color: ink } : { background: ink, color: '#fbf8f2' }}
          >
            Reply
          </button>
        </div>
      )}
    </article>
  );
}
