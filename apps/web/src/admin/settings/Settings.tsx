import { useSearchParams } from 'react-router-dom';
import { AdminLook } from '../AdminLook';
import { confirmLeave } from '../leave';
import { PageHeader, Tabs } from '../ui';
import { ChangeEmail, PlanAndBilling, TheWedding, YourDetails } from './Account';
import { Privacy } from './Privacy';
import { Backup, Passcode, SmsSetup } from './SmsSetup';

const VIEWS = [
  { key: 'details', label: 'Your details' },
  { key: 'people', label: 'Who can sign in' },
  { key: 'privacy', label: 'Privacy' },
  { key: 'plan', label: 'Your plan' },
  { key: 'texting', label: 'Texting' },
  { key: 'signin', label: 'Sign-in' },
  { key: 'backup', label: 'Backup' },
  { key: 'look', label: 'Admin look' },
] as const;
type View = (typeof VIEWS)[number]['key'];

/**
 * Account → Settings: your account as a customer and everything set once. Your details, the wedding and
 * the people who run it, texting (number, hours, costs, automatic replies), sign-in (email and passcode),
 * a backup of the whole wedding, and the admin's look.
 */
export function Settings() {
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'details') as View;
  const choose = (v: View) => {
    if (v === view || !confirmLeave()) return; // unsaved texting edits ask first
    setParams(v === 'details' ? {} : { view: v }, { replace: true });
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Account" title="Settings" />
      <Tabs label="Settings" items={VIEWS} value={view} onChange={choose} />
      {view === 'details' ? (
        <YourDetails />
      ) : view === 'people' ? (
        <TheWedding />
      ) : view === 'privacy' ? (
        <Privacy />
      ) : view === 'plan' ? (
        <PlanAndBilling />
      ) : view === 'texting' ? (
        <SmsSetup />
      ) : view === 'signin' ? (
        <div className="flex flex-col gap-10">
          <ChangeEmail />
          <Passcode />
        </div>
      ) : view === 'backup' ? (
        <Backup />
      ) : (
        <AdminLook embedded />
      )}
    </div>
  );
}
