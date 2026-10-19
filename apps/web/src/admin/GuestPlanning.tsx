import { NavLink } from 'react-router-dom';
import { useAdmin } from './Shell';

/**
 * Guest planning: the guest list, dietary needs and seating are one piece of work, so they share one
 * menu entry and switch between each other here. Dietary shows only for catered events and Seating
 * only where the event has a plan (both switch on in Setup → Details), as before.
 */
export function GuestPlanningBar() {
  const { wid, overview: o, event } = useAdmin();
  const f = o?.perEvent?.find((x) => x.key === event);
  const tabs = [
    { key: 'guests', label: 'Guest list' },
    ...(f?.catered !== false ? [{ key: 'dietary', label: 'Dietary' }] : []),
    ...(f?.hasSeating !== false ? [{ key: 'seating', label: 'Seating' }] : []),
  ];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Guest planning" className="flex gap-6 border-b border-[#e2d7bc] -mt-1">
      {tabs.map((t) => (
        <NavLink
          key={t.key}
          to={`/admin/${wid}/${t.key}`}
          className={({ isActive }) =>
            `py-2 border-0 border-b-2 border-solid no-underline text-[15px] -mb-px ${isActive ? 'border-[#33402f] font-semibold !text-[#33402f]' : 'border-transparent !text-[#5b6a52] hover:!text-[#33402f]'}`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
