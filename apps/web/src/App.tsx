import { lazy, Suspense, useState } from 'react';
import { createBrowserRouter, Navigate, Route, RouterProvider, Routes } from 'react-router-dom';
import { GuestNotFound } from './guest/GuestMessage';

// Guests and the couple download separate code: a guest opening their invitation never loads the admin.
const AdminRoot = lazy(() => import('./admin/AdminRoot').then((m) => ({ default: m.AdminRoot })));
const InvitationPage = lazy(() => import('./guest/invitation/InvitationPage').then((m) => ({ default: m.InvitationPage })));
const GuidePage = lazy(() => import('./guest/guide/GuidePage').then((m) => ({ default: m.GuidePage })));
const PhotoPage = lazy(() => import('./guest/photos/PhotoPage').then((m) => ({ default: m.PhotoPage })));
const BoardPage = lazy(() => import('./guest/board/BoardPage').then((m) => ({ default: m.BoardPage })));
const PartyPage = lazy(() => import('./guest/party/PartyPage').then((m) => ({ default: m.PartyPage })));
const SaveTheDatePage = lazy(() => import('./guest/savethedate/SaveTheDatePage').then((m) => ({ default: m.SaveTheDatePage })));
const CoordinatorPage = lazy(() => import('./guest/coordinator/CoordinatorPage').then((m) => ({ default: m.CoordinatorPage })));
const TasksPage = lazy(() => import('./guest/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const LivePage = lazy(() => import('./guest/live/LivePage').then((m) => ({ default: m.LivePage })));
const ShuttlePage = lazy(() => import('./guest/shuttle/ShuttlePage').then((m) => ({ default: m.ShuttlePage })));
const AlbumPage = lazy(() => import('./guest/album/AlbumPage').then((m) => ({ default: m.AlbumPage })));

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
        <Route path="/w/:slug/coordinator" element={<CoordinatorPage />} />
        <Route path="/w/:slug/tasks" element={<TasksPage />} />
        <Route path="/w/:slug/save-the-date" element={<SaveTheDatePage />} />
        <Route path="/w/:slug/live" element={<LivePage />} />
        <Route path="/w/:slug/shuttle" element={<ShuttlePage />} />
        <Route path="/w/:slug/album" element={<AlbumPage />} />
        <Route path="/" element={<Navigate to="/admin" replace />} />
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
