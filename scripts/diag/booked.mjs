/* global process, console */
// Read-only: how one wedding's planner records its suppliers, without names, emails or phone numbers, to see
// why a booked supplier still shows as "to book". Reads the JSON from `wrangler d1 execute --json` on stdin.
import { readFileSync } from 'node:fs';
const text = readFileSync(0, 'utf8');
let rows;
try {
  // wrangler may print a line or two before the JSON.
  rows = JSON.parse(text.slice(text.indexOf('['))).flatMap((x) => x.results ?? []);
} catch (e) {
  console.log(`::error title=diag parse::${String(e).slice(0, 200)} (output ${text.length} chars, starts ${JSON.stringify(text.slice(0, 40).replace(/[^[\]{}a-z :",0-9]/gi, ''))})`);
  process.exit(1);
}
if (!rows.length) console.log('::notice title=diag::no planner documents found for that wedding');
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
// Only derived flags are printed (the run's output is public): no names and no free text the couple typed, except
// our own template wording.
const TEMPLATE = new Set(['Book the venue and lock in the date', 'Book the celebrant', 'Book the photographer and videographer', 'Book the caterer (if the venue doesn’t cater)', 'Book the band or DJ and the florist']);
const out = [];
for (const r of rows) {
  const d = JSON.parse(r.data || '{}');
  out.push(`${r.kind} v${r.version}`);
  if (r.kind === 'vendors') for (const v of d.list ?? []) out.push(`vendor status=${v.status} byCategory=${kind(v.category)} byName=${kind(v.name)} categoryEmpty=${!(v.category ?? '').trim()}`);
  if (r.kind === 'budget') for (const l of d.lines ?? []) if ((l.vendor ?? '').trim() || l.paid > 0) out.push(`budget line kind=${kind(`${l.category} ${l.item}`)} vendorKind=${kind(l.vendor)} paid=${l.paid > 0}`);
  if (r.kind === 'checklist') for (const t of d.tasks ?? []) if (TEMPLATE.has(t.text) || /celebrant/i.test(t.text)) out.push(`task ${TEMPLATE.has(t.text) ? `"${t.text}"` : '(own wording, mentions celebrant)'} done=${t.done} status=${t.status ?? ''}`);
  if (r.kind === 'ceremony') out.push(`ceremony celebrantNameSet=${!!(d.celebrant?.name ?? '').trim()}`);
  if (r.kind === 'party') out.push(`party celebrantRoles=${(d.members ?? d.list ?? []).filter((m) => /celebrant|officiant/i.test(m.role ?? '')).length}`);
}
for (const line of out) console.log(line);
