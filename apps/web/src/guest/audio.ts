/** Music on guests' pages: an MP3 (preferred) or a YouTube link, started from a tap (browsers allow no autoplay). */

export interface Player {
  play: () => void;
  /** Pause, ready to play again (stop() also removes it). */
  pause: () => void;
  setMuted: (m: boolean) => void;
  stop: () => void;
}

/** A player for a link, or null when there is none. `loop` keeps it going (the night-before page). */
export function playerFor(src: string, loop = false): Player | null {
  const yt = youTubeId(src);
  if (yt) return youTubeAudio(yt, loop);
  if (!src || typeof Audio === 'undefined') return null;
  const a = new Audio(src);
  a.loop = loop;
  a.preload = 'auto';
  return {
    play: () => {
      a.volume = 0.7;
      void a.play().catch(() => undefined);
    },
    pause: () => a.pause(),
    setMuted: (m) => {
      a.muted = m;
    },
    stop: () => a.pause(),
  };
}

type YTApi = { Player: new (el: HTMLElement, o: unknown) => unknown };
const ytWindow = () => window as unknown as { YT?: YTApi; onYouTubeIframeAPIReady?: () => void };
/** Run `fn` once YouTube's player API has loaded (loading it the first time). */
function whenYouTube(fn: (yt: YTApi) => void) {
  const w = ytWindow();
  if (w.YT?.Player) return fn(w.YT);
  const prev = w.onYouTubeIframeAPIReady;
  w.onYouTubeIframeAPIReady = () => {
    prev?.();
    fn(w.YT!);
  };
  if (!document.getElementById('yt-api')) {
    const s = document.createElement('script');
    s.id = 'yt-api';
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }
}
/**
 * A hidden YouTube frame. It sends YouTube the site's address (only the address, never the guest's private
 * link): the site's referrer policy sends none by default, and YouTube's player refuses to play without one
 * ("error 153"). The player API then drives this frame.
 */
function youTubeFrame(id: string, loop: boolean) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;bottom:0;width:200px;height:200px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden';
  const frame = document.createElement('iframe');
  frame.width = '200';
  frame.height = '200';
  frame.title = 'Music';
  frame.allow = 'autoplay; encrypted-media';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.src = `https://www.youtube.com/embed/${id}?enablejsapi=1&controls=0&playsinline=1${loop ? `&loop=1&playlist=${id}` : ''}&origin=${encodeURIComponent(window.location.origin)}`;
  host.appendChild(frame);
  document.body.appendChild(host);
  return { host, frame };
}
const youTubeId = (src: string) => /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/.exec(src)?.[1];

/**
 * Whether a music link will play on the invitation: 'ok'; 'blocked' (the YouTube video's owner doesn't allow
 * it on other websites); 'missing' (no such video); 'unreadable' (not an MP3 or YouTube link that loads).
 */
export function checkMusic(src: string): Promise<'ok' | 'blocked' | 'missing' | 'unreadable'> {
  return new Promise((done) => {
    const id = youTubeId(src);
    if (id) {
      const { host, frame } = youTubeFrame(id, false);
      let settled = false;
      const finish = (r: 'ok' | 'blocked' | 'missing' | 'unreadable') => {
        if (settled) return;
        settled = true;
        host.remove();
        done(r);
      };
      // A blocked video says so just after it's ready; quiet for a few seconds means it plays.
      whenYouTube(
        (yt) =>
          new yt.Player(frame, {
            events: {
              onReady: () => setTimeout(() => finish('ok'), 4000),
              onError: (e: { data: number }) => finish(e.data === 100 ? 'missing' : e.data === 101 || e.data === 150 ? 'blocked' : 'unreadable'),
            },
          }),
      );
      setTimeout(() => finish('unreadable'), 15000);
      return;
    }
    if (!/^https:\/\//i.test(src) || typeof Audio === 'undefined') return done('unreadable');
    const a = new Audio();
    const t = setTimeout(() => done('unreadable'), 12000);
    a.oncanplay = () => {
      clearTimeout(t);
      done('ok');
    };
    a.onerror = () => {
      clearTimeout(t);
      done('unreadable');
    };
    a.preload = 'auto';
    a.src = src;
  });
}

/** YouTube fallback (MP3 is preferred; YouTube is unreliable on iOS). */
function youTubeAudio(id: string, loop: boolean): Player {
  type YTPlayer = { playVideo: () => void; pauseVideo: () => void; mute: () => void; unMute: () => void; setVolume: (n: number) => void };
  let player: YTPlayer | null = null;
  let want = false;
  const { host, frame } = youTubeFrame(id, loop);
  const make = (yt: YTApi) =>
    new yt.Player(frame, {
      events: {
        onReady: (e: { target: YTPlayer }) => {
          player = e.target;
          if (want) start();
        },
      },
    });
  const start = () => {
    try {
      player?.unMute();
      player?.setVolume(70);
      player?.playVideo();
    } catch {
      /* ignore */
    }
  };
  whenYouTube(make);
  return {
    play: () => {
      want = true;
      start();
    },
    pause: () => {
      want = false;
      try {
        player?.pauseVideo();
      } catch {
        /* ignore */
      }
    },
    setMuted: (m: boolean) => {
      try {
        if (m) player?.mute();
        else player?.unMute();
      } catch {
        /* ignore */
      }
    },
    stop: () => {
      try {
        player?.pauseVideo();
      } catch {
        /* ignore */
      }
      host.remove();
    },
  };
}
