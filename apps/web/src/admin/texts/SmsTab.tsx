import { SmsSetup } from '../settings/SmsSetup';
import { ALL_EVENTS, useAdmin } from '../Shell';
import { SmsMessages } from './SmsMessages';
import { OwnPhoneQueue, SendVia } from './OwnPhone';

/**
 * Admin → SMS. Under Account: the SMS provider setup, done once (number, sending hours, costs,
 * automatic replies). Under an event: scheduling that event's messages (plus the ones that go to
 * every event, marked as such).
 */
export function SmsTab() {
  const { event, overview } = useAdmin();
  const inEvent = event !== ALL_EVENTS && !!overview?.events.some((e) => e.key === event);
  if (!overview) return <div aria-busy="true" className="text-[var(--adm-muted,#5b6a52)]">Loading…</div>;
  return inEvent ? (
    <div className="flex flex-col gap-6">
      <OwnPhoneQueue />
      <SmsMessages />
    </div>
  ) : (
    <div className="flex flex-col gap-7">
      <SendVia />
      <OwnPhoneQueue />
      <SmsSetup />
    </div>
  );
}
