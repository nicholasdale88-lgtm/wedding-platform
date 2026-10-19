import { useCallback, useRef } from 'react';
import { plannerApi } from '../../lib/api';

type Kind = Parameters<typeof plannerApi.saveDoc>[1];

/**
 * Saves of one planner document, one at a time, each sent with the newest version seen. Quick changes in
 * a row (two ticks, typing a date) no longer conflict with each other: only a change made on another
 * device does. `version` is the version on screen (versions only ever go up, so the highest one wins).
 */
export function useDocSave<T>(wid: string, kind: Kind, scope: string, version: number | undefined) {
  const key = `${wid}|${kind}|${scope}`;
  const state = useRef({ key, ver: 0 });
  // Another document (another event, say) starts from its own version.
  if (state.current.key !== key) state.current = { key, ver: 0 };
  state.current.ver = Math.max(state.current.ver, version ?? 0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  return useCallback(
    (data: T) => {
      const run = chain.current.then(async () => {
        const r = await plannerApi.saveDoc<T>(wid, kind, scope, data, state.current.ver);
        if (state.current.key === key) state.current.ver = Math.max(state.current.ver, r.version);
        return r;
      });
      chain.current = run.catch(() => undefined);
      return run;
    },
    [wid, kind, scope, key],
  );
}
