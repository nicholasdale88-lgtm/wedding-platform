import { allows, chargeCents, EVENT_ADDON, FEATURE_LABEL, PLAN_INFO, planFor, planOf, type Feature, type Purchase, isPaid, PRICE_CENTS, TEXT_CREDIT_ALL_IN, TEXT_RATE } from '@wp/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { api, UPGRADE_EVENT } from '../lib/api';
import { useAdmin } from './Shell';
import { Pill, useToast } from './ui';

/**
 * Back from Stripe's payment page: it sends the couple to Settings → Your plan with ?paid=1&bought=… (paid)
 * or ?paid=0 (went back without paying). Read once per page load: Stripe's return is always a fresh load.
 */
let paidReturn: { paid: boolean; bought: string } | null | undefined;
function backFromPaying() {
  if (paidReturn === undefined) {
    const q = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
    const v = q?.get('paid');
    paidReturn = v === '1' || v === '0' ? { paid: v === '1', bought: q?.get('bought') ?? '' } : null;
  }
  return paidReturn;
}
/** usePlan runs in many places at once: thank them (and look for the new plan) only once. */
let paidHandled = false;

/** Whether paying by card is on, asked once per wedding however many Upgrade cards are showing. */
const cardOn = new Map<string, Promise<boolean>>();
function cardStatus(wid: string): Promise<boolean> {
  let p = cardOn.get(wid);
  if (!p) {
    // Can't tell (offline, signed out): fall back to asking for a payment link, which always works.
    p = api.planCard(wid).then((r) => r.on, () => false);
    cardOn.set(wid, p);
  }
  return p;
}

/** "$28", or "$7.50" when there are cents. */
const dollars = (cents: number) => `$${cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)}`;

