import { commitmentOf, type ReceptionGuide, type Vendors as VendorsDoc } from '@wp/shared';
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { pagesApi, plannerApi, seatingApi, type PagesData, type PartyData, type SeatingData } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, Pill } from '../ui';

/**
 * Wedding planner → Print: signage in the wedding's own fonts, ready to print at home or send to a
 * printer as a PDF (Print → Save as PDF). Welcome sign, table numbers, place cards and the seating
 * chart come from the seating plan; menu cards from the night-before page's menu.
 */

type Kind = 'welcome' | 'tables' | 'places' | 'chart' | 'menu' | 'runsheet' | 'savedate' | 'envelopes';
const KINDS: [Kind, string, string][] = [
  ['welcome', 'Welcome sign', 'One A3 page (prints well up to A1).'],
  ['tables', 'Table numbers', 'An A5 card for each table.'],
  ['places', 'Place cards', 'Name and table, eight to an A4 page: cut on the lines and fold.'],
  ['chart', 'Seating chart', 'Everyone A to Z with their table, on A3 posters (one per 135 guests).'],
  ['menu', 'Menu cards', 'The menu from your night-before page, two to an A4 page.'],
  ['envelopes', 'Vendor envelopes', 'A label for each supplier still to be paid on the day: what’s owing, when they arrive, who to give it to. Eight to an A4 page.'],
  ['savedate', 'Save the date cards', 'Four A6 cards to an A4 page, with a QR code to the online save the date: for guests you’d rather post one to.'],
  ['runsheet', 'Run sheet for the day', 'For the venue, coordinator, photographer and MC: the whole day, who’s in the party, and every supplier with their arrival time and phone.'],
];

