import { THEMES } from '../guest/generated/themes';
import { eventsApi, type EventFull, type Overview } from '../lib/api';
import { fmtEvent, fmtWhen } from '../lib/format';
import { downloadXlsx, type Sheet, type XlsxLook } from '../lib/xlsx';

/**
 * Every Excel export is dressed the same way: the wedding's colours and monogram seal, a title
 * ("Alex & Sam · Dietary list"), and a line for each event it covers (what, when, where) so
 * a caterer or venue knows exactly what it's for.
 */

/** The couple's monogram on a wax seal, in the invitation theme's colours, as a PNG (none where the browser can't draw). */
async function sealPng(monogram: string, gold: string, ink: string): Promise<Uint8Array | undefined> {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 112;
    const g = c.getContext('2d');
    if (!g) return undefined;
    const grad = g.createRadialGradient(42, 38, 6, 56, 56, 56);
    grad.addColorStop(0, '#fff3dc');
    grad.addColorStop(0.45, gold);
    grad.addColorStop(1, ink);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(56, 56, 54, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(56, 56, 44, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#ffffff';
    g.font = 'italic 30px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(monogram.slice(0, 5), 56, 58);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

export async function lookOf(o: Overview | null): Promise<XlsxLook> {
  const t = (o?.wedding.theme && THEMES[o.wedding.theme]) || THEMES['Cream & Sage'] || {};
  const ink = t.dg ?? '#33402f';
  const monogram = o?.wedding.monogram?.trim() || (o ? `${o.wedding.name1.charAt(0)}&${o.wedding.name2.charAt(0)}` : '');
  return {
    ink,
    soft: t.b2 ?? '#efe7d3',
    band: t.iv ?? '#f8f4ea',
    line: t.gcap ?? '#d3c6a4',
    seal: monogram ? await sealPng(monogram, t.acc ?? '#c8a46a', ink) : undefined,
  };
}

/** "The wedding · Sat 6 Mar 2027, 4:00pm · The Garden, 1 Example Road…" */
export const eventLine = (e: Pick<EventFull, 'name' | 'startsAt' | 'venue' | 'address'>, tz: string) =>
  [e.name, fmtEvent(e.startsAt, tz), [e.venue, e.address].filter((x) => x?.trim()).join(', ')].filter(Boolean).join(' · ');

/**
 * Download sheets dressed for the wedding. `eventKeys` are the events the export covers (all of them
 * when omitted); each gets a line under the title.
 */
export async function downloadDressed(wid: string, o: Overview | null, file: string, what: string, sheets: Sheet[], eventKeys?: string[]) {
  const tz = o?.wedding.timezone ?? 'Australia/Sydney';
  const couple = o ? `${o.wedding.name1.split(' ')[0]} & ${o.wedding.name2.split(' ')[0]}` : '';
  let events: EventFull[] = [];
  try {
    events = (await eventsApi.list(wid)).events;
  } catch {
    /* the export still works without the event lines */
  }
  const covered = eventKeys ? events.filter((e) => eventKeys.includes(e.key)) : events;
  const lines = [...covered.map((e) => eventLine(e, tz)), `Exported ${fmtWhen(new Date().toISOString(), tz)}`];
  const look = await lookOf(o);
  downloadXlsx(
    file,
    sheets.map((s) => ({ ...s, head: { title: [couple, `${what}${sheets.length > 1 ? ` · ${s.name}` : ''}`].filter(Boolean).join(' · '), lines } })),
    look,
  );
}
