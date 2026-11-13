import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { EVENT_ADDON, PLAN_INFO, TEXT_COST_NOTE, TEXT_CREDIT_ALL_IN } from '@wp/shared';
import { SalesPage } from '../src/sales/SalesPage';
import { DemoPage } from '../src/sales/Demo';

const page = () =>
  render(
    <MemoryRouter>
      <SalesPage />
    </MemoryRouter>,
  );

describe('front page', () => {
  it('leads with one line, one call to action and the real invitation on a phone', () => {
    page();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('RSVPs, sorted by text.');
    expect(screen.getByRole('link', { name: 'Start your wedding' })).toHaveAttribute('href', '#start');
    const phone = screen.getByTitle(/^Sample invitation for Harriet & Theo/);
    expect(phone.tagName).toBe('IFRAME');
    expect(phone).toHaveAttribute('src', '/demo?embed=1&theme=Rosewood%20Doors');
    expect(screen.getByRole('heading', { name: 'And everything after the yes.' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Vendor directory' }).length).toBeGreaterThan(0);
  });

  it('never offers a free plan or says texts are included', () => {
    const { container } = page();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/start free|free plan|free to start/i);
    expect(text).not.toMatch(/texts? (are )?included/i);
    // The free things that are still true stay.
    expect(screen.getByText('Wedding vendor? List your business free')).toBeInTheDocument();
    expect(screen.getByText(/Send each guest their own link from your own phone or by email/)).toBeInTheDocument();
  });

  it('shows texts at the all-in price first, never inside a plan', () => {
    page();
    expect(TEXT_CREDIT_ALL_IN).toBe(8);
    expect(screen.getByText('8c a credit, all-in')).toBeInTheDocument();
    expect(screen.getByText(TEXT_COST_NOTE)).toBeInTheDocument();
    expect(screen.getByText(/Not included in any plan: text credits are bought separately/)).toBeInTheDocument();
  });

  it('shows the same prices the app charges, the add-on, and a comparison that matches each plan', () => {
    page();
    for (const p of Object.values(PLAN_INFO)) expect(screen.getAllByText(p.price).length).toBeGreaterThan(0);
    expect(screen.getByText(EVENT_ADDON.price)).toBeInTheDocument();
    const table = screen.getByRole('table');
    const photos = within(table).getByText('Guests’ photos by QR code on each table').closest('tr')!;
    expect(within(photos).getByLabelText(`${PLAN_INFO.free.name}: not included`)).toBeInTheDocument();
    expect(within(photos).getByLabelText(`${PLAN_INFO.essentials.name}: not included`)).toBeInTheDocument();
    expect(within(photos).getByLabelText(`${PLAN_INFO.complete.name}: included`)).toBeInTheDocument();
    // Automatic texting comes with Essentials and Deluxe, and the row says the credits are extra.
    const texts = within(table).getByText('Automatic text invitations and reminders (text credits extra)').closest('tr')!;
    expect(within(texts).getByLabelText(`${PLAN_INFO.free.name}: not included`)).toBeInTheDocument();
    expect(within(texts).getByLabelText(`${PLAN_INFO.essentials.name}: included`)).toBeInTheDocument();
    expect(within(table).queryByText('Invitations and reminders by text')).toBeNull();
  });

  it('keeps the questions short', () => {
    page();
    const faq = screen.getByRole('region', { name: 'Questions' });
    const ours = within(faq).getByRole('group', { name: /^About / });
    const invites = within(faq).getByRole('group', { name: 'Wedding invitations, answered' });
    expect(ours.querySelectorAll('details').length).toBeLessThanOrEqual(6);
    expect(invites.querySelectorAll('details').length).toBeLessThanOrEqual(6);
    expect(within(ours).getByText('Is it a subscription?')).toBeInTheDocument();
    expect(within(invites).getByText('When should we send our wedding invitations?')).toBeInTheDocument();
  });

  it('compares itself without naming anyone', () => {
    page();
    const list = screen.getByRole('list', { name: 'How we compare' });
    expect(within(list).getAllByRole('listitem').length).toBe(5);
    expect(within(list).getByText(/Free, as often as you like/)).toBeInTheDocument();
  });

  it('shows the Signature designs opening, each leading to its sample', () => {
    page();
    const row = screen.getByRole('list', { name: 'Signature designs' });
    const links = within(row).getAllByRole('link');
    expect(links.length).toBe(3);
    expect(links[0]).toHaveAttribute('href', '/demo?theme=Rosewood%20Doors');
    expect(row.querySelectorAll('[data-scene]').length).toBe(3);
  });

  it('shows how sending works, step by step, with text credits bought separately', () => {
    page();
    const steps = screen.getByRole('heading', { name: 'From your guest list to their yes.' }).closest('section')!;
    expect(within(steps).getAllByRole('listitem')).toHaveLength(6);
    expect(within(steps).getByText(/not included in any plan/)).toBeInTheDocument();
    expect(within(steps).getByText(/Free from your own phone/)).toBeInTheDocument();
  });

  it('says clearly it is Australian owned and operated', () => {
    page();
    expect(screen.getByTestId('aussie-badge')).toHaveTextContent('Australian owned and operated');
  });
});

describe('sample invitation (/demo)', () => {
  beforeEach(() => localStorage.clear());

  it('is the real guest invitation with made-up names and venue, and needs no server', async () => {
    render(
      <MemoryRouter initialEntries={['/demo']}>
        <DemoPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Dear Emma & Tom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open invitation' })).toBeInTheDocument();
    expect(screen.getAllByText('Larkwood Estate').length).toBeGreaterThan(0);
    expect(screen.queryByText('[Ceremony venue]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Make your own' })).toHaveAttribute('href', '/#start');
  });
});
