import { allows, chargeCents, EVENT_ADDON, FEATURE_LABEL, PLAN_INFO, planFor, planOf, type Feature, type Purchase } from '@wp/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../lib/api';
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
  return { plan, has: (f: Feature) => allows(plan, f), requested: overview?.wedding.planRequested ?? '' };
}

/**
 * Shown where a feature isn't in the wedding's plan: what it is, which plan has it, and Upgrade. With card
 * payment switched on, Upgrade opens Stripe's payment page; otherwise it asks the platform owner for a
 * payment link.
 */
export function Upgrade({ feature, compact = false }: { feature: Feature; compact?: boolean }) {
  const { wid, reload } = useAdmin();
  const { plan, requested } = usePlan();
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
  const cents = deal ? deal.cents : chargeCents(plan, need);
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
  const pay = async () => {
    setBusy(true);
    try {
      const { url } = await api.checkout(wid, need, deal?.code ?? '');
      window.location.assign(url);
      // Stay busy while the browser leaves for Stripe, so a second tap doesn't open a second payment.
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };
  const upgradeNote = !addon && plan === 'essentials' && need === 'complete' && card ? ` You've paid for ${PLAN_INFO.essentials.name}, so it's ${price} more.` : '';
  return (
    <section aria-label="Upgrade" className={`flex flex-col gap-2 ${compact ? 'p-4' : 'p-6'} rounded-[16px] border border-[#d3c6a4] bg-[#fbf8f0]`}>
      <strong className={compact ? 'text-[15px]' : 'text-[18px]'}>{addon ? `${FEATURE_LABEL[feature]} is an add-on` : `${FEATURE_LABEL[feature]} comes with ${info.name}`}</strong>
      <span className="text-[14px] text-[#5b6a52]">
        {addon ? `Each extra event is ${info.price}, paid once.` : `${info.name} is ${info.price}, paid once for your whole wedding.${upgradeNote}`}{' '}
        {thanks
          ? 'Thank you! It switches on within a minute.'
          : asked && !card
            ? "You've asked to upgrade: we'll email you a link to pay, and it switches on as soon as it's paid."
            : 'Everything you’ve added so far stays as it is.'}
      </span>
      {!thanks && (card === true || deal?.cents === 0) && (
        <Pill kind="primary" className="self-start" disabled={busy} onClick={() => void pay()}>
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
                className="py-[6px] px-3 rounded-[10px] border border-[#d3c6a4] bg-white text-[15px] w-[160px] uppercase"
              />
              <Pill size="sm" onClick={() => void applyCode()}>
                Apply
              </Pill>
            </span>
          ) : (
            <button type="button" onClick={() => setCodeOpen(true)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
              Have a promo code?
            </button>
          )}
          {codeProblem && <span role="alert" className="text-[#7a4a37]">{codeProblem}</span>}
        </div>
      )}
      {!thanks && card !== true && !asked && (
        <Pill kind="primary" className="self-start" disabled={busy || card === null} onClick={() => void ask()}>
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
