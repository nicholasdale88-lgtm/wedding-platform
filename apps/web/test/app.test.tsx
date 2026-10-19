import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

/** Guests only ever see guest pages: a wrong address never leads to the admin. */
describe('routing', () => {
  it.each(['/w', '/wedding', '/w/alex-and-blair/nope', '/photos', '/admin-old'])('%s shows a gentle message, not the sign-in', async (path) => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    window.history.pushState({}, '', path);
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not find this page.');
    expect(screen.queryByText(/passcode/i)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled(); // nothing asked of the admin API
  });
});
