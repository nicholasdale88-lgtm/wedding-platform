import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { GuestNotFound } from './guest/GuestMessage';

// Guests and the couple download separate code: a guest opening their invitation never loads the admin.
const AdminRoot = lazy(() => import('./admin/AdminRoot').then((m) => ({ default: m.AdminRoot })));
const InvitationPage = lazy(() => import('./guest/invitation/InvitationPage').then((m) => ({ default: m.InvitationPage })));
const GuidePage = lazy(() => import('./guest/guide/GuidePage').then((m) => ({ default: m.GuidePage })));
const PhotoPage = lazy(() => import('./guest/photos/PhotoPage').then((m) => ({ default: m.PhotoPage })));
const BoardPage = lazy(() => import('./guest/board/BoardPage').then((m) => ({ default: m.BoardPage })));
const PartyPage = lazy(() => import('./guest/party/PartyPage').then((m) => ({ default: m.PartyPage })));

export function App() {
  return (
    <BrowserRouter>
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
          <Route path="/" element={<Navigate to="/admin" replace />} />
          {/* Old or mistyped guest links get a gentle message, never the sign-in screen. */}
          <Route path="*" element={<GuestNotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
