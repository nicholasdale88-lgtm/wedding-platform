import { aspectRatio, isSerious, roomScale, seatSpots, STRETCHES, tableBox, type TableShape } from '@wp/shared';
import { Fragment } from 'react';
import type { SeatArea, SeatTable } from '../lib/api';
import { BRAND, PRINT_BASE_CSS, PrintFigure, PrintFooter, PrintH, PrintHeader, SERIF } from './PrintBrand';

/**
 * The seating plan for the caterer and venue, dressed in The Yes List's branding:
 * 1. the room: every table, big and readable, with chairs coloured where someone has a dietary need;
 * 2. each table drawn on its own (two to a page), every guest's name beside their numbered chair, and the
 *    table's seat-by-seat list with needs and meals;
 * 3. the dietary list by table and seat (optional);
 * 4. everyone A to Z with their table and seat (optional).
 * The same markup shows on screen as A4 sheets (the sample at /demo/seating-pdf) and prints as pages.
 */
export interface PrintPerson {
  id: string;
  name: string;
  diet: string;
  meal: { e: string; m: string; d: string };
}
export interface SeatingPrintOptions {
  floor: boolean;
  tables: boolean;
  diet: boolean;
  az: boolean;
}
export const ALL_PARTS: SeatingPrintOptions = { floor: true, tables: true, diet: true, az: true };

const tableWord = (name: string) => (/^\d+$/.test(name.trim()) ? `Table ${name.trim()}` : name.trim());
const meals = (p: PrintPerson) => [p.meal.e, p.meal.m, p.meal.d].filter(Boolean).join(' · ');
const chairFill = (p: PrintPerson | null) => (!p ? '#fff' : isSerious(p.diet) ? BRAND.red : p.diet.trim() ? BRAND.amber : p.id.startsWith('couple-') ? '#a4566a' : BRAND.sage);
const byTableName = (a: SeatTable, b: SeatTable) => a.name.localeCompare(b.name, undefined, { numeric: true });

