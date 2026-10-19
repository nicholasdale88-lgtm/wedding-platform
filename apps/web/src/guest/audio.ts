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
  const yt = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/.exec(src);
  if (yt) return youTubeAudio(yt[1]!, loop);
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

/** YouTube fallback (MP3 is preferred; YouTube is unreliable on iOS). */
function youTubeAudio(id: string, loop: boolean): Player {
  type YTPlayer = { playVideo: () => void; pauseVideo: () => void; mute: () => void; unMute: () => void; setVolume: (n: number) => void };
  const w = window as unknown as { YT?: { Player: new (el: HTMLElement, o: unknown) => unknown }; onYouTubeIframeAPIReady?: () => void };
  let player: YTPlayer | null = null;
  let want = false;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;bottom:0;width:200px;height:200px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden';
  const inner = document.createElement('div');
  host.appendChild(inner);
  document.body.appendChild(host);
  const make = () =>
    new w.YT!.Player(inner, {
      videoId: id, width: 200, height: 200, playerVars: { autoplay: 0, loop: loop ? 1 : 0, playlist: loop ? id : undefined, controls: 0, playsinline: 1 },
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
  if (w.YT?.Player) make();
  else {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      make();
    };
    if (!document.getElementById('yt-api')) {
      const s = document.createElement('script');
      s.id = 'yt-api';
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  }
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
