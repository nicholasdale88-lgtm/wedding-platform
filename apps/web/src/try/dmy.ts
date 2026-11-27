/**
 * A date typed day / month / year (20/03/2027, 20-3-27, 20.03.2027) as YYYY-MM-DD; '' when left empty, null
 * when it isn't a real date.
 */
export function dmyToIso(typed: string): string | null {
  const s = typed.trim();
  if (!s) return '';
  const m = /^(\d{1,2})\s*[/.\- ]\s*(\d{1,2})\s*[/.\- ]\s*(\d{2}|\d{4})$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
