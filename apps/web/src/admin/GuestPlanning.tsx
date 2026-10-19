import { NavLink } from 'react-router-dom';
import { useAdmin } from './Shell';
import { tabCls } from './ui';

/**
 * Guest planning: the guest list, dietary needs and seating are one piece of work, so they share one
 * menu entry and switch between each other here. Dietary shows only for catered events and Seating
 * only where the event has a plan (both switch on in Setup → Details), as before.
 */
export function GuestPlanningBar() {
  const { overview: o, event, path } = useAdmin();
  const f = o?.perEvent?.find((x) => x.key === event);
  const tabs = [
    { key: 'guests', label: 'Guest list' },
    ...(f?.catered !== false ? [{ key: 'dietary', label: 'Dietary' }] : []),
    ...(f?.hasSeating !== false ? [{ key: 'seating', label: 'Seating' }] : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Guest planning" className="flex gap-6 border-b border-[#e2d7bc] -mt-1 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((t) => (
        <NavLink
          key={t.key}
          to={path(t.key)}
          className={({ isActive }) => tabCls(isActive)}
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
