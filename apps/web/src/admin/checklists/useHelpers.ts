import type { PlanChecklist } from '@wp/shared';
import { useLiveDoc } from '../planner/useDocSave';
import { useAdmin } from '../Shell';
import { useToast } from '../ui';

/** Someone things can be handed to, with their private task-list link. */
export interface Person {
  id: string;
  name: string;
  link: string;
}

/**
 * The people helping (kept with the planning checklist): anything on a day checklist can be handed to one
 * of them, and someone new can be added right there. Each has their own list and calendar on a private link.
 */
export function useHelpers() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const live = useLiveDoc<PlanChecklist>(wid, 'checklist', '', toast);
  const slug = overview?.wedding.slug ?? '';
  const helpers = live.doc?.data.helpers ?? [];
  const people: Person[] = helpers.map((h) => ({ id: h.id, name: h.name, link: `${window.location.origin}/w/${slug}/tasks?k=${h.key}` }));
  /** Add someone; returns their id ('' while the list is still loading). */
  const add = (name: string) => {
    const doc = live.doc;
    if (!doc || !name.trim()) return '';
    const h = { id: crypto.randomUUID().slice(0, 8), name: name.trim().slice(0, 80), mobile: '', key: crypto.randomUUID().replace(/-/g, '') };
    live.set({ ...doc.data, helpers: [...doc.data.helpers, h] }, true);
    return h.id;
  };
  return { people, add, ready: !!live.doc };
}
