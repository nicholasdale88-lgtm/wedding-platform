import { toE164 } from './phone';

/**
 * Guests from the couple's phone contacts: a contacts file (vCard .vcf from iPhone, Google Contacts or
 * Android; or a Google / Outlook CSV), or the phone's own contact picker. Each contact becomes a guest
 * with a name, an Australian mobile (when there is one), an email and a postal address, for printed
 * invitations. One postal address per invitation (household).
 */

export interface PostalAddress {
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
}
export const NO_ADDRESS: PostalAddress = { street: '', suburb: '', state: '', postcode: '', country: '' };
export const hasAddress = (a: Partial<PostalAddress> | null | undefined) => !!a && !!(a.street?.trim() || a.suburb?.trim() || a.postcode?.trim());
/** "12 Rose St, Newtown NSW 2042" (Australia isn't written; other countries are). */
export function addressLines(a: Partial<PostalAddress> | null | undefined): string[] {
  if (!a) return [];
  const town = [a.suburb, a.state, a.postcode].map((x) => x?.trim() ?? '').filter(Boolean).join(' ');
  const country = a.country?.trim() && !/^(australia|au|aus)$/i.test(a.country.trim()) ? a.country.trim() : '';
  return [...(a.street ?? '').split(/\r?\n/).map((x) => x.trim()), town, country].filter(Boolean);
}

/** How the invitation reaches them: by text/email (digital), a printed one in the post, or both. */
export const DELIVERY = ['digital', 'post', 'both'] as const;
export type Delivery = (typeof DELIVERY)[number];
export const DELIVERY_LABEL: Record<Delivery, string> = { digital: 'Digital (text or email)', post: 'Printed, by post only', both: 'Printed and digital' };
/** Nothing digital goes to someone getting their invitation by post only. */
export const digitalOk = (delivery: string | null | undefined) => delivery !== 'post';
export const printed = (delivery: string | null | undefined) => delivery === 'post' || delivery === 'both';

export interface Contact {
  name: string;
  /** Every number, mobiles first. */
  phones: string[];
  emails: string[];
  address: PostalAddress | null;
}

/** The contact's Australian mobile (E.164), if any of their numbers is one. */
export const contactMobile = (c: Contact) => c.phones.map((p) => toE164(p)).find((x): x is string => !!x) ?? null;

// ---------------------------------------------------------------- vCard

/** vCard text values: \n, \, and \; and \\ are escapes. */
const unescape = (s: string) => s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
/** Split on ; that isn't escaped. */
const parts = (s: string) => s.split(/(?<!\\);/).map((x) => unescape(x).trim());

