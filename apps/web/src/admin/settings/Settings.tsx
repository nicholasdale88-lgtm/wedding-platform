import { Link, useSearchParams } from 'react-router-dom';
import { ALL_EVENTS, useAdmin } from '../Shell';
import { AdminLook } from '../AdminLook';
import { AtAGlance } from './AtAGlance';
import { confirmLeave } from '../leave';
import { PageHeader, Tabs } from '../ui';
import { ChangeEmail, PlanAndBilling, TheWedding, YourDetails } from './Account';
import { Privacy } from './Privacy';
import { Backup, Passcode } from './SmsSetup';
import { SystemCheck } from './SystemCheck';
import { CreditsSection } from './Credits';
import { ToolsSection } from './Tools';

/**
 * Settings: the one menu item for everything set once (launch simplification, Job 3), in five sections, in
 * this order: Profile (your details and sign-in, with privacy, backup and checks, and the admin's colours as
 * parts of it), Plan & billing (the one plan), Text credits (always here: balance, buy or top up at cost, the
 * history), Partner access (who can sign in), and What you're using (the optional tools' switches).
 */
const VIEWS = [
  { key: 'profile', label: 'Profile' },
  { key: 'plan', label: 'Plan & billing' },
  { key: 'credits', label: 'Text credits' },
  { key: 'people', label: 'Partner access' },
  { key: 'tools', label: 'What you’re using' },
] as const;
/** Older links (and the tabs that were merged) still land in the right place. */
const MOVED: Record<string, (typeof VIEWS)[number]['key']> = { details: 'profile', signin: 'profile', privacy: 'profile', backup: 'profile', check: 'profile', look: 'profile', texting: 'credits' };
type View = (typeof VIEWS)[number]['key'];

export function Settings() {
  const { path } = useAdmin();
  const [params, setParams] = useSearchParams();
  const asked = params.get('view') ?? '';
  const view = (VIEWS.find((v) => v.key === (MOVED[asked] ?? asked))?.key ?? 'profile') as View;
  const choose = (v: View) => {
    if (v === view || !confirmLeave()) return; // unsaved texting edits ask first
    setParams(v === 'profile' ? {} : { view: v }, { replace: true });
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Your wedding" title="Settings" />
      <Tabs label="Settings" items={VIEWS} value={view} onChange={choose} />
      {view === 'profile' ? (
        <div className="flex flex-col gap-10">
          <AtAGlance />
          <Link to={`${path('overview', ALL_EVENTS)}?all=1`} className="self-start inline-flex items-center min-h-[44px] text-[14px] underline !text-[var(--adm-ink,#33402f)]">
            Your wedding admin: every event, setting up and status at a glance
          </Link>
          <YourDetails />
          <ChangeEmail />
          <Passcode />
          <Privacy />
          <section aria-label="Backup and checks" className="flex flex-col gap-6">
            <Backup />
            <SystemCheck />
          </section>
          <section aria-label="Colours" className="flex flex-col gap-3">
            <h2 className="m-0 font-display font-medium text-[26px]">Colours</h2>
            <AdminLook embedded />
          </section>
        </div>
      ) : view === 'plan' ? (
        <PlanAndBilling />
      ) : view === 'credits' ? (
        <CreditsSection />
      ) : view === 'people' ? (
        <TheWedding />
      ) : (
        <ToolsSection onBuyTexts={() => setParams({ view: 'credits' }, { replace: true })} />
      )}
    </div>
  );
}
