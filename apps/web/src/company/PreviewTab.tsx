import { useState, type FormEvent } from 'react';
import { companyApi, type CompanyWedding } from '../lib/api';
import { SIGNATURE_NAMES, THEME_NAMES } from '../guest/themeKit';

/**
 * Preview (company portal): every part of the product as the person using it sees it.
 * - The product: the front page, the free trial, the sample invitation in every design, the couple's app with
 *   a made-up wedding (opened straight in for the team, no trial to book), the seating PDF, the vendor pages.
 * - A real wedding's portals: find it, then open its invitation, guides, photos and board, each of its wedding
 *   party, each booked vendor, its coordinator and helpers, all as preview (looking changes nothing).
 */
type Group = { title: string; links: { name: string; what: string; url: string }[] };

const card = 'flex flex-col gap-3 p-5 rounded-[14px] border border-[#ecdcd2] bg-white shadow-[0_1px_3px_rgba(27,34,24,.06)]';
const preview = (url: string) => {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('preview', '1');
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
};

function Links({ group, previewing = true }: { group: Group; previewing?: boolean }) {
  return (
    <section aria-label={group.title} className="flex flex-col">
      <strong className="text-[13px] tracking-[.12em] uppercase text-[#5b6a52] pb-1">{group.title}</strong>
      {group.links.length ? (
        group.links.map((l) => (
          <a key={l.url} href={previewing ? preview(l.url) : l.url} target="_blank" rel="noopener" className="flex items-center justify-between gap-3 py-[9px] border-t border-[#f0e6dc] first-of-type:border-t-0 no-underline text-[#2e2430] hover:bg-[#fbf3ee]">
            <span className="min-w-0">
              <span className="block font-medium truncate">{l.name}</span>
              <span className="block text-[12px] text-[#5b6a52] truncate">{l.what}</span>
            </span>
            <span className="flex-none py-[3px] px-3 rounded-full border border-[#dcc2b4] text-[12px] font-semibold">Open</span>
          </a>
        ))
      ) : (
        <span className="py-2 text-[13px] text-[#5b6a52]">None yet.</span>
      )}
    </section>
  );
}

const PRODUCT: Group[] = [
  {
    title: 'What couples see first',
    links: [
      { name: 'Front page', what: 'The sales page', url: '/' },
      { name: 'Book a free trial', what: 'Before the sample app opens', url: '/try' },
      { name: 'Designs', what: `All ${THEME_NAMES.length} designs`, url: '/designs' },
      { name: 'Sample invitation', what: 'A guest’s invitation, with music, questions and where to stay', url: '/demo' },
      ...SIGNATURE_NAMES.map((n) => ({ name: `Sample: ${n}`, what: 'A Signature design, with its opening scene', url: `/demo?theme=${encodeURIComponent(n)}` })),
      { name: 'Sample seating PDF', what: 'What the caterer and venue get', url: '/demo/seating-pdf' },
    ],
  },
  {
    title: 'The couple’s app (a made-up wedding)',
    links: [
      { name: 'Wedding overview', what: 'Replies, needs you, the planning dashboard', url: '/admin/demo/wedding/overview' },
      { name: 'Guest list', what: 'Guests, replies, previews, first and last names', url: '/admin/demo/wedding/guests?show=all' },
      { name: 'Seating', what: 'Change seat allocation, reconfigure the room', url: '/admin/demo/wedding/seating' },
      { name: 'Dietary', what: 'Needs and special menus', url: '/admin/demo/wedding/dietary' },
      { name: 'Wedding planner', what: 'Budget, vendors, checklist', url: '/admin/demo/wedding/planner' },
      { name: 'Wedding party', what: 'Roles and their run sheet', url: '/admin/demo/wedding/party' },
      { name: 'Texts', what: 'Invitations and reminders', url: '/admin/demo/wedding/texts' },
      { name: 'Setup', what: 'The invitation, its look, scenes and photo', url: '/admin/demo/wedding/pages' },
    ],
  },
  {
    title: 'Vendors',
    links: [
      { name: 'Vendor directory', what: 'Couples find vendors', url: '/vendors' },
      { name: 'Vendor sign-up', what: 'A business lists itself', url: '/vendors/join' },
    ],
  },
];

export function PreviewTab() {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<CompanyWedding[] | null>(null);
  const [portals, setPortals] = useState<{ names: string; groups: Group[] } | null>(null);
  const [problem, setProblem] = useState('');
  const search = async (e: FormEvent) => {
    e.preventDefault();
    setProblem('');
    setPortals(null);
    try {
      setFound((await companyApi.weddings(q)).weddings.slice(0, 12));
    } catch (err) {
      setProblem((err as Error).message);
    }
  };
  const open = async (slug: string) => {
    setProblem('');
    try {
      setPortals(await companyApi.portals(slug));
    } catch (err) {
      setProblem((err as Error).message);
    }
  };
  // The sample app is behind the free-trial booking for visitors; the team goes straight in.
  const letIn = () => {
    try {
      localStorage.setItem('yl.trial', '1');
    } catch {
      /* private window: they'll see the trial page first */
    }
  };
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="m-0 text-[22px] font-semibold">Preview</h2>
        <p className="m-0 mt-1 text-[14px] text-[#5b6a52]">Every part of the product as the person using it sees it. Each opens in a new tab.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3" onClickCapture={letIn}>
        {PRODUCT.map((g) => (
          <div key={g.title} className={card}>
            <Links group={g} previewing={false} />
          </div>
        ))}
      </div>

      <div className={card}>
        <strong className="text-[15px]">A wedding’s portals</strong>
        <span className="text-[13px] text-[#5b6a52]">Find a wedding to open its invitation, its wedding party’s pages, its vendors’ pages, its coordinator and helpers, exactly as each of them sees it. Looking changes nothing, and each look is noted in Activity.</span>
        <form onSubmit={search} className="flex gap-2 flex-wrap">
          <input aria-label="Find a wedding" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Names, address or the couple’s email" className="flex-1 min-w-[220px] py-[9px] px-3 rounded-[10px] border border-[#dcc2b4] text-[14px]" />
          <button type="submit" className="py-[9px] px-4 rounded-full border-0 bg-[#2e2430] text-[#fbf1e8] text-[14px] font-semibold cursor-pointer">
            Find
          </button>
        </form>
        {problem && (
          <p role="alert" className="m-0 text-[14px] text-[#8a3b2c]">
            {problem}
          </p>
        )}
        {found && !portals && (
          <ul className="m-0 p-0 list-none flex flex-col">
            {found.map((w) => (
              <li key={w.slug} className="flex items-center justify-between gap-3 py-2 border-t border-[#f0e6dc] first:border-t-0 text-[14px]">
                <span className="min-w-0 truncate">
                  <strong>{w.names}</strong> <span className="text-[#5b6a52]">· {w.slug}</span>
                </span>
                <button type="button" onClick={() => void open(w.slug)} className="flex-none py-[5px] px-3 rounded-full border border-[#dcc2b4] bg-white text-[13px] font-semibold cursor-pointer">
                  Its portals
                </button>
              </li>
            ))}
            {!found.length && <li className="py-2 text-[14px] text-[#5b6a52]">No weddings match.</li>}
          </ul>
        )}
        {portals && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <strong>{portals.names}</strong>
              <button type="button" onClick={() => setPortals(null)} className="py-[5px] px-3 rounded-full border border-[#dcc2b4] bg-white text-[13px] cursor-pointer">
                ← Back to the list
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {portals.groups.map((g) => (
                <div key={g.title} className="p-4 rounded-[12px] border border-[#f0e6dc]">
                  <Links group={g} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
