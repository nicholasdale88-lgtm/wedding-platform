/* global process, console */
// The stress run's report, from every part (tests/stress/stress-report/part-*.json): weddings passed, checks
// passed, server errors, and each route's p95 speed, slowest first. Printed to the log, added to the run's
// summary page, and the headline and slowest routes as notes on the run page.
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(import.meta.dirname, 'stress-report');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^part-[\d-]+\.json$/.test(f)) : [];
if (!files.length) {
  console.log('No stress report found.');
  process.exit(0);
}
const parts = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const lat = new Map();
for (const p of parts) for (const [k, xs] of Object.entries(p.latency)) lat.set(k, [...(lat.get(k) ?? []), ...xs]);
const pct = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))] ?? 0;
};
const routes = [...lat].map(([route, xs]) => ({ route, n: xs.length, p50: pct(xs, 0.5), p95: pct(xs, 0.95), max: Math.max(...xs) })).sort((a, b) => b.p95 - a.p95);
const sum = (k) => parts.reduce((a, p) => a + (p[k] ?? 0), 0);
const head = `Stress (seed ${parts[0].seed}): ${sum('passed')}/${sum('weddings')} weddings passed; ${sum('checks') - sum('failed')}/${sum('checks')} checks passed; ${parts.reduce((a, p) => a + p.serverErrors.length, 0)} server errors; ${sum('rerunBatches')} batches re-run (test database bridge broke); slowest part ${Math.max(...parts.map((p) => p.seconds))} s`;
console.log(head);
console.log('p95 ms   p50 ms   max ms   calls   route');
for (const r of routes) console.log(`${String(r.p95).padStart(6)} ${String(r.p50).padStart(8)} ${String(r.max).padStart(8)} ${String(r.n).padStart(7)}   ${r.route}`);
console.log(`::notice title=Stress run::${head}`);
console.log(`::notice title=Slowest routes (p95 ms)::${routes.slice(0, 10).map((r) => `${r.p95} ${r.route}`).join(' | ')}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const md = [`### ${head}`, '', '| p95 ms | p50 ms | max ms | calls | route |', '|---:|---:|---:|---:|---|', ...routes.map((r) => `| ${r.p95} | ${r.p50} | ${r.max} | ${r.n} | \`${r.route}\` |`), ''];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n'));
}
