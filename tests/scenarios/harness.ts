/**
 * Runs generated wedding scenarios through the real API (createApp) on a real local D1 (miniflare), the
 * way couples, guests and vendors use it: sign up, events, privacy, importing guests (plus-ones, kids),
 * replies with dietary needs, changed and late replies, guest links on private weddings, add to calendar
 * (.ics and Google), vendor proposals, the wedding inbox, and guest photos saved to Dropbox or Google
 * Drive (both mocked). After each scenario the figures must match what was done and nothing may answer 5xx.
 *
 * Runs under apps/api's vitest with globals (see apps/api/vitest.scenarios.config.ts).
 */
import type { Env } from '../../apps/api/src/env';
import { createApp } from '../../apps/api/src/index';
import { receiveEmail } from '../../apps/api/src/routes/inbox';
import { testD1 } from '../../apps/api/test/support/d1';
import { DIETS, rng, scenario, type Scenario } from './generate';

type Init = { method?: string; body?: string | Uint8Array; headers?: Record<string, string> };
type W = { id: string; slug: string; cookie: string };
type Reply = { attending: boolean | null; count: number };
type Guest = { id: string; version: number; seatsHeld: number; people: { name: string; diet: string }[]; invited: string[]; rsvp: Record<string, Reply> };
type PerEvent = { key: string; invited: number; yes: number; no: number; awaiting: number; coming: number };

