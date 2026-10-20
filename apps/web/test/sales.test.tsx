import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EVENT_ADDON, PLAN_INFO } from '@wp/shared';
import { SalesPage } from '../src/sales/SalesPage';

describe('front page pricing', () => {
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
