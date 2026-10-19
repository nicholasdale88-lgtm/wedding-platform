import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AdminRoot } from '../src/admin/AdminRoot';
import { applyFilters } from '../src/admin/guestFilters';
import { detailOf, events, guests, overviewFixture } from './fixtures';

const ME = { user: { id: 'u1', email: 'owner@example.com', superAdmin: false }, weddings: [{ id: 'w1', slug: 'alex-and-blair', name1: 'Alex Smith', name2: 'Blair Jones', role: 'owner' }] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function mockApi(extra: Record<string, (init?: RequestInit) => Response> = {}) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const routes: Record<string, (init?: RequestInit) => Response> = {
    '/api/a/me': () => json(200, ME),
    '/api/a/w/w1/overview': () => json(200, overviewFixture),
    '/api/a/w/w1/guests': () => json(200, { events, guests }),
    ...Object.fromEntries(guests.map((g) => [`/api/a/w/w1/guests/${g.id}`, () => json(200, detailOf(g))])),
    ...extra,
  };
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    const key = Object.keys(routes).find((k) => k === path) ?? '';
    if (!routes[key]) throw new Error(`unexpected ${path}`);
    return routes[key]!(init);
  });
  return calls;
}

let location = '';
function Where() {
  const l = useLocation();
  location = l.pathname + l.search;
  return null;
}
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/*" element={<><AdminRoot /><Where /></>} />
      </Routes>
    </MemoryRouter>,
  );

describe('admin shell', () => {
  it('opens straight to the only wedding, with the couple name, nav badges, events and days to go', async () => {
    mockApi();
    renderAt('/admin');
    expect(await screen.findByText('Alex & Blair')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    expect(within(nav).getByRole('link', { name: /Guests\s*3/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /SMS messages\s*6 on autopilot/ })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /SMS setup\s*Not set up/ })).toBeInTheDocument();
    expect(screen.getAllByText('Recovery brunch').length).toBeGreaterThan(0);
    expect(screen.getByText('138 days to go')).toBeInTheDocument();
    expect(location).toBe('/admin/w1/overview');
  });
});

describe('Overview', () => {
  it('shows answered, figures per event, Needs you and latest replies', async () => {
    mockApi();
    renderAt('/admin/w1/overview');
    expect(await screen.findByRole('heading', { name: '2 of 3 invitations answered' })).toBeInTheDocument();
    expect(screen.getByText('138 days to the wedding')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wedding\s*2\s*guests coming/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Recovery brunch\s*2\s*guests coming/ })).toBeInTheDocument();
    const needs = screen.getByRole('region', { name: 'Needs you' });
    expect(within(needs).getByText('2 things to do')).toBeInTheDocument();
    expect(within(needs).getByText('1 invitation has no mobile')).toBeInTheDocument();
    expect(screen.getByText('Casey Lund')).toBeInTheDocument();
  });

  it('Needs you buttons go straight to the fix', async () => {
    mockApi();
    renderAt('/admin/w1/overview');
    await userEvent.click(await screen.findByRole('button', { name: 'See who' }));
    expect(location).toBe('/admin/w1/guests?filter=awaiting');
    expect(await screen.findByText('Jo Banks')).toBeInTheDocument();
    expect(screen.queryByText('Robin Hart')).not.toBeInTheDocument();
  });
});

describe('Guests', () => {
  it('lists invitations with status pills, answers and diet; title counts guests and invitations', async () => {
    mockApi();
    renderAt('/admin/w1/guests');
    expect(await screen.findByRole('heading', { name: '4 guests on 3 invitations' })).toBeInTheDocument();
    const row = screen.getByText('Robin Hart').closest('[role=row]') as HTMLElement;
    expect(within(row).getAllByText('Attending')).toHaveLength(2);
    expect(within(row).getByText('Sam is coeliac')).toBeInTheDocument();
    expect(within(row).getByText('2/2 · T2')).toBeInTheDocument();
    expect(within(row).getByText('Yes')).toBeInTheDocument(); // swim answer
    expect(screen.getAllByText('No mobile').length).toBeGreaterThan(0);
  });

  it('search and filters combine, show the count, and live in the address bar', async () => {
    mockApi();
    renderAt('/admin/w1/guests');
    await screen.findByText('Robin Hart');
    await userEvent.selectOptions(screen.getByLabelText('Mobile'), 'has');
    expect(screen.getByText('2 of 3 invitations')).toBeInTheDocument();
    expect(location).toContain('mob=has');
    await userEvent.type(screen.getByLabelText('Search name or mobile'), 'casey');
    expect(screen.queryByText('Robin Hart')).not.toBeInTheDocument();
    expect(screen.getByText('Casey Lund')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('3 invitations')).toBeInTheDocument();
  });

  it('opens the drawer; editing a reply sends If-Match and shows Saved', async () => {
    const g1 = guests[0]!;
    const calls = mockApi({
      '/api/a/w/w1/guests/g1/rsvp': () => json(200, detailOf({ ...g1, version: 4, rsvp: { ...g1.rsvp, brunch: { ...g1.rsvp.brunch!, attending: false } } })),
    });
    renderAt('/admin/w1/guests?g=g1');
    const drawer = await screen.findByRole('dialog', { name: 'Guest: Robin Hart' });
    const brunch = within(drawer).getByRole('group', { name: 'Recovery brunch' });
    await userEvent.click(within(brunch).getByRole('button', { name: 'Declined' }));
    const put = calls.find((c) => c.path === '/api/a/w/w1/guests/g1/rsvp')!;
    expect(new Headers(put.init!.headers).get('If-Match')).toBe('3');
    expect(JSON.parse(String(put.init!.body))).toEqual({ events: { brunch: { attending: false } } });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
    expect(within(brunch).getByRole('button', { name: 'Declined' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a clash with another edit says so and reloads', async () => {
    let n = 0;
    mockApi({
      '/api/a/w/w1/guests/g2': () => json(200, detailOf({ ...guests[1]!, version: 1 + n++ })),
      '/api/a/w/w1/guests/g2/rsvp': () => json(409, { error: { code: 'conflict', message: 'Updated elsewhere, reloaded.' } }),
    });
    renderAt('/admin/w1/guests?g=g2');
    const drawer = await screen.findByRole('dialog', { name: 'Guest: Jo Banks' });
    await userEvent.click(within(within(drawer).getByRole('group', { name: 'The wedding' })).getByRole('button', { name: 'Attending' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Updated elsewhere, reloaded.');
    await waitFor(() => expect(n).toBeGreaterThanOrEqual(2));
  });

  it('shows the personal link and text history; no mobile is called out', async () => {
    mockApi();
    renderAt('/admin/w1/guests?g=g2');
    const drawer = await screen.findByRole('dialog', { name: 'Guest: Jo Banks' });
    expect(within(drawer).getByText(/\/w\/alex-and-blair\/\?g=/)).toBeInTheDocument();
    expect(within(drawer).getByText('No mobile, so this guest will not receive any SMS.')).toBeInTheDocument();
    expect(within(drawer).getByText('Nothing sent yet.')).toBeInTheDocument();
  });

  it('previews every page this guest gets, in preview mode', async () => {
    mockApi();
    renderAt('/admin/w1/guests?g=g2');
    const drawer = await screen.findByRole('dialog', { name: 'Guest: Jo Banks' });
    const hrefs = within(drawer).getAllByRole('link').map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => /^\/w\/alex-and-blair\/\?g=[^&]+&preview=1$/.test(h))).toBe(true);
    expect(hrefs.some((h) => /^\/w\/alex-and-blair\/tomorrow\/\w+\?g=[^&]+&preview=1$/.test(h))).toBe(true);
    expect(hrefs.some((h) => /^\/w\/alex-and-blair\/photos\?g=[^&]+&preview=1$/.test(h))).toBe(true);
  });

  it('Escape closes the drawer and clears it from the address bar', async () => {
    mockApi();
    renderAt('/admin/w1/guests?g=g1');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(location).toBe('/admin/w1/guests');
  });
});

describe('guest filters (pure)', () => {
  const run = (s: Record<string, string>) => applyFilters(guests, events, { filter: 'all', q: '', ...s }).map((g) => g.people[0]!.name);
  it('quick filters and dropdowns', () => {
    expect(run({ filter: 'awaiting' })).toEqual(['Jo Banks']);
    expect(run({ filter: 'attending:brunch' })).toEqual(['Robin Hart']);
    expect(run({ filter: 'declined' })).toEqual(['Casey Lund']);
    expect(run({ filter: 'answer:brunch:swim' })).toEqual(['Robin Hart']);
    expect(run({ inv: 'wedding' })).toEqual(['Jo Banks']);
    expect(run({ inv: 'all' })).toEqual(['Casey Lund', 'Robin Hart']);
    expect(run({ diet: 'serious' })).toEqual(['Robin Hart']);
    expect(run({ diet: 'none' })).toEqual(['Casey Lund', 'Jo Banks']);
    expect(run({ seat: 'no' })).toEqual(['Casey Lund', 'Jo Banks']);
    expect(run({ size: '2' })).toEqual(['Robin Hart']);
    expect(run({ sort: 'za' })).toEqual(['Robin Hart', 'Jo Banks', 'Casey Lund']);
  });
  it('searches names and mobile digits in any format', () => {
    expect(run({ q: 'sam' })).toEqual(['Robin Hart']);
    expect(run({ q: '0412 000 003' })).toEqual(['Casey Lund']);
    expect(run({ q: '412000001' })).toEqual(['Robin Hart']);
  });
});
