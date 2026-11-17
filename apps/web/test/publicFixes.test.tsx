import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { weddingCalendarEvent } from '@wp/shared';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddToCalendar } from '../src/guest/invitation/AddToCalendar';
import { ProfileSwitch, resetMeCache } from '../src/lib/ProfileSwitch';
import { MobileMenu } from '../src/sales/MobileMenu';

afterEach(() => {
  vi.unstubAllGlobals();
  resetMeCache();
});

describe('Add to calendar', () => {
  const event = weddingCalendarEvent(
    { slug: 'harriet-and-theo', name1: 'Harriet Lane', name2: 'Theo Marsh', timezone: 'Australia/Sydney' },
    { key: 'wedding', name: 'The wedding', startsAt: '2027-03-20T03:00:00.000Z', venue: 'Larkwood Estate', address: 'Hunter Valley NSW' },
    'https://example.com',
  )!;

  it('shows the time in the wedding’s timezone, and opens Google, Apple, Outlook.com, Office 365 and a file', () => {
    render(<AddToCalendar event={event} icsHref="/api/p/harriet-and-theo/calendar/wedding.ics" fileName="harriet-and-theo-wedding.ics" />);
    expect(screen.getByText(/Saturday 20 March 2027 · 2:00 pm AEDT/)).toBeInTheDocument();
    expect(screen.getByText('(Sydney time)')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: /Add to calendar/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list', { name: 'Add Harriet & Theo: The wedding to your calendar' });
    const href = (name: string) => within(list).getByRole('link', { name }).getAttribute('href')!;
    expect(new URL(href('Google Calendar')).searchParams.get('ctz')).toBe('Australia/Sydney');
    expect(new URL(href('Google Calendar')).searchParams.get('location')).toBe('Larkwood Estate, Hunter Valley NSW');
    expect(href('Apple Calendar')).toBe('/api/p/harriet-and-theo/calendar/wedding.ics');
    expect(new URL(href('Outlook.com')).searchParams.get('startdt')).toBe('2027-03-20T14:00:00+11:00');
    expect(new URL(href('Office 365')).hostname).toBe('outlook.office.com');
    expect(within(list).getByRole('link', { name: 'Download .ics' })).toHaveAttribute('download', 'harriet-and-theo-wedding.ics');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('the front page menu on a phone', () => {
  const links = [
    { label: 'Pricing', to: '#pricing' },
    { label: 'Vendor directory', to: '/vendors' },
    { label: 'Sign in', to: '/admin' },
    { label: 'Get started', to: '#start', primary: true },
  ];
  it('opens a dialog with every header link, keeps focus inside, and Escape closes it back to the button', () => {
    render(
      <MemoryRouter>
        <MobileMenu links={links} ink="#2e2430" paper="#fffcf8" title="The Yes List" />
      </MemoryRouter>,
    );
    const menu = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(menu);
    const dialog = screen.getByRole('dialog', { name: 'Menu' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    for (const l of links) expect(within(dialog).getByRole('link', { name: l.label })).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);
    // Tab from the last link wraps to the first; Shift+Tab from the first wraps to the last.
    const items = within(dialog).getAllByRole('link');
    const close = within(dialog).getByRole('button', { name: 'Close menu' });
    items.at(-1)!.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(items.at(-1));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(menu);
  });

  it('closes when a link is chosen', () => {
    render(
      <MemoryRouter>
        <MobileMenu links={links} ink="#2e2430" paper="#fffcf8" title="The Yes List" />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Vendor directory' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('public pages and the signed-in check', () => {
  it('asks /api/a/session (never /api/a/me), and a signed-out visitor sees nothing extra', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (path: string) => {
      asked.push(String(path));
      return new Response(JSON.stringify({ me: null }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await act(async () => {
      render(
        <MemoryRouter>
          <ProfileSwitch here="vendor" tone="light" />
        </MemoryRouter>,
      );
    });
    expect(asked).toEqual(['/api/a/session']);
    expect(screen.queryByRole('button', { name: /Switch to/ })).toBeNull();
  });
});
