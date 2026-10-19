import { SmsSetup } from '../settings/SmsSetup';
import { ALL_EVENTS, useAdmin } from '../Shell';
import { SmsMessages } from './SmsMessages';

/**
 * Admin → SMS. Under Account: the SMS provider setup, done once (number, sending hours, costs,
 * automatic replies). Under an event: scheduling that event's messages (plus the ones that go to
 * every event, marked as such).
 */
export function SmsTab() {
  const { event, overview } = useAdmin();
  const inEvent = event !== ALL_EVENTS && !!overview?.events.some((e) => e.key === event);
  if (!overview) return <div aria-busy="true" className="text-[#5b6a52]">Loading…</div>;
  return inEvent ? <SmsMessages /> : <SmsSetup />;
}
