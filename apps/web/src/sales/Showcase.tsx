/**
 * The front page's product pictures, drawn (no screenshots to go stale): a fan of three phones (the guest
 * list filling itself in, the seating plan, the budget). All made-up
 * details for the sample couple, Olivia & James.
 */

const INK = '#33402f';
const SOFT = '#5b6a52';
const GOLD = '#c8a46a';
const serif = "'Cormorant Garamond', Georgia, serif";

const CSS = `
.sc-fan{position:relative;height:560px;max-width:980px;margin:0 auto}
.sc-ph{position:absolute;top:30px;width:250px;height:510px;border-radius:40px;padding:10px;background:#151a13;box-shadow:0 30px 60px rgba(27,34,24,.35),inset 0 0 0 2px #3a4236;transition:transform .6s cubic-bezier(.2,.8,.2,1)}
.sc-ph>div{width:100%;height:100%;border-radius:31px;overflow:hidden;background:#fbf8f2;display:flex;flex-direction:column}
.sc-l{left:calc(50% - 125px - 230px);transform:rotate(-8deg) translateY(30px)}
.sc-m{left:calc(50% - 125px);top:0;z-index:2}
.sc-r{left:calc(50% - 125px + 230px);transform:rotate(8deg) translateY(30px)}
.sc-fan:hover .sc-l{transform:rotate(-11deg) translate(-18px,24px)}
.sc-fan:hover .sc-r{transform:rotate(11deg) translate(18px,24px)}
.sc-row{display:flex;align-items:center;gap:8px;padding:7px 12px;border-top:1px solid #efe7d3;font-size:12px;animation:scIn .5s both}
.sc-row:nth-child(1){animation-delay:.2s}.sc-row:nth-child(2){animation-delay:.5s}.sc-row:nth-child(3){animation-delay:.8s}.sc-row:nth-child(4){animation-delay:1.1s}.sc-row:nth-child(5){animation-delay:1.4s}.sc-row:nth-child(6){animation-delay:1.7s}
@keyframes scIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
@media (max-width:820px){.sc-fan{height:540px}.sc-l,.sc-r{display:none}}
@media (prefers-reduced-motion:reduce){.sc-row{animation:none}.sc-ph{transition:none}}
`;

/** The page's shared styles (the phones and their rows). Put once on the page. */
export const ShowcaseStyles = () => <style>{CSS}</style>;

function Bar({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ padding: '30px 14px 10px', background: INK, color: '#fbf8f2' }}>
      <div style={{ fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', opacity: 0.75 }}>{sub}</div>
      <div style={{ fontFamily: serif, fontSize: 24, lineHeight: 1.1 }}>{title}</div>
    </div>
  );
}

const GUESTS: [string, string, string][] = [
  ['Emma & Tom', 'Coming · 2', 'Vegetarian'],
  ['The Nguyens', 'Coming · 4', '1 coeliac'],
  ['Priya', 'Coming · 1', ''],
  ['Lucy & Ben', 'Can’t make it', ''],
  ['Aunty Marg', 'Coming · 1', 'Low salt'],
  ['James’s uni crew', 'Opened', 'Reminder Thu'],
];

