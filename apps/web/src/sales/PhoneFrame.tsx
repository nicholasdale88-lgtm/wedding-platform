import type { ReactNode } from 'react';
import { SAMPLE } from './sample';

/**
 * The one phone every marketing preview sits in (send-10; Sentinel's sales-previews audit): one iPhone frame
 * (black bezel, Dynamic Island, the same corner radius), one soft shadow, never rotated, the same size on every
 * page (about 256px on a phone, 280px on a computer). The screen is a real phone's (390 × 844 CSS pixels),
 * so a live invitation or a still drawn at that size fits it exactly.
 */
export const PHONE_SCREEN = { w: 390, h: 844 } as const;
export const PHONE_SHADOW = '0 18px 40px rgba(70,40,40,.12)';
/** The sample's closed envelope in sales mode (/demo?embed=1&sales=1), as a still: H&T seal, Harriet & Theo. */
export const CLOSED_STILL = '/marketing/sample-closed-390.webp';

export function PhoneFrame({ children, className = '', label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div
      {...(label ? { role: 'img', 'aria-label': label } : {})}
      className={`relative flex-none rounded-[44px] p-[10px] bg-[#1c1719] [--phone:min(256px,68vw)] md:[--phone:280px] ${className}`}
      style={{ width: 'var(--phone)', boxShadow: `${PHONE_SHADOW}, inset 0 0 0 2px #3a3036` }}
      data-phone-frame
    >
      <span aria-hidden className="absolute z-10 top-[18px] left-1/2 w-[30%] h-[20px] -translate-x-1/2 rounded-full bg-[#1c1719]" />
      <div className="relative w-full overflow-hidden rounded-[34px] bg-[#f6f0e2] [clip-path:inset(0_round_34px)]" style={{ aspectRatio: `${PHONE_SCREEN.w} / ${PHONE_SCREEN.h}` }}>
        {children}
      </div>
    </div>
  );
}

/** The closed envelope, exactly as the sample opens on a phone (the still of /demo in sales mode). */
export function ClosedStill({ priority = false }: { priority?: boolean }) {
  return (
    <img
      src={CLOSED_STILL}
      alt={`The sample invitation, closed: a sealed envelope with a wax seal pressed with H&T, for ${SAMPLE.couple}`}
      width={PHONE_SCREEN.w}
      height={PHONE_SCREEN.h}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...((priority ? { fetchpriority: 'high' } : {}) as Record<string, string>)}
      className="absolute inset-0 w-full h-full object-cover"
    />
  );
}
