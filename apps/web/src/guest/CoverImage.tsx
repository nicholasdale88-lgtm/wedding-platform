import { useState, type ReactNode } from 'react';
import { coverOf } from './covers';

/**
 * A design's cover still (its closed envelope), loaded only as it scrolls near (lazy) unless it's the one
 * showing (eager, high priority). Until a still exists for a design, `fallback` is drawn instead.
 */
export function CoverImage({ name, active = false, className = '', fallback }: { name: string; active?: boolean; className?: string; fallback: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <img
      src={coverOf(name)}
      alt=""
      width={300}
      height={400}
      loading={active ? 'eager' : 'lazy'}
      decoding="async"
      {...({ fetchpriority: active ? 'high' : 'low' } as Record<string, string>)}
      onError={() => setFailed(true)}
      className={`block w-full object-cover object-center ${className}`}
    />
  );
}
