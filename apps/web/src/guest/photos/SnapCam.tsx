import { useEffect, useRef, useState } from 'react';
import { drawFilter, FILTER_LABEL, filterFontsReady, type FilterInfo, type FilterKey } from './filters';

/**
 * Take a photo through the link: the phone's camera full screen, the event's filter live over it,
 * swipe through the filters, flip between back and front camera, tap the shutter. The shot (filter
 * drawn on) goes straight into the album queue. Where the browser won't give the page a camera, the
 * phone's own camera opens instead (and the filter is added when it's sent).
 */
export function SnapCam({
  info,
  filters,
  filter,
  onFilter,
  onShot,
  onClose,
  fallback,
}: {
  info: FilterInfo;
  filters: FilterKey[];
  filter: FilterKey;
  onFilter: (f: FilterKey) => void;
  onShot: (photo: Blob) => void;
  onClose: () => void;
  /** Open the phone's own camera app instead (no live camera here). */
  fallback: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [shots, setShots] = useState(0);
  // Camera refused or missing: say so, with a button for the phone's own camera (it must come from a tap).
  const [blocked, setBlocked] = useState(false);
  // A proper full-screen dialog: Escape closes it and the page behind doesn't scroll.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener('keydown', onKey);
    };
  }, []); // eslint-disable-line

  // The camera stream, restarted when flipping; always stopped on close.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setBlocked(true);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current
            .play()
            .then(() => setReady(true))
            .catch(() => setBlocked(true));
        }
      })
      .catch(() => setBlocked(true));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]); // eslint-disable-line

  // The filter, live over the picture.
  useEffect(() => {
    const c = overlay.current;
    const v = video.current;
    if (!c || !v || !ready) return;
    let stop = false;
    const draw = () => {
      if (stop) return;
      const box = c.getBoundingClientRect();
      c.width = Math.round(box.width * devicePixelRatio);
      c.height = Math.round(box.height * devicePixelRatio);
      const g = c.getContext('2d');
      if (!g) return;
      g.clearRect(0, 0, c.width, c.height);
      drawFilter(g, c.width, c.height, filter, info);
    };
    void filterFontsReady().then(draw);
    // Turning the phone changes the picture's shape: draw the filter again to fit.
    window.addEventListener('resize', draw);
    window.addEventListener('orientationchange', draw);
    return () => {
      stop = true;
      window.removeEventListener('resize', draw);
      window.removeEventListener('orientationchange', draw);
    };
  }, [filter, ready, info]);

  const shoot = async () => {
    const v = video.current;
    if (!v || !ready) return;
    await filterFontsReady();
    // What's on screen: the video is shown "cover", so crop the frame to the screen's shape.
    const box = v.getBoundingClientRect();
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const k = Math.max(box.width / vw, box.height / vh);
    const sw = box.width / k;
    const sh = box.height / k;
    const c = document.createElement('canvas');
    const scale = Math.min(1, 2400 / Math.max(sw, sh));
    c.width = Math.round(sw * scale);
    c.height = Math.round(sh * scale);
    const g = c.getContext('2d');
    if (!g) return;
    if (facing === 'user') {
      // The front camera is shown mirrored; the photo is saved the way people expect (mirrored, like the preview).
      g.translate(c.width, 0);
      g.scale(-1, 1);
    }
    g.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawFilter(g, c.width, c.height, filter, info);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    c.toBlob(
      (b) => {
        if (!b) return;
        onShot(b);
        setShots((n) => n + 1);
      },
      'image/jpeg',
      0.9,
    );
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Camera" className="fixed inset-0 z-[60] bg-black text-white flex flex-col select-none">
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted className={`absolute inset-0 w-full h-full object-cover ${facing === 'user' ? '-scale-x-100' : ''}`} />
        <canvas ref={overlay} aria-hidden className="absolute inset-0 w-full h-full pointer-events-none" />
        {flash && <div className="absolute inset-0 bg-white/80" />}
        {!ready && !blocked && <div className="absolute inset-0 flex items-center justify-center text-[15px] opacity-80">Opening the camera…</div>}
        {blocked && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="m-0 text-[17px] leading-[1.4]">This page can't use your camera (it may need permission in your browser settings). Your phone's own camera works instead.</p>
            <button
              type="button"
              onClick={() => {
                fallback();
                onClose();
              }}
              className="py-3 px-6 rounded-full border-0 bg-white text-black text-[16px] cursor-pointer"
            >
              Use my phone's camera
            </button>
          </div>
        )}
        <button type="button" onClick={onClose} aria-label="Close the camera" className="absolute top-[max(14px,env(safe-area-inset-top))] left-4 w-11 h-11 rounded-full border-0 bg-black/45 text-white text-[24px] cursor-pointer">
          ×
        </button>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          aria-label="Switch camera"
          className="absolute top-[max(14px,env(safe-area-inset-top))] right-4 h-11 px-4 rounded-full border-0 bg-black/45 text-white text-[14px] cursor-pointer"
        >
          ⟲ Flip
        </button>
        {shots > 0 && (
          <div role="status" className="absolute top-[max(18px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 py-[6px] px-3 rounded-full bg-black/45 text-[13px]">
            {shots === 1 ? '1 photo added' : `${shots} photos added`}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 pt-3 pb-[max(18px,env(safe-area-inset-bottom))] bg-black">
        <div role="radiogroup" aria-label="Filter" className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] justify-center">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={f === filter}
              onClick={() => onFilter(f)}
              className={`flex-none py-2 px-4 rounded-full border text-[14px] cursor-pointer ${f === filter ? 'bg-white text-black border-white' : 'bg-transparent text-white border-white/40'}`}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void shoot()}
            disabled={!ready}
            aria-label="Take the photo"
            className="w-[76px] h-[76px] rounded-full border-[5px] border-white bg-white/25 cursor-pointer disabled:opacity-40 active:scale-95 transition-transform"
          />
        </div>
      </div>
    </div>
  );
}