const PLATFORM = 'platform@scenarios.example';
const PASSCODE = 'scenario-passcode-2027';
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let ipCounter = 0;
/** A fresh client address for each caller, so per-address limits never stand in for the thing under test. */
const nextIp = () => {
  const n = ++ipCounter + process.pid * 4096;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
};
const jpeg = (n: number, k: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n & 255, (n >> 8) & 255, k & 255, 0x4a, 0x46, 0x49, 0x46]);
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function scenarioPart(partNo: number, numbers: number[]) {
  describe(`wedding scenarios, part ${partNo}`, () => {
    let t: Awaited<ReturnType<typeof testD1>>;
    let env: Env;
    let platform = '';
    let vendor = { cookie: '', slug: '', listing: '' };
    const app = createApp();
    const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => undefined), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
    /** Every status any route returned in the current scenario. */
    const seen: { status: number; what: string }[] = [];
    const faults: string[] = [];
    /** What the storage providers were asked to do (mocked). */
    const storage: { url: string; dropboxPath?: string; driveName?: string; driveParents?: string[] }[] = [];
    let driveIds = 0;

    const send = async (path: string, init: Init = {}, cookie = '', ip = nextIp()) => {
      const r = await app.request(
        `/api${path}`,
        { method: init.method ?? 'GET', ...(init.body !== undefined ? { body: init.body } : {}), headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip, ...(cookie ? { cookie } : {}), ...init.headers } },
        env,
        ctx,
      );
      seen.push({ status: r.status, what: `${init.method ?? 'GET'} ${path.slice(0, 100)}` });
      return r;
    };
    const read = async <T>(r: Response) => (await r.json()) as T;
    const admin = (w: W, path: string, init: Init = {}) => send(`/a/w/${w.id}${path}`, init, w.cookie);
    const post = (w: W, path: string, data: unknown) => admin(w, path, { method: 'POST', body: JSON.stringify(data) });
    const ok = async (r: Response | Promise<Response>, status = 200) => {
      const res = await r;
      expect(res.status, `${seen.at(-1)?.what}: ${(await res.clone().text()).slice(0, 300)}`).toBe(status);
      return res;
    };
    const rsvp = async (w: W, body: Record<string, unknown>) => {
      for (let i = 0; ; i++) {
        const r = await send(`/p/${w.slug}/rsvp`, { method: 'POST', body: JSON.stringify(body) });
        if (r.status !== 503 || i === 5) return r;
        seen.pop(); // "busy, try again": the page retries, as here; only the final answer counts
        await new Promise((res) => setTimeout(res, 100 + i * 150));
      }
    };

    beforeAll(async () => {
      t = await testD1();
      env = {
        DB: t.db,
        PUBLIC_BASE_URL: 'https://example.com',
        SESSION_SECRET: 'scenario-secret-for-sessions-0000',
        SUPER_ADMINS: PLATFORM,
        DROPBOX_APP_KEY: 'dbx-key',
        DROPBOX_APP_SECRET: 'dbx-secret',
        GOOGLE_CLIENT_ID: 'g-id',
        GOOGLE_CLIENT_SECRET: 'g-secret',
      };
      // Dropbox and Google Drive, mocked: folders and files are made, and what was asked is kept.
      vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const h = (init?.headers ?? {}) as Record<string, string>;
        const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
        if (url.startsWith('https://api.dropboxapi.com/oauth2/token')) return json({ access_token: 'dbx-access', refresh_token: 'dbx-refresh', expires_in: 14400 });
        if (url.includes('dropboxapi.com/2/users/get_current_account')) return json({ email: 'couple@dropbox.example' });
        if (url.includes('dropboxapi.com/2/files/create_folder_v2')) {
          storage.push({ url, dropboxPath: (JSON.parse(String(init?.body)) as { path: string }).path });
          return json({ metadata: {} });
        }
        if (url.includes('content.dropboxapi.com/2/files/upload')) {
          storage.push({ url, dropboxPath: (JSON.parse(h['Dropbox-API-Arg']!) as { path: string }).path });
          return json({ id: `id:${storage.length}` });
        }
        if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'g-access', refresh_token: 'g-refresh', expires_in: 3600, id_token: `x.${b64url(JSON.stringify({ email: 'couple@gmail.example' }))}.y` });
        if (url.startsWith('https://www.googleapis.com/drive/v3/files?') && (init?.method ?? 'GET') === 'GET') return json({ files: [] });
        if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
          const meta = JSON.parse(String(init?.body)) as { name: string; parents: string[] };
          storage.push({ url, driveName: meta.name, driveParents: meta.parents });
          return json({ id: `folder-${++driveIds}` });
        }
        if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
          const head = new TextDecoder().decode((init?.body as Uint8Array).slice(0, 600));
          const meta = JSON.parse(/\{.*?\}(?=\r\n--)/s.exec(head)?.[0] ?? '{}') as { name?: string; parents?: string[] };
          storage.push({ url, driveName: meta.name, driveParents: meta.parents });
          return json({ id: `file-${++driveIds}` });
        }
        faults.push(`unexpected outside call: ${url.slice(0, 120)}`);
        return new Response('not available in tests', { status: 503 });
      });
      vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void faults.push(a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ').slice(0, 300)));
      // The platform owner (switches plans on) and one vendor for the part.
      platform = await signup('Platform', 'Owner', PLATFORM, 400, '');
      const v = await ok(
        send('/directory/join', {
          method: 'POST',
          body: JSON.stringify({ name: `Scenario Florals ${partNo}`, category: 'florist', region: 'sydney', regions: [], contactName: 'Jess Lee', phone: '0400 000 000', website: '', instagram: '', about: '', priceFrom: 0, photos: [], email: `vendor${partNo}@vendors.example`, passcode: PASSCODE, company: '' }),
        }),
      );
      vendor = { cookie: (v.headers.get('set-cookie') ?? '').split(';')[0]!, slug: (await read<{ slug: string }>(v)).slug, listing: '' };
      vendor.listing = (await t.db.prepare(`SELECT id FROM vendor_listing WHERE slug = ?`).bind(vendor.slug).first<{ id: string }>())!.id;
    }, 60_000);
    afterAll(async () => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      await t?.dispose();
    });
    beforeEach(() => {
      seen.length = 0;
      faults.length = 0;
      storage.length = 0;
    });

    /** Signs up from the front page; returns the session cookie (and the wedding, through `last`). */
    let last: { weddingId: string; slug: string } = { weddingId: '', slug: '' };
    async function signup(firstName: string, partnerName: string, email: string, inDays: number, ref: string) {
      const r = await ok(send('/a/signup', { method: 'POST', body: JSON.stringify({ firstName, partnerName, email, passcode: PASSCODE, date: day(inDays), plan: 'free', marketing: false, website: '', ...(ref ? { ref } : {}) }) }));
      const b = await read<{ weddingId: string; weddings: { id: string; slug: string }[] }>(r);
      last = { weddingId: b.weddingId, slug: b.weddings.find((x) => x.id === b.weddingId)!.slug };
      return (r.headers.get('set-cookie') ?? '').split(';')[0]!;
    }

    if (!numbers.length) it.skip('no scenarios from this part in this run', () => {});
    for (const n of numbers) {
      it(`scenario ${n}`, { timeout: 120_000 }, async () => {
        const s = scenario(n);
        try {
          await run(s);
        } finally {
          const crashed = seen.filter((x) => x.status >= 500).map((x) => `${x.status} ${x.what}`);
          expect(crashed, `scenario ${n} (${s.size}, seed ${s.seed}): ${faults.slice(0, 4).join(' | ')}`).toEqual([]);
        }
      });
    }

    async function run(s: Scenario) {
      const r = rng(s.seed ^ 0x9e37);
      const [a, b] = s.couple.map((x) => x.split(' ')[0]!) as [string, string];
      // ---- Sign up, privacy, plan, events
      const cookie = await signup(a, b, `couple${s.n}@scenarios.example`, s.inDays, s.vendor ? vendor.slug : '');
      const w: W = { id: last.weddingId, slug: last.slug, cookie };
      if (!s.private) await ok(admin(w, '/privacy', { method: 'PUT', headers: { 'If-Match': '0' }, body: JSON.stringify({ private: false }) }));
      await ok(send('/a/super/plan', { method: 'PUT', body: JSON.stringify({ slug: w.slug, plan: 'complete', extraEvents: 3 }) }, platform));
      const keys = ['wedding'];
      for (const [i, name] of s.extraEvents.entries()) {
        const ev = await ok(post(w, '/events', { name, startsAt: `${day(s.inDays + (i % 2 ? 1 : -1))}T0${i + 1}:00:00.000Z`, venue: `Venue ${i + 1}` }), 201);
        keys.push((await read<{ added: string }>(ev)).added);
      }

      // ---- Guests: households with plus-ones (named and not) and children
      const rows = s.households.map((h) => ({
        people: h.people,
        seats: h.people.length + (h.unnamedPlusOne ? 1 : 0),
        ...(h.phone ? { phone: h.phone } : {}),
        ...(h.email ? { email: h.email } : {}),
        invited: h.invited.map((i) => keys[i]!),
      }));
      for (let i = 0; i < rows.length; i += 250) {
        const res = await ok(post(w, '/guests/import', { rows: rows.slice(i, i + 250) }));
        const body = await read<{ added: number; problems: unknown[] }>(res);
        expect(body.problems).toEqual([]);
        expect(body.added).toBe(Math.min(250, rows.length - i));
      }
      const list = await read<{ guests: Guest[]; links: Record<string, string> }>(await ok(admin(w, '/guests')));
      expect(list.guests).toHaveLength(s.households.length);
      const byMain = new Map(list.guests.map((g) => [g.people[0]!.name, g]));
      const guestOf = (i: number) => byMain.get(s.households[i]!.people[0]!)!;
      const tokenOf = (i: number) => new URL(list.links[guestOf(i).id]!).searchParams.get('g')!;
      for (const [i, h] of s.households.entries()) {
        const g = guestOf(i);
        expect(g, h.people[0]).toBeDefined();
        expect(g.people.map((p) => p.name)).toEqual(h.people);
        expect(g.seatsHeld).toBe(rows[i]!.seats);
        expect([...g.invited].sort()).toEqual([...rows[i]!.invited].sort());
      }
      // Children marked on their invitation.
      for (const [i, h] of s.households.entries()) {
        if (!h.kids) continue;
        const g = guestOf(i);
        await ok(admin(w, `/guests/${g.id}`, { method: 'PATCH', headers: { 'If-Match': String(g.version) }, body: JSON.stringify({ children: h.people.map((_, k) => k >= h.people.length - h.kids) }) }));
      }

      // ---- Replies, changes of mind, dietary needs
      const model = new Map<number, { events: Record<string, Reply>; diet: string }>();
      const reply = async (i: number, flip: boolean, expectStatus = 200) => {
        const h = s.households[i]!;
        const prev = model.get(i);
        const events: Record<string, { attending: boolean }> = {};
        for (const k of rows[i]!.invited) events[k] = { attending: prev && flip ? !prev.events[k]!.attending : r() < 0.78 };
        const any = Object.values(events).some((e) => e.attending);
        const count = 1 + Math.floor(r() * rows[i]!.seats);
        const single = h.people.length === 1 && !h.unnamedPlusOne;
        const diet = !prev && single && r() < 0.3 ? DIETS[Math.floor(r() * DIETS.length)]! : undefined;
        const res = await rsvp(w, { token: tokenOf(i), events, count, ...(diet ? { diet } : {}), ...(r() < 0.3 ? { message: `Congratulations ${a} & ${b}!` } : {}) });
        expect(res.status, `reply ${i}: ${(await res.clone().text()).slice(0, 200)}`).toBe(expectStatus);
        if (expectStatus !== 200) return;
        const kept = Math.min(count, rows[i]!.seats);
        model.set(i, {
          events: Object.fromEntries(Object.entries(events).map(([k, e]) => [k, { attending: e.attending, count: kept }])),
          diet: !any ? '' : (diet ?? prev?.diet ?? ''),
        });
      };
      const late = s.late ? s.replies.slice(Math.ceil(s.replies.length / 2)) : [];
      const first = s.replies.filter((i) => !late.includes(i));
      for (const i of first) await reply(i, false);
      for (const i of s.changes.filter((c) => first.includes(c))) await reply(i, true);
      if (s.late) {
        // Replies close (yesterday): a change is refused, a first reply still counts.
        const pages = await read<{ version: number }>(await ok(admin(w, '/pages')));
        await ok(admin(w, '/pages', { method: 'PUT', headers: { 'If-Match': String(pages.version) }, body: JSON.stringify({ invitation: { rsvpClose: day(-1), rsvpEmail: `couple${s.n}@scenarios.example` } }) }));
        if (first[0] !== undefined) await reply(first[0], true, 403);
        for (const i of late) await reply(i, false);
      }

      // ---- The figures match what guests did
      const ov = await read<{ total: number; seatsHeld: number; replied: number; perEvent: PerEvent[] }>(await ok(admin(w, '/overview')));
      expect(ov.total).toBe(s.households.length);
      expect(ov.seatsHeld).toBe(rows.reduce((x, row) => x + row.seats, 0));
      expect(ov.replied).toBe(model.size);
      for (const k of keys) {
        const invited = rows.filter((row) => row.invited.includes(k)).length;
        let yes = 0;
        let no = 0;
        let coming = 0;
        for (const m of model.values()) {
          const e = m.events[k];
          if (!e) continue;
          if (e.attending) {
            yes++;
            coming += e.count;
          } else no++;
        }
        expect(ov.perEvent.find((p) => p.key === k), `event ${k}`).toMatchObject({ invited, yes, no, awaiting: invited - yes - no, coming });
      }
      const after = new Map((await read<{ guests: Guest[] }>(await ok(admin(w, '/guests')))).guests.map((g) => [g.id, g]));
      for (const [i, m] of model) {
        const g = after.get(guestOf(i).id)!;
        for (const [k, e] of Object.entries(m.events)) expect(g.rsvp[k], `${g.people[0]!.name} / ${k}`).toMatchObject({ attending: e.attending, ...(e.attending ? { count: e.count } : {}) });
        if (s.households[i]!.people.length === 1) expect(g.people[0]!.diet, g.people[0]!.name).toBe(m.diet);
      }

      // ---- Guest links: private weddings open only with a guest's own link
      const someone = s.replies[0] ?? 0;
      const tok = tokenOf(someone);
      if (s.private) {
        expect((await send(`/p/${w.slug}/invite`)).status).toBe(404);
        expect((await send(`/p/${w.slug}/calendar/wedding.ics`)).status).toBe(404);
      } else {
        expect((await read<{ invitation: unknown }>(await ok(send(`/p/${w.slug}/invite`)))).invitation).toBeNull();
      }
      const page = await read<{ wedding: { slug: string; name1: string; name2: string }; events: { key: string; name: string; startsAt: string }[]; invitation: { people: { name: string }[] } }>(
        await ok(send(`/p/${w.slug}/invite?g=${tok}&preview=1`)),
      );
      expect(page.invitation.people.map((p) => p.name)).toEqual(s.households[someone]!.people);

      // ---- Add to calendar: the event file, their own feed, and a well-formed Google link
      const ics = await ok(send(`/p/${w.slug}/calendar/wedding.ics?g=${tok}`));
      const text = await ics.text();
      expect(text).toMatch(/^BEGIN:VCALENDAR/);
      expect(text).toContain('BEGIN:VEVENT');
      expect(text).toMatch(/DTSTART[^:]*:\d{8}T\d{6}Z?/);
      const feed = await (await ok(send(`/p/${w.slug}/calendar/mine.ics?g=${tok}`))).text();
      expect(feed).toMatch(/^BEGIN:VCALENDAR/);
      for (const ev of page.events) {
        const start = new Date(ev.startsAt);
        expect(Number.isNaN(start.getTime()), ev.key).toBe(false);
        const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
        const google = new URL(`https://calendar.google.com/calendar/render?${new URLSearchParams({ action: 'TEMPLATE', text: `${a} & ${b}: ${ev.name}`, dates: `${z(start)}/${z(new Date(start.getTime() + 6 * 3_600_000))}` })}`);
        expect(google.searchParams.get('dates')).toMatch(/^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
      }

      // ---- A vendor's proposal: in the couple's planner and accepted once
      if (s.vendor) {
        const sent = await read<{ id: string; link: string }>(
          await ok(send('/a/vendor/proposals', { method: 'POST', body: JSON.stringify({ to: { couple: w.id }, title: 'Wedding flowers', lines: [{ what: 'Bouquet', amount: 300 + (s.n % 7) * 50 }, { what: 'Centrepieces', amount: 900 }], deposit: 200, validUntil: day(60), note: 'Seasonal flowers.' }) }, vendor.cookie)),
        );
        const vendors = await read<{ data: { list: { dirId: string; quotes: { id: string }[] }[] } }>(await ok(admin(w, '/planner/doc/vendors')));
        expect(vendors.data.list.find((v) => v.dirId === `v:${vendor.listing}`)?.quotes.map((q) => q.id)).toContain(sent.id);
        const token = sent.link.split('/').pop()!;
        expect(await read(await ok(send(`/directory/proposal/${token}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'accept' }) })))).toEqual({ status: 'accepted' });
        expect((await send(`/directory/proposal/${token}/answer`, { method: 'POST', body: JSON.stringify({ answer: 'decline' }) })).status).toBe(409);
      }

      // ---- The wedding inbox: a guest's email lands, filed under them
      if (s.inbox) {
        const address = `w${s.n}@inbox.scenarios.example`;
        await ok(admin(w, '/inbox/settings/address', { method: 'PUT', body: JSON.stringify({ address }) }));
        const raw = `From: ${s.households[0]!.people[0]} <${s.households[0]!.email}>\r\nSubject: Parking for scenario ${s.n}?\r\nMessage-ID: <s${s.n}@guests.example>\r\n\r\nIs there parking?\r\n`;
        expect((await receiveEmail({ from: s.households[0]!.email!, to: address, raw: new Blob([new TextEncoder().encode(raw)]).stream(), headers: new Headers() }, env)).stored).toBe(true);
        const inbox = await read<{ emails: { subject: string; kind: string; guest: string | null }[] }>(await ok(admin(w, '/inbox')));
        expect(inbox.emails.find((e) => e.subject === `Parking for scenario ${s.n}?`)).toMatchObject({ kind: 'guest', guest: s.households[0]!.people[0] });
      }

      // ---- Guest photos saved to the couple's own Dropbox or Google Drive (mocked)
      if (s.photos !== 'none') {
        const { url } = await read<{ url: string }>(await ok(post(w, '/photo-links/connect', { provider: s.photos })));
        const state = new URL(url).searchParams.get('state')!;
        const back = await send(`/oauth/callback?code=c${s.n}&state=${state}`, {}, w.cookie);
        expect(back.headers.get('location')).toBe(`https://example.com/admin/${w.id}/photos?linked=${s.photos}`);
        const link = (await read<{ links: { ok: boolean; filed: boolean; verified: boolean; folder: string }[] }>(await ok(admin(w, '/photo-links')))).links[0]!;
        expect(link).toMatchObject({ ok: true, filed: true, verified: true, folder: `The Yes List – ${a} & ${b}` });
        const up = await send(`/p/${w.slug}/photos?g=${tok}&event=wedding`, { method: 'PUT', body: jpeg(s.n, 1), headers: { 'content-type': 'image/jpeg', 'X-Photo-By': a } });
        expect(up.status, (await up.clone().text()).slice(0, 200)).toBe(200);
        if (s.photos === 'dropbox') {
          const photo = storage.filter((x) => x.url.includes('files/upload')).map((x) => x.dropboxPath!).find((p) => p.endsWith('.jpg'));
          expect(photo).toMatch(new RegExp(`^/The Yes List – ${a} & ${b}/Photos/[^/]+/.+\\.jpg$`));
        } else {
          const photo = storage.find((x) => x.url.includes('/upload/drive/') && x.driveName?.endsWith('.jpg'));
          expect(photo?.driveParents?.[0]).toMatch(/^folder-\d+$/);
          expect(storage.some((x) => x.driveName === `The Yes List – ${a} & ${b}`)).toBe(true);
        }
        const photos = await read<{ items: unknown[] }>(await ok(admin(w, '/photos')));
        expect(photos.items).toHaveLength(1);
      }

      // ---- Nobody else's wedding: this couple can't read the platform owner's
      expect([403, 404]).toContain((await send(`/a/w/${(await t.db.prepare(`SELECT id FROM wedding WHERE slug != ? LIMIT 1`).bind(w.slug).first<{ id: string }>())!.id}/overview`, {}, w.cookie)).status);
    }
  });
}
