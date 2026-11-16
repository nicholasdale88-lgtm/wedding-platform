import { useState } from 'react';
import type { PartyPayload } from '../invitation/api';
import { Ornament, SANS } from './look';

/** "The bridal party" for bridesmaids and the maid of honour, "The groomsmen" for groomsmen, the best man and ushers. */
export function partyGroup(roles: string[]): { title: string; word: string } {
  if (roles.length && roles.every((r) => /bride|maid|matron|flower girl/i.test(r))) return { title: 'The bridal party', word: 'bridal party' };
  if (roles.length && roles.every((r) => /groom|best man|usher|page boy|ring bearer/i.test(r))) return { title: 'The groomsmen', word: 'groomsmen' };
  return { title: 'Wedding party', word: 'wedding party' };
}

type Perms = PartyPayload['perms'];

/** What their page can do, in their words, for what the couple lets them see. */
function tips(perms: Perms, calendar: boolean): [string, string][] {
  const on = (k: keyof NonNullable<Perms>) => !perms || perms[k] !== false;
  const out: [string, string][] = [['The run sheet', 'Where to be and when, for the lines meant for you. On the day, what’s happening now is marked, with what’s next.']];
  if (on('tasks')) out.push(['Your to-dos', `Jobs the couple has given you. Tick them off as you go${!perms || perms.addTasks ? ', and add your own' : ''}.`]);
  if (on('packing')) out.push(['What to bring', 'Your packing list for the day: tick things off as they go in the bag.']);
  if (calendar) out.push(['On your phone', 'Add your jobs and moments to your phone’s calendar: it updates by itself if anything changes.']);
  if (on('people')) out.push(['Who’s who', 'Everyone else in the wedding party, by side, so you know who to find.']);
  if (perms?.speeches) out.push(['Speeches', 'The order of speeches and toasts, and when yours is.']);
  if (perms?.guests || perms?.vendors || perms?.seating) out.push(['The extras', 'Guests, suppliers on the day and the seating plan, as the couple has shared them.']);
  out.push(['Install it', 'Add this page to your home screen: it opens like an app, even with a weak signal on the day.']);
  return out;
}

/**
 * The first time they open their page: a welcome to the bridal party (or the groomsmen) and what the page
 * does, once; afterwards "How your page works" at the bottom brings the same guide back.
 */
export function PartyWelcome({ storeKey, firstNames, word, couple, perms, calendar, gold, ink, paper = '#fbf8f2' }: { storeKey: string; firstNames: string; word: string; couple: string; perms: Perms; calendar: boolean; gold: string; ink: string; paper?: string }) {
  const seen = (() => {
    try {
      return localStorage.getItem(storeKey) === '1';
    } catch {
      return false;
    }
  })();
  const [open, setOpen] = useState(!seen);
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(storeKey, '1');
    } catch {
      /* private browsing: it shows again next time, which is fine */
    }
  };
  if (!open) return null;
  return (
    <section aria-label="Welcome" className="relative flex flex-col gap-4 px-5 pt-6 pb-5 rounded-[22px] text-[18px] leading-[1.45]" style={{ background: paper, border: `1px solid ${gold}`, boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 14px 32px -18px rgba(0,0,0,.3)' }}>
      <div className="text-center flex flex-col gap-2">
        <div className="text-[14px] tracking-[.2em] uppercase font-semibold" style={{ fontFamily: SANS, color: ink, opacity: 0.7 }}>
          Hello
        </div>
        <h2 className="m-0 font-normal text-[32px] leading-[1.15]">Welcome to the {word}, {firstNames}!</h2>
        <Ornament gold={gold} width={84} />
      </div>
      <p className="m-0">This is your own page for {couple}’s wedding: everything you need, in one place. Here’s what it does:</p>
      <ul className="m-0 p-0 list-none flex flex-col gap-3">
        {tips(perms, calendar).map(([t, d]) => (
          <li key={t} className="flex gap-3">
            <span aria-hidden="true" className="mt-[10px] w-2 h-2 rotate-45 shrink-0" style={{ background: gold }} />
            <span>
              <strong className="font-semibold">{t}.</strong> {d}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={close} className="self-center min-h-[44px] px-8 rounded-full border-0 cursor-pointer text-[17px]" style={{ background: ink, color: '#fbf8f2', fontFamily: SANS }}>
        Got it
      </button>
    </section>
  );
}

/** The same guide, any time, at the bottom of their page. */
export function PartyHelp({ perms, calendar, gold }: { perms: Perms; calendar: boolean; gold: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-label="How your page works" className="flex flex-col gap-2 text-[17px]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((x) => !x)} className="self-center inline-flex items-center min-h-[44px] px-2 border-0 bg-transparent underline cursor-pointer text-[17px]" style={{ color: 'inherit' }}>
        {open ? 'Hide the guide' : 'How your page works'}
      </button>
      {open && (
        <div className="flex flex-col gap-3 p-5 rounded-[18px] leading-[1.45]" style={{ border: `1px solid ${gold}`, background: 'rgba(255,255,255,.55)' }}>
          {tips(perms, calendar).map(([t, d]) => (
            <p key={t} className="m-0">
              <strong className="font-semibold">{t}.</strong> {d}
            </p>
          ))}
          <p className="m-0 opacity-80">Stuck, or something looks wrong? Ask the couple: they can change what you see, or send you a new sign-in link.</p>
        </div>
      )}
    </section>
  );
}
