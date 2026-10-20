import { useSearchParams } from 'react-router-dom';
import { AdminLook } from '../AdminLook';
import { AtAGlance } from './AtAGlance';
import { confirmLeave } from '../leave';
import { PageHeader, Tabs } from '../ui';
import { ChangeEmail, PlanAndBilling, TheWedding, YourDetails } from './Account';
import { Privacy } from './Privacy';
import { Backup, Passcode, SmsSetup } from './SmsSetup';
import { SystemCheck } from './SystemCheck';

const VIEWS = [
  { key: 'details', label: 'Your details' },
  { key: 'people', label: 'People and privacy' },
  { key: 'plan', label: 'Your plan' },
  { key: 'texting', label: 'Texting' },
  { key: 'backup', label: 'Backup and checks' },
  { key: 'look', label: 'Admin look' },
] as const;
/** Tabs that were merged into another: their old links still land in the right place. */
const MOVED: Record<string, (typeof VIEWS)[number]['key']> = { privacy: 'people', signin: 'details', check: 'backup' };
type View = (typeof VIEWS)[number]['key'];

/**
 * Account → Settings: your account as a customer and everything set once, in six tabs. Your details (with
 * sign-in: email and passcode), the people who run it and who can open your pages, your plan, texting
 * (number, hours, costs, automatic replies), backups with the system check, and the admin's look.
 */
export function Settings() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('view') ?? '';
  const view = (VIEWS.find((v) => v.key === (MOVED[asked] ?? asked))?.key ?? 'details') as View;
  const choose = (v: View) => {
    if (v === view || !confirmLeave()) return; // unsaved texting edits ask first
    setParams(v === 'details' ? {} : { view: v }, { replace: true });
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Account" title="Settings" />
      <Tabs label="Settings" items={VIEWS} value={view} onChange={choose} />
      {view === 'details' ? (
        <div className="flex flex-col gap-10">
          <AtAGlance />
          <YourDetails />
          <ChangeEmail />
          <Passcode />
        </div>
      ) : view === 'people' ? (
        <div className="flex flex-col gap-8">
          <TheWedding />
          <Privacy />
        </div>
      ) : view === 'plan' ? (
        <PlanAndBilling />
      ) : view === 'texting' ? (
        <SmsSetup />
      ) : view === 'backup' ? (
        <div className="flex flex-col gap-10">
          <Backup />
          <SystemCheck />
        </div>
      ) : (
        <AdminLook embedded />
      )}
    </div>
  );
}