function decodeQP(s: string, charset: string): string {
  const bytes: number[] = [];
  const raw = s;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (ch === '=' && /^[0-9A-F]{2}$/i.test(raw.slice(i + 1, i + 3))) {
      bytes.push(parseInt(raw.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...new TextEncoder().encode(ch));
  }
  try {
    return new TextDecoder(/utf-?8/i.test(charset) || !charset ? 'utf-8' : charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
}

/** Where a vCard line's name and parameters end (a colon inside a quoted parameter doesn't count). */
function colonAt(line: string): number {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ':' && !quoted) return i;
  }
  return -1;
}

/** Every contact in a .vcf file (vCard 2.1, 3.0 or 4.0; folded lines; many contacts in one file). */
export function parseVCard(text: string): Contact[] {
  // Unfold: a line starting with a space or tab continues the one before; a quoted-printable value ending
  // in "=" carries on over the next line.
  const lines: string[] = [];
  for (const l of text.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n').split('\n')) {
    const prev = lines[lines.length - 1];
    if (prev !== undefined && /^[ \t]/.test(l)) lines[lines.length - 1] = prev + l.slice(1);
    else if (prev !== undefined && /QUOTED-PRINTABLE/i.test(prev.slice(0, Math.max(0, colonAt(prev)))) && prev.endsWith('=')) lines[lines.length - 1] = prev.slice(0, -1) + l;
    else lines.push(l);
  }
  const out: Contact[] = [];
  let cur: { fn: string; n: string; phones: { v: string; mobile: boolean }[]; emails: string[]; adr: PostalAddress | null; org: string } | null = null;
  for (const line of lines) {
    const colon = colonAt(line);
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [rawName = '', ...params] = head.split(';');
    const name = rawName.replace(/^item\d+\./i, '').toUpperCase();
    const p = params.join(';').toUpperCase();
    if (name === 'BEGIN' && /^VCARD$/i.test(value.trim())) {
      cur = { fn: '', n: '', phones: [], emails: [], adr: null, org: '' };
      continue;
    }
    if (!cur) continue;
    if (name === 'END') {
      const fromN = (() => {
        const [family = '', given = '', middle = '', prefix = '', suffix = ''] = parts(cur.n);
        return [prefix, given, middle, family, suffix].filter(Boolean).join(' ');
      })();
      const full = (cur.fn || fromN || cur.org).replace(/\s+/g, ' ').trim();
      const phones = [...cur.phones.filter((x) => x.mobile), ...cur.phones.filter((x) => !x.mobile)].map((x) => x.v);
      if (full || phones.length || cur.emails.length) out.push({ name: full, phones: [...new Set(phones)], emails: [...new Set(cur.emails)], address: cur.adr });
      cur = null;
      continue;
    }
    if (/ENCODING=QUOTED-PRINTABLE|\bQUOTED-PRINTABLE\b/.test(p)) value = decodeQP(value, /CHARSET=([^;:]+)/.exec(p)?.[1] ?? 'utf-8');
    if (name === 'FN') cur.fn = unescape(value).trim();
    else if (name === 'N') cur.n = value;
    else if (name === 'ORG') cur.org = parts(value)[0] ?? '';
    else if (name === 'TEL') {
      const v = value.replace(/^tel:/i, '').trim();
      if (v) cur.phones.push({ v, mobile: /CELL|MOBILE|IPHONE/.test(p) || !!toE164(v) });
    } else if (name === 'EMAIL') {
      const v = value.replace(/^mailto:/i, '').trim().toLowerCase();
      if (v) cur.emails.push(v);
    } else if (name === 'ADR' && (!cur.adr || /HOME|PREF/.test(p))) {
      // ADR: post office box; extended; street; locality; region; postal code; country
      const [box = '', ext = '', street = '', suburb = '', state = '', postcode = '', country = ''] = parts(value);
      const a = { street: [box && `PO Box ${box.replace(/^p\.?o\.?\s*box\s*/i, '')}`, ext, street].filter(Boolean).join('\n'), suburb, state, postcode, country };
      if (hasAddress(a)) cur.adr = a;
    }
  }
  return out;
}

// ---------------------------------------------------------------- CSV (Google Contacts, Outlook)

/** A CSV file as rows of cells (quotes, commas and line breaks inside quotes). */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** Contacts from a Google Contacts or Outlook CSV export (the columns are found by their names). */
export function parseContactsCsv(text: string): Contact[] {
  const [header = [], ...body] = csvRows(text);
  const h = header.map((x) => x.trim().toLowerCase());
  const col = (...re: RegExp[]) => h.map((x, i) => (re.some((r) => r.test(x)) ? i : -1)).filter((i) => i >= 0);
  const one = (re: RegExp) => h.findIndex((x) => re.test(x));
  const nameCol = one(/^(name|display name|full name)$/);
  const given = one(/^(given name|first name)$/);
  const middle = one(/^(additional name|middle name)$/);
  const family = one(/^(family name|last name)$/);
  // Google: "Phone 1 - Type" / "Phone 1 - Value"; Outlook: "Mobile Phone", "Home Phone"...
  const phoneTypes = new Map(col(/^phone \d+ - type$/).map((i) => [h[i]!.replace(' - type', ''), i]));
  const phones = [...col(/^phone \d+ - value$/), ...col(/^(mobile phone|primary phone|home phone|business phone|other phone|phone)$/)];
  const emails = [...col(/^e-?mail \d+ - value$/), ...col(/^(e-?mail address|e-?mail 2 address|e-?mail 3 address|e-?mail)$/)];
  // Google: "Address 1 - Street"...; Outlook: "Home Street", "Home City", "Home State", "Home Postal Code", "Home Country/Region".
  const addr = (field: RegExp) => one(new RegExp(`^address 1 - ${field.source}$`));
  const home = (field: RegExp) => one(new RegExp(`^home ${field.source}$`));
  const formatted = one(/^address 1 - formatted$/);
  const a = {
    street: [addr(/street/), home(/street/)].find((i) => i >= 0) ?? -1,
    street2: [addr(/extended address/), home(/street 2/)].find((i) => i >= 0) ?? -1,
    pobox: [addr(/po box/), home(/po box/)].find((i) => i >= 0) ?? -1,
    suburb: [addr(/city/), home(/city/)].find((i) => i >= 0) ?? -1,
    state: [addr(/region/), home(/state/)].find((i) => i >= 0) ?? -1,
    postcode: [addr(/postal code/), home(/postal code/)].find((i) => i >= 0) ?? -1,
    country: [addr(/country/), home(/country\/region/), home(/country/)].find((i) => i >= 0) ?? -1,
  };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const multi = (v: string) => v.split(/\s*:::\s*/).map((x) => x.trim()).filter(Boolean); // Google puts several in one cell
  return body
    .map((r) => {
      const name = (get(r, nameCol) || [get(r, given), get(r, middle), get(r, family)].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
      const nums = phones.flatMap((i) => {
        const type = [...phoneTypes.entries()].find(([k]) => h[i]!.startsWith(k))?.[1];
        const mobile = /mobile|cell/i.test(h[i]!) || /mobile|cell/i.test(type !== undefined ? get(r, type) : '');
        return multi(get(r, i)).map((v) => ({ v, mobile: mobile || !!toE164(v) }));
      });
      const street = [get(r, a.pobox) && `PO Box ${get(r, a.pobox)}`, get(r, a.street), get(r, a.street2)].filter(Boolean).join('\n');
      let address: PostalAddress | null = { street, suburb: get(r, a.suburb), state: get(r, a.state), postcode: get(r, a.postcode), country: get(r, a.country) };
      if (!hasAddress(address) && get(r, formatted)) address = { ...NO_ADDRESS, street: get(r, formatted) };
      if (!hasAddress(address)) address = null;
      return {
        name,
        phones: [...new Set([...nums.filter((x) => x.mobile), ...nums.filter((x) => !x.mobile)].map((x) => x.v))],
        emails: [...new Set(emails.flatMap((i) => multi(get(r, i)).map((e) => e.toLowerCase())))],
        address,
      };
    })
    .filter((c) => c.name || c.phones.length || c.emails.length);
}

/** A contacts file, whichever kind it is. */
export function parseContactsFile(name: string, text: string): Contact[] {
  return /\.vcf$|\.vcard$/i.test(name) || /^\s*BEGIN:VCARD/i.test(text.replace(/^﻿/, '')) ? parseVCard(text) : parseContactsCsv(text);
}
