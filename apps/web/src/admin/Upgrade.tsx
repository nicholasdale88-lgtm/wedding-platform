import { allows, EVENT_ADDON, FEATURE_LABEL, PLAN_INFO, planFor, planOf, type Feature } from '@wp/shared';
import { useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useAdmin } from './Shell';
import { Pill, useToast } from './ui';

/** Whether this wedding's plan includes a feature (older weddings and the platform's own have everything). */
export function usePlan() {
  const { overview } = useAdmin();
  const plan = planOf(overview?.wedding.plan);
  return { plan, has: (f: Feature) => allows(plan, f), requested: overview?.wedding.planRequested ?? '' };
}

/**
 * Shown where a feature isn't in the wedding's plan: what it is, which plan has it, and Upgrade. Paying is
 * by a payment link the platform owner sends (asked for here), until card payments are switched on.
 */
export function Upgrade({ feature, compact = false }: { feature: Feature; compact?: boolean }) {
  const { wid, reload } = useAdmin();
  const { requested } = usePlan();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Another event is an add-on of its own; everything else comes with a plan.
  const addon = feature === 'extraEvent';
  const need = addon ? 'event' : planFor(feature) === 'complete' ? 'complete' : 'essentials';
  const info = addon ? EVENT_ADDON : PLAN_INFO[need as 'essentials' | 'complete'];
  const asked = requested === need || (requested === 'complete' && need === 'essentials');
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
  return (
    <section aria-label="Upgrade" className={`flex flex-col gap-2 ${compact ? 'p-4' : 'p-6'} rounded-[16px] border border-[#d3c6a4] bg-[#fbf8f0]`}>
      <strong className={compact ? 'text-[15px]' : 'text-[18px]'}>{addon ? `${FEATURE_LABEL[feature]} is an add-on` : `${FEATURE_LABEL[feature]} comes with ${info.name}`}</strong>
      <span className="text-[14px] text-[#5b6a52]">
        {addon ? `Each extra event is ${info.price}, paid once.` : `${info.name} is ${info.price}, paid once for your whole wedding.`}{' '}
        {asked ? "You've asked to upgrade: we'll email you a link to pay, and it switches on as soon as it's paid." : 'Everything you’ve added so far stays as it is.'}
      </span>
      {!asked && (
        <Pill kind="primary" className="self-start" disabled={busy} onClick={() => void ask()}>
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
