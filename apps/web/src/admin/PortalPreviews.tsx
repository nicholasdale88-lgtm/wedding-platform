import type { Vendors as VendorsDoc } from '@wp/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { coordinatorApi, plannerApi, type PartyMember } from '../lib/api';
import { useHelpers } from './checklists/useHelpers';
import { Card } from './hub/Hub';
import { useAdmin } from './Shell';
import { useToast } from './ui';

/**
 * See what everyone else sees: every portal one tap away, opened exactly as that person sees it (marked
 * "Preview"): a guest's invitation, each of the wedding party (a bridesmaid, the best man…), each booked
 * vendor, the coordinator and each helper's task list. Looking changes nothing; anything tapped there is real.
 */
const withPreview = (url: string) => {
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('preview', '1');
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
};

export function PortalPreviews({ to }: { to: (link: string, event?: string) => void }) {
  const { wid, overview: o } = useAdmin();
  const toast = useToast();
  const slug = o?.wedding.slug ?? '';
  const [party, setParty] = useState<PartyMember[] | null>(null);
  const [vendors, setVendors] = useState<VendorsDoc['list'] | null>(null);
  const [coordinator, setCoordinator] = useState<{ on: boolean; name: string; url: string } | null>(null);
  const { people: helpers } = useHelpers();
  useEffect(() => {
    let live = true;
    plannerApi.party(wid).then((d) => live && setParty(d.members)).catch(() => live && setParty([]));
    plannerApi
      .doc<VendorsDoc>(wid, 'vendors')
      .then((d) => live && setVendors(d.data.list.filter((v) => v.status === 'booked')))
      .catch(() => live && setVendors([]));
    coordinatorApi.get(wid).then((c) => live && setCoordinator(c)).catch(() => live && setCoordinator(null));
    return () => {
      live = false;
    };
  }, [wid]);

  // A vendor's page needs its private key from the server: open the tab now (inside the tap), then send it there.
  const openVendor = async (id: string) => {
    const tab = window.open('', '_blank');
    try {
      const { url } = await plannerApi.vendorHub(wid, id);
      if (tab) tab.location.href = withPreview(url);
      else window.location.href = withPreview(url);
    } catch (e) {
      tab?.close();
      toast((e as Error).message);
    }
  };

  const link = (href: string, label: string, sub: string) => (
    <a key={href} href={withPreview(href)} target="_blank" rel="noopener" className={row}>
      <span className="min-w-0">
        <span className="block font-medium truncate">{label}</span>
        <span className="block text-[12px] text-[var(--adm-muted,#5b6a52)] truncate">{sub}</span>
      </span>
      <span className={pill}>Preview</span>
    </a>
  );
  const none = (text: string, cta: string, go: () => void) => (
    <div className="flex items-center justify-between gap-3 py-[9px] text-[13px] text-[var(--adm-muted,#5b6a52)]">
      <span>{text}</span>
      <button type="button" onClick={go} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[var(--adm-ink,#33402f)]">
        {cta}
      </button>
    </div>
  );
  const members = (party ?? []).filter((m) => m.token);

  return (
    <Card title="See what everyone else sees">
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[13px] text-[var(--adm-muted,#5b6a52)]">Each page opens exactly as they see it. Looking changes nothing; anything you tap there is real.</p>

        <Group title="Guests">{slug && link(`/w/${slug}/`, 'The invitation', 'As someone without their own link sees it')}</Group>

        <Group title="Wedding party">
          {party === null ? <Wait /> : members.length ? members.map((m) => link(`/w/${slug}/party?g=${encodeURIComponent(m.token!)}`, m.name, m.role || 'Wedding party')) : none('No one in the wedding party yet.', 'Add them', () => to('party'))}
        </Group>

        <Group title="Vendors">
          {vendors === null ? (
            <Wait />
          ) : vendors.length ? (
            vendors.map((v) => (
              <button key={v.id} type="button" onClick={() => void openVendor(v.id)} className={`${row} w-full text-left bg-transparent border-0 cursor-pointer`}>
                <span className="min-w-0">
                  <span className="block font-medium truncate">{v.name || 'A vendor'}</span>
                  <span className="block text-[12px] text-[var(--adm-muted,#5b6a52)] truncate">{v.category || 'Vendor'}</span>
                </span>
                <span className={pill}>Preview</span>
              </button>
            ))
          ) : (
            none('No booked vendors yet: their page opens once one is booked.', 'Vendors', () => to('planner?view=vendors'))
          )}
        </Group>

        <Group title="On the day">
          {coordinator?.on && coordinator.url ? link(coordinator.url, coordinator.name || 'Your coordinator', 'The coordinator’s run sheet') : none('No coordinator page yet.', 'Set it up', () => to('party?view=access'))}
          {helpers.map((h) => link(h.link, h.name, 'Their task list'))}
        </Group>
      </div>
    </Card>
  );
}

const row = 'flex items-center justify-between gap-3 py-[9px] border-0 border-t border-[var(--adm-line,#ece3cc)] first:border-t-0 no-underline !text-[var(--adm-ink,#33402f)] hover:bg-[var(--adm-tint,#f3ecd6)]';
const pill = 'flex-none py-[4px] px-3 rounded-full border border-[var(--adm-line,#c6b794)] text-[12px] font-semibold';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col">
      <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-[var(--adm-muted,#5b6a52)]">{title}</span>
      {children}
    </section>
  );
}

const Wait = () => <span className="py-[9px] text-[13px] text-[var(--adm-muted,#5b6a52)]">Loading…</span>;
