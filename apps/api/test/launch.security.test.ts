import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import { D1SmsStore } from '../src/db/smsStore';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode, sessionId } from '../src/lib/auth';
import { cellOf } from '../src/lib/directory';
import { receiveEmail } from '../src/routes/inbox';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';
import { FakeProvider } from './support/fakes';

/**
 * Before launch, round two: "no one's data to be linked". Two weddings on one platform (A and B, the same
 * guest names), and an attacker who holds a real session, guest link, party sign-in or helper key for A.
 * - IDOR: B's ids in A's paths, bodies and query strings; B's rows must not change (a fingerprint).
 * - Shared features: the vendor directory, email intake, photos (album and live wall), SMS replies from a
 *   mobile that's a guest of both, shuttles.
 * - Sessions: logout, passcode change, expiry, removal, one-time and expiring invite and reset links.
 * - Privilege: editors and viewers on members, party members on each other's lists, helpers on each other's tasks.
 * - Enumeration: sign-in, portal sign-in, forgot and "find my invite" answer the same either way.
 * - Injection: stored HTML comes back as plain JSON strings, calendar feeds escape what they print.
 * - Backups: only this wedding's rows, never a hash or a session.
 * Holes are written as the safe behaviour with `it.fails` and a "SECURITY HOLE" note: CI stays green, the
 * hole stays on record, and the day it's fixed the test fails, so `.fails` must then be dropped.
 */

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
interface Guest {
  pid: string;
  inv: string;
  tok: string;
  name: string;
}
interface Side {
  wid: string;
  slug: string;
  ev: { id: string; key: string };
  cid: string;
  a: Guest;
  b: Guest;
  c: Guest;
  d: Guest;
}
interface World {
  A: Side;
  B: Side;
  owner: string;
  other: string;
  viewer: string;
  editor: string;
  ownerId: string;
  otherId: string;
  viewerId: string;
  editorId: string;
}
interface Probe {
  label: string;
  method: Method;
  path: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  /** Statuses that are safe here. */
  want: number[];
}
type Hit = Record<string, unknown>;

const SLUG = 'sophie-and-nicholas';
const SLUG2 = 'other-wedding';
const SECRET = 'test-secret-for-sessions-000000';
const PASS = { owner: 'valley-2027', other: 'other-pass-2027', viewer: 'viewer-pass-2027', editor: 'editor-pass-2027' } as const;
const TABLE_B = '00000000-0000-4000-8000-0000000000b1';
const PAST = '2000-01-01T00:00:00.000Z';
/** The smallest thing that passes for a JPEG (SOI, a JFIF header, EOI). */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const HTML = '<script>alert(1)</script><img src=x onerror=alert(1)>';
const VENUE_A = { lat: -33.4, lon: 151.3 };
const VENUE_B = { lat: -33.4123, lon: 151.3123 };

const listOf = (failures: string[]) => `${failures.length} problem(s):\n${failures.join('\n')}`;
const tokenOf = (link: string) => new URL(link).searchParams.get('t') ?? '';
/** Every key anywhere in a JSON value. */
const keysOf = (v: unknown, out: string[] = []): string[] => {
  if (Array.isArray(v)) for (const x of v) keysOf(x, out);
  else if (v !== null && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      keysOf(x, out);
    }
  return out;
};
/** A calendar file's logical lines: folded lines joined back, split on CRLF only (RFC 5545). */
const icsLines = (text: string) => text.replace(/\r\n[ \t]/g, '').split('\r\n');

/** Everything about a wedding that a request from outside it must never change. */
const PRINT = [
  `SELECT json_group_array(json_array(id, deleted_at, version, phone, seats_held, party, opened_at, sms_optout)) AS v FROM invitation WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(p.id, p.name, p.party_role, p.meal_entree, p.diet, p.deleted_at)) AS v FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ?1`,
  `SELECT json_group_array(json_array(r.invitation_id, r.event_id, r.attending, r.count, r.message)) AS v FROM rsvp r JOIN invitation i ON i.id = r.invitation_id WHERE i.wedding_id = ?1`,
  `SELECT json_group_array(json_array(id, name, deleted_at, version)) AS v FROM event WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(id, body, enabled, deleted_at, version)) AS v FROM campaign WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(id, status, pinned, parent_id)) AS v FROM board_post WHERE wedding_id = ?1`,
  `SELECT COUNT(*) AS v FROM board_like WHERE post_id IN (SELECT id FROM board_post WHERE wedding_id = ?1)`,
  `SELECT json_group_array(json_array(id, status, deleted_at)) AS v FROM song_request WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(id, person_id, email, perms, deleted_at, invite_hash, reset_hash, pass_hash)) AS v FROM party_account WHERE wedding_id = ?1`,
  `SELECT COUNT(*) AS v FROM party_session WHERE wedding_id = ?1`,
  `SELECT COUNT(*) AS v FROM message WHERE invitation_id IN (SELECT id FROM invitation WHERE wedding_id = ?1)`,
  `SELECT COUNT(*) AS v FROM sms_out WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(kind, scope, version, data)) AS v FROM planner_doc WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(id, deleted_at)) AS v FROM planner_file WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(id, kind, vendor_id, filed, read_at, archived_at)) AS v FROM inbox_email WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(id, deleted_at)) AS v FROM media WHERE wedding_id = ?1`,
  `SELECT COUNT(*) AS v FROM photo_thumb WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(user_id, role)) AS v FROM membership WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(id, email, role, accepted_at, expires_at)) AS v FROM member_invite WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(id, name, deleted_at)) AS v FROM seat_table WHERE wedding_id = ?1`,
  `SELECT COUNT(*) AS v FROM seat WHERE event_id IN (SELECT id FROM event WHERE wedding_id = ?1)`,
  `SELECT json_group_array(json_array(shuttle_id, invitation_id, seats)) AS v FROM shuttle_booking WHERE wedding_id = ?1`,
  `SELECT json_group_array(json_array(dir_id, booked, amount)) AS v FROM vendor_use WHERE wedding_id = ?1`,
  `SELECT content || '#' || version || '#' || COALESCE(guide, '') AS v FROM wedding WHERE id = ?1`,
];

