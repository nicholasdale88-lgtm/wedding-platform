import { useEffect } from 'react';
import type { SeatTable } from '../lib/api';
import { SeatingPrint, type PrintPerson } from '../print/SeatingPrint';

/**
 * /demo/seating-pdf: the seating document a couple gives their caterer, for a made-up wedding. It shows
 * exactly what the export looks like (and prints the same way), with no sign-in.
 */
const FIRST = ['Charlotte', 'Tom', 'Priya', 'Sam', 'Grace', 'Liam', 'Mia', 'Noah', 'Ava', 'Jack', 'Isla', 'Oliver', 'Zoe', 'Ethan', 'Ruby', 'Lucas', 'Chloe', 'Henry', 'Emily', 'Max', 'Sophia', 'Leo', 'Harper', 'Archie', 'Ella', 'Theo', 'Lily', 'Hugo', 'Amelia', 'Finn', 'Evie', 'Oscar', 'Matilda', 'Arlo', 'Willow', 'Felix', 'Poppy', 'Jasper', 'Ivy', 'Louis', 'Hazel', 'Toby', 'Rose', 'Ned', 'Frankie', 'Alfie', 'Daisy', 'George'];
const LAST = ['Hale', 'Nair', 'Brooks', 'Chen', 'Walsh', 'Russo', 'Okafor', 'Murphy', 'Kowalski', 'Tanaka', 'Fraser', 'Singh'];
const DIETS = ['', '', '', '', 'Vegetarian', '', 'Gluten free', '', '', 'Nut allergy (anaphylaxis)', '', 'Vegan', '', '', 'Dairy free', ''];

function sample() {
  const tables: SeatTable[] = [
    { id: 't0', name: 'Bridal table', shape: 'head', dir: 'h', len: 40, x: 50, y: 14, seats: 8, sides: 1 } as SeatTable,
    { id: 't1', name: '1', shape: 'round', dir: 'h', len: 30, x: 20, y: 45, seats: 10 } as SeatTable,
    { id: 't2', name: '2', shape: 'round', dir: 'h', len: 30, x: 50, y: 45, seats: 10 } as SeatTable,
    { id: 't3', name: '3', shape: 'round', dir: 'h', len: 30, x: 80, y: 45, seats: 10 } as SeatTable,
    { id: 't4', name: '4', shape: 'long', dir: 'h', len: 34, x: 30, y: 80, seats: 12, sides: 2 } as SeatTable,
    { id: 't5', name: 'Family', shape: 'round', dir: 'h', len: 30, x: 75, y: 80, seats: 8 } as SeatTable,
  ];
  let k = 0;
  const person = (name?: string): PrintPerson => {
    const i = k++;
    return { id: `p${i}`, name: name ?? `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`, diet: DIETS[i % DIETS.length]!, meal: { e: '', m: DIETS[i % DIETS.length] === 'Vegetarian' ? 'Mushroom risotto' : i % 2 ? 'Beef fillet' : 'Barramundi', d: '' } };
  };
  const chairs = new Map<string, (PrintPerson | null)[]>();
  chairs.set('t0', [person('Grace Walsh'), person('Liam Brooks'), person('Ava Chen'), { ...person('Harriet Lane'), id: 'couple-1' }, { ...person('Theo Marsh'), id: 'couple-2' }, person('Noah Russo'), person('Isla Fraser'), person('Jack Murphy')]);
  for (const t of tables.slice(1)) chairs.set(t.id, Array.from({ length: t.seats }, (_, i) => (t.id === 't3' && i === 7 ? null : person())));
  return { tables, chairs, coming: k };
}

export function SampleSeatingPage() {
  useEffect(() => {
    document.title = 'Sample seating plan PDF · The Yes List';
  }, []);
  const { tables, chairs, coming } = sample();
  return (
    <div>
      <div className="print:hidden sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[14px]" style={{ background: '#33402f', color: '#fbf8f2' }}>
        <span>
          <strong>A sample</strong> of the seating PDF couples give their caterer (made-up names).
        </span>
        <button type="button" onClick={() => window.print()} className="py-2 px-4 rounded-full border-0 font-semibold cursor-pointer" style={{ background: '#e6cf9e', color: '#1b2218' }}>
          Save as PDF
        </button>
      </div>
      <SeatingPrint couple="Harriet & Theo" eventName="The wedding" when="Saturday 20 March 2027, 4:00pm" venue="Larkwood Estate, Hunter Valley" aspect="4 / 3" tables={tables} areas={[{ label: 'Dance floor', x: 50, y: 66, w: 22, h: 12 }]} chairs={chairs} coming={coming + 2} />
    </div>
  );
}
