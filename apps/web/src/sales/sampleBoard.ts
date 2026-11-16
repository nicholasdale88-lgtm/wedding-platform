import type { BoardPayload, BoardPost } from '../guest/invitation/api';
const COUPLE = 'Harriet & Theo';

/**
 * The sample wedding's message board (/demo/board): the same calls as the real board, answered here. Posts,
 * hearts and replies work for this visit only; nothing is sent or saved.
 */
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const p = (id: string, author: string, body: string, h: number, more: Partial<BoardPost> = {}): BoardPost => ({ id, parentId: null, author, body, at: ago(h), pinned: false, couple: false, mine: false, pending: false, likes: 0, liked: false, replies: [], ...more });

let posts: BoardPost[] = [];
const start = () => [
  p('c1', COUPLE, 'Thank you all for the love already. We can’t wait to celebrate with you in the valley!', 30, { couple: true, pinned: true, likes: 14 }),
  p('g1', 'Olivia Hart', 'Counting down the days! So happy for you both. 💛', 20, { likes: 6, replies: [p('r1', COUPLE, 'See you on the dance floor, Liv!', 18, { couple: true, parentId: 'g1' })] }),
  p('g2', 'James Hart', 'Harriet, Theo: wishing you a lifetime of long lunches and good wine.', 9, { likes: 3 }),
  p('g3', 'Priya Nair', 'Can’t wait to see the vines. Save us a seat near the cake!', 2, { likes: 2 }),
];

export const sampleBoard = {
  board: async (): Promise<BoardPayload> => {
    if (!posts.length) posts = start();
    return { on: true, theme: 'Cream & Sage', approve: false, couple: COUPLE, me: 'Emma', posts: structuredClone(posts) };
  },
  boardPost: async (...a: [slug: string, token: string, body: string, parent?: string]) => {
    const [, , body, parent] = a;
    const mine = p(`m${Date.now()}`, 'Emma', body, 0, { mine: true, parentId: parent ?? null });
    posts = parent ? posts.map((x) => (x.id === parent ? { ...x, replies: [...x.replies, mine] } : x)) : [mine, ...posts];
    return { ok: true as const, pending: false };
  },
  boardLike: async (...a: [slug: string, token: string, id: string]) => {
    const id = a[2];
    let out = { liked: false, likes: 0 };
    const flip = (x: BoardPost): BoardPost => {
      if (x.id !== id) return { ...x, replies: x.replies.map(flip) };
      out = { liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) };
      return { ...x, ...out };
    };
    posts = posts.map(flip);
    return out;
  },
  boardRemove: async (...a: [slug: string, token: string, id: string]) => {
    const id = a[2];
    posts = posts.filter((x) => x.id !== id).map((x) => ({ ...x, replies: x.replies.filter((r) => r.id !== id) }));
    return { ok: true as const };
  },
};
