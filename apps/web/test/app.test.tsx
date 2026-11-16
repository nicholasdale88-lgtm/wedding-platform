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

/** Company → Preview opens pages in the same tab; each has a way back to the company portal. */
describe('back to the company portal', () => {
  it('shows only in a tab opened from Company → Preview', async () => {
    vi.stubGlobal('fetch', vi.fn());
    window.history.pushState({}, '', '/w/nope/nope/nope');
    const { unmount } = render(<App />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('link', { name: /Company portal/ })).toBeNull();
    unmount();
    sessionStorage.setItem('yl.fromCompany', '1');
    render(<App />);
    expect(await screen.findByRole('link', { name: /Company portal/ })).toHaveAttribute('href', '/company#preview');
    sessionStorage.clear();
  });
});