export function Print() {
  const { wid, overview } = useAdmin();
  const [pages, setPages] = useState<PagesData | null>(null);
  const [seating, setSeating] = useState<SeatingData | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [party, setParty] = useState<PartyData | null>(null);
  const [vendors, setVendors] = useState<VendorsDoc['list']>([]);
  const first = overview?.events[0];
  useEffect(() => {
    pagesApi
      .get(wid)
      .then(setPages)
      .catch(() => setPages(null));
    seatingApi
      .get(wid, first?.key)
      .then(setSeating)
      .catch(() => setSeating(null));
    plannerApi
      .party(wid, first?.key)
      .then(setParty)
      .catch(() => setParty(null));
    plannerApi
      .doc<VendorsDoc>(wid, 'vendors')
      .then((r) => setVendors(r.data.list))
      .catch(() => setVendors([]));
  }, [wid, first?.key]);

  const names = pages?.names ?? { name1: overview?.wedding.name1 ?? '', name2: overview?.wedding.name2 ?? '', monogram: '' };
  const couple = `${names.name1.split(' ')[0]} & ${names.name2.split(' ')[0]}`;
  const date = first?.startsAt ? new Date(first.startsAt).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const tables = useMemo(() => (seating?.tables ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })), [seating]);
  const seated = useMemo(
    () =>
      (seating?.people ?? [])
        .filter((p) => p.coming && p.tableId)
        .map((p) => ({ name: p.name, table: tables.find((t) => t.id === p.tableId)?.name ?? '' }))
        .filter((p) => p.table)
        .sort((a, b) => a.name.split(' ').slice(-1)[0]!.localeCompare(b.name.split(' ').slice(-1)[0]!) || a.name.localeCompare(b.name)),
    [seating, tables],
  );
  const guide = first && pages ? (pages.guides[first.key] as ReceptionGuide | undefined) : undefined;
  const menu = guide?.style === 'reception' ? (guide.menu ?? []) : [];
  const items = party?.runsheet?.data.items ?? [];
  const booked = vendors.filter((v) => v.status === 'booked').sort((a, b) => (a.arrival || '~').localeCompare(b.arrival || '~', undefined, { numeric: true }) || a.name.localeCompare(b.name));
  const sideName = { p1: party?.setup?.data.p1 || 'Bride', p2: party?.setup?.data.p2 || 'Groom' };
  const whoLabel = (w: string) => (w === 'party' ? 'Everyone' : w === 'p1' ? `${sideName.p1}’s side` : w === 'p2' ? `${sideName.p2}’s side` : w);
  const owing = booked
    .map((v) => ({ v, amount: commitmentOf(v).amount - (v.depositPaid ? commitmentOf(v).deposit : 0) }))
    .filter((o) => o.amount > 0);
  const count: Record<Kind, number> = { welcome: 1, tables: tables.length, places: seated.length, chart: seated.length, menu: menu.length, runsheet: items.length + booked.length, savedate: first ? 1 : 0, envelopes: owing.length };
  // The online save the date (no guest link: anyone with the card can open it).
  const stdUrl = `${window.location.origin}/w/${overview?.wedding.slug ?? ''}/save-the-date`;
  const qr = (() => {
    try {
      const q = qrcode(0, 'M');
      q.addData(stdUrl);
      q.make();
      return q.createDataURL(6, 0);
    } catch {
      return '';
    }
  })();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <H2>Print</H2>
        <div className="text-[13px] text-[#5b6a52]">Signs and cards in your wedding’s fonts. Print at home, or choose “Save as PDF” to send to a printer.</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KINDS.map(([k, label, hint]) => {
          const ready = count[k] > 0;
          return (
            <div key={k} className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
              <strong className="font-display text-[22px] font-medium">{label}</strong>
              <span className="text-[13px] text-[#5b6a52] flex-1">{hint}</span>
              <span className="text-[12px] text-[#7a7466]">
                {k === 'tables'
                  ? `${tables.length} tables`
                  : k === 'places' || k === 'chart'
                    ? `${seated.length} guests seated`
                    : k === 'menu'
                      ? `${menu.length} courses`
                      : k === 'runsheet'
                        ? `${items.length} moments · ${booked.length} suppliers`
                        : couple}
                {!ready &&
                  (k === 'menu'
                    ? ' (add the menu in Setup → Night-before page)'
                    : k === 'runsheet'
                      ? ' (build the day in Wedding party, or book suppliers in Vendors)'
                      : k !== 'welcome'
                        ? ' (seat guests in Guest planning → Seating)'
                        : '')}
              </span>
              <Pill kind="outline" className="self-start" disabled={!ready} onClick={() => setKind(k)}>
                Preview and print
              </Pill>
            </div>
          );
        })}
      </div>
      {kind && (
        <PrintSheet onClose={() => setKind(null)}>
          {kind === 'welcome' && (
            <section className="pp pp-a3 flex flex-col items-center justify-center text-center gap-[10mm]">
              <div className="pp-small">Welcome to the wedding of</div>
              <div className="pp-script text-[42mm] leading-[1.05]">{names.name1.split(' ')[0]}</div>
              <div className="pp-serif text-[16mm] italic">&amp;</div>
              <div className="pp-script text-[42mm] leading-[1.05]">{names.name2.split(' ')[0]}</div>
              <div className="pp-rule" />
              <div className="pp-serif text-[9mm]">{date}</div>
            </section>
          )}
          {kind === 'tables' &&
            tables.map((t) => (
              <section key={t.id} className="pp pp-a5 flex flex-col items-center justify-center text-center gap-[6mm]">
                <div className="pp-small">{/^\d+$/.test(t.name) ? 'Table' : ''}</div>
                <div className="pp-script text-[52mm] leading-none">{t.name}</div>
                <div className="pp-rule" />
                <div className="pp-serif text-[6mm] italic">{couple}</div>
              </section>
            ))}
          {kind === 'places' &&
            chunk(seated, 8).map((page, n) => (
              <section key={n} className="pp pp-a4 grid grid-cols-2 grid-rows-4">
                {page.map((p) => (
                  <div key={`${p.name}-${p.table}`} className="pp-place flex flex-col items-center justify-end pb-[8mm] text-center">
                    <div className="pp-script text-[13mm] leading-tight">{p.name}</div>
                    <div className="pp-small mt-[2mm]">{/^\d+$/.test(p.table) ? `Table ${p.table}` : p.table}</div>
                  </div>
                ))}
              </section>
            ))}
          {kind === 'chart' &&
            chunk(seated, CHART_PER_PAGE).map((page, n, pages) => (
            <section key={n} className="pp pp-a3 flex flex-col gap-[6mm]">
              <div className="text-center">
                <div className="pp-script text-[26mm] leading-none">Find your seat</div>
                <div className="pp-serif text-[7mm] italic mt-[3mm]">
                  {couple}
                  {pages.length > 1 ? ` · ${page[0]!.name.split(' ').slice(-1)[0]![0]}–${page[page.length - 1]!.name.split(' ').slice(-1)[0]![0]}` : ''}
                </div>
              </div>
              <div className="pp-chart flex-1">
                {page.map((p) => (
                  <div key={`${p.name}-${p.table}`} className="flex justify-between gap-[3mm] pp-serif text-[4.6mm] border-b border-[#d8cfb8] py-[0.8mm]">
                    <span>{p.name}</span>
                    <span className="italic">{p.table}</span>
                  </div>
                ))}
              </div>
            </section>
            ))}
          {kind === 'envelopes' &&
            chunk(owing, 8).map((page, n) => (
              <section key={n} className="pp pp-a4 grid grid-cols-2 grid-rows-4">
                {page.map((o) => (
                  <div key={o.v.id} className="pp-place flex flex-col justify-center gap-[2mm] px-[8mm]">
                    <div className="pp-small">For</div>
                    <div className="pp-script text-[11mm] leading-tight">{o.v.name}</div>
                    <div className="pp-serif text-[5mm]">
                      <strong>{aud0(o.amount)}</strong>
                      {o.v.category ? ` · ${o.v.category}` : ''}
                    </div>
                    <div className="pp-serif text-[3.8mm] italic">
                      {[o.v.arrival && `Arrives ${o.v.arrival}`, o.v.contact && `Give to ${o.v.contact}`, o.v.phone].filter(Boolean).join(' · ')}
                    </div>
                    <div className="pp-serif text-[3.4mm] mt-[2mm] border-t border-[#d8cfb8] pt-[1.5mm]">Paid: ____ / ____ (initials)</div>
                  </div>
                ))}
              </section>
            ))}
          {kind === 'savedate' &&
            [0].map((n) => (
              <section key={n} className="pp pp-a4 grid grid-cols-2 grid-rows-2">
                {[0, 1, 2, 3].map((c) => (
                  <div key={c} className="pp-place flex flex-col items-center justify-center gap-[3mm] text-center px-[8mm]">
                    <div className="pp-small">Save the date</div>
                    <div className="pp-script text-[15mm] leading-[1.05]">{names.name1.split(' ')[0]}</div>
                    <div className="pp-serif text-[6mm] italic">&amp;</div>
                    <div className="pp-script text-[15mm] leading-[1.05]">{names.name2.split(' ')[0]}</div>
                    <div className="pp-rule" />
                    <div className="pp-serif text-[5.5mm]">{date}</div>
                    <div className="pp-serif text-[3.6mm] italic">Formal invitation to follow</div>
                    {qr && <img src={qr} alt="" className="w-[16mm] h-[16mm] mt-[1mm]" />}
                  </div>
                ))}
              </section>
            ))}
          {kind === 'runsheet' && (
            <section className="pp pp-flow pp-serif text-[4mm] leading-snug">
              <div className="flex justify-between items-end gap-[6mm] border-b-[0.5mm] border-[#c8a46a] pb-[3mm]">
                <div>
                  <div className="pp-small">Run sheet</div>
                  <div className="pp-script text-[14mm] leading-none mt-[2mm]">{couple}</div>
                </div>
                <div className="text-right text-[4.2mm]">
                  <div className="font-semibold">{first?.name}</div>
                  <div className="italic">{date}</div>
                </div>
              </div>
              {party?.runsheet?.data.note?.trim() && <p className="my-[4mm] italic whitespace-pre-line">{party.runsheet.data.note}</p>}
              {items.length > 0 && (
                <table className="pp-table">
                  <thead>
                    <tr>
                      <th className="w-[26mm]">When</th>
                      <th>What</th>
                      <th className="w-[38mm]">Who</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, n) => (
                      <tr key={n}>
                        <td className="whitespace-nowrap font-semibold">
                          {it.time}
                          {it.until ? `–${it.until}` : ''}
                        </td>
                        <td>
                          <div className="font-semibold">{it.title}</div>
                          {it.place && <div className="italic">{it.place}</div>}
                          {it.detail && <div className="whitespace-pre-line">{it.detail}</div>}
                        </td>
                        <td>{it.who.map(whoLabel).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(party?.members.length ?? 0) > 0 && (
                <>
                  <h3 className="pp-small mt-[7mm] mb-[2mm]">The wedding party</h3>
                  <div className="grid grid-cols-2 gap-x-[8mm]">
                    {party!.members.map((m) => (
                      <div key={m.personId} className="flex justify-between gap-[3mm] border-b border-[#e2d7bc] py-[0.8mm]">
                        <span>{m.name}</span>
                        <span className="italic">{m.role}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {booked.length > 0 && (
                <>
                  <h3 className="pp-small mt-[7mm] mb-[2mm]">Suppliers</h3>
                  <table className="pp-table">
                    <thead>
                      <tr>
                        <th className="w-[22mm]">Arrives</th>
                        <th>Who</th>
                        <th className="w-[52mm]">Contact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {booked.map((v) => (
                        <tr key={v.id}>
                          <td className="whitespace-nowrap font-semibold">{v.arrival}</td>
                          <td>
                            <span className="font-semibold">{v.name}</span>
                            {v.category && <span className="italic"> · {v.category}</span>}
                          </td>
                          <td>
                            {[v.contact, v.phone].filter(Boolean).join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          )}
          {kind === 'menu' && (
              <section className="pp pp-a4 grid grid-cols-2">
                {[0, 1].map((n) => (
                  <div key={n} className="flex flex-col items-center text-center gap-[5mm] px-[10mm] py-[16mm] border-dashed border-[#d8cfb8] first:border-r">
                    <div className="pp-script text-[18mm] leading-none">Menu</div>
                    <div className="pp-rule" />
                    {menu.map((m) => (
                      <div key={m.course} className="flex flex-col gap-[1.5mm]">
                        <div className="pp-small">{m.course}</div>
                        <div className="pp-serif text-[5mm] leading-snug">{m.a}</div>
                        {m.b?.trim() && (
                          <>
                            <div className="pp-serif text-[3.6mm] italic">or</div>
                            <div className="pp-serif text-[5mm] leading-snug">{m.b}</div>
                          </>
                        )}
                      </div>
                    ))}
                    <div className="mt-auto pp-serif text-[4mm] italic">{couple} · {date}</div>
                  </div>
                ))}
              </section>
            )}
        </PrintSheet>
      )}
    </div>
  );
}

/** Names on one A3 seating chart (three columns); more guests go on to another poster, A to Z. */
const CHART_PER_PAGE = 135;
const aud0 = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** A full-screen preview of the pages; Print sends only the pages to the printer. */
function PrintSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add('printing');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('printing');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="pp-root fixed inset-0 z-[80] overflow-auto bg-[#77786f]" role="dialog" aria-modal="true" aria-label="Print preview">
      <style>{PRINT_CSS}</style>
      <div className="pp-bar sticky top-0 z-10 flex justify-between items-center gap-3 py-3 px-5 bg-[#33402f] text-[#f3ecd6]">
        <span className="text-[14px]">Preview. Print, or choose “Save as PDF” in the print dialog.</span>
        <span className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="py-2 px-4 rounded-full border-0 bg-[#f3ecd6] text-[#33402f] text-[14px] font-medium cursor-pointer">
            Print
          </button>
          <button type="button" onClick={onClose} className="py-2 px-4 rounded-full border border-[#f3ecd6] bg-transparent text-[#f3ecd6] text-[14px] cursor-pointer">
            Close
          </button>
        </span>
      </div>
      <div className="pp-pages flex flex-col items-center gap-6 py-6">{children}</div>
    </div>
  );
}

// Page sizes, fonts and print rules (only the pages print; the admin and the bar don't).
const PRINT_CSS = `
.pp { background: #fffdf8; color: #33402f; box-shadow: 0 6px 24px rgba(0,0,0,.25); padding: 16mm; box-sizing: border-box; overflow: hidden; break-after: page; position: relative; }
.pp::before { content: ''; position: absolute; inset: 7mm; border: 0.5mm solid #c8a46a; pointer-events: none; }
.pp-a3 { width: 297mm; height: 420mm; page: a3; }
.pp-a4 { width: 210mm; height: 297mm; padding: 0; page: a4; }
.pp-a4::before { display: none; }
.pp-a5 { width: 148mm; height: 210mm; page: a5; }
.pp-script { font-family: 'Pinyon Script', cursive; color: #33402f; }
.pp-serif { font-family: 'Cormorant Garamond', Georgia, serif; }
.pp-small { font-family: 'DM Sans', system-ui, sans-serif; font-size: 3.4mm; letter-spacing: .3em; text-transform: uppercase; font-weight: 600; color: #6b6558; }
.pp-rule { width: 30mm; height: 0.5mm; background: #c8a46a; }
.pp-place { border: 0.2mm dashed #d8cfb8; }
.pp-chart { column-count: 3; column-gap: 10mm; }
.pp-flow { width: 210mm; min-height: 297mm; height: auto; padding: 14mm 16mm; page: a4; overflow: visible; }
.pp-flow::before { display: none; }
.pp-table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
.pp-table th { font-family: 'DM Sans', system-ui, sans-serif; font-size: 2.8mm; letter-spacing: .2em; text-transform: uppercase; text-align: left; color: #6b6558; padding: 1.5mm 2mm; border-bottom: 0.4mm solid #c8a46a; }
.pp-table td { vertical-align: top; padding: 2mm; border-bottom: 0.2mm solid #e2d7bc; }
.pp-table tr { break-inside: avoid; }
@media print {
  /* Each sheet asks for its own paper size (A3 signs, A4 cards, A5 table numbers); a printer without A3 scales to fit. */
  @page { margin: 0; }
  @page a3 { size: A3 portrait; margin: 0; }
  @page a4 { size: A4 portrait; margin: 0; }
  @page a5 { size: A5 portrait; margin: 0; }
  html.printing body * { visibility: hidden !important; }
  html.printing .pp-root, html.printing .pp-root * { visibility: visible !important; }
  html.printing .pp-root { position: absolute !important; inset: 0 !important; overflow: visible !important; background: none !important; }
  html.printing .pp-bar { display: none !important; }
  html.printing .pp-pages { padding: 0 !important; gap: 0 !important; }
  .pp { box-shadow: none !important; margin: 0 !important; }
}
`;
