import type { ListingPackage } from '@wp/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeeProposalBuilder } from '../src/sales/FeeProposal';

const packages: ListingPackage[] = [
  { name: 'Ceremony', price: 1200, unit: 'total', includes: ['Bridal bouquet', 'Aisle flowers'], popular: false },
  { name: 'Ceremony and reception', price: 2400, unit: 'total', includes: ['Long-table centrepieces'], popular: true },
];

afterEach(() => vi.unstubAllGlobals());

describe('a vendor’s fee proposal builder', () => {
  it('starts from a package, adds up the lines as they change, and sends', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      void init;
      return new Response(JSON.stringify({ id: 'p1', link: 'https://example.com/proposal/abc', emailed: false }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetch);
    render(<FeeProposalBuilder to={{ couple: 'w1' }} toName="Ava & Sam" packages={packages} onClose={() => {}} />);

    // From a package: its name and price as the first line, its title, and what it includes as the note.
    fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'Ceremony' } });
    expect(screen.getByLabelText('Line 1')).toHaveValue('Ceremony');
    expect(screen.getByLabelText('Line 1 amount')).toHaveValue('1200');
    expect(screen.getByLabelText('Title')).toHaveValue('Ceremony');
    expect(screen.getByLabelText('A note for them')).toHaveValue('Includes: Bridal bouquet, Aisle flowers.');
    expect(screen.getByTestId('proposal-total')).toHaveTextContent('$1,200');

    // Another line: the total follows.
    fireEvent.click(screen.getByRole('button', { name: 'Add a line' }));
    fireEvent.change(screen.getByLabelText('Line 2'), { target: { value: 'Delivery and set-up' } });
    fireEvent.change(screen.getByLabelText('Line 2 amount'), { target: { value: '$350' } });
    expect(screen.getByTestId('proposal-total')).toHaveTextContent('$1,550');
    fireEvent.click(screen.getByRole('button', { name: 'Remove line 1' }));
    expect(screen.getByTestId('proposal-total')).toHaveTextContent('$350');
    fireEvent.change(screen.getByLabelText('Line 1 amount'), { target: { value: '400' } });
    expect(screen.getByTestId('proposal-total')).toHaveTextContent('$400');

    fireEvent.click(screen.getByRole('button', { name: /Send the proposal/ }));
    await waitFor(() => expect(screen.getByLabelText('The proposal’s link')).toHaveValue('https://example.com/proposal/abc'));
    const body = JSON.parse(String(fetch.mock.calls[0]![1]!.body)) as { to: unknown; lines: unknown[]; title: string };
    expect(body).toMatchObject({ to: { couple: 'w1' }, title: 'Ceremony', lines: [{ what: 'Delivery and set-up', amount: 400 }] });
  });

  it('a revision starts from the latest version, shows what they asked, and sends to the revise path', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      void init;
      return new Response(JSON.stringify({ id: 'p1', link: 'https://example.com/proposal/abc', revision: 2, emailed: false }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetch);
    const p = {
      id: 'p1', to: 'Ava & Sam', kind: 'couple' as const, status: 'changes' as const, revision: 1, title: 'Flowers', total: 1650, deposit: 500, validUntil: '2027-01-31', note: 'Seasonal.', at: '2026-11-01T00:00:00Z', sentAt: '2026-11-01T00:00:00Z', answeredAt: '', link: '',
      lines: [{ what: 'Bridal bouquet', amount: 450 }, { what: 'Centrepieces (10)', amount: 1200 }],
      request: { revision: 1, message: 'Eight centrepieces, please.', at: '2026-11-02T00:00:00Z' },
    };
    render(<FeeProposalBuilder revise={p} toName="Ava & Sam" packages={packages} onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Revision 2 for Ava & Sam' })).toBeInTheDocument();
    expect(screen.getByText('Eight centrepieces, please.')).toBeInTheDocument();
    expect(screen.getByLabelText('Line 2')).toHaveValue('Centrepieces (10)');
    expect(screen.queryByLabelText('Start from')).toBeNull();
    fireEvent.change(screen.getByLabelText('Line 2'), { target: { value: 'Centrepieces (8)' } });
    fireEvent.change(screen.getByLabelText('Line 2 amount'), { target: { value: '960' } });
    expect(screen.getByTestId('proposal-total')).toHaveTextContent('$1,410');
    fireEvent.click(screen.getByRole('button', { name: /Send the revision/ }));
    await waitFor(() => expect(screen.getByText('Revision 2 sent to Ava & Sam')).toBeInTheDocument());
    expect(String(fetch.mock.calls[0]![0])).toBe('/api/a/vendor/proposals/p1/revise');
  });

  it('asks for what is missing before sending', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<FeeProposalBuilder to={{ enquiry: 'e1' }} toName="Grace Wu" packages={[]} onClose={() => {}} />);
    expect(screen.queryByLabelText('Start from')).toBeNull(); // no packages: a blank proposal
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Bouquets' } });
    fireEvent.change(screen.getByLabelText('Line 1'), { target: { value: 'Bridal bouquet' } });
    fireEvent.click(screen.getByRole('button', { name: /Send the proposal/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add an amount to each line');
    expect(fetch).not.toHaveBeenCalled();
  });
});
