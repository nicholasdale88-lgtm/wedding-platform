import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EVENT_ADDON, PLAN_INFO } from '@wp/shared';
import { SalesPage } from '../src/sales/SalesPage';

describe('front page pricing', () => {
  it('sells it: highlights up top, why couples choose it, and what they bring with its cost', () => {
    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('list', { name: 'Highlights' }).querySelectorAll('li')).toHaveLength(4);
    expect(screen.getByRole('heading', { name: 'Why couples choose it' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Every dietary need on the right plate' })).toBeInTheDocument();
    const byo = screen.getByRole('region', { name: 'What you bring, and what it costs' });
    expect(within(byo).getByRole('heading', { name: 'Your Google Drive or OneDrive' })).toBeInTheDocument();
    expect(within(byo).getByText('Usually free')).toBeInTheDocument();
    expect(within(byo).getByText('About 2c each')).toBeInTheDocument();
  });

  it('shows the same prices the app enforces, the add-ons, and a comparison that matches each plan', () => {
    render(
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>,
    );
    for (const p of Object.values(PLAN_INFO)) expect(screen.getAllByText(p.price).length).toBeGreaterThan(0);
    expect(screen.getByText(EVENT_ADDON.price)).toBeInTheDocument();
    const table = screen.getByRole('table');
    const row = within(table).getByText('Guests’ photos by QR code on each table').closest('tr')!;
    expect(within(row).getByLabelText('Free: not included')).toBeInTheDocument();
    expect(within(row).getByLabelText('Essentials: not included')).toBeInTheDocument();
    expect(within(row).getByLabelText('Complete: included')).toBeInTheDocument();
    const texts = within(table).getByText('Invitations and reminders by text').closest('tr')!;
    expect(within(texts).getByLabelText('Essentials: included')).toBeInTheDocument();
  });
});