function GuestList() {
  return (
    <>
      <Bar title="Guest list" sub="Olivia & James" />
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px' }}>
        {[
          ['86', 'coming'],
          ['9', 'no'],
          ['17', 'waiting'],
        ].map(([n, l]) => (
          <div key={l} style={{ flex: 1, padding: '6px 0', borderRadius: 10, background: '#efe7d3', textAlign: 'center' }}>
            <div style={{ fontFamily: serif, fontSize: 22, lineHeight: 1 }}>{n}</div>
            <div style={{ fontSize: 10, color: SOFT }}>{l}</div>
          </div>
        ))}
      </div>
      <div>
        {GUESTS.map(([who, status, note]) => (
          <div key={who} className="sc-row">
            <span style={{ width: 24, height: 24, borderRadius: 12, background: status.startsWith('Coming') ? '#dfe7cf' : status === 'Opened' ? '#f3e6c6' : '#eadfd8', display: 'grid', placeItems: 'center', fontSize: 10, flex: 'none' }}>
              {who[0]}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontWeight: 600, display: 'block' }}>{who}</strong>
              <span style={{ color: SOFT, fontSize: 11 }}>{note || ' '}</span>
            </span>
            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: status.startsWith('Coming') ? INK : status === 'Opened' ? GOLD : '#c9b8ae', color: '#fbf8f2', whiteSpace: 'nowrap' }}>{status}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Seating() {
  const tables: [number, number, string][] = [
    [62, 70, '1'], [168, 70, '2'], [62, 176, '3'], [168, 176, '4'], [62, 282, '5'], [168, 282, '6'],
  ];
  return (
    <>
      <Bar title="Seating" sub="Reception · 112 seats" />
      <svg viewBox="0 0 230 380" style={{ flex: 1 }}>
        <rect x="45" y="12" width="140" height="22" rx="4" fill="#efe7d3" stroke={GOLD} />
        <text x="115" y="27" textAnchor="middle" fontSize="10" fill={INK}>
          Head table
        </text>
        {tables.map(([x, y, n]) => (
          <g key={n}>
            <circle cx={x} cy={y} r="30" fill="#fffdf8" stroke={INK} strokeWidth="1.2" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i / 8) * Math.PI * 2;
              const full = Number(n) % 3 !== 0 || i < 6;
              return <circle key={i} cx={x + Math.cos(a) * 40} cy={y + Math.sin(a) * 40} r="6" fill={full ? '#a9b98d' : '#efe7d3'} stroke={INK} strokeWidth=".6" />;
            })}
            <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fontFamily={serif} fill={INK}>
              {n}
            </text>
          </g>
        ))}
        <rect x="20" y="338" width="190" height="28" rx="14" fill={INK} />
        <text x="115" y="356" textAnchor="middle" fontSize="11" fill="#fbf8f2">
          ✓ Auto-seat: all rules kept
        </text>
      </svg>
    </>
  );
}

function Budget() {
  const parts: [string, number, string][] = [
    ['Venue & catering', 52, INK],
    ['Photos & video', 16, '#7d8f62'],
    ['Flowers & styling', 12, GOLD],
    ['Attire', 10, '#b9876a'],
    ['Everything else', 10, '#d9cdb0'],
  ];
  let at = 0;
  const arc = (from: number, to: number) => {
    const p = (v: number) => {
      const a = (v / 100) * Math.PI * 2 - Math.PI / 2;
      return `${115 + Math.cos(a) * 62} ${110 + Math.sin(a) * 62}`;
    };
    return `M ${p(from)} A 62 62 0 ${to - from > 50 ? 1 : 0} 1 ${p(to)}`;
  };
  return (
    <>
      <Bar title="Budget" sub="$38,500 planned" />
      <svg viewBox="0 0 230 220">
        {parts.map(([k, v, c]) => {
          const d = arc(at, at + v - 0.8);
          at += v;
          return <path key={k} d={d} fill="none" stroke={c} strokeWidth="22" />;
        })}
        <text x="115" y="106" textAnchor="middle" fontSize="24" fontFamily={serif} fill={INK}>
          $24,180
        </text>
        <text x="115" y="124" textAnchor="middle" fontSize="10" fill={SOFT}>
          paid so far
        </text>
      </svg>
      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11 }}>
        {parts.map(([k, v, c]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: c }} />
            <span style={{ flex: 1 }}>{k}</span>
            <span style={{ color: SOFT }}>{v}%</span>
          </div>
        ))}
        <div style={{ marginTop: 6, padding: '7px 9px', borderRadius: 10, background: '#f3e6c6' }}>Florist balance $1,200 due Fri: reminder set</div>
      </div>
    </>
  );
}

/** Three phones, fanned: the guest list in the middle, seating and budget either side. */
export function PhoneFan() {
  return (
    <div className="sc-fan" role="img" aria-label="The app on three phones: the guest list filling in with replies, the seating plan, and the budget">
      <div className="sc-ph sc-l">
        <div>
          <Seating />
        </div>
      </div>
      <div className="sc-ph sc-m">
        <div>
          <GuestList />
        </div>
      </div>
      <div className="sc-ph sc-r">
        <div>
          <Budget />
        </div>
      </div>
    </div>
  );
}
