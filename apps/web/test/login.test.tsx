import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminRoot } from '../src/admin/AdminRoot';
import { overviewFixture } from './fixtures';

const renderAdmin = () =>
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin/*" element={<AdminRoot />} />
      </Routes>
    </MemoryRouter>,
  );

const ME = {
  user: { id: 'u1', email: 'owner@example.com', superAdmin: false },
  weddings: [{ id: 'w1', slug: 'a-and-b', name1: 'Alex Smith', name2: 'Blair Jones', role: 'owner' }],
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Scripted API: responses by path, recorded calls. */
function mockApi(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
  const calls: { path: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    const handler = routes[path];
    if (!handler) throw new Error(`unexpected ${path}`);
    return handler(init);
  });
  return calls;
}

describe('admin sign-in', () => {
  it('shows the sign-in screen when signed out, matching the design copy', async () => {
    mockApi({ '/api/a/me': () => json(401, { error: { code: 'signed_out', message: 'Please sign in.' } }) });
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('RSVP admin · private')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open admin' })).toBeInTheDocument();
    expect(screen.getByLabelText('Passcode')).toHaveAttribute('type', 'password');
  });

  it('signs in, then shows the wedding; remembers the couple name for next time', async () => {
    const calls = mockApi({
      '/api/a/me': () => json(401, { error: { code: 'signed_out', message: 'Please sign in.' } }),
      '/api/a/auth/login': () => json(200, ME),
      '/api/a/w/w1/overview': () => json(200, overviewFixture),
    });
    renderAdmin();
    await userEvent.type(await screen.findByLabelText('Email'), 'owner@example.com');
    await userEvent.type(screen.getByLabelText('Passcode'), 'valley-2027');
    await userEvent.click(screen.getByRole('button', { name: 'Open admin' }));
    expect(await screen.findByText('Alex & Blair')).toBeInTheDocument();
    const login = calls.find((c) => c.path === '/api/a/auth/login')!;
    expect(JSON.parse(String(login.init!.body))).toEqual({ email: 'owner@example.com', passcode: 'valley-2027' });
    expect(new Headers(login.init!.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(localStorage.getItem('wp-admin-last')!)).toEqual({ email: 'owner@example.com', name: 'Alex & Blair' });
  });

  it('greets a returning admin by the couple name and fills the email', async () => {
    localStorage.setItem('wp-admin-last', JSON.stringify({ email: 'owner@example.com', name: 'Alex & Blair' }));
    mockApi({ '/api/a/me': () => json(401, {}) });
    renderAdmin();
    expect(await screen.findByRole('heading', { name: 'Alex & Blair' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('owner@example.com');
  });

  it("shows the server's message on a wrong passcode and clears the field", async () => {
    mockApi({
      '/api/a/me': () => json(401, {}),
      '/api/a/auth/login': () => json(401, { error: { code: 'bad_login', message: "That email and passcode don't match." } }),
    });
    renderAdmin();
    await userEvent.type(await screen.findByLabelText('Email'), 'owner@example.com');
    await userEvent.type(screen.getByLabelText('Passcode'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Open admin' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That email and passcode don't match.");
    expect(screen.getByLabelText('Passcode')).toHaveValue('');
  });

  it('asks for both fields before calling the server', async () => {
    const calls = mockApi({ '/api/a/me': () => json(401, {}) });
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Open admin' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email and passcode.');
    expect(calls.map((c) => c.path)).toEqual(['/api/a/me']);
  });

  it('a double tap sends one request', async () => {
    let release!: () => void;
    const calls = mockApi({
      '/api/a/me': () => json(401, {}),
      '/api/a/auth/login': () => new Promise((r) => { release = () => r(json(200, ME)); }),
      '/api/a/w/w1/overview': () => json(200, overviewFixture),
    });
    renderAdmin();
    await userEvent.type(await screen.findByLabelText('Email'), 'owner@example.com');
    await userEvent.type(screen.getByLabelText('Passcode'), 'valley-2027');
    const button = screen.getByRole('button', { name: 'Open admin' });
    await userEvent.click(button);
    await userEvent.click(button);
    release();
    await screen.findByText('Alex & Blair');
    expect(calls.filter((c) => c.path === '/api/a/auth/login')).toHaveLength(1);
  });

  it('says so plainly when offline', async () => {
    mockApi({
      '/api/a/me': () => json(401, {}),
      '/api/a/auth/login': () => { throw new TypeError('Failed to fetch'); },
    });
    renderAdmin();
    await userEvent.type(await screen.findByLabelText('Email'), 'owner@example.com');
    await userEvent.type(screen.getByLabelText('Passcode'), 'valley-2027');
    await userEvent.click(screen.getByRole('button', { name: 'Open admin' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Can't reach the server"));
  });

  it('a signed-in admin skips the sign-in screen, and can sign out', async () => {
    mockApi({ '/api/a/me': () => json(200, ME), '/api/a/auth/logout': () => json(200, { ok: true }), '/api/a/w/w1/overview': () => json(200, overviewFixture) });
    renderAdmin();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('button', { name: 'Open admin' })).toBeInTheDocument();
  });
});
