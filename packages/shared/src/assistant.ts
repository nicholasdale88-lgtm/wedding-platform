/**
 * The couple's personal assistant (Ask, on every screen of their app): the screens it can send them to, and
 * the small jobs it can offer, which it writes at the end of an answer as [[open:guests]] or
 * [[todo:Book the cake tasting]]. Nothing happens until the couple taps the button and says OK.
 */

export const ASSISTANT_SCREENS = {
  overview: 'Overview',
  guests: 'Guest list',
  dietary: 'Dietary',
  seating: 'Seating',
  texts: 'Texts',
  messages: 'Messages',
  party: 'Wedding party',
  planner: 'Wedding planner',
  pages: 'Setup',
  photos: 'Photos',
  help: 'Help',
} as const;
export type AssistantScreen = keyof typeof ASSISTANT_SCREENS;

export type AssistantAction = { kind: 'open'; screen: AssistantScreen; label: string } | { kind: 'todo'; text: string };

/** What the assistant is told about the jobs it can offer (in its instructions). */
export const ASSISTANT_ACTIONS_HELP =
  'You can offer at most two buttons, each on its own line at the very end of your answer, written exactly like this: ' +
  `[[open:SCREEN]] to open a screen of their app (SCREEN is one of: ${Object.keys(ASSISTANT_SCREENS).join(', ')}), ` +
  'or [[todo:a short task]] to offer adding a task to their planning checklist. Only offer a button when it truly helps.';

/** The answer without its button lines, and the buttons (checked: unknown screens and odd tasks are dropped). */
export function assistantActions(raw: string): { answer: string; actions: AssistantAction[] } {
  const actions: AssistantAction[] = [];
  const seen = new Set<string>();
  const answer = raw
    .replace(/\[\[\s*(open|todo)\s*:\s*([^\]\n]{1,160}?)\s*\]\]/gi, (_, kind: string, value: string) => {
      const v = value.trim();
      if (actions.length >= 2) return '';
      if (kind.toLowerCase() === 'open') {
        const screen = v.toLowerCase().replace(/\s+/g, '') as AssistantScreen;
        if (Object.hasOwn(ASSISTANT_SCREENS, screen) && !seen.has(`o:${screen}`)) {
          seen.add(`o:${screen}`);
          actions.push({ kind: 'open', screen, label: ASSISTANT_SCREENS[screen] });
        }
      } else {
        const text = v.replace(/\s+/g, ' ').slice(0, 120);
        if (text.length >= 3 && !seen.has(`t:${text.toLowerCase()}`)) {
          seen.add(`t:${text.toLowerCase()}`);
          actions.push({ kind: 'todo', text });
        }
      }
      return '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { answer, actions };
}
