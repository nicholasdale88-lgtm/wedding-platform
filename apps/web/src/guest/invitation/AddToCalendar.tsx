import { googleCalendarUrl, outlookCalendarUrl, whenLine, zoneCity, type CalendarEvent } from '@wp/shared';
import { useId, useState } from 'react';

/**
 * "Add to calendar" under an event's details: when it is, in the wedding's own timezone ("2:00 pm AEDT,
 * Sydney time"), and one tap to Google Calendar, Apple Calendar, Outlook.com, Office 365 or a calendar
 * file. Opens in place (no pop-over to fall off a phone screen), in the invitation's own colours.
 */
export function AddToCalendar({ event, icsHref, fileName, feed }: { event: CalendarEvent; icsHref: string; fileName: string; feed?: { href: string; label: string; newTab: boolean } }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const serif = "'Cormorant Garamond', Georgia, serif";
  const item = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '0 14px',
    borderRadius: 999,
    border: '1px solid currentColor',
    color: 'inherit',
    textDecoration: 'none',
    fontSize: 16,
    lineHeight: 1.2,
    fontFamily: serif,
    background: 'transparent',
  } as const;
  const links = [
    { label: 'Google Calendar', href: googleCalendarUrl(event), newTab: true },
    { label: 'Apple Calendar', href: icsHref, newTab: false },
    { label: 'Outlook.com', href: outlookCalendarUrl(event, 'live'), newTab: true },
    { label: 'Office 365', href: outlookCalendarUrl(event, 'office'), newTab: true },
  ];
  return (
    <div data-add-to-calendar style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', textAlign: 'center', fontFamily: serif }}>
      <p style={{ margin: 0, fontSize: 17, lineHeight: 1.35, opacity: 0.9, overflowWrap: 'anywhere' }}>
        {whenLine(event.start, event.tz)} <span style={{ opacity: 0.75 }}>({zoneCity(event.tz)} time)</span>
      </p>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((x) => !x)} style={{ ...item, cursor: 'pointer', fontWeight: 600 }}>
        Add to calendar
        <span aria-hidden style={{ marginLeft: 8, fontSize: 12 }}>
          {open ? '▴' : '▾'}
        </span>
      </button>
      <ul id={id} hidden={!open} aria-label={`Add ${event.title} to your calendar`} style={{ listStyle: 'none', margin: 0, padding: 0, display: open ? 'flex' : 'none', flexWrap: 'wrap', justifyContent: 'center', gap: 8, maxWidth: '100%' }}>
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} style={item} {...(l.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {l.label}
            </a>
          </li>
        ))}
        <li>
          <a href={icsHref} download={fileName} style={item}>
            Download .ics
          </a>
        </li>
        {feed && (
          <li>
            <a href={feed.href} style={item} {...(feed.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {feed.label}
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}
