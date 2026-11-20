/**
 * The light part of "Try the app" (/admin/demo): whether this page is the sample, and the sample's own Setup
 * changes. Every page loads this (through lib/api), so it stays tiny: the sample's in-browser answers (try/demo,
 * with the planner's form rules) load only once the sample asks for something.
 */
export const DEMO_WID = 'demo';

export const isDemo = () => typeof window !== 'undefined' && window.location.pathname.startsWith(`/admin/${DEMO_WID}`);

/**
 * The sample's Setup page edits the sample invitation for real (colour boards, the arch photo, wording...).
 * Each change is kept in this tab (sessionStorage), where the preview beside it (/demo?embed=1&mine=1, the
 * same tab's storage) reads it. Closing the tab forgets it; nothing reaches the server.
 */
export const DEMO_PAGES_KEY = 'yl-try-pages';
export interface DemoPagesDoc {
  names: { name1: string; name2: string; monogram: string };
  theme: string;
  invitation: Record<string, unknown>;
  texts: Record<string, string>;
  /** The night-before guide (the sample has one, for the wedding). */
  guides?: Record<string, unknown>;
}
export function readDemoPages(): Partial<DemoPagesDoc> | null {
  try {
    const s = sessionStorage.getItem(DEMO_PAGES_KEY);
    return s ? (JSON.parse(s) as Partial<DemoPagesDoc>) : null;
  } catch {
    return null;
  }
}
