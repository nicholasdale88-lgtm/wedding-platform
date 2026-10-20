import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Something opened from a list and kept in the address (a guest `?g=`, a conversation `?c=`). Opening adds
 * a history entry, so the phone's Back closes it and stays on the page; closing goes back to that entry
 * when it was opened here, so Back never lands on the same list twice. Filters still replace (no entries).
 */
export function useOpenParam(key: string): [string | null, (value: string) => void, () => void] {
  const [params] = useSearchParams();
  const { pathname, search, state } = useLocation();
  const go = useNavigate();
  const value = params.get(key);
  const open = useCallback(
    (v: string) => {
      const n = new URLSearchParams(search);
      n.set(key, v);
      // Switching from one open item to another replaces, so Back still returns to the list.
      go({ pathname, search: `?${n}` }, { replace: !!value, state: { opened: key } });
    },
    [go, key, pathname, search, value],
  );
  const close = useCallback(() => {
    if ((state as { opened?: string } | null)?.opened === key) return go(-1);
    const n = new URLSearchParams(search);
    n.delete(key);
    const q = n.toString();
    go({ pathname, search: q ? `?${q}` : '' }, { replace: true });
  }, [go, key, pathname, search, state]);
  return [value, open, close];
}
