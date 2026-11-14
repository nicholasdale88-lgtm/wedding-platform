import { companyHelpFor, STAFF_CAN, STAFF_PERMS } from '@wp/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyHelp } from '../src/company/CompanyHelp';

/** Company portal → Help: loaded for staff from the API, searchable, with walkthroughs and a way to the page. */
describe('Company help', () => {
  afterEach(() => vi.unstubAllGlobals());
  const serve = (perms: readonly string[]) => {
    const fetch = vi.fn(async (url: string) =>
      url === '/api/a/company/help' ? new Response(JSON.stringify(companyHelpFor(perms)), { headers: { 'content-type': 'application/json' } }) : new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('speechSynthesis', undefined);
    return fetch;
  };
  const show = (onGo = vi.fn(), from?: string) => {
    render(
      <MemoryRouter>
        <CompanyHelp from={from} fromLabel="Money & tax" onGo={onGo} />
      </MemoryRouter>,
    );
    return onGo;
  };

  it('shows the guides, answers a search, and takes you to the page', async () => {
    const fetch = serve(STAFF_PERMS);
    const onGo = show();
    expect(await screen.findByRole('button', { name: 'Play the tour' })).toBeTruthy();
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe('/api/a/company/help');
    expect(screen.getByRole('region', { name: 'Money' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('What do you want to do?'), { target: { value: 'refund a couple' } });
    const answers = screen.getByRole('region', { name: 'Answers' });
    expect(answers.textContent).toMatch(/Finding a couple and changing their plan/);
    fireEvent.click(screen.getAllByRole('button', { name: 'Take me there' })[0]!);
    expect(onGo).toHaveBeenCalledWith('weddings');
  });

  it('plays a guide’s walkthrough in the portal', async () => {
    serve(STAFF_PERMS);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Watch: Setting up a Grok bot' }));
    expect(screen.getByRole('dialog', { name: 'Walkthrough: Setting up a Grok bot' })).toBeTruthy();
  });

  it('shows the page you came from first, and only your role’s guides', async () => {
    serve(STAFF_CAN.support);
    show(vi.fn(), 'weddings');
    expect(await screen.findByRole('region', { name: 'For the page you were on' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Money' })).toBeNull();
    expect(screen.queryByText('Setting up a Grok bot')).toBeNull();
  });
});
