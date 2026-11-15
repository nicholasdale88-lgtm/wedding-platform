import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Extra, ExtrasGrid } from '../src/admin/pages/ExtrasGrid';

describe('Setup → Extras as cards', () => {
  it('shows every extra as a card with what is set now; tapping one opens its settings, Done closes them', () => {
    render(
      <ExtrasGrid>
        <Extra title="Music" now="No music">
          <span>Music settings</span>
        </Extra>
        <Extra title="Gifts and registry" now="Nothing added">
          <span>Gift settings</span>
        </Extra>
      </ExtrasGrid>,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('No music')).toBeInTheDocument();
    expect(screen.queryByText('Music settings')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Music/ }));
    expect(screen.getByRole('region', { name: 'Music' })).toHaveTextContent('Music settings');
    // One at a time.
    fireEvent.click(screen.getByRole('button', { name: /Gifts and registry/ }));
    expect(screen.queryByText('Music settings')).toBeNull();
    expect(screen.getByText('Gift settings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Gift settings')).toBeNull();
  });

  it('an extra asked for by a link starts open', () => {
    render(
      <ExtrasGrid>
        <Extra title="Music" now="No music">
          <span>Music settings</span>
        </Extra>
        <Extra start title="Envelope and seal" now="Gold seal">
          <span>Seal settings</span>
        </Extra>
      </ExtrasGrid>,
    );
    expect(screen.getByText('Seal settings')).toBeInTheDocument();
  });
});
