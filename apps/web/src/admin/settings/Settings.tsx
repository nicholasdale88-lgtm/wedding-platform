import { useSearchParams } from 'react-router-dom';
import { AdminLook } from '../AdminLook';
import { confirmLeave } from '../leave';
import { PageHeader, Tabs } from '../ui';
import { Backup, Passcode, SmsSetup } from './SmsSetup';

const VIEWS = [
  { key: 'texting', label: 'Texting' },
  { key: 'signin', label: 'Your sign-in' },
  { key: 'backup', label: 'Backup' },
  { key: 'look', label: 'Admin look' },
] as const;
type View = (typeof VIEWS)[number]['key'];

/**
 * Account → Settings: everything set once and left alone, in one place. Texting (number, sending hours,
 * costs, automatic replies), your sign-in (passcode), a backup of the whole wedding, and the admin's look.
 */
export function Settings() {
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.find((v) => v.key === params.get('view'))?.key ?? 'texting') as View;
  const choose = (v: View) => {
    if (v === view || !confirmLeave()) return; // unsaved texting edits ask first
    setParams(v === 'texting' ? {} : { view: v }, { replace: true });
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Account" title="Settings" />
      <Tabs label="Settings" items={VIEWS} value={view} onChange={choose} />
      {view === 'texting' ? <SmsSetup /> : view === 'signin' ? <Passcode /> : view === 'backup' ? <Backup /> : <AdminLook embedded />}
    </div>
  );
}
