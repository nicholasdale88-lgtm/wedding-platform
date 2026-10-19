import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { THEMES } from '../generated/themes';

/**
 * /w/:slug/live?k=<code>: the live photo wall for the venue's screen (a laptop on the projector, or cast
 * to a TV). Guests' photos crossfade full screen, newest first, with messages from the board in between;
 * it picks up new ones every 20 seconds and shows them next (it never jumps back). Tap or press F for full screen.
 */

interface Wall {
  couple: string;
  theme: string;
  photos: { id: string; url: string; by: string; at: string }[];
  posts: { id: string; author: string; body: string; at: string }[];
}
type Slide = { kind: 'photo'; id: string; url: string; by: string } | { kind: 'post'; id: string; author: string; body: string };
const SHOW_MS = 7000;

export function LivePage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const k = params.get('k') ?? '';
  const [wall, setWall] = useState<Wall | null>(null);
  const [err, setErr] = useState('');
  const [i, setI] = useState(0);
  // The play order of photo ids: newest first to begin with; photos that arrive later go straight after the one on screen.
  const [order, setOrder] = useState<string[]>([]);
  const curId = useRef('');
  const lastPhoto = useRef('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/p/${encodeURIComponent(slug)}/live?k=${encodeURIComponent(k)}`);
      const body = (await res.json()) as Wall & { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? 'The photo wall is off.');
      setWall(body);
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [slug, k]);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!wall) return;
    setOrder((prev) => {
      const ids = wall.photos.map((p) => p.id);
      if (!prev.length) return ids;
      const now = new Set(ids);
      const kept = prev.filter((id) => now.has(id));
      const fresh = ids.filter((id) => !prev.includes(id));
      if (!fresh.length && kept.length === prev.length) return prev;
      const at = kept.indexOf(lastPhoto.current) + 1; // 0 when nothing has shown yet
      return [...kept.slice(0, at), ...fresh, ...kept.slice(at)];
    });
  }, [wall]);

  // Photos in play order, with a message from the board after every third one.
  const slides = useMemo<Slide[]>(() => {
    if (!wall) return [];
    const byId = new Map(wall.photos.map((p) => [p.id, p]));
    const out: Slide[] = [];
    let p = 0;
    order.forEach((id, n) => {
      const ph = byId.get(id);
      if (!ph) return;
      out.push({ kind: 'photo', id: ph.id, url: ph.url, by: ph.by });
      if (n % 3 === 2 && wall.posts.length) {
        const post = wall.posts[p++ % wall.posts.length]!;
        out.push({ kind: 'post', id: `${post.id}-after-${ph.id}`, author: post.author, body: post.body });
      }
    });
    if (!wall.photos.length) wall.posts.forEach((post) => out.push({ kind: 'post', id: post.id, author: post.author, body: post.body }));
    return out;
  }, [wall, order]);
  // New slides never move the screen: stay on the one showing.
  useEffect(() => {
    const at = slides.findIndex((s) => s.id === curId.current);
    if (at >= 0) setI(at);
    else setI((x) => (slides.length ? x % slides.length : 0));
  }, [slides]);
  useEffect(() => {
    const s = slides[i % Math.max(1, slides.length)];
    if (!s) return;
    curId.current = s.id;
    if (s.kind === 'photo') lastPhoto.current = s.id;
  }, [i, slides]);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), SHOW_MS);
    return () => clearInterval(t);
  }, [slides.length]);
  // The next photo loads before it's needed, so every change is a clean crossfade.
  useEffect(() => {
    const next = slides[(i + 1) % Math.max(1, slides.length)];
    if (next?.kind === 'photo') new Image().src = next.url;
  }, [i, slides]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') void document.documentElement.requestFullscreen?.().catch(() => undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const theme = THEMES[wall?.theme ?? ''] ?? {};
  const gold = theme.acc ?? '#b39563';
  if (err && !wall) {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-[#1b1d18] text-[#f3ecd6] text-center p-8" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
        <p className="text-[28px] italic max-w-[640px]">{err}</p>
      </main>
    );
  }
  return (
    <main
      className="fixed inset-0 overflow-hidden bg-[#141511] text-[#f3ecd6] cursor-pointer select-none"
      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
      onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}
    >
      {slides.map((s, n) => {
        const on = n === i % slides.length;
        return (
          <div key={s.id} aria-hidden={!on} className="absolute inset-0 transition-opacity duration-[1400ms] ease-in-out" style={{ opacity: on ? 1 : 0 }}>
            {s.kind === 'photo' ? (
              <>
                {/* The photo blurred behind, then the whole photo on top (nothing cropped, no black bars). */}
                <img src={on || n === (i + 1) % slides.length ? s.url : undefined} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-50" />
                <img src={on || n === (i + 1) % slides.length ? s.url : undefined} alt={s.by ? `Photo by ${s.by}` : 'A guest photo'} className={`absolute inset-0 w-full h-full object-contain ${on ? 'animate-[kb_7s_ease-out_forwards]' : ''}`} />
                {s.by && (
                  <div className="absolute bottom-[5vh] left-[4vw] py-2 px-5 rounded-full bg-black/45 text-[clamp(18px,2.4vw,34px)] italic">
                    Photo by {s.by}
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3vh] px-[10vw] text-center bg-[radial-gradient(ellipse_at_center,#2b3226_0%,#141511_70%)]">
                <span aria-hidden className="w-[80px] h-[2px]" style={{ background: gold }} />
                <p className="m-0 text-[clamp(30px,4.6vw,72px)] leading-[1.25] italic">“{s.body}”</p>
                <span className="text-[clamp(20px,2.6vw,40px)]" style={{ fontFamily: "'Pinyon Script', cursive", color: gold }}>
                  {s.author}
                </span>
              </div>
            )}
          </div>
        );
      })}
      {wall && !slides.length && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8">
          <div className="text-[clamp(48px,7vw,110px)]" style={{ fontFamily: "'Pinyon Script', cursive", color: gold }}>
            {wall?.couple}
          </div>
          <p className="m-0 text-[clamp(22px,3vw,40px)] italic">Share your photos from your invitation link, and watch them appear here.</p>
        </div>
      )}
      {wall && slides.length > 0 && (
        <div className="absolute top-[4vh] right-[4vw] text-[clamp(26px,3.4vw,52px)] drop-shadow-[0_2px_8px_rgba(0,0,0,.6)]" style={{ fontFamily: "'Pinyon Script', cursive" }}>
          {wall.couple}
        </div>
      )}
      <style>{'@keyframes kb { from { transform: scale(1) } to { transform: scale(1.05) } }'}</style>
    </main>
  );
}
