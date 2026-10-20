import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The guest page as guests will see it: on a phone (a true-to-size iPhone with its status bar, Dynamic
 * Island and home bar), on a laptop, or on a desktop screen with a browser bar. The page is drawn at the
 * device's real size and scaled to fit, so layouts switch exactly as they will for guests.
 */

export type Device = 'phone' | 'laptop' | 'desktop';
export const DEVICES: [Device, string][] = [
  ['phone', 'Phone'],
  ['laptop', 'Laptop'],
  ['desktop', 'Desktop'],
];
const SIZE: Record<Device, { w: number; h: number }> = { phone: { w: 390, h: 844 }, laptop: { w: 1280, h: 800 }, desktop: { w: 1440, h: 900 } };

export function useDevice(): [Device, (d: Device) => void] {
  const [d, setD] = useState<Device>(() => {
    try {
      const v = localStorage.getItem('wp.admin.device');
      return v === 'laptop' || v === 'desktop' ? v : 'phone';
    } catch {
      return 'phone';
    }
  });
  return [
    d,
    (v) => {
      setD(v);
      try {
        localStorage.setItem('wp.admin.device', v);
      } catch {
        /* this visit only */
      }
    },
  ];
}

/** The width available, for scaling the device to fit. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(420);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(el.clientWidth || 420);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function StatusBar() {
  return (
    <div aria-hidden className="h-[50px] flex-none flex items-end justify-between px-[30px] pb-[8px] bg-[#fbf8f2] text-[#111] text-[16px] font-semibold" style={{ fontFamily: '-apple-system, "SF Pro Text", system-ui, sans-serif' }}>
      <span className="w-[54px] text-center">9:41</span>
      <span className="flex items-center gap-[6px]">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="#111">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="#111">
          <path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 0 0 8 .4C5.1.4 2.4 1.5.5 3.4l1.3 1.3A8.8 8.8 0 0 1 8 2.2Zm0 3.6c1.4 0 2.7.5 3.7 1.5l1.3-1.3A7 7 0 0 0 8 4c-1.9 0-3.7.7-5 2l1.3 1.3c1-1 2.3-1.5 3.7-1.5Zm0 3.6c-.6 0-1.1.2-1.5.6L8 11.6l1.5-1.6c-.4-.4-.9-.6-1.5-.6Z" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13">
          <rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="#111" opacity=".4" />
          <rect x="2" y="2" width="20" height="9" rx="2" fill="#111" />
          <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="#111" opacity=".5" />
        </svg>
      </span>
    </div>
  );
}

function BrowserBar({ url }: { url: string }) {
  return (
    <div aria-hidden className="h-[40px] flex-none flex items-center gap-3 px-4 bg-[#ecebe8] border-b border-[#d6d4cf]">
      <span className="flex gap-[7px]">
        <i className="w-[12px] h-[12px] rounded-full bg-[#ff5f57]" />
        <i className="w-[12px] h-[12px] rounded-full bg-[#febc2e]" />
        <i className="w-[12px] h-[12px] rounded-full bg-[#28c840]" />
      </span>
      <span className="flex-1 max-w-[560px] mx-auto h-[26px] rounded-[7px] bg-white flex items-center justify-center gap-2 text-[13px] text-[#555] truncate px-3" style={{ fontFamily: 'system-ui, sans-serif' }}>
        <svg width="10" height="12" viewBox="0 0 10 12" fill="#888">
          <path d="M2 5V3.5a3 3 0 0 1 6 0V5h.5A1.5 1.5 0 0 1 10 6.5v4A1.5 1.5 0 0 1 8.5 12h-7A1.5 1.5 0 0 1 0 10.5v-4A1.5 1.5 0 0 1 1.5 5H2Zm1.5 0h3V3.5a1.5 1.5 0 0 0-3 0V5Z" />
        </svg>
        {url}
      </span>
    </div>
  );
}

export function DevicePreview({ src, url, device, title, frameKey }: { src: string; url: string; device: Device; title: string; frameKey: string }) {
  const [ref, avail] = useWidth();
  const size = SIZE[device];
  const frame = <iframe key={frameKey} src={src} title={title} allow="autoplay; encrypted-media; fullscreen" className="block w-full flex-1 border-0 bg-white" />;

  if (device === 'phone') {
    const outer = { w: size.w + 24, h: size.h + 24 };
    const k = Math.min(1, avail / outer.w);
    return (
      <div ref={ref} className="w-full">
        <div className="mx-auto relative" style={{ width: outer.w * k, height: outer.h * k }}>
          <div className="absolute top-0 left-0 origin-top-left" style={{ width: outer.w, height: outer.h, transform: `scale(${k})` }}>
            {/* side buttons */}
            <span aria-hidden className="absolute -left-[3px] top-[150px] w-[4px] h-[32px] rounded-l bg-[#2a2a2c]" />
            <span aria-hidden className="absolute -left-[3px] top-[205px] w-[4px] h-[62px] rounded-l bg-[#2a2a2c]" />
            <span aria-hidden className="absolute -left-[3px] top-[280px] w-[4px] h-[62px] rounded-l bg-[#2a2a2c]" />
            <span aria-hidden className="absolute -right-[3px] top-[230px] w-[4px] h-[96px] rounded-r bg-[#2a2a2c]" />
            <div className="w-full h-full rounded-[64px] bg-[#1b1b1d] p-[12px] shadow-[0_0_0_2px_#3a3a3d,0_30px_60px_rgba(30,30,30,.35)]">
              <div className="relative w-full h-full rounded-[52px] overflow-hidden flex flex-col bg-[#fbf8f2]">
                <span aria-hidden className="absolute top-[11px] left-1/2 -translate-x-1/2 w-[124px] h-[36px] rounded-full bg-black z-10" />
                <StatusBar />
                {frame}
                <div aria-hidden className="h-[30px] flex-none flex items-center justify-center bg-[#fbf8f2]">
                  <span className="w-[134px] h-[5px] rounded-full bg-[#111]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Laptop and desktop: the page at full width in a browser window, scaled to fit.
  const bezel = device === 'laptop' ? 16 : 14;
  const screen = { w: size.w + bezel * 2, h: size.h + 40 + bezel * 2 };
  const k = Math.min(1, (avail * (device === 'laptop' ? 0.86 : 1)) / screen.w);
  return (
    <div ref={ref} className="w-full flex flex-col items-center">
      <div className="relative" style={{ width: screen.w * k, height: screen.h * k }}>
        <div className="absolute top-0 left-0 origin-top-left" style={{ width: screen.w, height: screen.h, transform: `scale(${k})` }}>
          <div className={`w-full h-full bg-[#1d1d1f] shadow-[0_20px_50px_rgba(30,30,30,.3)] ${device === 'laptop' ? 'rounded-t-[22px]' : 'rounded-[18px]'}`} style={{ padding: bezel }}>
            {device === 'laptop' && <span aria-hidden className="absolute top-[6px] left-1/2 -translate-x-1/2 w-[7px] h-[7px] rounded-full bg-[#3b3b3f]" />}
            <div className="w-full h-full flex flex-col overflow-hidden rounded-[4px] bg-white">
              <BrowserBar url={url} />
              {frame}
            </div>
          </div>
        </div>
      </div>
      {device === 'laptop' ? (
        // The keyboard deck's front edge, a little wider than the screen.
        <div aria-hidden className="relative" style={{ width: screen.w * k * 1.16, height: Math.max(8, 18 * k) }}>
          <div className="absolute inset-0 rounded-b-[14px] bg-gradient-to-b from-[#d9dadc] to-[#a9abae]" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-[8px] bg-[#9fa1a4]" style={{ width: screen.w * k * 0.16, height: Math.max(3, 7 * k) }} />
        </div>
      ) : (
        <>
          <div aria-hidden className="bg-gradient-to-b from-[#c8c9cc] to-[#a6a8ab]" style={{ width: 110 * k + 40, height: Math.max(30, 120 * k) }} />
          <div aria-hidden className="rounded-[10px] bg-gradient-to-b from-[#d4d5d7] to-[#a9abae]" style={{ width: 360 * k + 80, height: Math.max(8, 16 * k) }} />
        </>
      )}
    </div>
  );
}

export function DevicePicker({ device, onChange }: { device: Device; onChange: (d: Device) => void }): ReactNode {
  return (
    <div role="radiogroup" aria-label="Preview on" className="flex gap-1 justify-center">
      {DEVICES.map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={device === k}
          onClick={() => onChange(k)}
          className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${device === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794] text-[#33402f] hover:bg-[#efe7d3]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
