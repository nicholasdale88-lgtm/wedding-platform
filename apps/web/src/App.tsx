import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoot } from './admin/AdminRoot';

/** Guest pages (/w/:slug/...) arrive in M2; until then everything leads to the admin. */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminRoot />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
