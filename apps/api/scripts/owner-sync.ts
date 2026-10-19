/**
 * Keeps tenant #1's owner login in step with the SEED_OWNER_EMAIL / SEED_OWNER_PASSCODE secrets,
 * so the owner can change their sign-in email or reset a forgotten passcode by updating a secret.
 * Reads the current owner (wrangler d1 execute --json output) and writes SQL only for what differs.
 *   pnpm tsx scripts/owner-sync.ts <current.json> <out.sql>
 * Note: once the admin has its own "Change passcode" setting (M3.9), remove SEED_OWNER_PASSCODE
 * from GitHub or a deploy would set the passcode back.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { hashPasscode, passcodeProblem, verifyPasscode } from '../src/lib/auth';

const [currentFile, out] = process.argv.slice(2);
if (!currentFile || !out) throw new Error('Usage: owner-sync <current.json> <out.sql>');

const rows = (JSON.parse(readFileSync(currentFile, 'utf8')) as { results: { id: string; email: string; pass_hash: string | null }[] }[])[0]?.results ?? [];
const owner = rows[0];
const email = (process.env.SEED_OWNER_EMAIL ?? '').trim().toLowerCase();
const passcode = process.env.SEED_OWNER_PASSCODE ?? '';
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const sql: string[] = [];

if (owner && email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && owner.email !== email) {
  sql.push(`UPDATE user SET email = ${q(email)} WHERE id = ${q(owner.id)};`);
  console.log('Owner sign-in email updated');
}
if (owner && passcode && !passcodeProblem(passcode) && !(await verifyPasscode(passcode, owner.pass_hash))) {
  sql.push(`UPDATE user SET pass_hash = ${q(await hashPasscode(passcode))} WHERE id = ${q(owner.id)};`);
  sql.push(`DELETE FROM session WHERE user_id = ${q(owner.id)};`); // sign out old sessions after a reset
  console.log('Owner passcode updated');
}
writeFileSync(out, sql.join('\n'));
if (!sql.length) console.log('Owner sign-in already up to date');
