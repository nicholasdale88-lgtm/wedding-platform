import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(within(nav).getByRole('link', { name: /^SMS\s*Not set up/ })).toBeInTheDocument(); // messages and setup in one tab
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

  it('lists every guest page and previews the real page in preview mode', async () => {
    mockApi({ '/api/a/w/w1/pages': () => json(200, pages) });
    renderAt('/admin/w1/pages');
    expect(await screen.findByRole('heading', { name: 'What your guests see' })).toBeInTheDocument();
    for (const name of ['Invitation', 'Night before: Wedding', 'Night before: Recovery brunch', 'Photo page']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByTitle('Guest page preview')).toHaveAttribute('src', '/w/alex-and-blair/?preview=1');
    await userEvent.click(screen.getByRole('button', { name: 'Night before: Recovery brunch' }));
    // Only guests invited to the brunch can be previewed for its guide.
    expect(screen.getByTitle('Guest page preview')).toHaveAttribute('src', `/w/alex-and-blair/tomorrow/brunch?g=${'T'.repeat(22)}&preview=1`);
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
    renderAt('/admin/w1/pages');
    const field = await screen.findByLabelText('Reply-by line');
    await userEvent.clear(field);
    await userEvent.type(field, 'Reply by 2 May');
    await waitFor(() => expect(calls.filter((c) => c.init?.method === 'PUT')).toHaveLength(1), { timeout: 3000 });
    expect(ifMatch).toBe('5');
    expect(body).toEqual({ invitation: { rsvpBy: 'Reply by 2 May', seal: 'Sandstone' } });
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('every word: shows the original, marks changes, and Reset brings it back', async () => {
    mockApi({ '/api/a/w/w1/pages': () => json(200, { ...pages, texts: { 'inv.dyn.greetAnon': 'Hello friend' } }) });
    renderAt('/admin/w1/pages');
    expect(await screen.findByDisplayValue('Hello friend')).toBeInTheDocument(); // changes listed first
    expect(screen.getByText('1 changed', { exact: false })).toBeInTheDocument();
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
    renderAt('/admin/w1/texts');
    expect(await screen.findByRole('heading', { name: '2 messages on autopilot' })).toBeInTheDocument();
    expect(screen.getByText(/Next: Reminder, 18 Jun/)).toBeInTheDocument();
    expect(screen.getByText('“Yes!”')).toBeInTheDocument();
    expect(screen.getByText('Marked attending')).toBeInTheDocument();
  });

  it('groups messages by stage; + Add a reminder creates one for everyone still to reply', async () => {
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
    renderAt('/admin/w1/texts');
    expect(await screen.findByRole('heading', { name: 'Invitations & reminders' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '+ Add a reminder' }));
    await waitFor(() => expect(created).toMatchObject({ name: 'Reminder 1', audience: { awaitingAny: true, invitedBefore: true } }));
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
    renderAt('/admin/w1/texts');
    await userEvent.click(await screen.findByRole('switch', { name: 'Autopilot: Invitation' }));
    await waitFor(() => expect(patch).toEqual({ body: { enabled: false }, ifMatch: '2' }));
  });

  it('opening a message shows the live phone preview; Send now needs a second tap', async () => {
    const calls = mockApi({
      '/api/a/w/w1/texts': () => json(200, texts),
      '/api/a/w/w1/texts/c1/estimate': () => json(200, estimate),
      '/api/a/w/w1/texts/c1/send': () => json(200, { queued: 1, sent: 1, failed: 0 }),
    });
    renderAt('/admin/w1/texts');
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
    renderAt('/admin/w1/settings');
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
    renderAt('/admin/w1/settings');
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
    renderAt('/admin/w1/seating');
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
    renderAt('/admin/w1/seating');
    await userEvent.click(await screen.findByRole('button', { name: 'Auto-seat the rest' }));
    expect(screen.getByRole('heading', { name: '2 of 3 seated' })).toBeInTheDocument(); // Jo hasn't replied: not seated
    expect(screen.getByText('Waiting for a reply (1)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jo Banks' })).toBeNull(); // can't be seated until she says yes
  });

  it('undo and redo every change', async () => {
    mockApi({ '/api/a/w/w1/seating': () => json(200, seating) });
    renderAt('/admin/w1/seating');
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
    renderAt('/admin/w1/seating');
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
    renderAt('/admin/w1/photos');
    expect(await screen.findByRole('heading', { name: '3 photos from 2 guests' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Robin · 1' }));
    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Photo by Robin');
  });

  it('says how to switch storage on when it is off', async () => {
    mockApi({ '/api/a/w/w1/photos': () => json(200, { enabled: false, items: [] }) });
    renderAt('/admin/w1/photos');
    expect(await screen.findByText("Photo storage isn't switched on yet.")).toBeInTheDocument();
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
    renderAt('/admin/w1/seating');
    expect(await screen.findByText(/Not published yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish to guests' }));
    await waitFor(() => expect(v).toBe('4'));
    expect(await screen.findByRole('button', { name: 'Published' })).toBeDisabled();
    expect(screen.getByText(/Guests see exactly this plan/)).toBeInTheDocument();
  });

  it('saved changes since publishing are counted; publishing waits for unsaved edits to be saved', async () => {
    mockApi({ '/api/a/w/w1/seating': () => json(200, { ...base, published: { at: '2026-10-19T05:00:00.000Z', changes: 2 } }) });
    renderAt('/admin/w1/seating');
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
    renderAt('/admin/w1/guests');
    await userEvent.click(await screen.findByRole('button', { name: 'Send without SMS' }));
    expect(screen.getByText(/1 guest can't get texts/)).toBeInTheDocument();
    expect(screen.getByText(/g=g2/)).toBeInTheDocument(); // Jo Banks has no mobile
    await userEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(opened[0]).toMatch(/^https:\/\/wa\.me\/\?text=.*g%3Dg2/);
    await userEvent.click(screen.getByRole('button', { name: 'Sent, next guest' }));
    expect(screen.getByText('All done. Everyone has their invitation.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('wp-manual-sent-w1')!)).toEqual(['g2']);
  });
});
