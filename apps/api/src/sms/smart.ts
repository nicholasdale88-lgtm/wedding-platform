/**
 * Understanding a guest's message beyond yes and no, without guessing:
 * - Dietary needs ("Sam is vegan", "I'm coeliac", "allergic to nuts") are written on that person, and the
 *   guest is told what was noted. Only when it's clear whose need it is: one person on the invitation, or
 *   the message names them (or says "we're all…"); otherwise the couple are asked.
 * - Questions the wedding already answers (what time, where, parking, what to wear, the couple's own
 *   FAQ) are answered straight away, for the guest's own events. Anything else still goes to the couple.
 * Plain rules, no outside service: it never sends a guest something the couple didn't write or set.
 */

/** What a wedding already says about one event, for answering questions. */
export interface EventFacts {
  eventKey: string;
  name: string;
  startsAt: string;
  venue: string;
  address: string;
  /** "Arrive from 1:30pm" (from the night-before guide). */
  arrive: string;
  parking: string;
  dress: string;
  faq: { q: string; a: string }[];
}

const DIETS: [RegExp, string][] = [
  [/\bvegan\b/i, 'Vegan'],
  [/\bvegetarian|\bveggo\b|\bveggie\b/i, 'Vegetarian'],
  [/\bpescatarian|\bpescetarian/i, 'Pescatarian'],
  [/\bco?eliac|\bceliac/i, 'Coeliac (gluten free)'],
  [/\bgluten[- ]?free|\bno gluten|\bgluten intoleran/i, 'Gluten free'],
  [/\bdairy[- ]?free|\bno dairy|\blactose/i, 'Dairy free'],
  [/\b(nut|peanut|tree[- ]nut)s? allerg|\ballergic to (pea)?nuts|\bnut[- ]free/i, 'Nut allergy'],
  [/\b(shellfish|seafood|prawn|crustacean)s? allerg|\ballergic to (shellfish|seafood|prawns)/i, 'Shellfish allergy'],
  [/\begg allerg|\ballergic to eggs?\b/i, 'Egg allergy'],
  [/\bhalal\b/i, 'Halal'],
  [/\bkosher\b/i, 'Kosher'],
  [/\bno pork\b|\bdon'?t eat pork/i, 'No pork'],
];
/** "allergic to sesame" and the like, for allergies not in the list. */
const ALLERGIC_TO = /\ballergic to ([a-z][a-z -]{2,30}?)(?=[.,!;]|\band\b|$)/i;
const NONE = /\bno (dietary|special|food) (requirements?|needs|restrictions)|\bno allergies\b|\bnothing special\b/i;
const EVERYONE = /\b(we('re| are) (all|both)|all of us|both of us|everyone|the whole family|whole family)\b/i;

/** The dietary needs a message states (empty when none). */
export function dietsIn(text: string): string[] {
  if (NONE.test(text)) return [];
  const out = DIETS.filter(([re]) => re.test(text)).map(([, label]) => label);
  // Coeliac already says gluten free.
  const tidy = out.includes('Coeliac (gluten free)') ? out.filter((x) => x !== 'Gluten free') : out;
  const other = ALLERGIC_TO.exec(text)?.[1]?.trim();
  if (other && !tidy.some((d) => d.toLowerCase().includes(other.split(' ')[0]!.toLowerCase().replace(/s$/, '')))) tidy.push(`Allergic to ${other}`);
  return tidy;
}

/**
 * Whose need it is: the people on the invitation a message names (by first name), everyone when it says
 * so, the one person when there's only one; null when it can't be told.
 */
export function whoseDiet(text: string, people: string[]): string[] | null {
  if (!people.length) return null;
  if (EVERYONE.test(text)) return people;
  const named = people.filter((p) => {
    const first = p.trim().split(/\s+/)[0] ?? '';
    return first.length > 1 && new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
  });
  if (named.length) return named;
  if (people.length === 1) return people;
  // "I'm vegan" from the main contact.
  if (/\b(i'?m|i am|i have|i'?ve got|i can'?t eat)\b/i.test(text)) return [people[0]!];
  return null;
}

const QUESTION = /\?|^\s*(what|when|where|how|is|are|can|could|do|does|will|should|any)\b/i;
const TOPICS: { key: 'time' | 'where' | 'parking' | 'dress'; re: RegExp }[] = [
  { key: 'parking', re: /\bpark(ing)?\b/i },
  { key: 'dress', re: /\b(dress|dress ?code|wear|attire|formal|suit|tie)\b/i },
  { key: 'time', re: /\b(what time|when (does|do|is|should)|start(s|ing)? time|time (does|is)|how early|arrive)\b/i },
  { key: 'where', re: /\b(where|address|venue|location|directions|how do (we|i) get)\b/i },
];
const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'there', 'what', 'when', 'where', 'how', 'can', 'do', 'does', 'we', 'i', 'you', 'to', 'for', 'of', 'at', 'in', 'on', 'be', 'will', 'it', 'our', 'my', 'your', 'and', 'or', 'any', 'should', 'have', 'with']);
const words = (s: string) => s.toLowerCase().match(/[a-z']{3,}/g)?.filter((w) => !STOPWORDS.has(w)) ?? [];

const when = (iso: string, tz: string) => {
  try {
    const d = new Date(iso);
    // Built from the parts, so it reads the same whatever punctuation the runtime's locale data adds.
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
        .formatToParts(d)
        .map((x) => [x.type, x.value]),
    ) as Record<string, string>;
    return `${p.hour}:${p.minute}${(p.dayPeriod ?? '').toLowerCase()} on ${p.weekday} ${p.day} ${p.month}`;
  } catch {
    return '';
  }
};

/**
 * An answer to a guest's question from what the wedding already says about their events, or null when
 * it isn't clearly a question this can answer (then the couple answer it).
 */
export function answerFrom(text: string, facts: EventFacts[], tz: string): string | null {
  if (!QUESTION.test(text) || !facts.length) return null;
  // Which event: one the message names, else all of theirs.
  const named = facts.filter((f) => words(f.name).some((w) => new RegExp(`\\b${w}`, 'i').test(text)));
  const evs = named.length ? named : facts;
  // The couple's own FAQ first: most words in common (two at least, or one long one).
  const asked = new Set(words(text));
  let best: { a: string; score: number } | null = null;
  for (const f of evs)
    for (const x of f.faq) {
      const common = words(x.q).filter((w) => asked.has(w));
      const score = common.length + (common.some((w) => w.length >= 7) ? 1 : 0);
      if (x.a.trim() && score >= 2 && (!best || score > best.score)) best = { a: x.a.trim(), score };
    }
  if (best) return best.a;
  const topic = TOPICS.find((t) => t.re.test(text))?.key;
  if (!topic) return null;
  const parts = evs
    .map((f) => {
      const label = evs.length > 1 ? `${f.name}: ` : '';
      if (topic === 'time') {
        const at = when(f.startsAt, tz);
        return at ? `${label}${f.name} starts at ${at}${f.arrive ? ` (${f.arrive.replace(/^./, (c) => c.toLowerCase())})` : ''}.` : null;
      }
      if (topic === 'where') {
        const place = [f.venue, f.address].filter(Boolean).join(', ');
        return place ? `${label}${place}.` : null;
      }
      if (topic === 'parking') return f.parking ? `${label}${f.parking}` : null;
      return f.dress ? `${label}${f.dress}` : null;
    })
    .filter((x): x is string => !!x);
  return parts.length ? parts.join(' ') : null;
}