export function SeatingPrint({
  couple,
  eventName,
  when,
  venue,
  aspect,
  tables,
  areas,
  chairs,
  coming,
  parts = ALL_PARTS,
}: {
  couple: string;
  eventName: string;
  when: string;
  venue: string;
  aspect: string;
  tables: SeatTable[];
  areas: SeatArea[];
  /** Who sits in each chair of each table (index 0 = seat 1); people beyond the seats are extras. */
  chairs: Map<string, (PrintPerson | null)[]>;
  /** How many guests are coming in all (for "seated of coming"). */
  coming: number;
  parts?: SeatingPrintOptions;
}) {
  const ordered = [...tables].sort(byTableName);
  const where: { p: PrintPerson; t: SeatTable; seat: number | null }[] = [];
  for (const t of ordered) (chairs.get(t.id) ?? []).forEach((p, i) => p && where.push({ p, t, seat: i < t.seats ? i + 1 : null }));
  const seated = where.length;
  const seats = tables.reduce((n, t) => n + t.seats, 0);
  const needs = where.filter((w) => w.p.diet.trim());
  const serious = needs.filter((w) => isSerious(w.p.diet));
  const lines = [eventName, when, venue];
  const head = (title: string) => <PrintHeader couple={couple} title={title} lines={lines} />;
  const counts = [...needs.reduce((m, w) => m.set(w.p.diet.trim().toLowerCase(), (m.get(w.p.diet.trim().toLowerCase()) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const pairs: SeatTable[][] = [];
  for (let i = 0; i < ordered.length; i += 2) pairs.push(ordered.slice(i, i + 2));
  return (
    <div className="yl-doc seat-print">
      <style>{PRINT_BASE_CSS}</style>
      {parts.floor && (
        <section className="yl-sheet">
          {head('Seating plan')}
          <div style={{ display: 'flex', gap: '3mm', marginBottom: '5mm', flexWrap: 'wrap' }}>
            <PrintFigure label="Guests seated" value={`${seated} of ${coming}`} />
            <PrintFigure label="Tables" value={`${tables.length} · ${seats} seats`} />
            <PrintFigure label="Dietary needs" value={String(needs.length)} />
            <PrintFigure label="Serious allergies" value={String(serious.length)} tone={serious.length ? 'warn' : undefined} />
          </div>
          <PrintH sub="Each table with how many are seated. Coloured chairs show who has a dietary need; the table pages give every name and seat.">The room</PrintH>
          <FloorPlan aspect={aspect} tables={tables} areas={areas} chairs={chairs} />
          <Legend />
          <PrintFooter />
        </section>
      )}
      {parts.tables &&
        pairs.map((pair, k) => (
          <section className="yl-sheet" key={k}>
            {head('Tables, seat by seat')}
            {pair.map((t) => (
              <TablePage key={t.id} t={t} layout={chairs.get(t.id) ?? []} />
            ))}
            <PrintFooter note={`Tables ${k * 2 + 1}${pair.length > 1 ? `–${k * 2 + 2}` : ''} of ${ordered.length}`} />
          </section>
        ))}
      {parts.diet && (
        <section className="yl-sheet">
          {head('Dietary requirements')}
          <PrintH sub={needs.length ? `${needs.length} ${needs.length === 1 ? 'guest' : 'guests'} with a dietary need${serious.length ? `, ${serious.length} serious (highlighted)` : ''}. Listed by table and seat so each plate goes to the right chair.` : 'No seated guest has a dietary need.'}>
            Dietary requirements, by table and seat
          </PrintH>
          {counts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2mm', marginBottom: '4mm' }}>
              {counts.map(([k, n]) => (
                <span key={k} style={{ padding: '1mm 3mm', borderRadius: '10mm', background: BRAND.tint, border: `.6pt solid ${BRAND.line}`, fontSize: '9pt', textTransform: 'capitalize' }}>
                  <strong>{n}</strong> × {k}
                </span>
              ))}
            </div>
          )}
          {needs.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Table</th>
                  <th style={{ width: '8%' }}>Seat</th>
                  <th style={{ width: '25%' }}>Guest</th>
                  <th style={{ width: '22%' }}>Dietary need</th>
                  <th>Meal</th>
                </tr>
              </thead>
              <tbody>
                {needs.map((w, i) => (
                  <tr key={w.p.id} className={isSerious(w.p.diet) ? 'yl-serious' : i % 2 ? 'yl-alt' : ''}>
                    <td>{tableWord(w.t.name)}</td>
                    <td style={{ fontWeight: 600 }}>{w.seat ?? '–'}</td>
                    <td style={{ fontWeight: 600 }}>{w.p.name}</td>
                    <td style={{ color: isSerious(w.p.diet) ? BRAND.red : undefined, fontWeight: isSerious(w.p.diet) ? 700 : 400 }}>
                      {isSerious(w.p.diet) ? '⚠ ' : ''}
                      {w.p.diet}
                    </td>
                    <td>{meals(w.p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <PrintFooter />
        </section>
      )}
      {parts.az && (
        <section className="yl-sheet">
          {head('Guest list')}
          <PrintH sub={`${seated} seated guests, A to Z, with their table and seat.`}>Everyone, A to Z</PrintH>
          <table>
            <thead>
              <tr>
                <th style={{ width: '34%' }}>Guest</th>
                <th style={{ width: '24%' }}>Table</th>
                <th style={{ width: '9%' }}>Seat</th>
                <th>Dietary need</th>
              </tr>
            </thead>
            <tbody>
              {[...where]
                .sort((a, b) => a.p.name.localeCompare(b.p.name))
                .map((w, i) => (
                  <tr key={w.p.id} className={isSerious(w.p.diet) ? 'yl-serious' : i % 2 ? 'yl-alt' : ''}>
                    <td style={{ fontWeight: 600 }}>{w.p.name}</td>
                    <td>{tableWord(w.t.name)}</td>
                    <td>{w.seat ?? '–'}</td>
                    <td style={{ color: isSerious(w.p.diet) ? BRAND.red : undefined }}>{w.p.diet}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <PrintFooter />
        </section>
      )}
    </div>
  );
}

function Legend() {
  const dot = (fill: string, label: string, dashed = false) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1.5mm' }}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ width: 12, height: 12 }}>
        <circle cx="6" cy="6" r="5" fill={fill} stroke={dashed ? '#9a9384' : 'none'} strokeDasharray={dashed ? '2 1.5' : undefined} />
      </svg>
      {label}
    </span>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2mm 6mm', marginTop: '3mm', fontSize: '9pt', color: BRAND.soft }}>
      {dot(BRAND.sage, 'Guest seated')}
      {dot('#a4566a', 'The couple')}
      {dot(BRAND.amber, 'Dietary need')}
      {dot(BRAND.red, 'Serious allergy')}
      {dot('#fff', 'Empty seat', true)}
      <span>8/10 = seated / seats</span>
    </div>
  );
}

/** The whole room: big table names, coloured chairs, no tiny writing. */
function FloorPlan({ aspect, tables, areas, chairs }: { aspect: string; tables: SeatTable[]; areas: SeatArea[]; chairs: Map<string, (PrintPerson | null)[]> }) {
  const W = 1000;
  const H = Math.round(W / aspectRatio(aspect));
  const k = 1 / roomScale(aspect);
  const chairR = Math.max(5, 8 * k);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: '175mm', display: 'block' }} role="img" aria-label="Floor plan" fontFamily="'DM Sans', Arial, sans-serif">
      <rect x={2} y={2} width={W - 4} height={H - 4} rx={10} fill={BRAND.paper} stroke={BRAND.gold} strokeWidth={3} />
      {areas.map((a, i) => {
        const w = (a.w / 100) * W;
        const h = (a.h / 100) * H;
        return (
          <g key={`a${i}`}>
            <rect x={(a.x / 100) * W - w / 2} y={(a.y / 100) * H - h / 2} width={w} height={h} rx={6} fill="#efe8d6" stroke="#b9a983" strokeWidth={1.5} strokeDasharray="8 6" />
            <text x={(a.x / 100) * W} y={(a.y / 100) * H} fontSize={Math.max(14, Math.min(22, h * 0.28))} fill={BRAND.soft} textAnchor="middle" dominantBaseline="central" letterSpacing="2">
              {a.label.toUpperCase()}
            </text>
          </g>
        );
      })}
      {tables.map((t) => {
        const box = tableBox(t, aspect);
        const bw = (box.w / 100) * W;
        const bh = (box.h / 100) * H;
        const cx = (t.x / 100) * W;
        const cy = (t.y / 100) * H;
        const shape = t.shape as TableShape;
        const layout = chairs.get(t.id) ?? [];
        const n = layout.filter(Boolean).length;
        const turned = t.dir === 'v' && (STRETCHES(shape) || shape === 'sweetheart');
        const along = turned ? bh : bw;
        const across = turned ? bw : bh;
        const name = t.name.trim();
        const fs = Math.max(14, Math.min(36, across * 0.42, (along * 0.8) / Math.max(1.6, name.length * 0.62)));
        return (
          <g key={t.id}>
            {seatSpots(t, t.seats).map((p, i) => (
              <circle key={i} cx={cx - bw / 2 + (p.x / 100) * bw} cy={cy - bh / 2 + (p.y / 100) * bh} r={chairR} fill={chairFill(layout[i] ?? null)} stroke={layout[i] ? 'none' : '#9a9384'} strokeWidth={1.2} strokeDasharray={layout[i] ? undefined : '3 2'} />
            ))}
            {shape === 'round' || shape === 'oval' ? (
              <ellipse cx={cx} cy={cy} rx={bw / 2} ry={bh / 2} fill="#fff" stroke={BRAND.ink} strokeWidth={2} />
            ) : (
              <rect x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} rx={shape === 'sweetheart' ? Math.min(bw, bh) / 2 : 4} fill="#fff" stroke={BRAND.ink} strokeWidth={2} />
            )}
            <g transform={turned ? `rotate(-90 ${cx} ${cy})` : undefined}>
              <text x={cx} y={cy - fs * 0.18} fontSize={fs} fontWeight={700} fill={BRAND.ink} textAnchor="middle" dominantBaseline="central" fontFamily={SERIF}>
                {name}
              </text>
              <text x={cx} y={cy + fs * 0.62} fontSize={Math.max(11, fs * 0.45)} fill={BRAND.soft} textAnchor="middle" dominantBaseline="central">
                {n}/{t.seats}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/** One table, big: every chair numbered, each guest's name beside it, then the seat-by-seat list. */
function TablePage({ t, layout }: { t: SeatTable; layout: (PrintPerson | null)[] }) {
  const people = layout.slice(0, t.seats);
  const extra = layout.slice(t.seats).filter(Boolean) as PrintPerson[];
  const here = people.filter(Boolean).length + extra.length;
  return (
    <div style={{ breakInside: 'avoid', marginBottom: '6mm', paddingBottom: '4mm', borderBottom: `.6pt solid ${BRAND.line}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4mm' }}>
        <h3 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: '19pt', margin: 0 }}>{tableWord(t.name)}</h3>
        <span style={{ fontSize: '9.5pt', color: BRAND.soft }}>
          {here} of {t.seats} seats
          {people.some((p) => p?.diet.trim()) ? ` · ${people.filter((p) => p?.diet.trim()).length} dietary` : ''}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '5mm', alignItems: 'start', marginTop: '2mm' }}>
        <TableDrawing t={t} people={people} />
        <table>
          <thead>
            <tr>
              <th style={{ width: '13%' }}>Seat</th>
              <th>Guest</th>
              <th style={{ width: '34%' }}>Dietary</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p, i) => (
              <tr key={i} className={p && isSerious(p.diet) ? 'yl-serious' : i % 2 ? 'yl-alt' : ''}>
                <td style={{ fontWeight: 700 }}>{i + 1}</td>
                <td style={{ fontWeight: p ? 600 : 400, color: p ? undefined : '#9a9384', fontStyle: p ? undefined : 'italic' }}>
                  {p ? p.name : 'Empty'}
                  {p && meals(p) ? <div style={{ fontSize: '8pt', fontWeight: 400, color: BRAND.soft }}>{meals(p)}</div> : null}
                </td>
                <td style={{ fontSize: '9pt', color: p && isSerious(p.diet) ? BRAND.red : undefined, fontWeight: p && isSerious(p.diet) ? 700 : 400 }}>{p?.diet ?? ''}</td>
              </tr>
            ))}
            {extra.map((p) => (
              <tr key={p.id}>
                <td>–</td>
                <td style={{ fontWeight: 600 }}>{p.name} (no seat number)</td>
                <td style={{ fontSize: '9pt' }}>{p.diet}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The table drawn large: chairs numbered, names written beside them in readable type. */
function TableDrawing({ t, people }: { t: SeatTable; people: (PrintPerson | null)[] }) {
  const shape = t.shape as TableShape;
  const long = STRETCHES(shape) || shape === 'sweetheart';
  const n = t.seats;
  const first = (p: PrintPerson) => p.name.trim().split(/\s+/)[0] ?? '';
  const rest = (p: PrintPerson) => p.name.trim().split(/\s+/).slice(1).join(' ');
  const clip = (s: string, m: number) => (s.length > m ? `${s.slice(0, m - 1)}…` : s);
  if (long) {
    const sides = shape === 'long' ? (t.sides ?? 2) : t.sides === -1 ? -1 : 1;
    const topN = sides === 2 ? Math.ceil(n / 2) : sides === 1 ? n : 0;
    const botN = n - topN;
    const perSide = Math.max(topN, botN, 1);
    const W = 600;
    const gap = Math.min(110, (W - 40) / perSide);
    const fs = Math.max(11, Math.min(17, gap / 5.6));
    const tw = gap * perSide;
    const x0 = (W - tw) / 2;
    const r = Math.min(17, gap / 3.2);
    const nameH = fs * 2.4;
    const topY = 20 + nameH + r;
    const tableY = topY + r + 12;
    const tableH = 46;
    const botY = tableY + tableH + 12 + r;
    const H = (botN ? botY + r + nameH : tableY + tableH) + 16;
    const seat = (i: number, x: number, y: number, up: boolean) => {
      const p = people[i] ?? null;
      const ny = up ? y - r - 6 : y + r + 6 + fs;
      return (
        <g key={i}>
          <circle cx={x} cy={y} r={r} fill={chairFill(p)} stroke={p ? 'none' : '#9a9384'} strokeDasharray={p ? undefined : '3 2'} />
          <text x={x} y={y} fontSize={r * 0.95} fontWeight={700} fill={p ? '#fff' : '#9a9384'} textAnchor="middle" dominantBaseline="central">
            {i + 1}
          </text>
          {p && (
            <text x={x} textAnchor="middle" fontSize={fs} fill={BRAND.ink}>
              <tspan x={x} y={up ? ny - fs * 1.1 : ny} fontWeight={700}>
                {clip(first(p), 11)}
              </tspan>
              <tspan x={x} y={up ? ny : ny + fs * 1.1}>{clip(rest(p), 12)}</tspan>
            </text>
          )}
        </g>
      );
    };
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label={`${tableWord(t.name)} drawn with each seat`} fontFamily="'DM Sans', Arial, sans-serif">
        <rect x={x0} y={tableY} width={tw} height={tableH} rx={shape === 'sweetheart' ? tableH / 2 : 6} fill={BRAND.tint} stroke={BRAND.ink} strokeWidth={2} />
        <text x={W / 2} y={tableY + tableH / 2} fontSize={20} fontFamily={SERIF} fontWeight={700} fill={BRAND.ink} textAnchor="middle" dominantBaseline="central">
          {tableWord(t.name)}
        </text>
        {sides !== -1 && Array.from({ length: topN }, (_, i) => seat(i, x0 + gap * (i + 0.5), topY, true))}
        {Array.from({ length: botN }, (_, j) => seat(topN + j, x0 + gap * (j + 0.5), botY, false))}
        {sides === -1 && Array.from({ length: n }, (_, j) => seat(j, x0 + gap * (j + 0.5), botY, false))}
      </svg>
    );
  }
  // Round, oval and square: a ring of chairs, names outside each one.
  const fs = n > 14 ? 12 : n > 10 ? 13.5 : 15;
  const r = n > 14 ? 14 : 17;
  const ring = Math.max(105, ((r * 2 + 10) * n) / (2 * Math.PI));
  const table = ring - r - 12;
  const out = ring + r + 8;
  const W = 2 * (out + 110);
  const H = 2 * (out + fs * 2.6);
  const cx = W / 2;
  const cy = H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: '105mm', display: 'block' }} role="img" aria-label={`${tableWord(t.name)} drawn with each seat`} fontFamily="'DM Sans', Arial, sans-serif">
      {shape === 'square' ? (
        <rect x={cx - table * 0.8} y={cy - table * 0.8} width={table * 1.6} height={table * 1.6} rx={6} fill={BRAND.tint} stroke={BRAND.ink} strokeWidth={2} />
      ) : (
        <ellipse cx={cx} cy={cy} rx={table} ry={shape === 'oval' ? table * 0.78 : table} fill={BRAND.tint} stroke={BRAND.ink} strokeWidth={2} />
      )}
      <text x={cx} y={cy} fontSize={Math.min(26, table * 0.32)} fontFamily={SERIF} fontWeight={700} fill={BRAND.ink} textAnchor="middle" dominantBaseline="central">
        {tableWord(t.name)}
      </text>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const x = cx + ring * c;
        const y = cy + ring * s;
        const p = people[i] ?? null;
        const anchor = c > 0.35 ? 'start' : c < -0.35 ? 'end' : 'middle';
        const nx = cx + out * c + (anchor === 'start' ? 2 : anchor === 'end' ? -2 : 0);
        const ny = cy + out * s;
        // Names above the top chairs and below the bottom ones; beside them at the sides.
        const y1 = anchor === 'middle' ? (s < 0 ? ny - fs * 1.15 : ny + fs * 0.8) : ny - fs * 0.15;
        return (
          <Fragment key={i}>
            <circle cx={x} cy={y} r={r} fill={chairFill(p)} stroke={p ? 'none' : '#9a9384'} strokeDasharray={p ? undefined : '3 2'} />
            <text x={x} y={y} fontSize={r * 0.95} fontWeight={700} fill={p ? '#fff' : '#9a9384'} textAnchor="middle" dominantBaseline="central">
              {i + 1}
            </text>
            {p && (
              <text textAnchor={anchor} fontSize={fs} fill={BRAND.ink}>
                <tspan x={nx} y={y1} fontWeight={700}>
                  {clip(first(p), 12)}
                </tspan>
                <tspan x={nx} y={y1 + fs * 1.1}>{clip(rest(p), 13)}</tspan>
              </text>
            )}
          </Fragment>
        );
      })}
    </svg>
  );
}
