/**
 * The marketing pages' colours (/, /designs, /try, /demo's bar): one source of truth, with the contrast each is
 * allowed (WCAG 2.x, checked in test/tokens.test.ts). Visual specs 01 (VS-01).
 *
 * - `gold` is display gold: large script and decoration only (18px+, or 14px bold), and only on cream or paper,
 *   never on blush. Small gold type (eyebrows, the wordmark's "Yes", ticks, labels) is `goldInk`.
 * - Never cream or display gold on a pale card: there, type is `ink` or `sage`.
 */
export const TOKENS = {
  /** Marketing page background. */
  paper: '#fbf5f0',
  /** Cards, the trial form, the designs page. */
  paperBright: '#fffcf8',
  /** Invite-adjacent paper. */
  paperWarm: '#f6f0e2',
  /** The invitation page. */
  paperInvite: '#f1e9d6',
  /** Headlines, primary fills. */
  ink: '#2e2430',
  /** Dark pills, the sample bar. */
  sage: '#33402f',
  /** Secondary body. */
  muted: '#6e6068',
  /** Display gold: large script and decoration only. */
  gold: '#a8834a',
  /** Small gold type: eyebrows, the wordmark's "Yes", ticks, tracked caps. */
  goldInk: '#7a5c28',
  /** Names and body on invitation paper. */
  inviteInk: '#5d6b47',
  /** Text on burgundy or sage only, never on paper. */
  creamText: '#f3ecd6',
  /** The /try panel. */
  burgundy: '#3d2634',
  /** Hero wash only, not a text background. */
  blush: '#f6e6e0',
  /** The label on primary dark buttons. */
  btnOnInk: '#fbf1e8',
} as const;

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
