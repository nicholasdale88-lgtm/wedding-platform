import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotoLinksPanel } from '../src/admin/photos/PhotoLinks';
import { ToastProvider } from '../src/admin/ui';
import type { PhotoLink, PhotoLinks } from '../src/lib/api';

/** Photos → "Where photos are saved": one tap to connect, a clear connected state, a loud reconnect. */
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const providers: PhotoLinks['providers'] = [
  { key: 'gdrive', name: 'Google Drive', ready: true },
  { key: 'dropbox', name: 'Dropbox', ready: true },
  { key: 'onedrive', name: 'OneDrive', ready: false },
];
const base: PhotoLinks = { siteStorage: false, redirectUri: 'https://example.com/api/oauth/callback', canSetUp: false, providers, links: [] };
const drive: PhotoLink = {
  id: 'l1',
  provider: 'gdrive',
  name: 'Google Drive',
  account: 'alex@example.com',
  ok: true,
  problem: null,
  copied: 3,
  waiting: 0,
  failed: 0,
  since: '2027-01-01T00:00:00.000Z',
  docs: true,
  filed: true,
  verified: true,
  folder: 'The Yes List – Alex Smith & Blair Jones',
  openUrl: 'https://drive.google.com/drive/folders/abc',
};

function show(data: PhotoLinks, at = '/admin/w1/photos') {
  vi.stubGlobal('fetch', async (path: string) => {
    if (String(path).includes('photo-links')) return json(data);
    throw new Error(`unexpected ${path}`);
  });
  render(
    <MemoryRouter initialEntries={[at]}>
      <ToastProvider>
        <PhotoLinksPanel onChanged={() => {}} />
      </ToastProvider>
    </MemoryRouter>,
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('Where photos are saved', () => {
  it('nothing connected: Connect Google Drive and Connect Dropbox, side by side; never Google Photos or OneDrive without its keys', async () => {
    show(base);
    expect(await screen.findByRole('heading', { name: 'Where photos are saved' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Dropbox' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Google Photos/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /OneDrive/ })).toBeNull();
    expect(screen.queryByText(/use .* instead|somewhere else/i)).toBeNull();
    // Couples never see the site's own app setup.
    expect(screen.queryByText(/GitHub|redirect URI|Only you see this/i)).toBeNull();
  });

  it('even when the site lists Google Photos as ready, it is not offered', async () => {
    show({ ...base, providers: [...providers, { key: 'gphotos', name: 'Google Photos', ready: true }] });
    await screen.findByRole('button', { name: 'Connect Google Drive' });
    expect(screen.queryByRole('button', { name: /Google Photos/ })).toBeNull();
  });

  it('back from signing in: a success card, Connected with the account, the folder, Open in Google Drive and the test-file check', async () => {
    show({ ...base, links: [drive] }, '/admin/w1/photos?linked=gdrive');
    expect(await screen.findByText('You’re connected to Google Drive')).toBeInTheDocument();
    expect(screen.getByText(/Your folder “The Yes List – Alex Smith & Blair Jones” is ready/)).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('alex@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Google Drive/ })).toHaveAttribute('href', 'https://drive.google.com/drive/folders/abc');
    expect(screen.getByText(/saved a test file in your folder/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Your folders' })).toHaveTextContent('The Yes List – Alex Smith & Blair Jones');
    expect(screen.getByRole('checkbox', { name: /Keep planning files here too/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Disconnect Google Drive' })).toBeInTheDocument();
    // No second step for a new connection.
    expect(screen.queryByRole('button', { name: /Set up these folders|wedding folder for new photos/ })).toBeNull();
    // Dropbox is offered as a second copy, in the open.
    expect(screen.getByRole('button', { name: 'Connect Dropbox' })).toBeInTheDocument();
  });

  it('a broken or expired link is a loud Reconnect card, in plain words', async () => {
    show({ ...base, links: [{ ...drive, ok: false, verified: false, problem: 'Access was removed or has expired. Tap Reconnect and sign in again: everything carries on where it left off.' }] });
    const card = await screen.findByRole('alert');
    expect(card).toHaveTextContent('Google Drive needs reconnecting');
    expect(card).toHaveTextContent(/Access was removed or has expired/);
    expect(screen.getByRole('button', { name: 'Reconnect Google Drive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect Google Drive' })).toBeInTheDocument();
    expect(screen.queryByText('Connected')).toBeNull();
  });

  it('back with an error: says what happened and offers Connect again', async () => {
    show(base, '/admin/w1/photos?link_error=declined');
    expect(await screen.findByText('Not connected yet')).toBeInTheDocument();
    expect(screen.getByText(/access wasn’t allowed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google Drive' })).toBeInTheDocument();
  });
});
