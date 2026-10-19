import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoot } from './admin/AdminRoot';

// Guest pages load on their own, so a guest opening their invitation never downloads the admin.
const InvitationPage = lazy(() => import('./guest/invitation/InvitationPage').then((m) => ({ default: m.InvitationPage })));

export function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />}>
        <Routes>
          <Route path="/admin/*" element={<AdminRoot />} />
          <Route path="/w/:slug" element={<InvitationPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
