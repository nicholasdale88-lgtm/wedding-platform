import { lazy, Suspense, useEffect, useState } from 'react';
import { createBrowserRouter, Route, RouterProvider, Routes, useLocation } from 'react-router-dom';
import { countPage } from './lib/stats';
import { GuestNotFound } from './guest/GuestMessage';

/**
 * After a new version goes live, a page left open on the old one asks for code files that no longer exist
 * and would break ("glitching"). Reload once to get the new version instead (at most every 30 seconds).
 */
function fresh<T>(load: Promise<T>): Promise<T> {
  return load.catch((e: unknown) => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem('wp-reloaded') ?? 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem('wp-reloaded', String(Date.now()));
        window.location.reload();
        return new Promise<T>(() => {});
      }
    } catch {
      /* no session storage: show the error */
    }
    throw e;
  });
}

// Guests and the couple download separate code: a guest opening their invitation never loads the admin.
const AdminRoot = lazy(() => fresh(import('./admin/AdminRoot')).then((m) => ({ default: m.AdminRoot })));
const ResetPasscode = lazy(() => fresh(import('./admin/ResetPasscode')).then((m) => ({ default: m.ResetPasscode })));
const InvitationPage = lazy(() => fresh(import('./guest/invitation/InvitationPage')).then((m) => ({ default: m.InvitationPage })));
const GuidePage = lazy(() => fresh(import('./guest/guide/GuidePage')).then((m) => ({ default: m.GuidePage })));
const ThanksPage = lazy(() => fresh(import('./guest/thanks/ThanksPage')).then((m) => ({ default: m.ThanksPage })));
const PhotoPage = lazy(() => fresh(import('./guest/photos/PhotoPage')).then((m) => ({ default: m.PhotoPage })));
const BoardPage = lazy(() => fresh(import('./guest/board/BoardPage')).then((m) => ({ default: m.BoardPage })));
const PartyPage = lazy(() => fresh(import('./guest/party/PartyPage')).then((m) => ({ default: m.PartyPage })));
const PartyLinkPage = lazy(() => fresh(import('./guest/party/PartyAuth')).then((m) => ({ default: m.PartyLinkPage })));
const SaveTheDatePage = lazy(() => fresh(import('./guest/savethedate/SaveTheDatePage')).then((m) => ({ default: m.SaveTheDatePage })));
const CoordinatorPage = lazy(() => fresh(import('./guest/coordinator/CoordinatorPage')).then((m) => ({ default: m.CoordinatorPage })));
const TasksPage = lazy(() => fresh(import('./guest/tasks/TasksPage')).then((m) => ({ default: m.TasksPage })));
const LivePage = lazy(() => fresh(import('./guest/live/LivePage')).then((m) => ({ default: m.LivePage })));
const ShuttlePage = lazy(() => fresh(import('./guest/shuttle/ShuttlePage')).then((m) => ({ default: m.ShuttlePage })));
const AlbumPage = lazy(() => fresh(import('./guest/album/AlbumPage')).then((m) => ({ default: m.AlbumPage })));
const QuotePage = lazy(() => fresh(import('./guest/quote/QuotePage')).then((m) => ({ default: m.QuotePage })));
const TrialPage = lazy(() => fresh(import('./try/TrialPage')).then((m) => ({ default: m.TrialPage })));
const SalesPage = lazy(() => fresh(import('./sales/SalesPage')).then((m) => ({ default: m.SalesPage })));
// The front page's sample invitation and its footer pages (privacy, terms, contact).
const DemoPage = lazy(() => fresh(import('./sales/Demo')).then((m) => ({ default: m.DemoPage })));
const SampleSeatingPage = lazy(() => fresh(import('./sales/SampleSeating')).then((m) => ({ default: m.SampleSeatingPage })));
const DesignsPage = lazy(() => fresh(import('./sales/Designs')).then((m) => ({ default: m.DesignsPage })));
const PrivacyPage = lazy(() => fresh(import('./sales/Legal')).then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => fresh(import('./sales/Legal')).then((m) => ({ default: m.TermsPage })));
const ContactPage = lazy(() => fresh(import('./sales/Legal')).then((m) => ({ default: m.ContactPage })));
const VendorPage = lazy(() => fresh(import('./guest/vendor/VendorPage')).then((m) => ({ default: m.VendorPage })));
// The vendor directory (public): browse, a vendor's page, joining, and a vendor's own listing.
const DirectoryPage = lazy(() => fresh(import('./sales/Directory')).then((m) => ({ default: m.DirectoryPage })));
const ListingPage = lazy(() => fresh(import('./sales/Directory')).then((m) => ({ default: m.ListingPage })));
const VendorJoinPage = lazy(() => fresh(import('./sales/Directory')).then((m) => ({ default: m.VendorJoinPage })));
const CompanyPortal = lazy(() => fresh(import('./company/CompanyPortal')).then((m) => ({ default: m.CompanyPortal })));
const VendorHomePage = lazy(() => fresh(import('./sales/Directory')).then((m) => ({ default: m.VendorHomePage })));

