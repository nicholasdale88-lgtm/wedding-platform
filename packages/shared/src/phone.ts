/** Australian mobile numbers: stored as E.164 (+614XXXXXXXX), shown as 0412 345 678. */

/** Normalise any AU mobile format to E.164, or null if it isn't a valid AU mobile. */
export function toE164(input: string | null | undefined): string | null {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('0061')) d = d.slice(4);
  else if (d.startsWith('61')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^4\d{8}$/.test(d) ? `+61${d}` : null;
}

/** "+61412345678" → "0412 345 678". Unknown input is returned trimmed. */
export function displayPhone(input: string | null | undefined): string {
  const e = toE164(input);
  if (!e) return String(input ?? '').trim();
  const local = '0' + e.slice(3);
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** Local format the SMS provider accepts ("0412345678"). */
export function toProviderFormat(e164: string): string {
  return '0' + e164.replace(/^\+61/, '');
}