/** Whether this wedding's plan includes a feature (older weddings and the platform's own have everything). */
export function usePlan() {
  const { overview, reload } = useAdmin();
  const toast = useToast();
  const plan = planOf(overview?.wedding.plan);
  useEffect(() => {
    const back = backFromPaying();
    if (!back || paidHandled) return;
    paidHandled = true;
    toast(back.paid ? 'Thank you! It switches on within a minute.' : 'No payment was taken. You can try again whenever you like.');
    // Take ?paid off the address, so a refresh or a bookmark doesn't say it again.
    const u = new URL(window.location.href);
    u.searchParams.delete('paid');
    u.searchParams.delete('bought');
    window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`);
    // Stripe's webhook switches the plan on, usually within seconds: look again a few times so it shows.
    if (back.paid) for (const ms of [4_000, 15_000, 45_000]) setTimeout(() => void reload(), ms);
  }, [toast, reload]);
  const stored = overview?.wedding.plan;
  return { plan, paid: isPaid(stored), basicPaid: stored === 'basic', has: (f: Feature) => allows(plan, f), requested: overview?.wedding.planRequested ?? '' };
}

/**
 * Shown where a feature isn't in the wedding's plan: what it is, which plan has it, and Upgrade. With card
 * payment switched on, Upgrade opens Stripe's payment page; otherwise it asks the platform owner for a
 * payment link.
 */
export function Upgrade({ feature, compact = false }: { feature: Feature; compact?: boolean }) {
  const { wid, reload } = useAdmin();
  const { plan, requested, basicPaid } = usePlan();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // A promo code: typed, then checked (the new price shows before paying).
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [deal, setDeal] = useState<{ cents: number; off: number; code: string } | null>(null);
  const [codeProblem, setCodeProblem] = useState('');
  // null until we know; the button waits rather than changing under the couple's finger.
  const [card, setCard] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void cardStatus(wid).then((on) => live && setCard(on));
    return () => {
      live = false;
    };
  }, [wid]);
  // Another event is an add-on of its own; everything else comes with a plan.
  const addon = feature === 'extraEvent';
  const need: Purchase = addon ? 'event' : planFor(feature) === 'complete' ? 'complete' : 'essentials';
  const info = need === 'event' ? EVENT_ADDON : PLAN_INFO[need];
  const asked = requested === need || (requested === 'complete' && need === 'essentials');
  // What a card payment would be now: Essentials to Deluxe is only the difference.
  const cents = deal ? deal.cents : chargeCents(plan, need, basicPaid);
  const price = cents === null ? info.price : dollars(cents);
  const applyCode = async () => {
    setCodeProblem('');
    if (!code.trim()) return;
    try {
      setDeal(await api.promo(wid, need, code.trim()));
    } catch (e) {
      setDeal(null);
      setCodeProblem((e as Error).message);
    }
  };
  // Just paid for this (or for Deluxe, which covers Essentials): say thanks while the webhook switches it on.
  const back = backFromPaying();
  const thanks = !!back?.paid && (back.bought === need || (back.bought === 'complete' && need === 'essentials'));
  const ask = async () => {
    setBusy(true);
    try {
      await api.requestPlan(wid, need);
      toast(`Thanks! We'll email you a secure link to pay for ${info.name}. It switches on as soon as it's paid.`);
      void reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const [textsOk, setTextsOk] = useState(false);
  const pay = async () => {
    setBusy(true);
    try {
      const { url } = await api.checkout(wid, need, deal?.code ?? '', textsOk);
      window.location.assign(url);
      // Stay busy while the browser leaves for Stripe, so a second tap doesn't open a second payment.
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };
  const upgradeNote = !addon && (plan === 'essentials' || basicPaid) && card ? ` You've paid for ${PLAN_INFO[plan].name}, so it's ${price} more.` : '';
  return (
    <section aria-label="Upgrade" className={`flex flex-col gap-2 ${compact ? 'p-4' : 'p-6'} rounded-[16px] border border-[var(--adm-line,#d3c6a4)] bg-[var(--adm-card,#fbf8f0)]`}>
      <strong className={compact ? 'text-[15px]' : 'text-[18px]'}>{addon ? `${FEATURE_LABEL[feature]} is an add-on` : `${FEATURE_LABEL[feature]} comes with ${info.name}`}</strong>
      <span className="text-[14px] text-[var(--adm-muted,#5b6a52)]">
        {addon ? `Each extra event is ${info.price}, paid once.` : `${info.name} is ${info.price}, paid once for your whole wedding.${upgradeNote}`}{' '}
        {thanks
          ? 'Thank you! It switches on within a minute.'
          : asked && !card
            ? "You've asked to upgrade: we'll email you a link to pay, and it switches on as soon as it's paid."
            : 'Everything you’ve added so far stays as it is.'}
      </span>
      {!thanks && !addon && (card === true || deal?.cents === 0 || (card === false && !asked)) && <TextsNotIncluded ok={textsOk} onOk={setTextsOk} />}
      {!thanks && (card === true || deal?.cents === 0) && (
        <Pill kind="primary" className="self-start" disabled={busy || (!addon && !textsOk)} onClick={() => void pay()}>
          {busy ? 'Opening the payment page…' : deal?.cents === 0 ? `Switch on ${addon ? 'the extra event' : info.name} free` : addon ? `Add an event: ${price} by card` : `Pay ${price} by card`}
        </Pill>
      )}
      {!thanks && (
        <div className="flex flex-col gap-1 text-[13px]">
          {deal ? (
            <span className="text-[#3d4a2f] font-semibold">
              Code {deal.code}: {dollars(deal.off)} off{deal.cents === 0 ? ', so it’s free' : ''}.
            </span>
          ) : codeOpen ? (
            <span className="flex gap-2 items-center flex-wrap">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && void applyCode()}
                placeholder="Promo code"
                aria-label="Promo code"
                maxLength={24}
                className="py-[6px] px-3 rounded-[10px] border border-[var(--adm-line,#d3c6a4)] bg-white text-[15px] w-[160px] uppercase"
              />
              <Pill size="sm" onClick={() => void applyCode()}>
                Apply
              </Pill>
            </span>
          ) : (
            <button type="button" onClick={() => setCodeOpen(true)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[var(--adm-ink,#33402f)]">
              Have a promo code?
            </button>
          )}
          {codeProblem && <span role="alert" className="text-[#7a4a37]">{codeProblem}</span>}
        </div>
      )}
      {!thanks && card !== true && !asked && (
        <Pill kind="primary" className="self-start" disabled={busy || card === null || (!addon && !textsOk)} onClick={() => void ask()}>
          {busy ? 'Asking…' : addon ? `Add an event (${info.price})` : `Upgrade to ${info.name}`}
        </Pill>
      )}
    </section>
  );
}

/** The page's content when the plan has the feature, else the Upgrade card. */
export function Gate({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { has } = usePlan();
  return has(feature) ? <>{children}</> : <Upgrade feature={feature} />;
}

/**
 * When a save is refused because the plan doesn't include it (a seating plan or a budget on Free), the
 * Upgrade card for that feature, over the page, instead of only an error. Mounted once in the admin.
 */
export function UpgradeWhenRefused() {
  const [feature, setFeature] = useState<Feature | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const f = (e as CustomEvent<unknown>).detail;
      // Only saves that can be refused anywhere (another event and texts show their own card where they're asked for).
      if (f === 'planner' || f === 'seating') setFeature(f);
    };
    window.addEventListener(UPGRADE_EVENT, on);
    return () => window.removeEventListener(UPGRADE_EVENT, on);
  }, []);
  useEffect(() => {
    if (!feature) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFeature(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [feature]);
  if (!feature) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Upgrade to save this" className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(20,24,18,.55)] p-4" onClick={() => setFeature(null)}>
      <div className="w-full max-w-[460px] flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
        <Upgrade feature={feature} />
        <Pill className="self-end" onClick={() => setFeature(null)}>
          Not now
        </Pill>
      </div>
    </div>
  );
}

/**
 * There's no free version: until a plan is paid, the couple sets everything up and previews it, but guests
 * can't open their invitations. This says so, and offers the three plans (paid once).
 */
export function GoLive({ compact = false }: { compact?: boolean }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const { paid } = usePlan();
  const [busy, setBusy] = useState('');
  const [card, setCard] = useState<boolean | null>(null);
  const [textsOk, setTextsOk] = useState(false);
  useEffect(() => {
    let live = true;
    void cardStatus(wid).then((on) => live && setCard(on));
    return () => {
      live = false;
    };
  }, [wid]);
  if (paid) return null;
  const choose = async (what: 'basic' | 'essentials' | 'complete') => {
    setBusy(what);
    try {
      if (card) {
        const { url } = await api.checkout(wid, what, '', true);
        window.location.assign(url);
        return;
      }
      await api.requestPlan(wid, what);
      toast('Thanks! We’ll email you a secure link to pay. Your invitations go live as soon as it’s paid.');
    } catch (e) {
      toast((e as Error).message);
    }
    setBusy('');
  };
  const plans = [
    ['basic', PLAN_INFO.free, 'Your invitation, replies and guest list, up to 50 guests'],
    ['essentials', PLAN_INFO.essentials, 'Plus seating, the planner, unlimited guests and automatic texts (credits extra)'],
    ['complete', PLAN_INFO.complete, 'Everything: photos by QR, wedding party sign-ins, backups, two events'],
  ] as const;
  return (
    <section aria-label="Go live" className={`flex flex-col gap-3 ${compact ? 'p-4' : 'p-5'} rounded-[16px] border border-[#33402f] bg-[var(--adm-card,#fbf8f0)]`}>
      <strong className="text-[17px]">Your invitations aren’t live yet</strong>
      <span className="text-[14px] text-[var(--adm-muted,#5b6a52)]">Set everything up and preview it as much as you like. Choose a plan, paid once, when you’re ready for guests to open their invitations. No subscription.</span>
      <TextsNotIncluded ok={textsOk} onOk={setTextsOk} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {plans.map(([k, info, what]) => (
          <button
            key={k}
            type="button"
            disabled={!!busy || !textsOk}
            title={textsOk ? undefined : 'Tick the box above first'}
            onClick={() => void choose(k)}
            className="flex flex-col gap-1 p-3 rounded-[12px] border border-[var(--adm-line,#c6b794)] bg-white text-left cursor-pointer disabled:opacity-60 hover:border-[#33402f]"
          >
            <span className="font-semibold">
              {info.name} · {info.price}
            </span>
            <span className="text-[12px] text-[var(--adm-muted,#5b6a52)]">{what}</span>
            <span className="text-[12px] underline">{busy === k ? 'Opening…' : card ? `Pay $${PRICE_CENTS[k === 'basic' ? 'free' : k] / 100}` : 'Ask for a payment link'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Before paying for a plan: a clear notice that text messages aren't included, ticked to go on. The tick
 * is sent with the payment and kept with it.
 */
export function TextsNotIncluded({ ok, onOk }: { ok: boolean; onOk: (ok: boolean) => void }) {
  const perGuest = (TEXT_RATE.creditsPerGuest * TEXT_CREDIT_ALL_IN) / 100;
  return (
    <div role="group" aria-label="Text messages are not included" className="flex flex-col gap-2 p-4 rounded-[14px] border-2 border-[#c98a3e] bg-[#fdf3e2]">
      <strong className="text-[16px] text-[#6b3f12]">Text messages are not included in any plan</strong>
      <span className="text-[14px] text-[#5b4a2f]">
        Sending invitations and reminders from your own phone or by email is free. If you’d like us to text your guests, you buy text credits separately:{' '}
        <strong>
          {TEXT_CREDIT_ALL_IN}c a credit, about ${perGuest.toFixed(2)} a guest
        </strong>{' '}
        with every text (invitation, reminders, thank-yous) and the back-and-forth when guests text you back. You’ll see the total before you pay for any.
      </span>
      <label className="flex items-start gap-3 pt-1 text-[15px] font-semibold text-[var(--adm-ink,#33402f)] cursor-pointer">
        <input type="checkbox" checked={ok} onChange={(e) => onOk(e.target.checked)} className="mt-[2px] w-[22px] h-[22px] flex-none accent-[#33402f]" />I understand text messages aren’t included in my plan.
      </label>
    </div>
  );
}
