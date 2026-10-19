import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoot } from './admin/AdminRoot';

// Guest pages load on their own, so a guest opening their invitation never downloads the admin.
const InvitationPage = lazy(() => import('./guest/invitation/InvitationPage').then((m) => ({ default: m.InvitationPage })));
const GuidePage = lazy(() => import('./guest/guide/GuidePage').then((m) => ({ default: m.GuidePage })));
const PhotoPage = lazy(() => import('./guest/photos/PhotoPage').then((m) => ({ default: m.PhotoPage })));

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
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