describe('launch security: round two, nothing linked between weddings', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let w: World;
  let waits: Promise<unknown>[] = [];
  let provider = new FakeProvider();
  const hashes = { owner: '', other: '', viewer: '', editor: '' };
  const app = createApp((e) => ({ store: new D1SmsStore(e.DB, e.PUBLIC_BASE_URL), provider, now: () => new Date(), uuid: () => crypto.randomUUID() }));
  const ctx = { waitUntil: (p: Promise<unknown>) => void waits.push(p.catch(() => undefined)), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

  // A new network for each request, so per-IP limits never mix one check's result into another's.
  let ipSeq = 0;
  const nextIp = () => {
    ipSeq += 1;
    return `10.${(ipSeq >> 16) & 255}.${(ipSeq >> 8) & 255}.${ipSeq & 255}`;
  };

  const call = (method: string, path: string, opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
    app.request(
      path,
      {
        method,
        headers: { 'content-type': 'application/json', 'CF-Connecting-IP': nextIp(), ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers },
        ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      },
      env,
      ctx,
    );
  /** A request with a raw (non-JSON) body. */
  const callRaw = (method: string, path: string, body: Uint8Array, headers: Record<string, string>) =>
    app.request(path, { method, headers: { 'CF-Connecting-IP': nextIp(), ...headers }, body }, env, ctx);
  const jsonOf = async <T>(res: Response | Promise<Response>) => (await (await res).json()) as T;
  const statusOf = async (res: Response | Promise<Response>) => {
    const r = await res;
    await r.arrayBuffer();
    return r.status;
  };
  const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const one = async <T>(sql: string, ...bind: unknown[]): Promise<T> => {
    const row = await t.db.prepare(sql).bind(...bind).first<T>();
    if (!row) throw new Error(`setup: nothing for ${sql}`);
    return row;
  };
  const maybe = (sql: string, ...bind: unknown[]) => t.db.prepare(sql).bind(...bind).first<Record<string, unknown>>();
  const all = async <T>(sql: string, ...bind: unknown[]) => (await t.db.prepare(sql).bind(...bind).all<T>()).results;
  const exec = (sql: string, ...bind: unknown[]) => t.db.prepare(sql).bind(...bind).run();
  const now = () => new Date().toISOString();

  const login = async (email: string, passcode: string) => {
    const res = await call('POST', '/api/a/auth/login', { body: { email, passcode } });
    if (res.status !== 200) throw new Error(`setup: sign-in for ${email} gave ${res.status}`);
    await res.arrayBuffer();
    return cookieOf(res);
  };

  const fingerprint = async (weddingId: string) => {
    const out: string[] = [];
    for (const sql of PRINT) out.push(JSON.stringify((await t.db.prepare(sql).bind(weddingId).first<{ v: unknown }>())?.v ?? null));
    return out;
  };

  /** Save a planning document (kind, or kind/scope) at whatever version it's at. */
  const saveDoc = async (cookie: string, weddingId: string, kind: string, data: unknown) => {
    const path = `/api/a/w/${weddingId}/planner/doc/${kind}`;
    const cur = await jsonOf<{ version: number }>(call('GET', path, { cookie }));
    const status = await statusOf(call('PUT', path, { cookie, body: data, headers: { 'If-Match': String(cur.version) } }));
    if (status !== 200) throw new Error(`setup: saving ${kind} gave ${status}`);
  };
  const docOf = async <T>(weddingId: string, kind: string, scope = '') => {
    const row = await maybe(`SELECT data FROM planner_doc WHERE wedding_id = ? AND kind = ? AND scope = ?`, weddingId, kind, scope);
    return JSON.parse(String(row?.data ?? '{}')) as T;
  };

  /** A member's portal sign-in, once they've accepted their invite: the cookie. */
  const portalAccount = async (cookie: string, wid: string, slug: string, pid: string, email: string, password: string) => {
    const inv = await jsonOf<{ link: string }>(call('POST', `/api/a/w/${wid}/party-accounts/${pid}/invite`, { cookie, body: { email } }));
    const set = await call('POST', `/api/p/${slug}/portal/password-link`, { body: { t: tokenOf(inv.link), password } });
    if (set.status !== 200) throw new Error(`setup: portal sign-up gave ${set.status}`);
    await set.arrayBuffer();
    return cookieOf(set);
  };

  /** Run probes; each must answer one of its safe statuses (never a 500). */
  const run = async (probes: Probe[]) => {
    const failures: string[] = [];
    for (const p of probes) {
      const res = await call(p.method, p.path, { ...(p.cookie ? { cookie: p.cookie } : {}), ...(p.body === undefined ? {} : { body: p.body }), ...(p.headers ? { headers: p.headers } : {}) });
      const text = await res.text();
      if (!p.want.includes(res.status)) failures.push(`${p.label}: ${p.method} ${p.path} -> ${res.status} ${text.slice(0, 140)}`);
    }
    return failures;
  };

  beforeAll(async () => {
    hashes.owner = await hashPasscode(PASS.owner);
    hashes.other = await hashPasscode(PASS.other);
    hashes.viewer = await hashPasscode(PASS.viewer);
    hashes.editor = await hashPasscode(PASS.editor);
  });

  beforeEach(async () => {
    t = await testD1();
    waits = [];
    provider = new FakeProvider();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: SECRET, MM_HOOK_SECRET: 'hook-key' };
    const seed = async (input: unknown, email: string, hash: string) => {
      const stmts = buildSeed(input, { ownerEmail: email, ownerPassHash: hash });
      await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    };
    await seed(seedJson, 'owner@example.com', hashes.owner);
    // A second couple on the same platform (the same guest names, different everything else).
    await seed({ ...seedJson, wedding: { ...seedJson.wedding, slug: SLUG2 } }, 'other@example.com', hashes.other);

    const side = async (slug: string): Promise<Side> => {
      const wid = (await one<{ id: string }>(`SELECT id FROM wedding WHERE slug = ?`, slug)).id;
      const gs = await all<Guest>(
        `SELECT p.id AS pid, i.id AS inv, i.token AS tok, p.name AS name FROM person p JOIN invitation i ON i.id = p.invitation_id
          WHERE i.wedding_id = ? AND p.idx = 0 AND p.deleted_at IS NULL ORDER BY p.name LIMIT 4`,
        wid,
      );
      const [a, b, c, d] = gs;
      if (!a || !b || !c || !d) throw new Error('setup: the seed needs at least four guests');
      const ev = await one<{ id: string; key: string }>(`SELECT id, key FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort LIMIT 1`, wid);
      const cid = (await one<{ id: string }>(`SELECT id FROM campaign WHERE wedding_id = ? ORDER BY sort LIMIT 1`, wid)).id;
      // Bridesmaids (one side, 'p1'): c and d.
      await exec(`UPDATE person SET party_role = 'Bridesmaid' WHERE id IN (?, ?)`, c.pid, d.pid);
      return { wid, slug, ev, cid, a, b, c, d };
    };
    const A = await side(SLUG);
    const B = await side(SLUG2);
    const ownerId = (await one<{ id: string }>(`SELECT id FROM user WHERE email = 'owner@example.com'`)).id;
    const otherId = (await one<{ id: string }>(`SELECT id FROM user WHERE email = 'other@example.com'`)).id;
    const viewerId = crypto.randomUUID();
    const editorId = crypto.randomUUID();
    await t.db.batch([
      t.db.prepare(`INSERT INTO user (id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)`).bind(viewerId, 'viewer@example.com', hashes.viewer, now()),
      t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES (?, ?, 'viewer')`).bind(A.wid, viewerId),
      t.db.prepare(`INSERT INTO user (id, email, pass_hash, created_at) VALUES (?, ?, ?, ?)`).bind(editorId, 'editor@example.com', hashes.editor, now()),
      t.db.prepare(`INSERT INTO membership (wedding_id, user_id, role) VALUES (?, ?, 'editor')`).bind(A.wid, editorId),
    ]);
    w = {
      A,
      B,
      owner: await login('owner@example.com', PASS.owner),
      other: await login('other@example.com', PASS.other),
      viewer: await login('viewer@example.com', PASS.viewer),
      editor: await login('editor@example.com', PASS.editor),
      ownerId,
      otherId,
      viewerId,
      editorId,
    };
    // Nothing reaches the internet (map search, weather, SMS providers).
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'offline in tests' }), { status: 503 }));
  });

  afterEach(async () => {
    await Promise.allSettled(waits);
    vi.unstubAllGlobals();
    await t.dispose();
  });

  // ---------------------------------------------------------------- 1. IDOR everywhere

  it("IDOR: wedding A's session, guest link, helper key and coordinator key with B's ids in paths, bodies and queries change nothing in B", async () => {
    const { A, B } = w;
    const a = `/api/a/w/${A.wid}`;
    const b = `/api/a/w/${B.wid}`;
    const stamp = now();
    // B's things to aim at.
    await t.db.batch([
      t.db.prepare(`INSERT INTO media (id, wedding_id, kind, key, content_type, bytes, invitation_id, created_at) VALUES ('mb1', ?, 'photo', 'wb/mb1.jpg', 'image/jpeg', 22, ?, ?)`).bind(B.wid, B.a.inv, stamp),
      t.db.prepare(`INSERT INTO photo_thumb (media_id, wedding_id, data, created_at) VALUES ('mb1', ?, ?, ?)`).bind(B.wid, JPEG, stamp),
      t.db.prepare(`INSERT INTO planner_file (id, wedding_id, name, type, bytes, data, created_at) VALUES ('fb1', ?, 'quote.pdf', 'application/pdf', 8, ?, ?)`).bind(B.wid, new TextEncoder().encode('%PDF-1.4'), stamp),
      t.db.prepare(`INSERT INTO planner_file (id, wedding_id, name, type, bytes, data, created_at) VALUES ('fa1', ?, 'quote.pdf', 'application/pdf', 8, ?, ?)`).bind(A.wid, new TextEncoder().encode('%PDF-1.4'), stamp),
      t.db
        .prepare(`INSERT INTO inbox_email (id, wedding_id, from_addr, subject, body, files, received_at) VALUES ('eb1', ?, 'sales@bloom.example', 'Quote', 'Hi', ?, ?)`)
        .bind(B.wid, JSON.stringify([{ id: 'fb1', name: 'quote.pdf', type: 'application/pdf' }]), stamp),
      t.db
        .prepare(`INSERT INTO inbox_email (id, wedding_id, from_addr, subject, body, files, received_at) VALUES ('ea1', ?, 'sales@bloom.example', 'Quote', 'Hi', ?, ?)`)
        .bind(A.wid, JSON.stringify([{ id: 'fa1', name: 'quote.pdf', type: 'application/pdf' }]), stamp),
      t.db.prepare(`INSERT INTO board_post (id, wedding_id, invitation_id, author, body, parent_id, status, created_at) VALUES ('pb1', ?, ?, 'A guest', 'Congrats', NULL, 'shown', ?)`).bind(B.wid, B.a.inv, stamp),
      t.db.prepare(`INSERT INTO song_request (id, wedding_id, invitation_id, title, artist, note, created_at) VALUES ('sb1', ?, ?, 'Song', 'Artist', '', ?)`).bind(B.wid, B.a.inv, stamp),
    ]);
    await saveDoc(w.other, B.wid, 'vendors', { list: [{ id: 'vb1', name: 'Bloom', category: 'Florist', email: 'sales@bloom.example' }] });
    await saveDoc(w.owner, A.wid, 'vendors', { list: [{ id: 'va1', name: 'Bloom', category: 'Florist', email: 'sales@bloom.example' }] });
    await saveDoc(w.other, B.wid, 'checklist', { tasks: [{ id: 'tb1', text: 'Cake', before: 100, helper: 'hb1' }], helpers: [{ id: 'hb1', name: 'Mum', key: 'helper-key-bbbbbbbbbbbbbb' }] });
    const helperA = 'helper-key-aaaaaaaaaaaaaa';
    await saveDoc(w.owner, A.wid, 'checklist', { tasks: [{ id: 'ta1', text: 'Cake', before: 100, helper: 'ha1' }], helpers: [{ id: 'ha1', name: 'Mum', key: helperA }] });
    await saveDoc(w.other, B.wid, 'coord-log', { entries: [{ id: 'logb1', at: stamp, text: 'Lost ring', done: false }] });
    await saveDoc(w.other, B.wid, `shuttles/${B.ev.key}`, { list: [{ id: 'run-b-only', time: '2pm', from: 'Hotel', to: 'Venue', seats: 10 }] });
    const coordA = new URL((await jsonOf<{ url: string }>(call('PUT', `${a}/coordinator`, { cookie: w.owner, body: { on: true, name: 'Jo' } }))).url).searchParams.get('k') ?? '';
    expect(await statusOf(call('PUT', `${a}/board/settings`, { cookie: w.owner, body: { on: true, approve: false } }))).toBe(200);
    expect(await statusOf(call('POST', `${b}/party-accounts/${B.c.pid}/invite`, { cookie: w.other, body: { email: 'ella2@example.com' } }))).toBe(200);
    expect(await statusOf(call('POST', `${b}/members/invite`, { cookie: w.other, body: { email: 'friend@example.com', role: 'editor' } }))).toBe(200);
    const bInvite = (await one<{ id: string }>(`SELECT id FROM member_invite WHERE wedding_id = ?`, B.wid)).id;
    const seatB = await jsonOf<{ version: number }>(call('GET', `${b}/seating?event=${B.ev.key}`, { cookie: w.other }));
    const table = (id: string) => ({ id, name: 'Table B', shape: 'round', dir: 'h', len: 50, x: 10, y: 10, seats: 8 });
    expect(
      await statusOf(call('PUT', `${b}/seating`, { cookie: w.other, headers: { 'If-Match': String(seatB.version) }, body: { event: B.ev.key, aspect: '4 / 3', tables: [table(TABLE_B)], areas: [], seats: {} } })),
    ).toBe(200);
    const evB = await one<{ version: number }>(`SELECT version FROM event WHERE id = ?`, B.ev.id);

    const before = await fingerprint(B.wid);
    const o = w.owner;
    const p = `/api/p/${SLUG}`;
    const probes: Probe[] = [
      // Wedding party sign-ins (PUT /party-accounts/:pid/perms with B's person id, and the rest).
      { label: "B's party member's perms", method: 'PUT', path: `${a}/party-accounts/${B.c.pid}/perms`, cookie: o, body: { perms: { vendors: true, people: true } }, want: [404] },
      { label: "invite B's party member", method: 'POST', path: `${a}/party-accounts/${B.c.pid}/invite`, cookie: o, body: { email: 'hacker@example.com' }, want: [404] },
      { label: "reset B's party member", method: 'POST', path: `${a}/party-accounts/${B.c.pid}/reset`, cookie: o, body: {}, want: [404] },
      { label: "sign out B's party member", method: 'POST', path: `${a}/party-accounts/${B.c.pid}/signout`, cookie: o, body: {}, want: [200, 404] },
      { label: "remove B's party sign-in", method: 'DELETE', path: `${a}/party-accounts/${B.c.pid}`, cookie: o, want: [200, 404] },
      { label: "B's guest as a party role", method: 'PUT', path: `${a}/planner/people/${B.c.pid}/role`, cookie: o, body: { role: 'Hacked' }, want: [404] },
      // Members and invites.
      { label: "demote B's owner", method: 'PATCH', path: `${a}/members/${w.otherId}`, cookie: o, body: { role: 'viewer' }, want: [404] },
      { label: "remove B's owner", method: 'DELETE', path: `${a}/members/${w.otherId}`, cookie: o, want: [404] },
      { label: "revoke B's member invite", method: 'DELETE', path: `${a}/members/invites/${bInvite}`, cookie: o, want: [200, 404] },
      // Photos and planner files (ids in the path).
      { label: "B's photo", method: 'GET', path: `${a}/photos/mb1`, cookie: o, want: [404] },
      { label: "B's photo thumb", method: 'GET', path: `${a}/photos/mb1/thumb`, cookie: o, want: [404] },
      { label: "delete B's photo", method: 'DELETE', path: `${a}/photos/mb1`, cookie: o, want: [404] },
      { label: "B's planner file", method: 'GET', path: `${a}/planner/files/fb1`, cookie: o, want: [404] },
      { label: "delete B's planner file", method: 'DELETE', path: `${a}/planner/files/fb1`, cookie: o, want: [404] },
      { label: "read B's planner file", method: 'POST', path: `${a}/planner/files/fb1/read`, cookie: o, body: {}, want: [400, 404] },
      // Emails (in the path, and B's vendor and file in the body).
      { label: "B's email", method: 'GET', path: `${a}/inbox/eb1`, cookie: o, want: [404] },
      { label: "re-sort B's email", method: 'PUT', path: `${a}/inbox/eb1`, cookie: o, body: { archived: true, read: true, kind: 'other' }, want: [404] },
      { label: "file B's email", method: 'POST', path: `${a}/inbox/eb1/file`, cookie: o, body: { vendorId: 'vb1', fileId: 'fb1' }, want: [404] },
      { label: "file B's attachment from A's email", method: 'POST', path: `${a}/inbox/ea1/file`, cookie: o, body: { vendorId: 'va1', fileId: 'fb1' }, want: [404] },
      // Board, songs.
      { label: "hide B's post", method: 'PATCH', path: `${a}/board/pb1`, cookie: o, body: { status: 'hidden' }, want: [404] },
      { label: "delete B's post", method: 'DELETE', path: `${a}/board/pb1`, cookie: o, want: [404] },
      { label: "reply under B's post", method: 'POST', path: `${a}/board`, cookie: o, body: { body: 'Hacked', parent: 'pb1' }, want: [404] },
      { label: "B's song", method: 'PATCH', path: `${a}/songs/sb1`, cookie: o, body: { status: 'no' }, want: [404] },
      { label: "delete B's song", method: 'DELETE', path: `${a}/songs/sb1`, cookie: o, want: [200, 404] },
      // Events and messages (B's ids in the path, in the body, and B's guests in `only`).
      { label: "edit B's event", method: 'PUT', path: `${a}/events/${B.ev.id}`, cookie: o, headers: { 'If-Match': String(evB.version) }, body: { name: 'Hacked' }, want: [403, 404, 409] },
      { label: "delete B's event", method: 'DELETE', path: `${a}/events/${B.ev.id}`, cookie: o, headers: { 'If-Match': String(evB.version) }, want: [400, 403, 404, 409] },
      { label: "edit B's message", method: 'PATCH', path: `${a}/texts/${B.cid}`, cookie: o, headers: { 'If-Match': '1' }, body: { body: 'Hacked' }, want: [404] },
      { label: "send B's message", method: 'POST', path: `${a}/texts/${B.cid}/send`, cookie: o, body: {}, want: [400, 404] },
      { label: "estimate B's message", method: 'POST', path: `${a}/texts/${B.cid}/estimate`, cookie: o, body: {}, want: [400, 404] },
      { label: "A's message to B's guest (only)", method: 'POST', path: `${a}/texts/${A.cid}/send`, cookie: o, body: { only: [B.a.inv, B.b.inv] }, want: [200, 400] },
      { label: "B's message to A's guest (campaignId)", method: 'POST', path: `${a}/guests/${A.a.inv}/send`, cookie: o, body: { campaignId: B.cid }, want: [400, 404] },
      { label: "A's message to B's guest (path)", method: 'POST', path: `${a}/guests/${B.a.inv}/send`, cookie: o, body: { campaignId: A.cid }, want: [200, 400, 404] },
      // Guest side: A's links and keys with B's ids in the body.
      { label: "A's party link acting for B's member", method: 'POST', path: `${p}/party`, body: { token: A.c.tok, personId: B.c.pid, action: 'add-task', text: 'Hacked' }, want: [403, 404] },
      { label: "A's helper key on B's task", method: 'POST', path: `${p}/tasks`, body: { k: helperA, id: 'tb1', status: 'done' }, want: [404] },
      { label: "A's coordinator key on B's log entry", method: 'POST', path: `${p}/coordinator`, body: { k: coordA, action: 'done', id: 'logb1' }, want: [200, 404] },
      { label: "A's guest likes B's post", method: 'POST', path: `${p}/board/pb1/like`, body: { token: A.a.tok }, want: [404] },
      { label: "A's guest deletes B's post", method: 'DELETE', path: `${p}/board/pb1`, body: { token: A.a.tok }, want: [404] },
      { label: "A's guest replies under B's post", method: 'POST', path: `${p}/board`, body: { token: A.a.tok, body: 'Hacked', parent: 'pb1' }, want: [404] },
      { label: "A's guest books B's shuttle", method: 'POST', path: `${p}/shuttles`, body: { token: A.a.tok, shuttleId: 'run-b-only', seats: 1 }, want: [404] },
      // B's ids in the query string.
      { label: "A's guest page with B's event", method: 'GET', path: `${p}/guide?g=${A.a.tok}&event=${B.ev.id}`, want: [200, 404] },
      { label: "A's photo page with B's event", method: 'GET', path: `${p}/photos?g=${A.a.tok}&event=${B.ev.id}`, want: [200] },
    ];
    const failures = await run(probes);
    // Seating: B's table id and B's guest in A's body (the version read just before, so the id check is what answers).
    for (const [label, body] of [
      ["take over B's table", { event: A.ev.key, aspect: '4 / 3', tables: [table(TABLE_B)], areas: [], seats: {} }],
      ["seat B's guest", { event: A.ev.key, aspect: '4 / 3', tables: [], areas: [], seats: { [B.a.pid]: null } }],
    ] as const) {
      const seatA = await jsonOf<{ version: number }>(call('GET', `${a}/seating?event=${A.ev.key}`, { cookie: o }));
      const res = await call('PUT', `${a}/seating`, { cookie: o, headers: { 'If-Match': String(seatA.version) }, body });
      if (res.status !== 400) failures.push(`${label} -> ${res.status} ${(await res.text()).slice(0, 140)}`);
      else await res.arrayBuffer();
    }
    // A guest's small copy for B's photo (a raw JPEG body).
    const thumb = await callRaw('PUT', `${p}/photos/mb1/thumb?g=${A.a.tok}`, JPEG, { 'content-type': 'image/jpeg' });
    if (thumb.status !== 404) failures.push(`A's guest adds a thumb to B's photo -> ${thumb.status}`);
    await thumb.arrayBuffer();
    // Estimating A's message for B's guests counts nobody.
    const est = await jsonOf<{ count?: number }>(call('POST', `${a}/texts/${A.cid}/estimate`, { cookie: o, body: { only: [B.a.inv, B.b.inv] } }));
    if ((est.count ?? 0) !== 0) failures.push(`estimate with B's guests in "only" counted ${est.count}`);
    // B's event key or id in A's query strings falls back to A's own: nothing of B's comes back.
    for (const path of [`${a}/planner/party?event=${B.ev.id}`, `${a}/seating?event=${B.ev.id}`, `/api/p/${SLUG}/photos?g=${A.a.tok}&event=${B.ev.id}`]) {
      const res = await call('GET', path, { cookie: o });
      const text = await res.text();
      if (res.status === 500) failures.push(`GET ${path} -> 500`);
      for (const id of [B.wid, B.c.pid, B.c.tok, B.a.tok, B.a.inv]) if (text.includes(id)) failures.push(`GET ${path} contains B's ${id}`);
    }
    expect(failures, listOf(failures)).toEqual([]);
    expect(await fingerprint(B.wid)).toEqual(before);
    // B's invite was never revoked, B's party member was never given more.
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM member_invite WHERE id = ? AND accepted_at IS NULL`, bInvite)).n).toBe(1);
    expect(await maybe(`SELECT 1 FROM party_account WHERE wedding_id = ? AND person_id = ?`, A.wid, B.c.pid)).toBeNull();
  }, 90_000);

  // ---------------------------------------------------------------- 2. shared features: the vendor directory

  /** Both venues 1.7 km apart; three florists from OpenStreetMap near them; B books one of them and one of its own. */
  const directory = async () => {
    const { A, B } = w;
    const guide = (key: string, v: { lat: number; lon: number }) => JSON.stringify({ [key]: { style: 'reception', lat: v.lat, lon: v.lon } });
    await exec(`UPDATE wedding SET guide = ? WHERE id = ?`, guide(A.ev.key, VENUE_A), A.wid);
    await exec(`UPDATE wedding SET guide = ? WHERE id = ?`, guide(B.ev.key, VENUE_B), B.wid);
    const stamp = now();
    const rows = [1, 2, 3].map((n) => {
      const lat = VENUE_A.lat + n * 0.001;
      const lon = VENUE_A.lon + n * 0.001;
      return t.db
        .prepare(`INSERT INTO vendor_directory (id, source, category, name, lat, lon, cell, address, phone, email, website, hidden, first_seen, updated_at) VALUES (?, 'osm', 'florist', ?, ?, ?, ?, '', '', '', '', 0, ?, ?)`)
        .bind(`osm:node/900${n}`, `Florist ${n}`, lat, lon, cellOf(lat, lon), stamp, stamp);
    });
    // The area counts as searched, so nothing is fetched.
    rows.push(t.db.prepare(`INSERT INTO vendor_area_search (category, cell, searched_at) VALUES ('florist', ?, ?)`).bind(`${cellOf(VENUE_A.lat, VENUE_A.lon)}~25`, stamp));
    await t.db.batch(rows);
    // B: a directory florist booked at $43,217, and its own florist (not in the directory) booked at $98,761.
    await saveDoc(w.other, B.wid, 'vendors', {
      list: [
        { id: 'vb1', name: 'Florist 3', category: 'Florist', status: 'booked', quote: 43217, dirId: 'osm:node/9003' },
        { id: 'vb2', name: 'Petal Co', category: 'Florist', status: 'booked', quote: 98761, phone: '0400 000 001' },
      ],
    });
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM vendor_use WHERE wedding_id = ?`, B.wid)).n).toBe(2);
  };
  const search = (cookie = w.owner) => call('GET', `/api/a/w/${w.A.wid}/planner/vendors/search?category=florist&km=25`, { cookie });

  it('the vendor directory: no wedding ids, no one couple’s prices, only counts of how often vendors were chosen', async () => {
    await directory();
    const res = await search();
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as { results: Hit[]; price: unknown };
    expect(body.results.length).toBeGreaterThanOrEqual(3);
    const failures: string[] = [];
    for (const s of [w.B.wid, w.A.wid, w.otherId, w.ownerId, 'other@example.com', SLUG2, '43217', '98761']) if (text.includes(s)) failures.push(`the search answer contains ${s}`);
    const keys = new Set(keysOf(body));
    for (const k of keys) if (/wedding|user|owner|couple_?id|amount|quote/i.test(k)) failures.push(`the search answer has a field "${k}"`);
    const allowed = new Set(['id', 'osm', 'name', 'address', 'phone', 'email', 'website', 'km', 'lat', 'lon', 'source', 'added', 'booked']);
    for (const r of body.results) for (const k of Object.keys(r)) if (!allowed.has(k)) failures.push(`a result has an unexpected field "${k}"`);
    // Two prices, both one couple's: no range.
    if (body.price !== null) failures.push(`a price range from one wedding: ${JSON.stringify(body.price)}`);
    // How often: counts, never who.
    const booked = body.results.find((r) => r.name === 'Florist 3');
    if (!booked || booked.booked !== 1 || booked.added !== 1) failures.push(`Florist 3 should show added 1, booked 1: ${JSON.stringify(booked)}`);
    expect(failures, listOf(failures)).toEqual([]);
    // B's own vendor list never comes back through A's directory search, and B's search shows the same counts.
    const fromB = await call('GET', `/api/a/w/${w.B.wid}/planner/vendors/search?category=florist&km=25`, { cookie: w.other });
    expect([200, 502]).toContain(fromB.status);
    await fromB.arrayBuffer();
  }, 60_000);

  // SECURITY HOLE: src/lib/directory.ts:144-153 counts vendor_use rows, not weddings ("amounts.length >= 3"), and
  // includes the asking wedding's own rows. A couple who books two florists in the area at prices they choose
  // ($1 and anything) turns one other couple's single booking into "low/typical/high", and reads that couple's
  // exact price as the median. Fix: one amount per wedding (GROUP BY u.wedding_id), leave out the asking
  // wedding (u.wedding_id != ?), and show a range only when COUNT(DISTINCT wedding_id) >= 3.
  it("fixed: the directory's price range never reveals another couple's price (needs three other weddings)", async () => {
    await directory();
    // A books two florists itself at prices it picked.
    await saveDoc(w.owner, w.A.wid, 'vendors', {
      list: [
        { id: 'va1', name: 'Florist 1', category: 'Florist', status: 'booked', quote: 1, dirId: 'osm:node/9001' },
        { id: 'va2', name: 'Florist 2', category: 'Florist', status: 'booked', quote: 9_000_000, dirId: 'osm:node/9002' },
      ],
    });
    const body = await jsonOf<{ price: { low: number; typical: number; high: number } | null }>(search());
    // Only two weddings have prices here (A and B): there must be no range at all.
    expect(body.price).toBeNull();
  }, 60_000);

  // SECURITY HOLE (low): src/lib/directory.ts:171-180 files a couple's own booked vendor in the shared directory at
  // the couple's exact venue latitude and longitude (venue.lat, venue.lon), and searchDirectory returns lat/lon
  // to every wedding. A nearby couple learns where another wedding is held (a private property, for a backyard
  // wedding) and who they booked. Fix: store the grid square's centre ((Math.floor(lat / CELL) + 0.5) * CELL, the
  // same for lon) for source 'couple', and don't return lat/lon for those hits.
  it("fixed: a couple's own booked vendor never shows another wedding's exact venue location", async () => {
    await directory();
    const body = await jsonOf<{ results: Hit[] }>(search());
    const petal = body.results.find((r) => r.name === 'Petal Co');
    expect(petal).toBeDefined();
    expect(!!petal && petal.lat === VENUE_B.lat && petal.lon === VENUE_B.lon).toBe(false);
  }, 60_000);

  // ---------------------------------------------------------------- 2. shared features: email intake

  it("email intake: A's address only ever fills A's inbox and A's vendors, whatever the headers say", async () => {
    const { A, B } = w;
    const mail = (raw: string, to: string) => receiveEmail({ from: 'x@example.com', to, raw: new Blob([new TextEncoder().encode(raw.replace(/\n/g, '\r\n'))]).stream(), headers: new Headers() }, env);
    expect(await statusOf(call('PUT', `/api/a/w/${A.wid}/inbox/settings/address`, { cookie: w.owner, body: { address: 'a-inbox@mail.example' } }))).toBe(200);
    expect(await statusOf(call('PUT', `/api/a/w/${B.wid}/inbox/settings/address`, { cookie: w.other, body: { address: 'b-inbox@mail.example' } }))).toBe(200);
    // B can't take A's address, in any case.
    expect(await statusOf(call('PUT', `/api/a/w/${B.wid}/inbox/settings/address`, { cookie: w.other, body: { address: 'A-Inbox@Mail.Example' } }))).toBe(400);
    // A guest with the same name in both weddings; the same florist works for both couples.
    await exec(`UPDATE person SET name = 'Ivy Testguest' WHERE id IN (?, ?)`, A.a.pid, B.a.pid);
    await saveDoc(w.owner, A.wid, 'vendors', { list: [{ id: 'va1', name: 'Bloom A', category: 'Florist', email: 'sales@bloom.example' }] });
    await saveDoc(w.other, B.wid, 'vendors', { list: [{ id: 'vb1', name: 'Bloom B', category: 'Florist', email: 'sales@bloom.example' }] });
    // Turn on A's calendar feed, to check nothing from an email header lands in it.
    const cal = await jsonOf<{ url: string }>(call('PUT', `/api/a/w/${A.wid}/planner-calendar`, { cookie: w.owner, body: { on: true } }));
    const smsBefore = (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM sms_out`)).n;
    const before = await fingerprint(B.wid);

    const pdf = btoa('%PDF-1.4 a small quote');
    const crlf = btoa('Your quote\r\nBcc: evil@example.com\r\nX-Injected: 1');
    // To A, though the headers name B; a quote; a CRLF in the (encoded) subject.
    const quote = await mail(
      `From: Jess <sales@bloom.example>
To: b-inbox@mail.example
Cc: b-inbox@mail.example
Subject: =?UTF-8?B?${crlf}?=
Message-ID: <q1@bloom>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="b"

--b
Content-Type: text/plain

Our quote is attached.
--b
Content-Type: application/pdf; name="quote.pdf"
Content-Disposition: attachment; filename="quote.pdf"
Content-Transfer-Encoding: base64

${pdf}
--b--
`,
      'a-inbox@mail.example',
    );
    expect(quote.stored).toBe(true);
    // A guest's name that exists in both weddings (the same seed): filed under A's guest.
    expect((await mail(`From: Ivy Testguest <someone@gmail.com>\nSubject: Parking?\n\nIs there parking?`, ' A-INBOX@Mail.Example ')).stored).toBe(true);
    // Both addresses at once, or B's address with a different case, never reach the wrong inbox.
    expect((await mail('From: x@y.example\nSubject: Both\n\nHi', 'a-inbox@mail.example, b-inbox@mail.example')).stored).toBe(false);

    expect(await fingerprint(B.wid)).toEqual(before);
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM inbox_email WHERE wedding_id = ?`, B.wid)).n).toBe(0);
    const files = await all<{ wedding_id: string }>(`SELECT wedding_id FROM planner_file`);
    expect(files.length).toBe(1);
    expect(files.every((f) => f.wedding_id === A.wid)).toBe(true);
    // A's inbox: the quote filed under A's vendor; the guest is A's guest.
    const res = await call('GET', `/api/a/w/${A.wid}/inbox`, { cookie: w.owner });
    expect(res.headers.get('content-type') ?? '').toContain('application/json');
    expect([...res.headers.keys()].some((k) => /^(bcc|x-injected)$/i.test(k))).toBe(false);
    const inbox = (await res.json()) as { emails: { subject: string; vendorId: string | null; invitationId: string | null; filed: string }[] };
    expect(inbox.emails.length).toBe(2);
    const q = inbox.emails.find((e) => e.vendorId);
    expect(q).toMatchObject({ vendorId: 'va1', filed: 'Bloom A' });
    // The subject is kept as text (no headers built from it).
    expect(typeof q?.subject).toBe('string');
    const g = inbox.emails.find((e) => e.invitationId);
    expect(g?.invitationId).toBe(A.a.inv);
    const vendorsB = await docOf<{ list: { quotes?: unknown[] }[] }>(B.wid, 'vendors');
    expect(vendorsB.list.every((v) => (v.quotes ?? []).length === 0)).toBe(true);
    // No text went anywhere, and the calendar feed has no header from the email.
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM sms_out`)).n).toBe(smsBefore);
    const ics = await (await call('GET', new URL(cal.url).pathname)).text();
    expect(icsLines(ics).some((l) => /^(bcc|x-injected):/i.test(l))).toBe(false);
  }, 60_000);

  // ---------------------------------------------------------------- 2. shared features: photos

  it("photos: A's live wall code, A's album links and A's session never list or open B's photos", async () => {
    const { A, B } = w;
    // Photo storage that hands back the key it was asked for (so a 404 means "refused", not "no storage").
    const media = { get: async (key: string) => ({ body: new Blob([`photo:${key}`]).stream(), size: `photo:${key}`.length }), delete: async () => undefined };
    env = { ...env, MEDIA: media as unknown as R2Bucket };
    const stamp = now();
    await t.db.batch([
      t.db.prepare(`INSERT INTO media (id, wedding_id, kind, key, content_type, bytes, invitation_id, created_at) VALUES ('ma1', ?, 'photo', 'wa/ma1.jpg', 'image/jpeg', 22, ?, ?)`).bind(A.wid, A.a.inv, stamp),
      t.db.prepare(`INSERT INTO media (id, wedding_id, kind, key, content_type, bytes, invitation_id, created_at) VALUES ('mb1', ?, 'photo', 'wb/mb1.jpg', 'image/jpeg', 22, ?, ?)`).bind(B.wid, B.a.inv, stamp),
      t.db.prepare(`INSERT INTO photo_thumb (media_id, wedding_id, data, created_at) VALUES ('mb1', ?, ?, ?)`).bind(B.wid, JPEG, stamp),
      t.db.prepare(`INSERT INTO board_post (id, wedding_id, invitation_id, author, body, parent_id, status, created_at) VALUES ('pb1', ?, ?, 'B guest', 'B only post', NULL, 'shown', ?)`).bind(B.wid, B.a.inv, stamp),
    ]);
    const liveA = (await jsonOf<{ code: string | null }>(call('PUT', `/api/a/w/${A.wid}/live`, { cookie: w.owner, body: { on: true } }))).code ?? '';
    const liveB = (await jsonOf<{ code: string | null }>(call('PUT', `/api/a/w/${B.wid}/live`, { cookie: w.other, body: { on: true } }))).code ?? '';
    expect(liveA.length).toBeGreaterThanOrEqual(16);
    expect(liveB).not.toBe(liveA);
    for (const [cookie, wid] of [
      [w.owner, A.wid],
      [w.other, B.wid],
    ] as const)
      expect(await statusOf(call('PUT', `/api/a/w/${wid}/album`, { cookie, body: { on: true } }))).toBe(200);

    const failures: string[] = [];
    // The wall: A's photos and posts only.
    const wall = await call('GET', `/api/p/${SLUG}/live?k=${liveA}`);
    const wallText = await wall.text();
    if (wall.status !== 200) failures.push(`A's wall -> ${wall.status}`);
    const wallIds = (JSON.parse(wallText) as { photos: { id: string }[] }).photos.map((x) => x.id);
    if (JSON.stringify(wallIds) !== JSON.stringify(['ma1'])) failures.push(`A's wall lists ${JSON.stringify(wallIds)}`);
    if (wallText.includes('B only post')) failures.push(`A's wall shows B's board post`);
    const own = await call('GET', `/api/p/${SLUG}/live/photo/ma1?k=${liveA}`);
    if (own.status !== 200 || (await own.text()) !== 'photo:wa/ma1.jpg') failures.push(`A's wall can't open A's own photo (${own.status})`);
    for (const [label, path] of [
      ["A's code, B's photo id", `/api/p/${SLUG}/live/photo/mb1?k=${liveA}`],
      ["A's code on B's slug", `/api/p/${SLUG2}/live/photo/mb1?k=${liveA}`],
      ["B's code on A's slug", `/api/p/${SLUG}/live/photo/mb1?k=${liveB}`],
      ["A's album link, B's photo", `/api/p/${SLUG}/album/mb1?g=${A.a.tok}`],
      ["A's album link, B's thumb", `/api/p/${SLUG}/album/mb1/thumb?g=${A.a.tok}`],
      ["A's album link on B's slug", `/api/p/${SLUG2}/album/mb1?g=${A.a.tok}`],
      ["A's session, B's photo", `/api/a/w/${A.wid}/photos/mb1`],
      ["A's session, B's thumb", `/api/a/w/${A.wid}/photos/mb1/thumb`],
    ] as const) {
      const res = await call('GET', path, { cookie: w.owner });
      const text = await res.text();
      if (res.status !== 404) failures.push(`${label} -> ${res.status}`);
      if (text.includes('photo:wb/')) failures.push(`${label} returned B's photo bytes`);
    }
    // The album and the admin list: A's photos only.
    const album = await jsonOf<{ photos: { id: string }[] }>(call('GET', `/api/p/${SLUG}/album?g=${A.a.tok}`));
    if (JSON.stringify(album.photos.map((x) => x.id)) !== JSON.stringify(['ma1'])) failures.push(`A's album lists ${JSON.stringify(album.photos.map((x) => x.id))}`);
    const ownAlbum = await call('GET', `/api/p/${SLUG}/album/ma1?g=${A.a.tok}`);
    if (ownAlbum.status !== 200) failures.push(`A's guest can't open A's own album photo (${ownAlbum.status})`);
    await ownAlbum.arrayBuffer();
    const list = await jsonOf<{ items: { id: string }[] }>(call('GET', `/api/a/w/${A.wid}/photos`, { cookie: w.owner }));
    if (JSON.stringify(list.items.map((x) => x.id)) !== JSON.stringify(['ma1'])) failures.push(`A's photo list ${JSON.stringify(list.items.map((x) => x.id))}`);
    expect(failures, listOf(failures)).toEqual([]);
    expect((await one<{ d: string | null }>(`SELECT deleted_at AS d FROM media WHERE id = 'mb1'`)).d).toBeNull();
  }, 60_000);

  // ---------------------------------------------------------------- 2. shared features: SMS replies

  it("SMS: a mobile that's a guest of both weddings changes only the wedding whose number it texted", async () => {
    const { A, B } = w;
    const MOBILE = '+61400111222';
    const SENDER_A = '+61400000001';
    const SENDER_B = '+61400000002';
    await exec(`UPDATE wedding SET sms_sender = ? WHERE id = ?`, SENDER_A, A.wid);
    await exec(`UPDATE wedding SET sms_sender = ? WHERE id = ?`, SENDER_B, B.wid);
    // One guest in each wedding on the same mobile, each invited to just the first event, no replies yet.
    for (const [g, ev] of [
      [A.a, A.ev],
      [B.a, B.ev],
    ] as const) {
      await exec(`UPDATE invitation SET phone = ?, sms_optout = 0 WHERE id = ?`, MOBILE, g.inv);
      await exec(`DELETE FROM invite_event WHERE invitation_id = ?`, g.inv);
      await exec(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`, g.inv, ev.id);
      await exec(`DELETE FROM rsvp WHERE invitation_id = ?`, g.inv);
    }
    const rsvpOf = async (inv: string) => (await maybe(`SELECT attending FROM rsvp WHERE invitation_id = ?`, inv))?.attending ?? null;
    const text = async (id: string, to: string, body: string) => {
      const res = await call('POST', '/api/hooks/texto/inbound?k=hook-key', { body: { message_id: id, from: '0400 111 222', to, body, received_at: now() } });
      expect(res.status).toBe(200);
      await res.arrayBuffer();
      await Promise.allSettled(waits);
      return maybe(`SELECT wedding_id, invitation_id, action FROM sms_in WHERE provider_id = ?`, id);
    };

    const bBefore = await fingerprint(B.wid);
    const yes = await text('m-yes-a', SENDER_A, 'YES');
    expect(yes).toMatchObject({ wedding_id: A.wid, invitation_id: A.a.inv });
    expect(await rsvpOf(A.a.inv)).toBe(1);
    expect(await rsvpOf(B.a.inv)).toBeNull();
    // Only the RSVP side of B is compared (texts to A's guest are A's rows).
    expect(await fingerprint(B.wid)).toEqual(bBefore);

    const aBefore = await fingerprint(A.wid);
    const no = await text('m-no-b', SENDER_B, 'No sorry');
    expect(no).toMatchObject({ wedding_id: B.wid, invitation_id: B.a.inv });
    expect(await rsvpOf(B.a.inv)).toBe(0);
    expect(await rsvpOf(A.a.inv)).toBe(1);
    expect(await fingerprint(A.wid)).toEqual(aBefore);

    // A second invitation in A on the same mobile: A never guesses whose reply it is, and B is untouched.
    await exec(`UPDATE invitation SET phone = ? WHERE id = ?`, MOBILE, A.b.inv);
    const bMid = await fingerprint(B.wid);
    const unclear = await text('m-no-a', SENDER_A, 'NO');
    expect(unclear).toMatchObject({ wedding_id: A.wid });
    expect(await rsvpOf(A.a.inv)).toBe(1);
    expect(await rsvpOf(B.a.inv)).toBe(0);
    expect(await fingerprint(B.wid)).toEqual(bMid);
  }, 60_000);

  // ---------------------------------------------------------------- 2. shared features: shuttles

  // SECURITY HOLE: src/routes/shuttles.ts:92 checks a run's free seats with
  // "SELECT SUM(seats) FROM shuttle_booking WHERE shuttle_id = ?2 AND invitation_id != ?3", with no wedding_id.
  // Shuttle ids are chosen by the client (any string up to 40), so two weddings with the same run id share one
  // seat count: B's guests fill A's bus, and a couple can name a run after another wedding's (seen by anyone who
  // is a guest there) to find out how many booked it, or to make it look full. Fix: add "wedding_id = ?1 AND" to
  // that subquery (and to the DELETE on line 84), and make the key (wedding_id, shuttle_id, invitation_id).
  it("fixed: another wedding's shuttle bookings never use up this wedding's seats", async () => {
    const { A, B } = w;
    for (const [g, ev] of [
      [A.a, A.ev],
      [B.a, B.ev],
    ] as const) {
      await exec(`DELETE FROM invite_event WHERE invitation_id = ?`, g.inv);
      await exec(`INSERT INTO invite_event (invitation_id, event_id) VALUES (?, ?)`, g.inv, ev.id);
      await exec(`DELETE FROM rsvp WHERE invitation_id = ?`, g.inv);
    }
    await exec(`UPDATE invitation SET seats_held = 2 WHERE id = ?`, A.a.inv);
    await exec(`UPDATE invitation SET seats_held = 5 WHERE id = ?`, B.a.inv);
    await saveDoc(w.owner, A.wid, `shuttles/${A.ev.key}`, { list: [{ id: 'run-1', time: '2pm', from: 'Hotel', to: 'Venue', seats: 5 }] });
    await saveDoc(w.other, B.wid, `shuttles/${B.ev.key}`, { list: [{ id: 'run-1', time: '3pm', from: 'Station', to: 'Farm', seats: 10 }] });
    // B's guest takes 5 of B's 10 seats.
    expect(await statusOf(call('POST', `/api/p/${SLUG2}/shuttles`, { body: { token: B.a.tok, shuttleId: 'run-1', seats: 5 } }))).toBe(200);
    // A's bus is empty: 2 of its 5 seats must be free.
    expect(await statusOf(call('POST', `/api/p/${SLUG}/shuttles`, { body: { token: A.a.tok, shuttleId: 'run-1', seats: 2 } }))).toBe(200);
  }, 60_000);

  // ---------------------------------------------------------------- 3. sessions and cookies

  it('admin sessions: dead after logout, after a passcode change elsewhere, after expiry, and the moment a member is removed or demoted', async () => {
    const a = `/api/a/w/${w.A.wid}`;
    // Logout ends that session only.
    const second = await login('owner@example.com', PASS.owner);
    expect(await statusOf(call('POST', '/api/a/auth/logout', { cookie: second, body: {} }))).toBe(200);
    expect(await statusOf(call('GET', '/api/a/me', { cookie: second }))).toBe(401);
    expect(await statusOf(call('GET', `${a}/overview`, { cookie: second }))).toBe(401);
    expect(await statusOf(call('GET', '/api/a/me', { cookie: w.owner }))).toBe(200);

    // A passcode change signs out every other device; the old passcode stops working.
    const laptop = await login('owner@example.com', PASS.owner);
    expect(await statusOf(call('POST', '/api/a/auth/passcode', { cookie: w.owner, body: { current: PASS.owner, next: 'brand-new-pass-2027' } }))).toBe(200);
    expect(await statusOf(call('GET', '/api/a/me', { cookie: laptop }))).toBe(401);
    expect(await statusOf(call('GET', `${a}/guests`, { cookie: laptop }))).toBe(401);
    expect(await statusOf(call('GET', '/api/a/me', { cookie: w.owner }))).toBe(200);
    expect(await statusOf(call('POST', '/api/a/auth/login', { body: { email: 'owner@example.com', passcode: PASS.owner } }))).toBe(401);

    // An expired session is refused.
    const viewerToken = w.viewer.slice(w.viewer.indexOf('=') + 1);
    await exec(`UPDATE session SET expires_at = ? WHERE id = ?`, PAST, await sessionId(decodeURIComponent(viewerToken), SECRET));
    expect(await statusOf(call('GET', '/api/a/me', { cookie: w.viewer }))).toBe(401);

    // Demoted: the editor's very next write is refused.
    expect(await statusOf(call('PUT', `${a}/coordinator`, { cookie: w.editor, body: { on: true, name: 'Jo' } }))).toBe(200);
    expect(await statusOf(call('PATCH', `${a}/members/${w.editorId}`, { cookie: w.owner, body: { role: 'viewer' } }))).toBe(200);
    expect(await statusOf(call('PUT', `${a}/coordinator`, { cookie: w.editor, body: { on: false } }))).toBe(403);
    expect((await jsonOf<{ url: string }>(call('GET', `${a}/coordinator`, { cookie: w.editor }))).url).toBe('');
    // Removed: the same session loses the wedding at once (admin routes and the couple's preview of guest pages).
    expect(await statusOf(call('DELETE', `${a}/members/${w.editorId}`, { cookie: w.owner }))).toBe(200);
    expect(await statusOf(call('GET', `${a}/overview`, { cookie: w.editor }))).toBe(404);
    expect(await statusOf(call('GET', a, { cookie: w.editor }))).toBe(404);
    expect(await statusOf(call('GET', `/api/p/${SLUG}/guide?preview=1`, { cookie: w.editor }))).toBe(404);
    const me = await jsonOf<{ weddings: { id: string }[] }>(call('GET', '/api/a/me', { cookie: w.editor }));
    expect(me.weddings.map((x) => x.id)).not.toContain(w.A.wid);
  }, 60_000);

  it('member invite links: one use only, they expire, can be revoked, and never let a stranger into an existing account', async () => {
    const a = `/api/a/w/${w.A.wid}`;
    const invite = async (email: string, role: string) => {
      const res = await jsonOf<{ link: string }>(call('POST', `${a}/members/invite`, { cookie: w.owner, body: { email, role } }));
      return tokenOf(res.link);
    };
    const tk = await invite('newbie@example.com', 'editor');
    expect(tk.length).toBeGreaterThanOrEqual(40);
    expect((await jsonOf<{ role: string; hasAccount: boolean }>(call('GET', `/api/a/invite/${tk}`))).role).toBe('editor');
    // The role isn't the joiner's to choose.
    expect(await statusOf(call('POST', `/api/a/invite/${tk}`, { body: { passcode: 'newbie-pass-2027', firstName: 'New', role: 'owner' } }))).toBe(400);
    const joined = await call('POST', `/api/a/invite/${tk}`, { body: { passcode: 'newbie-pass-2027', firstName: 'New' } });
    expect(joined.status).toBe(200);
    await joined.arrayBuffer();
    const newbie = cookieOf(joined);
    expect((await jsonOf<{ role: string }>(call('GET', a, { cookie: newbie }))).role).toBe('editor');
    // Replayed: refused, whatever is sent.
    expect(await statusOf(call('POST', `/api/a/invite/${tk}`, { body: { passcode: 'newbie-pass-2027', firstName: 'New' } }))).toBe(410);
    expect(await statusOf(call('POST', `/api/a/invite/${tk}`, { body: { passcode: 'attacker-pass-2027', firstName: 'Evil' } }))).toBe(410);
    expect(await statusOf(call('GET', `/api/a/invite/${tk}`))).toBe(410);
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM membership m JOIN user u ON u.id = m.user_id WHERE u.email = 'newbie@example.com'`)).n).toBe(1);

    // Expired.
    const late = await invite('late@example.com', 'owner');
    await exec(`UPDATE member_invite SET expires_at = ? WHERE email = 'late@example.com'`, PAST);
    expect(await statusOf(call('GET', `/api/a/invite/${late}`))).toBe(410);
    expect(await statusOf(call('POST', `/api/a/invite/${late}`, { body: { passcode: 'late-pass-2027', firstName: 'Late' } }))).toBe(410);
    expect(await maybe(`SELECT 1 FROM user WHERE email = 'late@example.com'`)).toBeNull();

    // Revoked.
    const gone = await invite('gone@example.com', 'viewer');
    const goneId = (await one<{ id: string }>(`SELECT id FROM member_invite WHERE email = 'gone@example.com'`)).id;
    expect(await statusOf(call('DELETE', `${a}/members/invites/${goneId}`, { cookie: w.owner }))).toBe(200);
    expect(await statusOf(call('POST', `/api/a/invite/${gone}`, { body: { passcode: 'gone-pass-2027', firstName: 'Gone' } }))).toBe(410);

    // A leaked link to someone who already has an account (B's owner) needs their passcode, not a new one.
    const leak = await invite('other@example.com', 'owner');
    expect(await statusOf(call('POST', `/api/a/invite/${leak}`, { body: { passcode: 'attacker-pass-2027', firstName: 'Evil' } }))).toBe(400);
    expect(await maybe(`SELECT 1 FROM membership WHERE wedding_id = ? AND user_id = ?`, w.A.wid, w.otherId)).toBeNull();
    expect(await statusOf(call('POST', '/api/a/auth/login', { body: { email: 'other@example.com', passcode: 'attacker-pass-2027' } }))).toBe(401);
    // A garbage or truncated token is the same "gone".
    for (const bad of ['x'.repeat(43), tk.slice(0, 19), `${tk}x`]) expect(await statusOf(call('GET', `/api/a/invite/${bad}`)), bad).toBe(410);
  }, 60_000);

  it('party portal links: invite and reset links work once and expire; old passwords stop working', async () => {
    const { A } = w;
    const a = `/api/a/w/${A.wid}`;
    const p = `/api/p/${SLUG}/portal`;
    const t1 = tokenOf((await jsonOf<{ link: string }>(call('POST', `${a}/party-accounts/${A.c.pid}/invite`, { cookie: w.owner, body: { email: 'ella@example.com' } }))).link);
    expect(await statusOf(call('POST', `${p}/password-link`, { body: { t: t1, password: 'bridesmaid-2027' } }))).toBe(200);
    // The invite is spent.
    expect(await statusOf(call('GET', `${p}/link?t=${t1}`))).toBe(404);
    expect(await statusOf(call('POST', `${p}/password-link`, { body: { t: t1, email: 'evil@example.com', password: 'hijacked-2027' } }))).toBe(404);

    // A reset link, expired.
    const t2 = tokenOf((await jsonOf<{ link: string }>(call('POST', `${a}/party-accounts/${A.c.pid}/reset`, { cookie: w.owner, body: {} }))).link);
    await exec(`UPDATE party_account SET reset_expires = ? WHERE person_id = ?`, PAST, A.c.pid);
    expect(await statusOf(call('GET', `${p}/link?t=${t2}`))).toBe(404);
    expect(await statusOf(call('POST', `${p}/password-link`, { body: { t: t2, password: 'hijacked-2027' } }))).toBe(404);
    // A fresh one: once.
    const t3 = tokenOf((await jsonOf<{ link: string }>(call('POST', `${a}/party-accounts/${A.c.pid}/reset`, { cookie: w.owner, body: {} }))).link);
    expect(t3).not.toBe(t2);
    expect(await statusOf(call('POST', `${p}/password-link`, { body: { t: t3, password: 'second-pass-2027' } }))).toBe(200);
    expect(await statusOf(call('POST', `${p}/password-link`, { body: { t: t3, password: 'hijacked-2027' } }))).toBe(404);
    expect(await statusOf(call('POST', `${p}/login`, { body: { email: 'ella@example.com', password: 'bridesmaid-2027' } }))).toBe(401);
    expect(await statusOf(call('POST', `${p}/login`, { body: { email: 'ella@example.com', password: 'second-pass-2027' } }))).toBe(200);

    // An expired invite never sets a password.
    const t4 = tokenOf((await jsonOf<{ link: string }>(call('POST', `${a}/party-accounts/${A.d.pid}/invite`, { cookie: w.owner, body: { email: 'dee@example.com' } }))).link);
    await exec(`UPDATE party_account SET invite_expires = ? WHERE person_id = ?`, PAST, A.d.pid);
    expect(await statusOf(call('GET', `${p}/link?t=${t4}`))).toBe(404);
    expect(await statusOf(call('POST', `${p}/password-link`, { body: { t: t4, password: 'hijacked-2027' } }))).toBe(404);
    expect((await one<{ h: string | null }>(`SELECT pass_hash AS h FROM party_account WHERE person_id = ? AND deleted_at IS NULL`, A.d.pid)).h).toBeNull();
  }, 60_000);

  it('party portal sessions: the same email and password in two weddings are two sign-ins; losing the role or the sign-in ends it at once', async () => {
    const { A, B } = w;
    const jarA = await portalAccount(w.owner, A.wid, SLUG, A.c.pid, 'shared@example.com', 'same-pass-2027');
    const jarB = await portalAccount(w.other, B.wid, SLUG2, B.c.pid, 'shared@example.com', 'same-pass-2027');
    expect(jarA).not.toBe(jarB);
    const me = (slug: string, cookie: string) => jsonOf<{ signedIn: boolean; token?: string }>(call('GET', `/api/p/${slug}/portal/me`, { cookie }));
    expect((await me(SLUG, jarA)).signedIn).toBe(true);
    // Each cookie belongs to its wedding only, even with the same email and password.
    expect((await me(SLUG2, jarA)).signedIn).toBe(false);
    expect((await me(SLUG, jarB)).signedIn).toBe(false);
    const meA = await me(SLUG, jarA);
    expect(meA.token).toBe(A.c.tok);
    const partyB = await call('GET', `/api/p/${SLUG2}/party`, { cookie: jarA });
    expect(partyB.status).toBe(404);
    expect(await partyB.text()).not.toContain(B.c.tok);
    // A's password change doesn't touch B's sign-in.
    expect(await statusOf(call('POST', `/api/p/${SLUG}/portal/password`, { cookie: jarA, body: { current: 'same-pass-2027', next: 'changed-pass-2027' } }))).toBe(200);
    expect(await statusOf(call('POST', `/api/p/${SLUG2}/portal/login`, { body: { email: 'shared@example.com', password: 'same-pass-2027' } }))).toBe(200);
    expect((await me(SLUG2, jarB)).signedIn).toBe(true);

    // The couple takes away the role: the sign-in stops at once.
    expect(await statusOf(call('PUT', `/api/a/w/${A.wid}/planner/people/${A.c.pid}/role`, { cookie: w.owner, body: { role: '' } }))).toBe(200);
    expect((await me(SLUG, jarA)).signedIn).toBe(false);
    expect(await statusOf(call('POST', `/api/p/${SLUG}/party`, { cookie: jarA, body: { personId: A.c.pid, action: 'add-task', text: 'Still here?' } }))).not.toBe(200);
    // The couple removes B's member's sign-in: that session is gone too.
    expect(await statusOf(call('DELETE', `/api/a/w/${B.wid}/party-accounts/${B.c.pid}`, { cookie: w.other }))).toBe(200);
    expect((await me(SLUG2, jarB)).signedIn).toBe(false);
    expect((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM party_session WHERE wedding_id = ?`, B.wid)).n).toBe(0);
  }, 60_000);

  // ---------------------------------------------------------------- 4. privilege escalation

  it("members: an editor can't make themselves owner or remove the owner; a viewer can't invite or change roles", async () => {
    const a = `/api/a/w/${w.A.wid}`;
    expect(await statusOf(call('POST', `${a}/members/invite`, { cookie: w.owner, body: { email: 'pending@example.com', role: 'viewer' } }))).toBe(200);
    const pending = (await one<{ id: string }>(`SELECT id FROM member_invite WHERE email = 'pending@example.com'`)).id;
    const before = await fingerprint(w.A.wid);
    const probes: Probe[] = [];
    for (const [who, cookie] of [
      ['editor', w.editor],
      ['viewer', w.viewer],
    ] as const) {
      const self = who === 'editor' ? w.editorId : w.viewerId;
      probes.push(
        { label: `${who} makes themselves owner`, method: 'PATCH', path: `${a}/members/${self}`, cookie, body: { role: 'owner' }, want: [403] },
        { label: `${who} demotes the owner`, method: 'PATCH', path: `${a}/members/${w.ownerId}`, cookie, body: { role: 'viewer' }, want: [403] },
        { label: `${who} removes the owner`, method: 'DELETE', path: `${a}/members/${w.ownerId}`, cookie, want: [403] },
        { label: `${who} invites an owner`, method: 'POST', path: `${a}/members/invite`, cookie, body: { email: 'friend@example.com', role: 'owner' }, want: [403] },
        { label: `${who} invites a viewer`, method: 'POST', path: `${a}/members/invite`, cookie, body: { email: 'friend@example.com', role: 'viewer' }, want: [403] },
        { label: `${who} revokes an invite`, method: 'DELETE', path: `${a}/members/invites/${pending}`, cookie, want: [403] },
      );
    }
    probes.push(
      { label: 'viewer promotes the editor', method: 'PATCH', path: `${a}/members/${w.editorId}`, cookie: w.viewer, body: { role: 'owner' }, want: [403] },
      { label: 'viewer removes the editor', method: 'DELETE', path: `${a}/members/${w.editorId}`, cookie: w.viewer, want: [403] },
      { label: 'editor removes the viewer', method: 'DELETE', path: `${a}/members/${w.viewerId}`, cookie: w.editor, want: [403] },
      // The last owner can't leave or step down (nobody would be left to run it).
      { label: 'last owner steps down', method: 'PATCH', path: `${a}/members/${w.ownerId}`, cookie: w.owner, body: { role: 'editor' }, want: [409] },
      { label: 'last owner leaves', method: 'DELETE', path: `${a}/members/${w.ownerId}`, cookie: w.owner, want: [409] },
    );
    const failures = await run(probes);
    expect(failures, listOf(failures)).toEqual([]);
    expect(await fingerprint(w.A.wid)).toEqual(before);
    // A viewer sees who's who, not their emails or pending invites.
    const list = await jsonOf<{ members: { id: string; email: string }[]; invites: unknown[] }>(call('GET', `${a}/members`, { cookie: w.viewer }));
    expect(list.members.filter((m) => m.id !== w.viewerId).every((m) => m.email === '')).toBe(true);
    expect(list.invites).toEqual([]);
    // And nobody sees members of the other wedding.
    expect(list.members.map((m) => m.id)).not.toContain(w.otherId);
  }, 60_000);

  it("the wedding party: a member can only tick, add, remove and pack their own things, never another member's", async () => {
    const { A } = w;
    const jar = await portalAccount(w.owner, A.wid, SLUG, A.c.pid, 'ella@example.com', 'bridesmaid-2027');
    const dEntry = { pack: [{ text: 'Veil', done: false }], packed: ['Shoes'] };
    await saveDoc(w.owner, A.wid, 'party-p1', {
      tasks: [
        { id: 't-c', text: 'Book hair', person: A.c.pid },
        { id: 't-d', text: 'Collect dress', person: A.d.pid },
      ],
      people: { [A.d.pid]: dEntry, [A.c.pid]: { packed: ['Shoes'] } },
    });
    const p = `/api/p/${SLUG}/party`;
    const probes: Probe[] = [
      { label: "tick d's task as d", method: 'POST', path: p, cookie: jar, body: { personId: A.d.pid, action: 'task', id: 't-d', done: true }, want: [403] },
      { label: "tick d's task as myself", method: 'POST', path: p, cookie: jar, body: { personId: A.c.pid, action: 'task', id: 't-d', done: true }, want: [404] },
      { label: "remove d's task", method: 'POST', path: p, cookie: jar, body: { personId: A.c.pid, action: 'remove-task', id: 't-d' }, want: [404] },
      { label: "tick d's own packing item", method: 'POST', path: p, cookie: jar, body: { personId: A.c.pid, action: 'own-pack', text: 'Veil', done: true }, want: [404] },
      { label: "remove d's packing item (only mine can go)", method: 'POST', path: p, cookie: jar, body: { personId: A.c.pid, action: 'remove-pack', text: 'Veil' }, want: [200] },
      { label: "add to d's packing", method: 'POST', path: p, cookie: jar, body: { personId: A.d.pid, action: 'add-pack', text: 'Hacked' }, want: [403] },
      { label: "untick my own 'Shoes'", method: 'POST', path: p, cookie: jar, body: { personId: A.c.pid, action: 'packed', text: 'Shoes', done: false }, want: [200] },
      // With private links (no sign-in): only the people on that invitation.
      { label: "c's link acting as d", method: 'POST', path: p, body: { token: A.c.tok, personId: A.d.pid, action: 'packed', text: 'Shoes', done: false }, want: [403] },
      { label: "d's link acting as c", method: 'POST', path: p, body: { token: A.d.tok, personId: A.c.pid, action: 'task', id: 't-c', done: true }, want: [403] },
      { label: 'my own task', method: 'POST', path: p, cookie: jar, body: { personId: A.c.pid, action: 'task', id: 't-c', done: true }, want: [200] },
    ];
    const failures = await run(probes);
    expect(failures, listOf(failures)).toEqual([]);
    const doc = await docOf<{ tasks: { id: string; done: boolean }[]; people: Record<string, { pack: { text: string; done: boolean }[]; packed: string[] }> }>(A.wid, 'party-p1');
    expect(doc.tasks.find((x) => x.id === 't-d')?.done).toBe(false);
    expect(doc.tasks.find((x) => x.id === 't-c')?.done).toBe(true);
    expect(doc.people[A.d.pid]?.pack).toEqual(dEntry.pack);
    expect(doc.people[A.d.pid]?.packed).toEqual(dEntry.packed);
    expect(doc.people[A.c.pid]?.packed).toEqual([]);
    expect(doc.tasks.some((x) => (x as { text?: string }).text === 'Hacked')).toBe(false);
  }, 60_000);

  it("helper keys: a helper sees and marks only their own tasks, never another helper's or the couple's", async () => {
    const { A } = w;
    const key1 = 'helper-one-key-aaaaaaaaaaa';
    const key2 = 'helper-two-key-bbbbbbbbbbb';
    await saveDoc(w.owner, A.wid, 'checklist', {
      tasks: [
        { id: 't1', text: 'Mum: the cake', before: 100, helper: 'h1' },
        { id: 't2', text: 'Dad: the cars', before: 100, helper: 'h2' },
        { id: 't3', text: 'Ours: the rings', before: 100, owner: 'both' },
      ],
      helpers: [
        { id: 'h1', name: 'Mum', key: key1 },
        { id: 'h2', name: 'Dad', key: key2 },
      ],
    });
    const p = `/api/p/${SLUG}/tasks`;
    const view = await call('GET', `${p}?k=${key1}`);
    const text = await view.text();
    expect(view.status).toBe(200);
    expect((JSON.parse(text) as { tasks: { id: string }[] }).tasks.map((x) => x.id)).toEqual(['t1']);
    for (const leak of ['Dad: the cars', 'Ours: the rings', key2]) expect(text, leak).not.toContain(leak);
    const failures = await run([
      { label: "helper 1 marks helper 2's task", method: 'POST', path: p, body: { k: key1, id: 't2', status: 'done' }, want: [404] },
      { label: "helper 1 marks the couple's task", method: 'POST', path: p, body: { k: key1, id: 't3', status: 'doing' }, want: [404] },
      { label: "helper 1 on another wedding's slug", method: 'POST', path: `/api/p/${SLUG2}/tasks`, body: { k: key1, id: 't1', status: 'done' }, want: [404] },
      { label: 'helper 1 marks their own', method: 'POST', path: p, body: { k: key1, id: 't1', status: 'done' }, want: [200] },
    ]);
    expect(failures, listOf(failures)).toEqual([]);
    const doc = await docOf<{ tasks: { id: string; status: string; done: boolean }[] }>(A.wid, 'checklist');
    expect(doc.tasks.map((x) => [x.id, x.done])).toEqual([
      ['t1', true],
      ['t2', false],
      ['t3', false],
    ]);
  }, 60_000);

  // ---------------------------------------------------------------- 5. enumeration

  it('enumeration: sign-in, portal sign-in, portal forgot and "find my invite" answer the same for real and made-up people', async () => {
    const { A, B } = w;
    // Admin sign-in: unknown email, known email (wrong passcode), and an account with no passcode yet.
    await exec(`INSERT INTO user (id, email, pass_hash, created_at) VALUES (?, 'nopass@example.com', NULL, ?)`, crypto.randomUUID(), now());
    const admin = async (email: string) => {
      const res = await call('POST', '/api/a/auth/login', { body: { email, passcode: 'wrong-guess-2027' } });
      return `${res.status} ${await res.text()}`;
    };
    const unknownAdmin = await admin('nobody-here@example.com');
    expect(unknownAdmin.startsWith('401 ')).toBe(true);
    expect(await admin('owner@example.com')).toBe(unknownAdmin);
    expect(await admin('nopass@example.com')).toBe(unknownAdmin);
    expect(await admin('OTHER@example.com')).toBe(unknownAdmin);

    // Portal sign-in.
    await portalAccount(w.owner, A.wid, SLUG, A.c.pid, 'ella@example.com', 'bridesmaid-2027');
    await portalAccount(w.other, B.wid, SLUG2, B.c.pid, 'bonly@example.com', 'bonly-pass-2027');
    const portal = async (email: string) => {
      const res = await call('POST', `/api/p/${SLUG}/portal/login`, { body: { email, password: 'wrong-guess-2027' } });
      return `${res.status} ${await res.text()}`;
    };
    const unknownPortal = await portal('ghost@example.com');
    expect(unknownPortal.startsWith('401 ')).toBe(true);
    expect(await portal('ella@example.com')).toBe(unknownPortal);
    expect(await portal('bonly@example.com')).toBe(unknownPortal);

    // Forgot: one answer for unknown, this wedding's member (with a mobile), and another wedding's member.
    await exec(`UPDATE invitation SET phone = '+61400333444' WHERE id = ?`, A.c.inv);
    const forgot = async (email: string) => {
      const res = await call('POST', `/api/p/${SLUG}/portal/forgot`, { body: { email } });
      return `${res.status} ${await res.text()}`;
    };
    const unknownForgot = await forgot('ghost@example.com');
    expect(unknownForgot.startsWith('200 ')).toBe(true);
    expect(await forgot('ella@example.com')).toBe(unknownForgot);
    expect(await forgot('bonly@example.com')).toBe(unknownForgot);
    // B's member got no reset link from A's page.
    expect((await one<{ h: string | null }>(`SELECT reset_hash AS h FROM party_account WHERE wedding_id = ? AND person_id = ?`, B.wid, B.c.pid)).h).toBeNull();

    // Find my invite: a name only on B's list is as unknown on A's page as a made-up one.
    await exec(`UPDATE person SET name = 'Zara Onlyinb' WHERE id = ?`, B.b.pid);
    const find = async (slug: string, name: string) => {
      const res = await call('POST', `/api/p/${slug}/find`, { body: { name } });
      return { status: res.status, text: await res.text() };
    };
    const madeUp = await find(SLUG, 'Nobody Atall');
    expect(madeUp.status).toBe(404);
    expect(await find(SLUG, 'Zara Onlyinb')).toEqual(madeUp);
    expect(await find(SLUG, '  zara   ONLYINB ')).toEqual(madeUp);
    // On B's own page it's found, and the answer never hands over the link, an id or the number.
    const found = await find(SLUG2, 'Zara Onlyinb');
    expect(found.status).toBe(200);
    const body = JSON.parse(found.text) as Record<string, unknown>;
    expect(Object.keys(body).every((k) => ['found', 'texted', 'ending', 'again'].includes(k))).toBe(true);
    for (const s of [B.b.tok, B.b.inv, B.b.pid, B.wid]) expect(found.text).not.toContain(s);
    // A's guest, found on A's page, never gets B's details (same names in both weddings).
    const same = await find(SLUG, A.a.name);
    expect(same.status).toBe(200);
    for (const s of [B.a.tok, B.a.inv, A.a.tok, A.a.inv]) expect(same.text).not.toContain(s);
  }, 60_000);

  // ---------------------------------------------------------------- 6. injection in stored content

  it('stored HTML comes back as plain JSON strings (never rendered), and file names never reach a header raw', async () => {
    const { A } = w;
    const a = `/api/a/w/${A.wid}`;
    const v = await one<{ version: number }>(`SELECT version FROM invitation WHERE id = ?`, A.a.inv);
    expect(await statusOf(call('PATCH', `${a}/guests/${A.a.inv}`, { cookie: w.owner, headers: { 'If-Match': String(v.version) }, body: { people: [HTML], party: `${HTML} party` } }))).toBe(200);
    await saveDoc(w.owner, A.wid, 'vendors', { list: [{ id: 'v1', name: HTML, category: 'Florist', notes: HTML }] });
    expect(await statusOf(call('PUT', `${a}/board/settings`, { cookie: w.owner, body: { on: true, approve: false } }))).toBe(200);
    expect(await statusOf(call('POST', `/api/p/${SLUG}/board`, { body: { token: A.b.tok, body: HTML } }))).toBe(200);
    expect(await statusOf(call('POST', `/api/p/${SLUG}/songs`, { body: { token: A.b.tok, title: HTML, artist: HTML, note: HTML } }))).toBe(200);

    const failures: string[] = [];
    const check = async (label: string, path: string, cookie: string | undefined, find: (j: unknown) => boolean) => {
      const res = await call('GET', path, cookie ? { cookie } : {});
      const text = await res.text();
      if (res.status !== 200) return failures.push(`${label} -> ${res.status}`);
      if (!(res.headers.get('content-type') ?? '').startsWith('application/json')) failures.push(`${label}: content-type ${res.headers.get('content-type')}`);
      if (res.headers.get('x-content-type-options') !== 'nosniff') failures.push(`${label}: no nosniff`);
      if (!(res.headers.get('content-security-policy') ?? '').includes("default-src 'none'")) failures.push(`${label}: no CSP`);
      if (text.includes('&lt;script')) failures.push(`${label}: HTML-escaped on the server (it should be plain text in JSON)`);
      if (!find(JSON.parse(text))) failures.push(`${label}: the exact text didn't come back as a JSON string`);
      return 0;
    };
    const has = (j: unknown) => JSON.stringify(j).includes(JSON.stringify(HTML).slice(1, -1));
    await check('guest', `${a}/guests/${A.a.inv}`, w.owner, has);
    await check('guest list', `${a}/guests`, w.owner, has);
    await check('vendors', `${a}/planner/doc/vendors`, w.owner, (j) => (j as { data: { list: { name: string }[] } }).data.list[0]?.name === HTML);
    await check('board (guest)', `/api/p/${SLUG}/board?g=${A.c.tok}`, undefined, has);
    await check('board (admin)', `${a}/board`, w.owner, has);
    await check('songs (admin)', `${a}/songs`, w.owner, (j) => (j as { songs: { title: string }[] }).songs.some((s) => s.title === HTML));
    expect(failures, listOf(failures)).toEqual([]);

    // A planning file with quotes, CRLF and HTML in its name: the download header is safe, and it's served as what it is.
    const up = await jsonOf<{ id: string }>(
      call('POST', `${a}/planner/files`, { cookie: w.owner, body: { name: 'quote"\r\nX-Injected: 1\r\n<b>.pdf', type: 'application/pdf', data: btoa('%PDF-1.4 a quote') } }),
    );
    const file = await call('GET', `${a}/planner/files/${up.id}`, { cookie: w.owner });
    expect(file.status).toBe(200);
    await file.arrayBuffer();
    expect(file.headers.get('content-type')).toBe('application/pdf');
    expect(file.headers.get('x-injected')).toBeNull();
    expect(file.headers.get('content-disposition') ?? '').toMatch(/^inline; filename="[\w. -]+"$/);
    // HTML pretending to be a PDF is refused.
    expect(await statusOf(call('POST', `${a}/planner/files`, { cookie: w.owner, body: { name: 'x.pdf', type: 'application/pdf', data: btoa('<html><script>alert(1)</script>') } }))).toBe(400);
  }, 60_000);

  it('calendar feeds escape commas, semicolons and line breaks: no new properties and no extra events', async () => {
    const { A } = w;
    const a = `/api/a/w/${A.wid}`;
    // The planner feed: a task with CRLF, LF, commas and semicolons.
    await saveDoc(w.owner, A.wid, 'checklist', {
      tasks: [
        { id: 'x1', text: 'Call Bob, Sue; Ann\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Injected', before: 100, note: 'a\nX-INJ:1' },
        { id: 'x2', text: 'Plain task', before: 90 },
      ],
      helpers: [],
    });
    const url = (await jsonOf<{ url: string }>(call('PUT', `${a}/planner-calendar`, { cookie: w.owner, body: { on: true } }))).url;
    const feed = await call('GET', new URL(url).pathname);
    expect(feed.status).toBe(200);
    const lines = icsLines(await feed.text());
    expect(lines.filter((l) => l === 'BEGIN:VEVENT').length).toBe(lines.filter((l) => l === 'END:VEVENT').length);
    expect(lines.some((l) => l === 'SUMMARY:Injected' || l.startsWith('X-INJ'))).toBe(false);
    const summary = lines.find((l) => l.startsWith('SUMMARY:Call Bob'));
    expect(summary).toBe('SUMMARY:Call Bob\\, Sue\\; Ann\\nEND:VEVENT\\nBEGIN:VEVENT\\nSUMMARY:Injected');
    expect(lines.some((l) => l === 'DESCRIPTION:a\\nX-INJ:1')).toBe(true);
    const events = lines.filter((l) => l === 'BEGIN:VEVENT').length;
    expect(lines.filter((l) => l.startsWith('SUMMARY:')).length).toBe(events);

    // The guest "add to calendar" file: an event name with CRLF, commas and semicolons.
    const ev = await one<{ version: number }>(`SELECT version FROM event WHERE id = ?`, A.ev.id);
    expect(await statusOf(call('PUT', `${a}/events/${A.ev.id}`, { cookie: w.owner, headers: { 'If-Match': String(ev.version) }, body: { name: 'Party, fun; x\r\nBEGIN:VEVENT\r\nX-INJ:1' } }))).toBe(200);
    const one_ = await call('GET', `/api/p/${SLUG}/calendar/${A.ev.key}.ics`);
    expect(one_.status).toBe(200);
    const guestLines = icsLines(await one_.text());
    expect(guestLines.filter((l) => l === 'BEGIN:VEVENT').length).toBe(1);
    expect(guestLines.some((l) => l.startsWith('X-INJ'))).toBe(false);
    expect(guestLines.find((l) => l.startsWith('SUMMARY:'))).toContain('Party\\, fun\\; x\\nBEGIN:VEVENT\\nX-INJ:1');
    for (const l of guestLines) expect(l, l).not.toMatch(/[\r\n]/);
  }, 60_000);

  // SECURITY HOLE (low): src/routes/plannerCalendar.ts:16 escapes only "\r?\n", so a lone CR in a task, payment,
  // vendor or fitting name goes into the feed raw (fold() keeps every character). Calendar apps that also break
  // lines on a bare CR (many parsers split on /\r\n|\r|\n/) then read a new property or a whole new VEVENT. Only
  // the couple's own owners and editors can write those names, so it's one member injecting into the others'
  // calendars. Fix: .replace(/\r\n|\r|\n/g, '\\n') in esc() (and the same in src/routes/calendar.ts:9, which is
  // only safe today because its fold() regex happens to drop CRs).
  it('fixed: the planner feed never carries a raw CR (no line break a calendar app could act on)', async () => {
    await saveDoc(w.owner, w.A.wid, 'checklist', { tasks: [{ id: 'cr', text: 'Lone\rEND:VEVENT\rBEGIN:VEVENT\rSUMMARY:Injected by CR', before: 100 }], helpers: [] });
    const url = (await jsonOf<{ url: string }>(call('PUT', `/api/a/w/${w.A.wid}/planner-calendar`, { cookie: w.owner, body: { on: true } }))).url;
    const lines = icsLines(await (await call('GET', new URL(url).pathname)).text());
    for (const l of lines) expect(l).not.toMatch(/[\r\n]/);
  }, 60_000);

  // ---------------------------------------------------------------- 7. backups

  it("a backup has only this wedding's rows: nothing of the other wedding's, and no hash, session or other account", async () => {
    const { A, B } = w;
    const stamp = now();
    // Rows of every kind for both weddings.
    for (const s of [A, B]) {
      const tag = s === A ? 'a' : 'b';
      await t.db.batch([
        t.db.prepare(`INSERT INTO media (id, wedding_id, kind, key, content_type, bytes, invitation_id, created_at) VALUES (?, ?, 'photo', ?, 'image/jpeg', 22, ?, ?)`).bind(`media-${tag}`, s.wid, `w${tag}/p.jpg`, s.a.inv, stamp),
        t.db
          .prepare(`INSERT INTO sms_in (id, wedding_id, invitation_id, provider_id, type, from_phone, to_phone, body, action, received_at) VALUES (?, ?, ?, ?, 'inbound', '+61400999000', NULL, 'Yes', 'RSVP set to yes', ?)`)
          .bind(`smsin-${tag}`, s.wid, s.a.inv, `prov-${tag}`, stamp),
        t.db.prepare(`INSERT INTO inbox_email (id, wedding_id, from_addr, subject, body, received_at) VALUES (?, ?, 'x@y.example', 'Hi', 'Hi', ?)`).bind(`email-${tag}`, s.wid, stamp),
      ]);
    }
    await portalAccount(w.other, B.wid, SLUG2, B.c.pid, 'bonly@example.com', 'bonly-pass-2027');
    await portalAccount(w.owner, A.wid, SLUG, A.c.pid, 'ella@example.com', 'bridesmaid-2027');
    const res = await call('GET', `/api/a/w/${A.wid}/settings/backup`, { cookie: w.owner });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition') ?? '').toMatch(/^attachment; filename="sophie-and-nicholas-backup-\d{4}-\d{2}-\d{2}\.json"$/);
    const text = await res.text();
    const backup = JSON.parse(text) as { wedding: { id: string }; invitations: { id: string }[]; media: { id: string }[]; sms: { in: { id: string }[] } };
    expect(backup.wedding.id).toBe(A.wid);
    expect(backup.invitations.length).toBeGreaterThan(3);
    expect(backup.media.map((m) => m.id)).toEqual(['media-a']);
    expect(backup.sms.in.map((m) => m.id)).toEqual(['smsin-a']);

    const bIds = [
      B.wid,
      ...(await all<{ v: string }>(`SELECT id AS v FROM invitation WHERE wedding_id = ?1 UNION ALL SELECT token FROM invitation WHERE wedding_id = ?1`, B.wid)).map((r) => r.v),
      ...(await all<{ v: string }>(`SELECT p.id AS v FROM person p JOIN invitation i ON i.id = p.invitation_id WHERE i.wedding_id = ?`, B.wid)).map((r) => r.v),
      ...(await all<{ v: string }>(`SELECT id AS v FROM event WHERE wedding_id = ?1 UNION ALL SELECT id FROM campaign WHERE wedding_id = ?1`, B.wid)).map((r) => r.v),
      'media-b',
      'smsin-b',
      'email-b',
      'other@example.com',
      'bonly@example.com',
      w.otherId,
    ];
    const secrets = [
      ...(await all<{ v: string | null }>(`SELECT pass_hash AS v FROM user UNION ALL SELECT id FROM session UNION ALL SELECT id FROM party_session UNION ALL SELECT pass_hash FROM party_account`)).map((r) => r.v),
      ...[w.owner, w.other, w.viewer, w.editor].map((c) => c.slice(c.indexOf('=') + 1)),
    ].filter((s): s is string => !!s);
    expect(secrets.length).toBeGreaterThan(6);
    const failures: string[] = [];
    for (const id of bIds) if (text.includes(id)) failures.push(`the backup contains wedding B's ${id}`);
    for (const s of secrets) if (text.includes(s)) failures.push(`the backup contains a hash or session (${s.slice(0, 12)}…)`);
    if (/pass_hash|invite_hash|reset_hash|token_hash|pbkdf2\$/.test(text)) failures.push('the backup names a hash field');
    expect(failures, listOf(failures)).toEqual([]);
    // Only owners: an editor and another wedding's owner get nothing.
    expect(await statusOf(call('GET', `/api/a/w/${A.wid}/settings/backup`, { cookie: w.editor }))).toBe(403);
    expect(await statusOf(call('GET', `/api/a/w/${A.wid}/settings/backup`, { cookie: w.other }))).toBe(404);
  }, 60_000);
});
