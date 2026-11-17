/**
 * The wedding scenarios: 1,000 generated weddings, from tiny to 400+ guests. Everything comes from one
 * seeded generator, so scenario N is always the same wedding and a failure reproduces exactly
 * (run one with SCENARIO=N). Names are made up.
 */

export const TOTAL = 1000;
export const PER_PART = 50;
export const PARTS = TOTAL / PER_PART;

/** Seeded PRNG (the same as the launch tests), so scenario N never changes. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const FIRST = ['Olivia', 'Jack', 'Charlotte', 'William', 'Amelia', 'Noah', 'Isla', 'Thomas', 'Mia', 'James', 'Ava', 'Lucas', 'Grace', 'Henry', 'Chloe', 'Oliver', 'Matilda', 'Leo', 'Zoe', 'Hugo', 'Ruby', 'Archie', 'Harper', 'Lachlan', 'Sienna', 'Priya', 'Wei', 'Aroha', 'Mateo', 'Fatima'];
const LAST = ['Smith', 'Nguyen', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Anderson', 'Martin', 'Kelly', 'Murphy', 'Chen', 'Patel', 'Rossi', 'O’Brien', 'Ngata'];
const KIDS = ['Max', 'Lily', 'Ollie', 'Rosie', 'Finn', 'Evie', 'Arlo', 'Poppy'];
const PARTNERS = ['Sam', 'Alex', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Morgan', 'Jamie'];
const EXTRA_EVENTS = ['Welcome drinks', 'Rehearsal dinner', 'Recovery brunch', 'Mehndi night'];
export const DIETS = ['Vegetarian', 'Vegan', 'Coeliac', 'No nuts', 'Halal', 'Dairy free'];

export type Size = 'tiny' | 'small' | 'medium' | 'large' | 'huge';
export interface Household {
  people: string[];
  /** How many of `people` are children (they come last). */
  kids: number;
  /** A plus-one with no name yet: one more seat than people. */
  unnamedPlusOne: boolean;
  phone?: string;
  email?: string;
  /** Event indexes they're invited to (0 is the wedding). */
  invited: number[];
}
export interface Scenario {
  n: number;
  size: Size;
  couple: [string, string];
  /** Days from today to the wedding. */
  inDays: number;
  extraEvents: string[];
  private: boolean;
  households: Household[];
  /** Households that reply (indexes), in the order they reply. */
  replies: number[];
  /** Of those, the ones who change their mind afterwards. */
  changes: number[];
  /** Replies close (in the past) after the first wave: a change is refused, a first reply still counts. */
  late: boolean;
  vendor: boolean;
  inbox: boolean;
  photos: 'none' | 'dropbox' | 'gdrive';
  seed: number;
}

const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!;
const sizeOf = (r: () => number): [Size, number] => {
  const x = r();
  if (x < 0.25) return ['tiny', 1 + Math.floor(r() * 8)];
  if (x < 0.6) return ['small', 9 + Math.floor(r() * 50)];
  if (x < 0.82) return ['medium', 60 + Math.floor(r() * 90)];
  if (x < 0.95) return ['large', 150 + Math.floor(r() * 150)];
  return ['huge', 300 + Math.floor(r() * 150)]; // 400+ guests once plus-ones and kids are in
};

export function scenario(n: number): Scenario {
  const seed = 0x5eed + n * 7919;
  const r = rng(seed);
  for (let i = 0; i < 3; i++) r(); // let the generator settle
  const [size, count] = sizeOf(r);
  const extra = r() < 0.35 ? Math.floor(r() * 3) + 1 : 0;
  const extraEvents = [...EXTRA_EVENTS].sort(() => r() - 0.5).slice(0, extra);
  const plusOneRate = 0.2 + r() * 0.4;
  const kidRate = r() < 0.4 ? r() * 0.25 : 0;
  // Every name in a wedding is different (an import skips someone already on the list).
  const taken = new Set<string>();
  const unique = (name: string, i: number) => {
    const out = taken.has(name) ? `${name} ${i}` : name;
    taken.add(out);
    return out;
  };
  const households: Household[] = Array.from({ length: count }, (_, i) => {
    const main = `${FIRST[(i + n) % FIRST.length]!} ${LAST[Math.floor(i / FIRST.length + n) % LAST.length]!}${i >= FIRST.length * LAST.length ? ` ${i}` : ''}`;
    const surname = main.split(' ')[1]!;
    const people = [unique(main, i)];
    const roll = r();
    let unnamedPlusOne = false;
    if (roll < plusOneRate * 0.7) people.push(unique(`${pick(r, PARTNERS)} ${surname}`, i));
    else if (roll < plusOneRate) unnamedPlusOne = true;
    let kids = 0;
    if (r() < kidRate) {
      kids = 1 + Math.floor(r() * 3);
      for (let k = 0; k < kids; k++) people.push(unique(`${KIDS[(k + i) % KIDS.length]!} ${surname}`, i));
    }
    // Every guest is invited to the wedding; extra events go to some of them.
    const invited = [0, ...extraEvents.map((_, e) => e + 1).filter(() => r() < 0.55)];
    return {
      people,
      kids,
      unnamedPlusOne,
      ...(r() < 0.85 ? { phone: `04${String(10_000_000 + ((n * 997 + i) % 89_999_999)).padStart(8, '0')}` } : {}),
      ...(i === 0 ? { email: `guest${n}@guests.example` } : {}),
      invited,
    };
  });
  // Replies: up to 30 households (a few more for big weddings), the rest still waiting.
  const order = households.map((_, i) => i).sort(() => r() - 0.5);
  const replyCount = Math.min(count, size === 'huge' || size === 'large' ? 40 : 30, Math.max(1, Math.round(count * (0.4 + r() * 0.6))));
  const replies = order.slice(0, replyCount);
  const changes = replies.filter(() => r() < 0.2);
  return {
    n,
    size,
    couple: [`${pick(r, FIRST)} ${pick(r, LAST)}`, `${pick(r, FIRST)} ${pick(r, LAST)}`],
    inDays: 30 + Math.floor(r() * 500),
    extraEvents,
    private: r() < 0.6,
    households,
    replies,
    changes,
    late: r() < 0.1 && replyCount < count,
    vendor: r() < 0.1,
    inbox: r() < 0.15,
    photos: ((x) => (x < 0.15 ? 'dropbox' : x < 0.25 ? 'gdrive' : 'none'))(r()),
    seed,
  };
}

/** Scenario numbers for one part (1-based part, 1-based scenarios). SCENARIO=N runs just that one. */
export function part(p: number): number[] {
  const only = Number(process.env.SCENARIO);
  if (only) return Math.ceil(only / PER_PART) === p ? [only] : [];
  return Array.from({ length: PER_PART }, (_, i) => (p - 1) * PER_PART + i + 1);
}
