import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
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
    '/api/a/w/w1/events': () => json(200, { timezone: 'Australia/Sydney', events: [] }),
    '/api/a/w/w1/guests': () => json(200, { events, guests }),
    ...Object.fromEntries(guests.map((g) => [`/api/a/w/w1/guests/${g.id}`, () => json(200, detailOf(g))])),
    ...extra,
  };
  vi.stubGlobal('fetch', async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    const key = Object.keys(routes).find((k) => k === path) ?? Object.keys(routes).find((k) => k === path.split('?')[0]) ?? '';
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
/** The admin in a memory data router (as in the app, so leaving unsaved work can be guarded); returns the router. */
const renderAt = (path: string) => {
  const router = createMemoryRouter([{ path: '/admin/*', element: <><AdminRoot /><Where /></> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
};

describe('admin shell', () => {
  it('opens straight to the only wedding, with the couple name, nav badges, events and days to go', async () => {
    mockApi();
    renderAt('/admin');
    expect(await screen.findByText('Alex & Blair')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Admin' });
    // Account: what's shared by every event (overview, messages, the SMS provider setup). The invitation is in the first event.
    for (const name of [/^Overview/, /^Messages/, /^Settings\s*Texts off/]) expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /^Invitation/ })).toBeNull();
    expect(screen.getAllByText('Recovery brunch').length).toBeGreaterThan(0);
    expect(screen.getByText('138 days to go')).toBeInTheDocument();
    expect(location).toBe('/admin/w1/account/overview');
  });
});

describe('addresses', () => {
  it('old addresses without a section open the right one, keeping their filters', async () => {
    localStorage.clear();
    mockApi();
    renderAt('/admin/w1/guests?show=all');
    expect(await screen.findByRole('heading', { name: '4 guests on 3 invitations' })).toBeInTheDocument();
    expect(location).toBe('/admin/w1/wedding/guests?show=all');
  });

  it('a removed event (an old link) lands in Account', async () => {
    mockApi();
    renderAt('/admin/w1/gone/overview');
    await waitFor(() => expect(location).toBe('/admin/w1/account/overview'));
  });

  it('switching section is in the address, so Back returns to the section you were in', async () => {
    mockApi();
    const router = renderAt('/admin/w1/wedding/guests?show=all');
    await screen.findByText('Robin Hart');
    await userEvent.click(screen.getByRole('button', { name: 'Recovery brunch' }));
    await waitFor(() => expect(location).toBe('/admin/w1/brunch/guests'));
    expect(screen.getByRole('button', { name: 'Recovery brunch' })).toHaveAttribute('aria-current', 'true');
    await act(() => router.navigate(-1));
    await waitFor(() => expect(location).toBe('/admin/w1/wedding/guests?show=all'));
    expect(screen.getByRole('button', { name: 'The wedding' })).toHaveAttribute('aria-current', 'true');
    expect(localStorage.getItem('wp.admin.event.w1')).toBe('wedding'); // only for /admin/w1
  });
});

describe('phone menu', () => {
  const phone = () => vi.stubGlobal('matchMedia', (q: string) => ({ matches: /max-width/.test(q), media: q, addEventListener: () => {}, removeEventListener: () => {} }));
  const openMenu = async () => {
    await userEvent.click(await screen.findByRole('button', { name: /^Menu/ }));
    return screen.getByRole('dialog', { name: 'Menu' });
  };

  it('one menu, at the top: no bar at the bottom and no page strip', async () => {
    phone();
    mockApi();
    renderAt('/admin/w1/account/overview');
    await screen.findByRole('button', { name: /^Menu: Account/ });
    expect(screen.queryByRole('navigation', { name: 'Quick links' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Admin' })).toBeNull();
    // Help sits to the right of the menu button.
    const help = screen.getByRole('link', { name: 'Help' });
    expect(screen.getByRole('button', { name: /^Menu/ }).compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the menu: Account on its own, then Events; tapping one shows only its pages, each once', async () => {
    phone();
    mockApi();
    renderAt('/admin/w1/account/overview');
    const menu = await openMenu();
    expect(within(menu).getByRole('group', { name: 'Account' })).toBeInTheDocument();
    expect(within(within(menu).getByRole('group', { name: 'Events' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['The wedding', 'Recovery brunch']);
    // Account: its own pages.
    for (const name of ['Overview', 'Messages', 'Settings', 'Help']) expect(within(menu).getAllByRole('button', { name })).toHaveLength(1);
    expect(within(menu).queryByRole('button', { name: 'Photos' })).toBeNull();
    // The second event: its own pages only.
    await userEvent.click(within(menu).getByRole('button', { name: 'Recovery brunch' }));
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument(); // stays open
    expect(within(menu).getByRole('button', { name: 'Party checklist' })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Wedding planner' })).toBeNull();
    expect(within(menu).queryByRole('button', { name: 'Settings' })).toBeNull();
    // The wedding: its pages, the planner once.
    await userEvent.click(within(menu).getByRole('button', { name: 'The wedding' }));
    expect(within(menu).getAllByText(/planner/i)).toHaveLength(1);
    expect(within(menu).getByRole('button', { name: 'Wedding party' })).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('button', { name: 'Texts' }));
    expect(location).toBe('/admin/w1/wedding/texts');
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
    expect(screen.getByRole('button', { name: /^Menu: The wedding/ })).toBeInTheDocument();
  });
});

describe('the planner in the menus', () => {
  it('a computer: the sidebar lists "Wedding planner" once', async () => {
    mockApi({ '/api/a/w/w1/overview': () => json(200, { ...overviewFixture, focus: 'wedding' }) });
    renderAt('/admin/w1/wedding/overview');
    const nav = await screen.findByRole('navigation', { name: 'Admin' });
    await waitFor(() => expect(within(nav).getAllByText('Wedding planner')).toHaveLength(1));
  });
});

describe('messages', () => {
  const thread = (id: string, name: string, events: string[], unread: number) => ({
    invitationId: id, name, canText: true, last: { body: `Hi from ${name}`, at: '2026-10-19T00:00:00.000Z', from: 'guest' }, unread, kinds: [], events,
  });
  const threads = [thread('g1', 'Robin Hart', ['wedding', 'brunch'], 1), thread('g2', 'Jo Banks', ['wedding'], 2)];

  it("each event's Messages shows its own guests; Account has an overview of every event", async () => {
    mockApi({ '/api/a/w/w1/messages': () => json(200, { threads }) });
    renderAt('/admin/w1/brunch/messages');
    expect(await screen.findByText('Robin Hart')).toBeInTheDocument();
    expect(screen.queryByText('Jo Banks')).toBeNull(); // not invited to the brunch
    expect(screen.queryByRole('tab', { name: 'Email' })).toBeNull(); // email and the board are in Account
  });

  it('Account → Messages is one inbox for every event, each conversation tagged with its events', async () => {
    mockApi({ '/api/a/w/w1/messages': () => json(200, { threads }) });
    renderAt('/admin/w1/account/messages');
    const robin = (await screen.findByText('Robin Hart')).closest('button')!;
    expect(robin).toHaveTextContent(/The wedding.*Recovery brunch/);
    expect(screen.getByText('Jo Banks').closest('button')).toHaveTextContent('The wedding');
    expect(screen.getByRole('tab', { name: 'Email' })).toBeInTheDocument();
    await userEvent.click(robin);
    expect(location).toBe('/admin/w1/account/messages?c=g1');
  });
});

describe('your account', () => {
  const profile = {
    id: 'u1', email: 'owner@example.com', firstName: '', lastName: '', mobile: '', state: '', postcode: '', heardFrom: '',
    marketing: { optIn: false, at: null }, createdAt: '2026-10-01T00:00:00.000Z', lastLoginAt: '2026-10-19T00:00:00.000Z',
  };

  it('Settings opens on your details; changes wait for Save and only what changed is sent', async () => {
    let body: unknown;
    mockApi({
      '/api/a/me/profile': (init) => {
        if (init?.method === 'PUT') {
          body = JSON.parse(String(init.body));
          return json(200, { profile: { ...profile, firstName: 'Alex', marketing: { optIn: true, at: '2026-10-20T00:00:00.000Z' } } });
        }
        return json(200, { profile, states: ['NSW', 'VIC'], heardFrom: ['Instagram', 'A friend'] });
      },
    });
    renderAt('/admin/w1/account/settings');
    const first = await screen.findByLabelText('First name');
    expect(screen.getByDisplayValue('owner@example.com')).toHaveAttribute('readonly');
    await userEvent.type(first, 'Alex');
    await userEvent.click(screen.getByLabelText(/wedding-planning tips/));
    expect(body).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body).toEqual({ firstName: 'Alex', marketingOptIn: true }));
    expect(await screen.findByText(/You said yes on/)).toBeInTheDocument();
  });

  it('an invitation link: a new person sets their name and passcode, and lands in the wedding', async () => {
    let accepted: unknown;
    mockApi({
      '/api/a/invite/TOKEN0123456789abcdefghij': (init) => {
        if (init?.method === 'POST') {
          accepted = JSON.parse(String(init.body));
          return json(200, ME);
        }
        return json(200, { email: 'partner@example.com', role: 'owner', couple: 'Alex & Blair', hasAccount: false });
      },
    });
    renderAt('/admin/join?t=TOKEN0123456789abcdefghij');
    expect(await screen.findByText(/partner@example.com/)).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('First name'), 'Sam');
    await userEvent.type(screen.getByPlaceholderText(/Choose a passcode/), 'partner-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Create my sign-in' }));
    await waitFor(() => expect(accepted).toEqual({ passcode: 'partner-pass-1', firstName: 'Sam', lastName: '', marketingOptIn: false }));
    await waitFor(() => expect(location).toBe('/admin/w1/account/overview'));
  });
});

describe('add your partner', () => {
  it('while only you can sign in, Account → Setting up opens the invite with the email box ready', async () => {
    const members = { you: { id: 'u1', role: 'owner' }, members: [{ id: 'u1', email: 'owner@example.com', name: 'Alex Smith', role: 'owner', lastLoginAt: null }], invites: [] };
    mockApi({ '/api/a/w/w1/members': () => json(200, members) });
    renderAt('/admin/w1/account/overview');
    const step = (await screen.findByText('Add your partner or a helper')).closest('li')!;
    await waitFor(() => expect(within(step).getByLabelText('To do')).toBeInTheDocument());
    await userEvent.click(within(step).getByRole('button', { name: 'Set up' }));
    expect(location).toBe('/admin/w1/account/settings?view=people&invite=1');
    await waitFor(() => expect(screen.getByLabelText('Their email')).toHaveFocus());
    expect(screen.getByLabelText('They can')).toHaveValue('owner');
  });
});

describe('admin name', () => {
  it('Admin look: the name at the top of the admin saves when you leave the box', async () => {
    let body: unknown;
    mockApi({
      '/api/a/w/w1/admin-name': (init) => {
        body = JSON.parse(String(init!.body));
        return json(200, { ok: true, name: 'Our big day' });
      },
    });
    renderAt('/admin/w1/account/look');
    const box = await screen.findByLabelText('Shown at the top of the admin, on every screen');
    expect(box).toHaveAttribute('placeholder', 'Alex & Blair');
    await userEvent.type(box, 'Our big day');
    expect(body).toBeUndefined();
    await userEvent.tab();
    await waitFor(() => expect(body).toEqual({ name: 'Our big day' }));
  });
});

describe('Overview', () => {
  it("the wedding's overview has the planning dashboard: tasks, who has them, payments and budget, each with its chart", async () => {
    const doc = (data: unknown) => () => json(200, { data, version: 1 });
    mockApi({
      '/api/a/w/w1/planner/doc/checklist': doc({
        tasks: [
          { id: 't1', text: 'Book the venue', before: 400, done: true, note: '', legal: false, owner: 'p1' },
          { id: 't2', text: 'Send save the dates', before: 300, done: false, note: '', legal: false, owner: 'p1' },
          { id: 't3', text: 'Final numbers to caterer', before: 14, done: false, note: '', legal: false, owner: '' },
        ],
      }),
      '/api/a/w/w1/planner/doc/budget': doc({ total: 30000, guests: 0, lines: [{ category: 'Venue', item: 'Venue hire', estimate: 10000, quote: 12000, paid: 5000, due: '2027-01-10', vendor: '', note: '', payer: '', perHead: 0 }] }),
      '/api/a/w/w1/planner/doc/vendors': doc({ list: [] }),
      '/api/a/w/w1/overview': () => json(200, { ...overviewFixture, focus: 'wedding' }),
    });
    renderAt('/admin/w1/wedding/overview');
    // On a phone (and in tests) the dashboard opens with one tap.
    await userEvent.click(await screen.findByRole('button', { name: /Planning dashboard/ }));
    const tasks = await screen.findByRole('region', { name: 'Planning tasks' });
    expect(within(tasks).getByText('33%')).toBeInTheDocument();
    const glance = screen.getByRole('region', { name: 'Key figures' });
    expect(within(glance).getByText('1/3')).toBeInTheDocument();
    expect(within(glance).getByText('1 overdue')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Tasks by person' })).toHaveTextContent(/Alex.*1\/2/);
    expect(screen.getByRole('region', { name: 'Payments' })).toHaveTextContent('$7,000 still to pay');
    expect(screen.getByRole('region', { name: "Who's doing what" })).toHaveTextContent(/Next up.*Send save the dates.*Alex/);
    expect(screen.getByRole('region', { name: 'Budget' })).toHaveTextContent('$5,000 paid · $12,000 committed · $30,000 budget');
  });

  it("an event's overview: replies, its figures, Needs you and latest replies", async () => {
    mockApi({ '/api/a/w/w1/overview': () => json(200, { ...overviewFixture, focus: 'wedding' }) });
    renderAt('/admin/w1/wedding/overview');
    expect(await screen.findByRole('heading', { name: '2 of 3 invitations answered' })).toBeInTheDocument();
    expect(screen.getByText('138 days to the wedding')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Wedding\s*2\s*guests coming/ })).toBeInTheDocument();
    const needs = screen.getByRole('region', { name: 'Needs you' });
    expect(within(needs).getByText('2 things to do')).toBeInTheDocument();
    expect(within(needs).getByText('1 invitation has no mobile')).toBeInTheDocument();
    expect(screen.getByText('Casey Lund')).toBeInTheDocument();
  });

  it('Account → Overview is the setup home: what to set up, plan, who signs in, backups, and each event as a card', async () => {
    mockApi();
    renderAt('/admin/w1/account/overview');
    expect(await screen.findByRole('heading', { name: 'Your wedding admin' })).toBeInTheDocument();
    const setup = screen.getByRole('region', { name: 'Setting up' });
    for (const t of ['Your names and the date', 'Your guests', 'Texting', 'Add your partner or a helper', 'Keep it private']) expect(within(setup).getByText(t)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Your plan/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Backups/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /invitations answered/ })).toBeNull(); // figures are in each event
    await userEvent.click(within(screen.getByRole('region', { name: 'Your events' })).getByRole('button', { name: /Recovery brunch/ }));
    expect(location).toBe('/admin/w1/brunch/overview');
  });

  it('adding an event beyond the plan offers the add-on instead of an error', async () => {
    mockApi({
      '/api/a/w/w1/events': (init) =>
        init?.method === 'POST'
          ? json(402, { error: { code: 'upgrade', feature: 'extraEvent', message: 'Your plan includes 2 events.' } })
          : json(200, { timezone: 'Australia/Sydney', events: [] }),
    });
    renderAt('/admin/w1/account/overview');
    await userEvent.click(await screen.findByRole('button', { name: '+ Add an event' }));
    await userEvent.type(await screen.findByPlaceholderText('Recovery brunch'), 'Welcome drinks');
    await userEvent.click(screen.getByRole('button', { name: 'Add event' }));
    expect(await screen.findByText(/Another event/)).toBeInTheDocument();
    expect(screen.queryByText('Your plan includes 2 events.')).toBeNull(); // the card, not an error message
  });

  it('Needs you buttons go straight to the fix', async () => {
    mockApi();
    renderAt('/admin/w1/account/overview');
    await userEvent.click(await screen.findByRole('button', { name: 'See who' }));
    expect(location).toBe('/admin/w1/wedding/guests?filter=awaiting');
    expect(await screen.findByText('Jo Banks')).toBeInTheDocument();
    expect(screen.queryByText('Robin Hart')).not.toBeInTheDocument();
  });
});

describe('Guests', () => {
  it('lists invitations with status pills, answers and diet; title counts guests and invitations', async () => {
    mockApi();
    renderAt('/admin/w1/wedding/guests?show=all');
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
    renderAt('/admin/w1/wedding/guests?show=all');
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
    renderAt('/admin/w1/wedding/guests?show=all&g=g1');
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
    renderAt('/admin/w1/wedding/guests?show=all&g=g2');
    const drawer = await screen.findByRole('dialog', { name: 'Guest: Jo Banks' });
    await userEvent.click(within(within(drawer).getByRole('group', { name: 'The wedding' })).getByRole('button', { name: 'Attending' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Updated elsewhere, reloaded.');
    await waitFor(() => expect(n).toBeGreaterThanOrEqual(2));
  });

  it('shows the personal link and text history; no mobile is called out', async () => {
    mockApi();
    renderAt('/admin/w1/wedding/guests?show=all&g=g2');
    const drawer = await screen.findByRole('dialog', { name: 'Guest: Jo Banks' });
    expect(within(drawer).getByText(/\/w\/alex-and-blair\/\?g=/)).toBeInTheDocument();
    expect(within(drawer).getByText('No mobile, so this guest will not receive any texts.')).toBeInTheDocument();
    expect(within(drawer).getByText('Nothing sent yet.')).toBeInTheDocument();
  });

  it('previews every page this guest gets, in preview mode', async () => {
    mockApi();
    renderAt('/admin/w1/wedding/guests?show=all&g=g2');
    const drawer = await screen.findByRole('dialog', { name: 'Guest: Jo Banks' });
    const hrefs = within(drawer).getAllByRole('link').map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => /^\/w\/alex-and-blair\/\?g=[^&]+&preview=1$/.test(h))).toBe(true);
    expect(hrefs.some((h) => /^\/w\/alex-and-blair\/tomorrow\/\w+\?g=[^&]+&preview=1$/.test(h))).toBe(true);
    expect(hrefs.some((h) => /^\/w\/alex-and-blair\/photos\?g=[^&]+&preview=1$/.test(h))).toBe(true);
  });

  it('Escape closes the drawer and clears it from the address bar', async () => {
    mockApi();
    renderAt('/admin/w1/wedding/guests?show=all&g=g1');
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(location).toBe('/admin/w1/wedding/guests?show=all');
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

describe('guest pages tab', () => {
  const pages = {
    version: 5,
    slug: 'alex-and-blair',
    theme: 'Cream & Sage',
    events: [{ key: 'wedding', name: 'The wedding' }, { key: 'brunch', name: 'Recovery brunch' }],
    invitation: { rsvpBy: 'Kindly reply by 1 May', seal: 'Sandstone' },
    guides: {
      wedding: { style: 'reception', date: 'Saturday 6 March', runsheet: [{ t: '4:00pm', what: 'Ceremony', where: 'Garden' }], contacts: [], menu: [], faq: [] },
      brunch: { style: 'dayout', date: 'Sunday 7 March', bring: ['Hat'], runsheet: [], contacts: [] },
    },
    texts: { 'inv.dyn.greetAnon': 'Dear Guest' },
    samples: [
      { token: 'T'.repeat(22), label: 'Robin Hart & Sam Hart', invited: ['wedding', 'brunch'] },
      { token: 'U'.repeat(22), label: 'Jo Banks', invited: ['wedding'] },
    ],
  };

  it('Setup: the invitation lives in the first event; every event has its details, timeline, night-before and photo pages', async () => {
    mockApi({ '/api/a/w/w1/pages': () => json(200, pages) });
    renderAt('/admin/w1/wedding/pages');
    expect(await screen.findByRole('heading', { name: 'Set up The wedding' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'The wedding' })).toHaveAttribute('aria-current', 'true'));
    for (const name of ['Invitation', 'Details', 'Timeline', 'Night-before page', 'Photo page']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    // On a phone (and in tests) the preview opens full screen from its own button.
    await userEvent.click(screen.getByRole('button', { name: /^Preview/ }));
    expect(screen.getByTitle('Guest page preview')).toHaveAttribute('src', '/w/alex-and-blair/?preview=1');
    // The preview can be seen as guests will on a laptop or desktop too.
    await userEvent.click(screen.getByRole('radio', { name: 'Laptop' }));
    expect(screen.getByRole('radio', { name: 'Laptop' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Photo page' }));
    expect(screen.getByTitle('Guest page preview')).toHaveAttribute('src', '/w/alex-and-blair/photos/wedding?preview=1');
    await userEvent.click(screen.getByRole('button', { name: 'Recovery brunch' }));
    expect(await screen.findByRole('heading', { name: 'Set up Recovery brunch' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invitation' })).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Night-before page' }));
    // A stand-in guest by default; only guests invited to the brunch can be picked for its guide.
    expect(screen.getByTitle('Guest page preview')).toHaveAttribute('src', '/w/alex-and-blair/tomorrow/brunch?preview=1');
    expect(screen.getByRole('option', { name: 'A sample guest' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Jo Banks' })).toBeNull();
    expect(screen.getByDisplayValue('Hat')).toBeInTheDocument();
  });

  it('saves by itself after typing, with the version, and says so', async () => {
    let body: unknown;
    let ifMatch = '';
    const calls = mockApi({
      '/api/a/w/w1/pages': (init) => {
        if (init?.method === 'PUT') {
          body = JSON.parse(String(init.body));
          ifMatch = new Headers(init.headers).get('If-Match') ?? '';
          return json(200, { ...pages, version: 6, invitation: { ...pages.invitation, rsvpBy: 'Reply by 2 May' } });
        }
        return json(200, pages);
      },
    });
    renderAt('/admin/w1/wedding/pages');
    const field = await screen.findByLabelText('Reply-by line');
    await userEvent.clear(field);
    await userEvent.type(field, 'Reply by 2 May');
    await waitFor(() => expect(calls.filter((c) => c.init?.method === 'PUT')).toHaveLength(1), { timeout: 3000 });
    expect(ifMatch).toBe('5');
    expect(body).toEqual({ invitation: { rsvpBy: 'Reply by 2 May', seal: 'Sandstone' } });
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('the invitation: the essentials up front; each extra shows what is set now, and opens on Change', async () => {
    mockApi({ '/api/a/w/w1/pages': () => json(200, pages) });
    renderAt('/admin/w1/wedding/pages');
    expect(await screen.findByRole('heading', { name: 'The essentials' })).toBeInTheDocument();
    expect(screen.getByLabelText('Reply-by line')).toBeInTheDocument();
    const music = screen.getByRole('button', { name: /^Music\s*No music/ });
    expect(screen.queryByLabelText('Music link (MP3 or YouTube)')).toBeNull(); // folded away until wanted
    await userEvent.click(music);
    expect(screen.getByLabelText('Music link (MP3 or YouTube)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Envelope and seal\s*Sandstone seal/ })).toBeInTheDocument();
  });

  it('every word: grouped by section; a changed sentence shows what it was, and Reset brings it back', async () => {
    mockApi({ '/api/a/w/w1/pages': () => json(200, { ...pages, texts: { 'inv.dyn.greetAnon': 'Hello friend' } }) });
    renderAt('/admin/w1/wedding/pages');
    expect(await screen.findByDisplayValue('Hello friend')).toBeInTheDocument();
    expect(screen.getAllByText(/sentences · 1 changed$/)).toHaveLength(2); // the page's total and its section's
    expect(screen.getByText(/^Was: /)).toBeInTheDocument(); // the original shows only once changed
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByDisplayValue('Hello friend')).toBeNull();
  });
});

describe('SMS messages tab', () => {
  const camp = (over: Record<string, unknown>) => ({
    key: 'k', body: 'Hi {first}', mode: 'auto', enabled: true, trigger: 'invitation_created', audience: { all: true }, audienceLabel: 'Everyone with a mobile',
    excluded: [], custom: false, version: 2, count: 3, slots: [], ...over,
  });
  const texts = {
    live: true, sender: '+61400000999', paused: false, adminMobile: '+61400000001', timezone: 'Australia/Sydney', quiet: { start: 8, end: 20 },
    events: [{ key: 'wedding', name: 'The wedding' }],
    audiences: [{ key: '{"all":true}', label: 'Everyone with a mobile', audience: { all: true } }],
    presets: [],
    people: [{ id: 'g1', name: 'Robin Hart', phone: true, optOut: false }, { id: 'g2', name: 'Jo Banks', phone: false, optOut: false }],
    campaigns: [
      camp({ id: 'c1', name: 'Invitation' }),
      camp({ id: 'c2', name: 'Reminder', mode: 'dates', trigger: null, slots: [{ id: 's1', sendAt: '2027-06-18T00:00:00.000Z', status: 'pending', error: null }] }),
    ],
    inbox: [{ id: 'i1', at: '2026-10-02T08:00:00.000Z', name: 'Robin Hart', body: 'Yes!', action: 'Marked attending', handled: true }],
    history: [],
  };
  const estimate = { count: 1, ids: ['g1'], parts: 1, costCents: 2, sample: 'Hi Robin', quiet: false };

  it('shows autopilot count, the next send and replies', async () => {
    mockApi({ '/api/a/w/w1/texts': () => json(200, texts) });
    renderAt('/admin/w1/wedding/texts');
    expect(await screen.findByRole('heading', { name: '2 texts sending themselves' })).toBeInTheDocument();
    expect(screen.getByText(/Next: Reminder, 18 Jun/)).toBeInTheDocument();
    expect(screen.getByText('“Yes!”')).toBeInTheDocument();
    expect(screen.getByText('Marked attending')).toBeInTheDocument();
  });

  it("groups messages by stage; + Add a reminder creates one for this event's guests still to reply", async () => {
    let created: { name: string; audience: unknown; body?: string } | null = null;
    const withReplyGroup = { ...texts, audiences: [...texts.audiences, { key: 'r', label: 'Still to reply', audience: { awaitingAny: true, invitedBefore: true } }] };
    mockApi({
      '/api/a/w/w1/texts': (init) => {
        if (init?.method === 'POST') {
          created = JSON.parse(String(init.body));
          return json(200, { id: 'c9' });
        }
        return json(200, withReplyGroup);
      },
      '/api/a/w/w1/texts/c9/estimate': () => json(200, estimate),
    });
    renderAt('/admin/w1/wedding/texts');
    expect(await screen.findByRole('heading', { name: 'Invitations & reminders' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Add a reminder' }));
    // Inside the wedding's section: a reminder for the wedding's guests still to reply.
    await waitFor(() => expect(created).toMatchObject({ name: 'Reminder 1 · The wedding', audience: { awaitingAny: true, invitedBefore: true, invitedTo: 'wedding' } }));
    expect(created!.body).toMatch(/{link}/);
  });

  it('the autopilot switch saves with the version', async () => {
    let patch: { body: unknown; ifMatch: string | null } | null = null;
    mockApi({
      '/api/a/w/w1/texts': () => json(200, texts),
      '/api/a/w/w1/texts/c1': (init) => {
        patch = { body: JSON.parse(String(init!.body)), ifMatch: new Headers(init!.headers).get('If-Match') };
        return json(200, { ok: true, version: 3 });
      },
    });
    renderAt('/admin/w1/wedding/texts');
    await userEvent.click(await screen.findByRole('switch', { name: 'Autopilot: Invitation' }));
    await waitFor(() => expect(patch).toEqual({ body: { enabled: false }, ifMatch: '2' }));
  });

  it('opening a message shows the live phone preview; Send now needs a second tap', async () => {
    const calls = mockApi({
      '/api/a/w/w1/texts': () => json(200, texts),
      '/api/a/w/w1/texts/c1/estimate': () => json(200, estimate),
      '/api/a/w/w1/texts/c1/send': () => json(200, { queued: 1, sent: 1, failed: 0 }),
    });
    renderAt('/admin/w1/wedding/texts');
    await userEvent.click(await screen.findByRole('button', { name: /^When invited/ }));
    expect(await screen.findByText('Hi Robin')).toBeInTheDocument();
    expect(screen.getByText('About $0.02')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send now' }));
    expect(calls.some((c) => c.path.endsWith('/send'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Tap again to send to 1 now' }));
    await waitFor(() => expect(calls.some((c) => c.path === '/api/a/w/w1/texts/c1/send')).toBe(true));
    expect(await screen.findByText('Sent to 1 guest')).toBeInTheDocument();
  });
});

describe('SMS setup tab', () => {
  const settings = {
    version: 7, live: true, sender: '0400 000 999', adminMobile: '0400 000 001', paused: false, dailyCap: 500, quietStart: 8, quietEnd: 20,
    optOutFooter: 'Reply STOP to opt out', replies: { yes: 'Yay {first}', no: 'Sad {first}', multi: 'Both {first}' }, rateX100: 176, timezone: 'Australia/Sydney',
    plan: [{ name: 'Invitation', detail: '20 guests · 40 credits', costCents: 70, auto: true }], planTotalCents: 70,
  };

  it('shows live status and cost; Pause all texts saves straight away with the version', async () => {
    let put: unknown;
    mockApi({
      '/api/a/w/w1/settings': (init) => {
        if (init?.method === 'PUT') {
          put = { body: JSON.parse(String(init.body)), v: new Headers(init.headers).get('If-Match') };
          return json(200, { ...settings, version: 8, paused: true });
        }
        return json(200, settings);
      },
    });
    renderAt('/admin/w1/account/texts');
    expect(await screen.findByText('Texts are live')).toBeInTheDocument();
    expect(screen.getAllByText('$0.70').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Pause all texts' }));
    await waitFor(() => expect(put).toEqual({ body: { paused: true }, v: '7' }));
    expect(await screen.findByText('All texts are paused')).toBeInTheDocument();
  });

  it('other edits wait for Save, and only changed fields are sent', async () => {
    let body: unknown;
    mockApi({
      '/api/a/w/w1/settings': (init) => {
        if (init?.method === 'PUT') body = JSON.parse(String(init.body));
        return json(200, settings);
      },
    });
    renderAt('/admin/w1/account/texts');
    const yes = await screen.findByLabelText('When they reply YES');
    await userEvent.clear(yes);
    await userEvent.type(yes, 'Hooray');
    expect(body).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(body).toEqual({ replies: { yes: 'Hooray' } }));
  });
});

describe('seating tab', () => {
  const T1 = '11111111-1111-4111-8111-111111111111';
  const seating = {
    version: 4, published: null, event: { key: 'wedding', name: 'The wedding' }, events: [{ key: 'wedding', name: 'The wedding' }], aspect: '4 / 3', planImg: '',
    tables: [{ id: T1, name: '1', shape: 'round', dir: 'h', len: 40, x: 30, y: 30, seats: 4 }],
    areas: [{ label: 'Dance floor', x: 50, y: 50, w: 20, h: 15 }],
    people: [
      { id: 'p1', invitationId: 'g1', name: 'Robin Hart', party: '', diet: 'Nut allergy', meal: { e: '', m: '', d: '' }, tableId: T1, coming: true },
      { id: 'p2', invitationId: 'g1', name: 'Sam Hart', party: '', diet: '', meal: { e: '', m: '', d: '' }, tableId: null, coming: true },
      { id: 'p3', invitationId: 'g2', name: 'Jo Banks', party: '', diet: '', meal: { e: '', m: '', d: '' }, tableId: null, coming: false },
    ],
  };

  it('shows who is seated; tapping a table then a guest seats them; Save sends it with the version', async () => {
    let saved: { body: { seats: Record<string, string | null> }; v: string | null } | null = null;
    mockApi({
      '/api/a/w/w1/seating': (init) => {
        if (init?.method === 'PUT') {
          saved = { body: JSON.parse(String(init.body)), v: new Headers(init.headers).get('If-Match') };
          return json(200, { ...seating, version: 5, people: seating.people.map((p) => (p.id === 'p2' ? { ...p, tableId: T1 } : p)) });
        }
        return json(200, seating);
      },
    });
    renderAt('/admin/w1/wedding/seating');
    expect(await screen.findByRole('heading', { name: '1 of 3 seated' })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Table 1, 1 of 4' }));
    expect(screen.getByText('Nut allergy')).toBeInTheDocument(); // who sits there, with their diet
    await userEvent.click(screen.getByRole('button', { name: 'Sam Hart' }));
    expect(screen.getByRole('heading', { name: '2 of 3 seated' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save seating' }));
    await waitFor(() => expect(saved?.v).toBe('4'));
    expect(saved!.body.seats).toEqual({ p1: T1, p2: T1, p3: null });
    expect(await screen.findByText('Saved. Publish when you want guests to see it.')).toBeInTheDocument();
  });

  it('Auto-seat seats only guests who said yes, keeping invitations together', async () => {
    mockApi({ '/api/a/w/w1/seating': () => json(200, seating) });
    renderAt('/admin/w1/wedding/seating');
    await userEvent.click(await screen.findByRole('button', { name: 'Auto-seat the rest' }));
    expect(screen.getByRole('heading', { name: '2 of 3 seated' })).toBeInTheDocument(); // Jo hasn't replied: not seated
    expect(screen.getByText('Waiting for a reply (1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jo Banks' })).toBeNull(); // can't be seated until she says yes
  });

  it('preset rules are on, can be turned off (saved), and auto-seat keeps people kept apart at different tables', async () => {
    let saved: unknown = null;
    const T2 = '22222222-2222-4222-8222-222222222222';
    const two = { ...seating, tables: [...seating.tables, { ...seating.tables[0]!, id: T2, name: '2', x: 60 }], people: seating.people.map((p) => ({ ...p, tableId: null, coming: true, invitationId: p.id })) };
    mockApi({
      '/api/a/w/w1/seating': () => json(200, two),
      '/api/a/w/w1/planner/doc/seat-rules/wedding': (init) => {
        if (init?.method === 'PUT') {
          saved = JSON.parse(String(init.body));
          return json(200, { data: saved, version: 2 });
        }
        return json(200, { data: { pairs: [{ a: 'p1', b: 'p2', kind: 'apart' }] }, version: 1 });
      },
    });
    renderAt('/admin/w1/wedding/seating');
    await userEvent.click(await screen.findByRole('button', { name: /^The rules \(4 on, 1 of your own\)/ }));
    const invite = screen.getByRole('checkbox', { name: /People invited together sit together/ });
    expect(invite).toBeChecked();
    await waitFor(() => expect(invite).toBeEnabled());
    await userEvent.click(screen.getByRole('checkbox', { name: /Wedding party at the head table/ }));
    await waitFor(() => expect(saved).toMatchObject({ presets: { invite: true, head: false }, pairs: [{ a: 'p1', b: 'p2', kind: 'apart' }] }));
    await userEvent.click(screen.getByRole('button', { name: 'Auto-seat the rest' }));
    expect(screen.getByRole('heading', { name: '3 of 3 seated' })).toBeInTheDocument();
    expect(screen.getByText('All good ✓')).toBeInTheDocument(); // Robin and Sam ended up apart
  });

  it('unsaved seating: leaving asks first, and staying keeps the changes', async () => {
    mockApi({ '/api/a/w/w1/seating': () => json(200, seating) });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderAt('/admin/w1/wedding/seating');
    await userEvent.click(await screen.findByRole('button', { name: 'Auto-seat the rest' }));
    await userEvent.click(screen.getByRole('link', { name: 'Guest list' }));
    expect(ask).toHaveBeenCalledWith('You have seating changes that are not saved. Leave without saving them?');
    expect(location).toBe('/admin/w1/wedding/seating');
    expect(screen.getByRole('heading', { name: '2 of 3 seated' })).toBeInTheDocument();
    ask.mockReturnValue(true);
    await userEvent.click(screen.getByRole('link', { name: 'Guest list' }));
    await waitFor(() => expect(location).toBe('/admin/w1/wedding/guests'));
    ask.mockRestore();
  });

  it('undo and redo every change', async () => {
    mockApi({ '/api/a/w/w1/seating': () => json(200, seating) });
    renderAt('/admin/w1/wedding/seating');
    await userEvent.click(await screen.findByRole('button', { name: 'Auto-seat the rest' }));
    expect(screen.getByRole('heading', { name: '2 of 3 seated' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('heading', { name: '1 of 3 seated' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getByRole('heading', { name: '2 of 3 seated' })).toBeInTheDocument();
  });

  it('the table type menu changes the selected table (and its usual seats); Save sends every table', async () => {
    let body: { tables: { id: string; shape: string; seats: number }[] } | null = null;
    mockApi({
      '/api/a/w/w1/seating': (init) => {
        if (init?.method === 'PUT') body = JSON.parse(String(init.body));
        return json(200, seating);
      },
    });
    renderAt('/admin/w1/wedding/seating');
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Table 1, 1 of 4' }));
    await userEvent.selectOptions(screen.getByLabelText('Table 1 type'), 'long');
    await userEvent.click(screen.getByRole('button', { name: 'Save seating' }));
    await waitFor(() => expect(body?.tables[0]).toMatchObject({ id: T1, shape: 'long', seats: 4 })); // 4 was set by hand, so kept
  });
});

describe('photos tab', () => {
  it('shows the album with who took each photo, and filters by guest', async () => {
    const items = [
      { id: 'a1', by: 'Ivy', at: '2026-10-01T00:00:00.000Z', bytes: 10, type: 'image/jpeg', url: '/api/a/w/w1/photos/a1' },
      { id: 'a2', by: 'Robin', at: '2026-10-01T00:00:00.000Z', bytes: 10, type: 'image/jpeg', url: '/api/a/w/w1/photos/a2' },
      { id: 'a3', by: 'Ivy', at: '2026-10-01T00:00:00.000Z', bytes: 10, type: 'image/jpeg', url: '/api/a/w/w1/photos/a3' },
    ];
    mockApi({ '/api/a/w/w1/photos': () => json(200, { enabled: true, items }) });
    renderAt('/admin/w1/wedding/photos');
    expect(await screen.findByRole('heading', { name: '3 photos from 2 guests' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Robin · 1' }));
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Photo by Robin');
  });

  it('says how to switch storage on when it is off', async () => {
    mockApi({ '/api/a/w/w1/photos': () => json(200, { enabled: false, items: [] }) });
    renderAt('/admin/w1/wedding/photos');
    expect(await screen.findByText("Guests can't add photos yet.")).toBeInTheDocument();
  });
});

describe('seating publish', () => {
  const T1 = '11111111-1111-4111-8111-111111111111';
  const base = {
    version: 4, event: { key: 'wedding', name: 'The wedding' }, events: [{ key: 'wedding', name: 'The wedding' }], aspect: '4 / 3', planImg: '',
    tables: [{ id: T1, name: '1', shape: 'round', dir: 'h', len: 40, x: 30, y: 30, seats: 4 }], areas: [],
    people: [{ id: 'p1', invitationId: 'g1', name: 'Robin Hart', party: '', diet: '', meal: { e: '', m: '', d: '' }, tableId: T1, coming: true }],
  };

  it('not published: says so, and Publish sends the version; afterwards it reads Published', async () => {
    let v: string | null = null;
    mockApi({
      '/api/a/w/w1/seating': () => json(200, { ...base, published: null }),
      '/api/a/w/w1/seating/publish': (init) => {
        v = new Headers(init!.headers).get('If-Match');
        return json(200, { ...base, version: 5, published: { at: '2026-10-19T05:00:00.000Z', changes: 0 } });
      },
    });
    renderAt('/admin/w1/wedding/seating');
    expect(await screen.findByText(/Not published yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish to guests' }));
    await waitFor(() => expect(v).toBe('4'));
    expect(await screen.findByRole('button', { name: 'Published' })).toBeDisabled();
    expect(screen.getByText(/Guests see exactly this plan/)).toBeInTheDocument();
  });

  it('saved changes since publishing are counted; publishing waits for unsaved edits to be saved', async () => {
    mockApi({ '/api/a/w/w1/seating': () => json(200, { ...base, published: { at: '2026-10-19T05:00:00.000Z', changes: 2 } }) });
    renderAt('/admin/w1/wedding/seating');
    expect(await screen.findByText(/2 saved changes are not live yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish 2 changes' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Line up tables' })); // an unsaved edit
    expect(screen.getByRole('button', { name: 'Publish 2 changes' })).toBeDisabled();
  });
});

describe('send without SMS', () => {
  it('steps through guests texts cannot reach, with their personal link, and remembers who is done', async () => {
    localStorage.clear();
    const links = Object.fromEntries(guests.map((g) => [g.id, `https://example.com/w/alex-and-blair/?g=${g.id}`]));
    mockApi({ '/api/a/w/w1/guests': () => json(200, { events, guests, links }) });
    const opened: string[] = [];
    vi.spyOn(window, 'open').mockImplementation((u) => (opened.push(String(u)), null));
    renderAt('/admin/w1/wedding/guests?show=all');
    await userEvent.click(await screen.findByRole('button', { name: 'Share invitation links yourself' }));
    expect(screen.getByText(/1 guest can't get texts/)).toBeInTheDocument();
    expect(screen.getByText(/g=g2/)).toBeInTheDocument(); // Jo Banks has no mobile
    await userEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(opened[0]).toMatch(/^https:\/\/wa\.me\/\?text=.*g%3Dg2/);
    await userEvent.click(screen.getByRole('button', { name: 'Sent, next guest' }));
    expect(screen.getByText('All done. Everyone has their invitation.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('wp-manual-sent-w1')!)).toEqual(['g2']);
  });
});