/** The couple previewing someone's portal (Overview → See what everyone else sees): a reminder it's the real page. */
const PORTAL_OF: Record<string, string> = { party: 'wedding party', vendor: 'vendor', coordinator: 'coordinator', tasks: 'helper' };
function PortalPreviewBanner() {
  const { pathname, search } = useLocation();
  // A slim strip along the top (never over the page's own words), and it can be put away.
  const [hidden, setHidden] = useState(false);
  const kind = /^\/w\/[^/]+\/(party|vendor|coordinator|tasks)\/?$/.exec(pathname)?.[1];
  if (hidden || !kind || new URLSearchParams(search).get('preview') !== '1') return null;
  return (
    <div role="status" className="fixed z-[90] top-0 left-0 right-0 flex items-center gap-2 pl-[52px] pr-2 pt-[env(safe-area-inset-top)] min-h-[36px] bg-[#2e2430]/95 text-[#fbf1e8] text-[12px] leading-tight shadow-[0_4px_12px_rgba(0,0,0,.2)] print:hidden">
      <span className="flex-1 min-w-0 py-1">
        <strong>Preview</strong> of what the {PORTAL_OF[kind]} sees. Anything you tap is real.
      </span>
      <button type="button" aria-label="Hide the preview note" onClick={() => setHidden(true)} className="flex-none w-9 h-9 border-0 bg-transparent text-[#fbf1e8] text-[18px] cursor-pointer">
        ×
      </button>
    </div>
  );
}

/**
 * Opened from Company → Preview: a way back to it on every page (the sample app, the vendor account, a
 * wedding's portals), since a phone or the installed app has no Back button. Remembered for this tab only,
 * until they're back in the company portal.
 */
const FROM_COMPANY = 'yl.fromCompany';
function BackToCompany() {
  const { pathname } = useLocation();
  // Said in full at first, then just the arrow so it covers as little of the page as it can.
  const [small, setSmall] = useState(false);
  useEffect(() => {
    setSmall(false);
    const t = setTimeout(() => setSmall(true), 4000);
    return () => clearTimeout(t);
  }, [pathname]);
  let on = false;
  try {
    if (pathname.startsWith('/company')) sessionStorage.removeItem(FROM_COMPANY);
    else on = sessionStorage.getItem(FROM_COMPANY) === '1';
  } catch {
    /* storage blocked: no button */
  }
  if (!on) return null;
  return (
    <a
      href="/company#preview"
      aria-label="Back to the company portal"
      className={`fixed z-[95] left-2 top-[max(8px,env(safe-area-inset-top))] flex items-center justify-center gap-1 min-h-[36px] min-w-[36px] ${small ? 'px-0' : 'py-[7px] px-3'} rounded-full no-underline text-[13px] font-semibold !text-[#fbf1e8] bg-[#2e2430]/90 shadow-[0_6px_16px_rgba(0,0,0,.25)] backdrop-blur-sm print:hidden transition-all`}
    >
      <span aria-hidden>←</span>
      {!small && <span aria-hidden>Company portal</span>}
    </a>
  );
}

function Pages() {
  // Traffic & errors (company portal): the kind of page opened, counted as the address changes.
  const { pathname } = useLocation();
  useEffect(() => countPage(pathname), [pathname]);
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />}>
      <PortalPreviewBanner />
      <BackToCompany />
      <Routes>
        <Route path="/admin/reset" element={<ResetPasscode />} />
        <Route path="/company/*" element={<CompanyPortal />} />
        <Route path="/admin/*" element={<AdminRoot />} />
        <Route path="/w/:slug" element={<InvitationPage />} />
        <Route path="/w/:slug/tomorrow" element={<GuidePage />} />
        <Route path="/w/:slug/tomorrow/:event" element={<GuidePage />} />
        <Route path="/w/:slug/photos" element={<PhotoPage />} />
        <Route path="/w/:slug/thanks" element={<ThanksPage />} />
        <Route path="/w/:slug/photos/:event" element={<PhotoPage />} />
        <Route path="/w/:slug/board" element={<BoardPage />} />
        <Route path="/w/:slug/party" element={<PartyPage />} />
        <Route path="/w/:slug/party/join" element={<PartyLinkPage />} />
        <Route path="/w/:slug/party/reset" element={<PartyLinkPage />} />
        <Route path="/w/:slug/coordinator" element={<CoordinatorPage />} />
        <Route path="/w/:slug/tasks" element={<TasksPage />} />
        <Route path="/w/:slug/save-the-date" element={<SaveTheDatePage />} />
        <Route path="/w/:slug/live" element={<LivePage />} />
        <Route path="/w/:slug/shuttle" element={<ShuttlePage />} />
        <Route path="/w/:slug/album" element={<AlbumPage />} />
        <Route path="/w/:slug/quote" element={<QuotePage />} />
        <Route path="/w/:slug/vendor" element={<VendorPage />} />
        <Route path="/" element={<SalesPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/demo/tomorrow" element={<GuidePage sample />} />
        <Route path="/demo/photos" element={<PhotoPage sample />} />
        <Route path="/demo/board" element={<BoardPage sample />} />
        <Route path="/demo/party" element={<PartyPage sample />} />
        <Route path="/demo/seating-pdf" element={<SampleSeatingPage />} />
        <Route path="/designs" element={<DesignsPage />} />
        {/* Try the app: the admin for a made-up wedding, answered in the browser (try/demo.ts). */}
        <Route path="/try" element={<TrialPage />} />
        <Route path="/templates" element={<DesignsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/vendors" element={<DirectoryPage />} />
        <Route path="/vendors/join" element={<VendorJoinPage />} />
        <Route path="/vendors/me" element={<VendorHomePage />} />
        <Route path="/vendors/:slug" element={<ListingPage />} />
        {/* Old or mistyped guest links get a gentle message, never the sign-in screen. */}
        <Route path="*" element={<GuestNotFound />} />
      </Routes>
    </Suspense>
  );
}

/** A data router, so the admin can ask before leaving unsaved work (menu, links and the browser's Back). */
export function App() {
  const [router] = useState(() => createBrowserRouter([{ path: '*', element: <Pages /> }]));
  return <RouterProvider router={router} />;
}
