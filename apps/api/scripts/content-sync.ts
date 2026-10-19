/**
 * Adds new page wording and settings to an existing wedding without touching anything it already has.
 * When a design gains a sentence (new catalogue key) or a new setting, deploys bring it in; a couple's
 * own edits are never overwritten.
 *   pnpm tsx scripts/content-sync.ts <current.json> <seed.json> <slug> <out.sql>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [currentFile, seedFile, slug, out] = process.argv.slice(2);
if (!currentFile || !seedFile || !slug || !out) throw new Error('Usage: content-sync <current.json> <seed.json> <slug> <out.sql>');

const row = (JSON.parse(readFileSync(currentFile, 'utf8')) as { results: { content: string }[] }[])[0]?.results[0];
if (!row) {
  writeFileSync(out, '');
  console.log(`No wedding "${slug}" yet; nothing to sync`);
  process.exit(0);
}
const seed = JSON.parse(readFileSync(seedFile, 'utf8')) as { invitation?: Record<string, string> };
const dir = dirname(seedFile);
const texts: Record<string, string> = {
  ...JSON.parse(readFileSync(join(dir, 'texts.json'), 'utf8')),
  ...JSON.parse(readFileSync(join(dir, 'texts.dynamic.json'), 'utf8')),
};

const content = JSON.parse(row.content || '{}') as { invitation?: Record<string, string>; texts?: Record<string, string> };
let added = 0;
const fill = <T extends Record<string, string>>(target: T, defaults: Record<string, string>) => {
  for (const [k, v] of Object.entries(defaults)) {
    if (!(k in target)) {
      (target as Record<string, string>)[k] = v;
      added++;
    }
  }
  return target;
};
content.invitation = fill(content.invitation ?? {}, seed.invitation ?? {});
content.texts = fill(content.texts ?? {}, texts);

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
writeFileSync(out, added ? `UPDATE wedding SET content = ${q(JSON.stringify(content))}, version = version + 1 WHERE slug = ${q(slug)};\n` : '');
console.log(added ? `Added ${added} new wording keys and settings` : 'Wording and settings already up to date');
