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
  // Each document keeps its own version (another event's, say): a save still on its way for the document
  // just left is sent with that document's version, never the new one's.
  const vers = useRef(new Map<string, number>());
  vers.current.set(key, Math.max(vers.current.get(key) ?? 0, version ?? 0));
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  return useCallback(
    (data: T) => {
      const run = chain.current.then(async () => {
        const r = await plannerApi.saveDoc<T>(wid, kind, scope, data, vers.current.get(key) ?? 0);
        vers.current.set(key, Math.max(vers.current.get(key) ?? 0, r.version));
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
 * Everything is tied to the document it's for: switching event (a new scope) never saves into, or shows,
 * the other one, even while a save is still on its way.
 */
export function useLiveDoc<T>(wid: string, kind: Kind, scope: string, onConflict: (message: string) => void) {
  const key = `${wid}|${kind}|${scope}`;
  const [doc, setDoc] = useState<{ key: string; data: T; version: number } | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const mine = doc && doc.key === key ? doc : null;
  const save = useDocSave<T>(wid, kind, scope, mine?.version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ key: string; data: T } | null>(null);
  const keyNow = useRef(key);
  keyNow.current = key;
  const dataNow = useRef<T | null>(null);
  dataNow.current = mine?.data ?? null;

  const load = useCallback(async () => {
    const k = key;
    try {
      const d = scope ? await plannerApi.docFor<T>(wid, kind, scope) : await plannerApi.doc<T>(wid, kind);
      if (keyNow.current === k) {
        setDoc({ key: k, ...d });
        setError('');
      }
    } catch (e) {
      if (keyNow.current === k) setError((e as Error).message);
    }
  }, [wid, kind, scope, key]);
  useEffect(() => {
    setDoc(null);
    void load();
  }, [load]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const waiting = latest.current;
    if (!waiting || waiting.key !== key) return;
    latest.current = null;
    try {
      const r = await save(waiting.data);
      // Only the document it was for takes the new version (the page may have moved on).
      setDoc((d) => (d && d.key === waiting.key ? { ...d, version: r.version } : d));
    } catch (e) {
      if (keyNow.current === waiting.key) {
        onConflict(e instanceof ApiError && e.status === 409 ? 'Changed on another device: here it is now.' : (e as Error).message);
        await load();
      }
    } finally {
      if (latest.current === null) setPending(false);
    }
  }, [save, load, key]); // eslint-disable-line
  // Leaving the page (or the document) saves what's waiting for it.
  useEffect(() => () => void flush(), [flush]);

  const set = useCallback(
    (data: T, now = false) => {
      setDoc((d) => (d && d.key === key ? { ...d, data } : d));
      dataNow.current = data;
      latest.current = { key, data };
      setPending(true);
      if (timer.current) clearTimeout(timer.current);
      if (now) void flush();
      else timer.current = setTimeout(() => void flush(), 600);
    },
    [flush, key],
  );
  /** A change made from the newest data (for work that finishes later, like an upload). */
  const update = useCallback(
    (fn: (cur: T) => T, now = false) => {
      if (dataNow.current !== null) set(fn(dataNow.current), now);
    },
    [set],
  );
  return { doc: mine ? { data: mine.data, version: mine.version } : null, error, pending, set, update, reload: load };
}
