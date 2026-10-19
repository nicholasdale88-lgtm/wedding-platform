/**
 * Where each piece of wording sits on its page, read from the generated page itself: which section it is
 * in, and which pieces make up one sentence (a sentence the design split around a bold time or a guest's
 * name is one row in the editor, not five unrelated boxes). Loaded only when the editor opens.
 */

export type Piece = { key: string } | { fill: string };
export interface Sentence {
  section: string;
  pieces: Piece[];
}

const SOURCES: Record<string, () => Promise<{ default: string }>> = {
  inv: () => import('../../guest/generated/InvitationView.tsx?raw'),
  gd: () => import('../../guest/generated/GuideView.tsx?raw'),
  g30: () => import('../../guest/generated/Guide30View.tsx?raw'),
  ph: () => import('../../guest/generated/PhotoUploadView.tsx?raw'),
};

/** Night-before sections are marked data-reveal="…" in the design. */
const REVEAL: Record<string, string> = {
  cards: 'Your seats and meals',
  day: 'The day',
  menu: 'Menu',
  photos: 'Photos',
  travel: 'Getting there and home',
  faq: 'Quick answers',
  plan: 'Your plan',
  bring: 'What to bring',
  wx: 'Weather',
};
const INLINE = new Set(['b', 'i', 'em', 'strong', 'span', 'a', 'br', 'u', 'small', 'sup', 'sub', 'Fragment']);
/** Values filled in for each guest: a readable name for the grey chip. */
export const fillName = (v: string) =>
  v
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

const cache = new Map<string, Sentence[]>();

export async function sentencesFor(prefix: string): Promise<Sentence[]> {
  const hit = cache.get(prefix);
  if (hit) return hit;
  const load = SOURCES[prefix];
  if (!load) return [];
  const src = (await load()).default;
  const out: Sentence[] = [];
  const seen = new Set<string>();
  let section = 'Top of the page';
  let cur: Piece[] = [];
  const close = () => {
    // A sentence starts and ends with words, not with a filled-in value.
    while (cur.length && 'fill' in cur[0]!) cur.shift();
    while (cur.length && 'fill' in cur[cur.length - 1]!) cur.pop();
    if (cur.some((p) => 'key' in p)) out.push({ section, pieces: cur });
    cur = [];
  };
  const re = new RegExp(String.raw`t\("((?:inv|gd|g30|ph)\.[\w.-]+)"\)|v\.hide\?\.\("([^"]+)"\)|data-reveal=\{"(\w+)"\}|\{v\.(\w+)\}|<\/?([A-Za-z][\w.]*)`, 'g');
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const [, key, hide, reveal, fill, tag] = m;
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
      cur.push({ key });
    } else if (hide || reveal) {
      close();
      section = hide ? hide.replace(/^\d+\w?\s+/, '') : (REVEAL[reveal!] ?? fillName(reveal!));
    } else if (fill) {
      if (cur.length) cur.push({ fill });
    } else if (tag && !INLINE.has(tag)) close();
  }
  close();
  cache.set(prefix, out);
  return out;
}
