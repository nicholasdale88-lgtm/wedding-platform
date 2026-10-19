/**
 * Writes a tenant seed as SQL, for `wrangler d1 execute wedding-db --remote --file seed.sql`.
 * Run by the deploy workflow (no Node needed locally):
 *   SEED_OWNER_EMAIL=... SEED_OWNER_PASSCODE=... [SEED_ADMIN_MOBILE=...] pnpm --filter api seed:sql [seed.json] [out.sql]
 * Seeding twice fails on the unique wedding slug, so it can never duplicate a wedding.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hashPasscode, passcodeProblem } from '../src/lib/auth';
import { buildSeed, toSqlText } from '../src/seed/build';

const [file = '../../seed/sophie-nicholas.json', out = 'seed.sql'] = process.argv.slice(2);
const email = process.env.SEED_OWNER_EMAIL;
const passcode = process.env.SEED_OWNER_PASSCODE ?? '';

if (!email) throw new Error('Set SEED_OWNER_EMAIL (the owner login).');
const problem = passcodeProblem(passcode);
if (problem) throw new Error(`SEED_OWNER_PASSCODE: ${problem}`);

const seedDir = dirname(file);
const texts = {
  ...JSON.parse(readFileSync(join(seedDir, 'texts.json'), 'utf8')),
  ...JSON.parse(readFileSync(join(seedDir, 'texts.dynamic.json'), 'utf8')),
} as Record<string, string>;
const statements = buildSeed(JSON.parse(readFileSync(file, 'utf8')), {
  texts,
  ownerEmail: email,
  ownerPassHash: await hashPasscode(passcode),
  adminMobile: process.env.SEED_ADMIN_MOBILE,
  // The design's sample guests are for tests and demos only; SEED_SAMPLE_GUESTS=0 leaves them out.
  sampleGuests: process.env.SEED_SAMPLE_GUESTS !== '0',
});
writeFileSync(out, toSqlText(statements) + '\n');
console.log(`Wrote ${statements.length} statements to ${out}`);
