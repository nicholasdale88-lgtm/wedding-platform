import { lazy, Suspense, useState } from 'react';
import { createBrowserRouter, Route, RouterProvider, Routes } from 'react-router-dom';
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
const InvitationPage = lazy(() => fresh(import('./guest/invitation/InvitationPage')).then((m) => ({ default: m.InvitationPage })));
const GuidePage = lazy(() => fresh(import('./guest/guide/GuidePage')).then((m) => ({ default: m.GuidePage })));
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
const SalesPage = lazy(() => fresh(import('./sales/SalesPage')).then((m) => ({ default: m.SalesPage })));

function Pages() {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />}>
      <Routes>
        <Route path="/admin/*" element={<AdminRoot />} />
        <Route path="/w/:slug" element={<InvitationPage />} />
        <Route path="/w/:slug/tomorrow" element={<GuidePage />} />
        <Route path="/w/:slug/tomorrow/:event" element={<GuidePage />} />
        <Route path="/w/:slug/photos" element={<PhotoPage />} />
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
        <Route path="/" element={<SalesPage />} />
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
