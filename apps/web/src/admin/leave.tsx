import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Unsaved work, admin-wide. A screen with edits not yet saved (seating, SMS setup, an event card, a text
 * being written, a night-before card) calls useUnsavedChanges(dirty). While any is dirty, leaving asks
 * first: the menu, every link, the browser's Back and closing the tab (LeaveGuard, once in the shell).
 */
const dirty = new Map<symbol, string>();
const ASK = 'You have changes that are not saved. Leave without saving them?';
const question = () => [...dirty.values()][0] ?? ASK;

export function useUnsavedChanges(when: boolean, message = ASK) {
  useEffect(() => {
    if (!when) return;
    const key = Symbol('unsaved');
    dirty.set(key, message);
    return () => {
      dirty.delete(key);
    };
  }, [when, message]);
}

/** For changes the router can't see (a reload, a switch inside a screen): true when it's fine to go on. */
export function confirmLeave(): boolean {
  return dirty.size === 0 || window.confirm(question());
}

export function LeaveGuard() {
  // Filters and the open guest live in the address bar too; only moving to another page asks.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty.size > 0 && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(question())) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.size) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return null;
}
