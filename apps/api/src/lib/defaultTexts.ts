import generic from '../../../../seed/texts.generic.json';

/**
 * The wording every wedding starts from: the invitation, night-before guide and photo page in neutral words,
 * with [placeholders] where a couple fills in their own (the venue, the date). A wedding's own wording
 * (content.texts, edited in Setup → Wording) replaces any of it. Without this, a new wedding's pages
 * would have no words at all.
 */
export const DEFAULT_TEXTS: Record<string, string> = generic;
export const withDefaults = (texts: Record<string, string> | undefined): Record<string, string> => ({ ...DEFAULT_TEXTS, ...(texts ?? {}) });
