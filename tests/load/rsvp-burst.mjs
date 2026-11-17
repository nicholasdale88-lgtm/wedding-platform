/* global process, console, fetch, performance, URL, setTimeout */
// Burst load test: 500 guest replies in 60 seconds against the API running locally (wrangler dev, its own
// throwaway local database). Passes only if the 95th percentile answers in under 300 ms and nothing
// answers 5xx (every reply must be a 200). Never touches the live site.
//
//   node tests/load/rsvp-burst.mjs http://localhost:8787
//
// Needs the API started with SUPER_ADMINS including load-platform@example.com (to give the test wedding
// a plan with room for 500 guests). Seeded, so the order of replies is the same every run.

const BASE = (process.argv[2] || process.env.API_URL || 'http://localhost:8787').replace(/\/$/, '');
const TOTAL = Number(process.env.LOAD_REPLIES || 500);
const SECONDS = Number(process.env.LOAD_SECONDS || 60);
const P95_MS = Number(process.env.LOAD_P95_MS || 300);
const PASSCODE = 'load-test-passcode-2027';

let seed = 4242;
const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
let ipN = 0;
const ip = () => {
  const n = ++ipN + 50_000;
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
};

async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': ip(), ...(cookie ? { cookie } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return res;
}
async function must(res, what) {
  if (!res.ok) throw new Error(`${what}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res;
}
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

async function signup(firstName, partnerName, email) {
  const res = await must(
    await call('/a/signup', { method: 'POST', body: { firstName, partnerName, email, passcode: PASSCODE, date: '2027-11-20', plan: 'free', marketing: false, website: '' } }),
    `sign up ${email}`,
  );
  const b = await res.json();
  return { cookie: cookieOf(res), id: b.weddingId, slug: b.weddings.find((w) => w.id === b.weddingId).slug };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

async function main() {
  const stamp = Date.now();
  // ---- Set up: a wedding with 500 invitations (Complete, so the guest list has room).
  const platform = await signup('Load', 'Platform', 'load-platform@example.com').catch(async () => {
    // Already signed up on this database (a re-run): sign in instead.
    const res = await must(await call('/a/auth/login', { method: 'POST', body: { email: 'load-platform@example.com', passcode: PASSCODE } }), 'platform sign in');
    return { cookie: cookieOf(res) };
  });
  const w = await signup('Avery', 'Quinn', `load-${stamp}@example.com`);
  await must(await call('/a/super/plan', { method: 'PUT', cookie: platform.cookie, body: { slug: w.slug, plan: 'complete' } }), 'plan');
  const rows = Array.from({ length: TOTAL }, (_, i) => ({ people: i % 3 ? [`Guest ${i} Load`] : [`Guest ${i} Load`, `Partner ${i} Load`], phone: `04${String(30_000_000 + i).padStart(8, '0')}` }));
  await must(await call(`/a/w/${w.id}/guests/import`, { method: 'POST', cookie: w.cookie, body: { rows } }), 'import');
  const list = await (await must(await call(`/a/w/${w.id}/guests`, { cookie: w.cookie }), 'guest list')).json();
  const tokens = list.guests.map((g) => ({ token: new URL(list.links[g.id]).searchParams.get('g'), seats: g.seatsHeld }));
  if (tokens.length !== TOTAL) throw new Error(`expected ${TOTAL} invitations, got ${tokens.length}`);
  // Warm up (not counted): the first requests to a fresh local server are slower.
  for (let i = 0; i < 10; i++) await call(`/p/${w.slug}/invite?g=${tokens[i].token}&preview=1`);

  // ---- The burst: replies arrive at random through the minute (open loop: nobody waits for anyone).
  const at = Array.from({ length: TOTAL }, () => random() * SECONDS * 1000).sort((a, b) => a - b);
  const results = [];
  const start = performance.now();
  await Promise.all(
    tokens.map(async (t, i) => {
      const wait = at[i] - (performance.now() - start);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const attending = random() < 0.8;
      const t0 = performance.now();
      let status = 0;
      try {
        const res = await call(`/p/${w.slug}/rsvp`, { method: 'POST', body: { token: t.token, events: { wedding: { attending } }, count: Math.max(1, Math.ceil(random() * t.seats)), message: i % 7 ? undefined : 'See you there!' } });
        status = res.status;
        await res.arrayBuffer();
      } catch {
        status = -1; // connection refused or dropped
      }
      results.push({ ms: performance.now() - t0, status });
    }),
  );
  const wall = (performance.now() - start) / 1000;

  // ---- The figures: every reply counted once.
  const ov = await (await must(await call(`/a/w/${w.id}/overview`, { cookie: w.cookie }), 'overview')).json();

  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const bad = results.filter((r) => r.status !== 200);
  const fivexx = results.filter((r) => r.status >= 500 || r.status < 0);
  const summary = {
    replies: results.length,
    seconds: Number(wall.toFixed(1)),
    perSecond: Number((results.length / wall).toFixed(1)),
    p50: Math.round(pct(ms, 50)),
    p95: Math.round(pct(ms, 95)),
    p99: Math.round(pct(ms, 99)),
    max: Math.round(ms.at(-1)),
    non200: bad.length,
    fiveXX: fivexx.length,
    statuses: Object.fromEntries([...new Set(results.map((r) => r.status))].map((s) => [s, results.filter((r) => r.status === s).length])),
    replied: ov.replied,
  };
  console.log(JSON.stringify(summary, null, 2));
  // The headline numbers as a check annotation too, readable without signing in to GitHub.
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Burst load::p50 ${summary.p50} ms, p95 ${summary.p95} ms (limit ${P95_MS}), max ${summary.max} ms, ${summary.non200} non-200, ${summary.fiveXX} 5xx`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Burst load: ${summary.replies} replies in ${summary.seconds}s\n\n| p50 | p95 | p99 | max | non-200 | 5xx |\n|---|---|---|---|---|---|\n| ${summary.p50} ms | **${summary.p95} ms** (limit ${P95_MS}) | ${summary.p99} ms | ${summary.max} ms | ${summary.non200} | ${summary.fiveXX} |\n`,
    );
  }
  const fails = [];
  if (summary.p95 >= P95_MS) fails.push(`p95 ${summary.p95} ms is not under ${P95_MS} ms`);
  if (fivexx.length) fails.push(`${fivexx.length} replies answered 5xx or dropped`);
  if (bad.length) fails.push(`${bad.length} replies were not 200: ${JSON.stringify(summary.statuses)}`);
  if (ov.replied !== TOTAL) fails.push(`the overview counts ${ov.replied} replies, not ${TOTAL}`);
  if (fails.length) {
    for (const f of fails) console.error(`::error::${f}`);
    process.exit(1);
  }
  console.log('Burst load test passed.');
}

main().catch((e) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});
