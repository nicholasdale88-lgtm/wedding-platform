import { useState } from 'react';
import { QrSvg } from '../lib/SaveToPhone';
import { BRAND } from './brand';

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";

/** The vendor's own links: the front page and the live sample, each carrying who sent them and their code. */
export function vendorLinks(origin: string, slug: string, code: string) {
  const q = `ref=${encodeURIComponent(slug)}&code=${encodeURIComponent(code)}`;
  return { home: `${origin}/?${q}`, sample: `${origin}/demo?play=1&${q}` };
}

/** What a vendor sends their couples, in their words (they can change it before sending). */
export const vendorMessage = (code: string, percentOff: number, link: string) =>
  `Planning your wedding? ${BRAND} does your invitations, RSVPs, seating, dietary needs and the whole plan in one place, and your guests just tap a link. Use my code ${code} for ${percentOff}% off: ${link}`;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** A card to print for the counter or a client pack: the code, what it does, and a QR to the vendor's link. */
function printCard(name: string, code: string, percentOff: number, link: string, qr: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} · ${esc(BRAND)} card</title><style>
@page{size:A4;margin:12mm}body{margin:0;font-family:Georgia,serif;color:${INK}}
.s{display:grid;grid-template-columns:repeat(2,90mm);grid-auto-rows:62mm;gap:6mm}
.c{box-sizing:border-box;border:1px solid #c6b794;border-radius:4mm;padding:6mm;display:flex;gap:5mm;align-items:center;background:#fbf8f2}
.t{display:flex;flex-direction:column;gap:2mm}.b{font-size:9pt;letter-spacing:.18em;text-transform:uppercase;color:${SOFT}}
.h{font-size:15pt;line-height:1.15}.k{font-size:20pt;letter-spacing:.08em}.f{font-size:8.5pt;color:${SOFT}}
svg{width:30mm;height:30mm;flex:none}
</style></head><body><div class="s">${Array.from({ length: 8 })
      .map(
        () =>
          `<div class="c">${qr}<div class="t"><span class="b">From ${esc(name)}</span><span class="h">Your invitations, RSVPs and seating in one place</span><span class="k">${esc(code)}</span><span class="f">${percentOff}% off ${esc(BRAND)} · scan to see a sample</span></div></div>`,
      )
      .join('')}</div><script>setTimeout(function(){print()},300)</script></body></html>`,
  );
  w.document.close();
}

/**
 * On the vendor's own page: everything they need to recommend us to their couples. Their link and QR carry
 * their code, so the couple sees the sample invitation, and the code is filled in for them when they upgrade.
 */
export function VendorKit({ name, slug, code, percentOff, uses }: { name: string; slug: string; code: string; percentOff: number; uses: number }) {
  const [copied, setCopied] = useState('');
  const links = vendorLinks(window.location.origin, slug, code);
  const message = vendorMessage(code, percentOff, links.home);
  const copy = (what: string, text: string) =>
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(what))
      .catch(() => undefined);
  const qrMarkup = () => document.getElementById('vendor-kit-qr')?.innerHTML ?? '';
  const share = () => {
    if (navigator.share) void navigator.share({ title: BRAND, text: message, url: links.home }).catch(() => undefined);
    else copy('message', message);
  };
  const pill = 'py-2 px-4 rounded-full border border-[#c6b794] bg-white text-[14px] cursor-pointer no-underline';
  return (
    <section aria-label="Recommend us to your couples" className="flex flex-col gap-3 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0] self-start">
      <h2 className="m-0 text-[26px] leading-tight font-normal" style={{ fontFamily: serif, color: INK }}>
        Recommend us to your couples
      </h2>
      <p className="m-0 text-[15px]" style={{ color: SOFT }}>
        Your couples get {percentOff}% off with your code, and see exactly what their guests will get before they spend anything. Couples who plan with {BRAND} can add you to their planner, and it shows on your listing.
      </p>
      <div className="flex gap-4 items-center flex-wrap">
        <div id="vendor-kit-qr">
          <QrSvg text={links.sample} size={132} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-[.18em] uppercase" style={{ color: SOFT }}>
            Your code
          </span>
          <span className="text-[30px] tracking-[.08em] leading-none" style={{ fontFamily: serif, color: INK }}>
            {code}
          </span>
          <span className="text-[14px]" style={{ color: SOFT }}>
            {percentOff}% off any plan · used {uses} {uses === 1 ? 'time' : 'times'} so far
          </span>
          <span className="text-[13px]" style={{ color: SOFT }}>
            The QR opens the sample invitation, with your code kept for them.
          </span>
        </div>
      </div>
      <ol className="m-0 pl-5 flex flex-col gap-1 text-[14px]" style={{ color: INK }}>
        <li>Send couples your link, or let them scan the QR at a meeting.</li>
        <li>They open the sample invitation (music, RSVP, dietary needs) on their own phone.</li>
        <li>When they upgrade, your code is already filled in.</li>
      </ol>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className={pill} onClick={share}>
          Send to a couple
        </button>
        <button type="button" className={pill} onClick={() => copy('message', message)}>
          {copied === 'message' ? 'Message copied ✓' : 'Copy a message'}
        </button>
        <button type="button" className={pill} onClick={() => copy('link', links.home)}>
          {copied === 'link' ? 'Link copied ✓' : 'Copy your link'}
        </button>
        <a className={pill} href={links.sample} target="_blank" rel="noreferrer" style={{ color: INK }}>
          See what couples see
        </a>
        <button type="button" className={pill} onClick={() => printCard(name, code, percentOff, links.sample, qrMarkup())}>
          Print cards for your counter
        </button>
      </div>
      <details className="text-[14px]">
        <summary className="cursor-pointer" style={{ color: INK }}>
          The message
        </summary>
        <p className="m-0 mt-2 p-3 rounded-[10px] bg-white border border-[#e2d7bc] whitespace-pre-line">{message}</p>
      </details>
    </section>
  );
}
