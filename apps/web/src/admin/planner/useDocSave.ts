import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, plannerApi } from '../../lib/api';

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

/**
 * A planner document on screen: loads it, shows each change straight away, and saves a moment after the
 * last change (typing doesn't send a save per key). A change from another device reloads it with a note.
 */
export function useLiveDoc<T>(wid: string, kind: Kind, scope: string, onConflict: (message: string) => void) {
  const [doc, setDoc] = useState<{ data: T; version: number } | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const save = useDocSave<T>(wid, kind, scope, doc?.version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<T | null>(null);

  const load = useCallback(async () => {
    try {
      const d = scope ? await plannerApi.docFor<T>(wid, kind, scope) : await plannerApi.doc<T>(wid, kind);
      setDoc(d);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid, kind, scope]);
  useEffect(() => {
    setDoc(null);
    void load();
  }, [load]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const data = latest.current;
    if (data === null) return;
    latest.current = null;
    try {
      const r = await save(data);
      setDoc((d) => (d ? { ...d, version: r.version } : r));
    } catch (e) {
      onConflict(e instanceof ApiError && e.status === 409 ? 'Changed on another device: here it is now.' : (e as Error).message);
      await load();
    } finally {
      if (latest.current === null) setPending(false);
    }
  }, [save, load]); // eslint-disable-line
  // Leaving the page saves what's waiting.
  useEffect(() => () => void flush(), [flush]);

  const set = useCallback(
    (data: T, now = false) => {
      setDoc((d) => (d ? { ...d, data } : d));
      latest.current = data;
      setPending(true);
      if (timer.current) clearTimeout(timer.current);
      if (now) void flush();
      else timer.current = setTimeout(() => void flush(), 600);
    },
    [flush],
  );
  return { doc, error, pending, set, reload: load };
}
