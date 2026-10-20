import { NavLink } from 'react-router-dom';
import { useAdmin } from './Shell';
import { tabCls } from './ui';

/**
 * Guest planning: the guest list, dietary needs and seating are one piece of work, so they share one
 * menu entry and switch between each other here. All three are always there (a tab that comes and goes
 * is hard to find again): adding tables switches seating on, and Dietary is useful for any meal.
 */
export function GuestPlanningBar() {
  const { path } = useAdmin();
  const tabs = [
    { key: 'guests', label: 'Guest list' },
    { key: 'dietary', label: 'Dietary needs' },
    { key: 'seating', label: 'Seating' },
  ];
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
