/**
 * The couple's optional tools, switched on and off per wedding (Settings → What you’re using). Off hides the
 * tool's screens; nothing is deleted, and switching it back on brings it all back. Everything is in the one
 * plan: these are about keeping the admin simple, not about paying.
 *
 * Stored on the wedding as content.tools. A new sign-up starts with all of them off. A wedding from before the
 * switches (no content.tools: the founders' own wedding among them) keeps everything on. Text messages also
 * need text credits bought: until then they stay hidden even when switched on (founders' weddings excepted).
 */
export const TOOL_KEYS = ['texts', 'photos', 'party', 'seating', 'extraEvent', 'nightBefore', 'thankYou'] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];
export type Tools = Record<ToolKey, boolean>;

/** Each tool, as the couple sees it in Settings. */
export const TOOL_LABEL: Record<ToolKey, string> = {
  texts: 'Text messages',
  photos: 'Photos and the live wall',
  party: 'Wedding party sign-ins',
  seating: 'A seating plan',
  extraEvent: 'Another event',
  nightBefore: 'A night-before page',
  thankYou: 'A thank-you page',
};

/** One line under each, in plain words. */
export const TOOL_HINT: Record<ToolKey, string> = {
  texts: 'We text your guests for you, with reminders. Charged at cost, from your text credits.',
  photos: 'Guests share photos by QR code; a live wall on the day.',
  party: 'Your bridesmaids, groomsmen and helpers get their own sign-in and run sheet.',
  seating: 'Tables, auto-seat and place cards.',
  extraEvent: 'Welcome drinks or a recovery brunch, on the same invitation.',
  nightBefore: 'A page guests open the night before: times, weather, where to go.',
  thankYou: 'A thank-you page with your photos, after the day.',
};

export const ALL_TOOLS_OFF: Tools = { texts: false, photos: false, party: false, seating: false, extraEvent: false, nightBefore: false, thankYou: false };
export const ALL_TOOLS_ON: Tools = { texts: true, photos: true, party: true, seating: true, extraEvent: true, nightBefore: true, thankYou: true };

/** What a wedding has chosen (content.tools). None stored: a wedding from before the switches, everything on. */
export function chosenTools(content: unknown): Tools {
  const raw = content && typeof content === 'object' ? (content as { tools?: unknown }).tools : undefined;
  if (!raw || typeof raw !== 'object') return { ...ALL_TOOLS_ON };
  const t = raw as Partial<Record<string, unknown>>;
  return Object.fromEntries(TOOL_KEYS.map((k) => [k, t[k] === true])) as Tools;
}

/**
 * What shows: the chosen tools, with text messages only once credits have been bought (founders' weddings,
 * which never buy credits, always have them).
 */
export function toolsShown(chosen: Tools, opts: { founders: boolean; textsBought: boolean }): Tools {
  if (opts.founders) return { ...ALL_TOOLS_ON };
  return { ...chosen, texts: chosen.texts && opts.textsBought };
}

/** A change from Settings: only these keys, only true or false. */
export function toolPatch(body: unknown): Partial<Tools> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const out: Partial<Tools> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!(TOOL_KEYS as readonly string[]).includes(k) || typeof v !== 'boolean') return null;
    out[k as ToolKey] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Which admin page belongs to which tool (a page whose tool is off offers to switch it on, never a 404). */
export const TOOL_OF_TAB: Partial<Record<string, ToolKey>> = { texts: 'texts', photos: 'photos', party: 'party', seating: 'seating' };
