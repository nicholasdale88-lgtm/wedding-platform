import { useRef, useState } from 'react';

/**
 * A spin view: photos taken in a circle around a piece (a cake, a bouquet), turned with a finger or the mouse
 * (drag sideways), or the slider underneath (keyboard and screen readers). Every frame is loaded up front and
 * stacked, so turning only changes which one shows: no flicker, nothing moving on its own.
 */
export function SpinView({ frames, label }: { frames: string[]; label: string }) {
  const [i, setI] = useState(0);
  const drag = useRef<{ x: number; at: number } | null>(null);
  const n = frames.length;
  if (n < 2) return null;
  const go = (k: number) => setI(((k % n) + n) % n);
  return (
    <div className="flex flex-col gap-2">
      <div
        role="img"
        aria-label={`${label}: photo ${i + 1} of ${n}. Drag sideways to turn it.`}
        className="relative w-full max-w-[420px] aspect-square rounded-[14px] overflow-hidden bg-[#efe6d0] cursor-grab active:cursor-grabbing select-none touch-pan-y"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, at: i };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          // About one frame for every 14 pixels dragged (a full turn across a phone screen).
          const step = Math.round((e.clientX - drag.current.x) / 14);
          go(drag.current.at - step);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {frames.map((src, k) => (
          <img key={src} src={src} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity: k === i ? 1 : 0 }} />
        ))}
        <span aria-hidden className="absolute left-2 bottom-2 py-1 px-2 rounded-full bg-black/45 text-white text-[12px]">
          ⟲ Drag to turn
        </span>
      </div>
      <input type="range" min={0} max={n - 1} value={i} onChange={(e) => go(Number(e.target.value))} aria-label={`Turn the ${label.toLowerCase()}`} className="w-full max-w-[420px] min-h-[44px] accent-[#5d6b47]" />
    </div>
  );
}
