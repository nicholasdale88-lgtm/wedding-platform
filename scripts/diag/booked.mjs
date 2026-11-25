/* global process, console */
// Read-only: how one wedding's planner records its suppliers, without names, emails or phone numbers, to see
// why a booked supplier still shows as "to book". Reads the JSON from `wrangler d1 execute --json` on stdin.
import { readFileSync } from 'node:fs';
const rows = JSON.parse(readFileSync(0, 'utf8'))[0].results;
const KINDS = [
  ['Venue', /venue|reception|estate|winery/i],
  ['Band or DJ', /\bband\b|\bdj\b|music|singer|string|entertain|photo ?booth/i],
  ['Photographer', /photog|\bphotos?\b/i],
  ['Videographer', /video|film/i],
  ['Celebrant', /celebrant|officiant|minister|priest|\bvicar\b|\brabbi\b|\bimam\b|married by|marriage (?:cert|fee|licen)|registry office/i],
  ['Catering', /cater/i],
  ['Hair and makeup', /\bhair|make-?up|beauty/i],
  ['Attire', /dress|gown|bridal(?! suite)|\bsuits?\b|tailor|attire/i],
  ['Florist', /flor|flower/i],
  ['Accommodation', /accommodation|hotel|motel|lodg|suite/i],
  ['Transport', /transport|\bcars?\b|\bbus(es)?\b|coach|limo|shuttle/i],
  ['Styling and hire', /styl|hire|decor|marquee/i],
  ['Stationery', /station|invit|print/i],
  ['Cake', /cake|dessert|patisserie/i],
  ['Rings', /\brings?\b|jewel/i],
];
const kind = (s) => KINDS.find(([, re]) => re.test(s ?? ''))?.[0] ?? '-';
for (const r of rows) {
  const d = JSON.parse(r.data || '{}');
  console.log(`--- ${r.kind}${r.scope ? ` (${r.scope})` : ''} v${r.version} updated ${r.updated_at}`);
  if (r.kind === 'vendors')
    for (const v of d.list ?? []) console.log(`vendor: category="${v.category}" status=${v.status} kindByCategory=${kind(v.category)} kindByName=${kind(v.name)} nameLooksLikeCelebrant=${/celebrant|married by|officiant/i.test(v.name)}`);
  if (r.kind === 'budget')
    for (const l of d.lines ?? []) console.log(`budget: category="${l.category}" item="${l.item}" hasVendor=${!!(l.vendor ?? '').trim()} paid>0=${l.paid > 0} kind=${kind(`${l.category} ${l.item}`)} vendorKind=${kind(l.vendor)}`);
  if (r.kind === 'checklist')
    for (const t of d.tasks ?? []) if (/book|celebrant|vendor|photog|florist|cater|band|dj|venue/i.test(t.text)) console.log(`task: "${t.text}" done=${t.done} status=${t.status ?? ''}`);
  if (r.kind === 'ceremony') console.log(`ceremony: celebrant name set=${!!d.celebrant?.name} email set=${!!d.celebrant?.email} keys=${Object.keys(d.celebrant ?? {}).join(',')}`);
  if (r.kind === 'party') for (const m of d.members ?? d.list ?? []) console.log(`party: role="${m.role}"`);
}
