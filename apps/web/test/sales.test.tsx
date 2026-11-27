import { render, screen, within } from '@testing-library/react';
import { SAMPLE_INVITE } from '../src/sales/sample';
import { MUSIC_BOX } from '../src/guest/musicBox';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { PLAN_INFO, PLAN_NAME, PLAN_PRICE_AUD, TEXT_COST_NOTE, TEXT_CREDIT_ALL_IN } from '@wp/shared';
import { CLOSED_STILL } from '../src/sales/PhoneFrame';
import { SalesPage } from '../src/sales/SalesPage';
import { DemoPage } from '../src/sales/Demo';

const page = () =>
  render(
    <MemoryRouter>
      <SalesPage />
    </MemoryRouter>,
  );

describe('front page', () => {
  it('leads with one line and one call to action, then the invitations opening (no second phone)', () => {
    page();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The invitation they’ll never forget.');
    // Nothing over the hero's phone (send-10): no "guest list updated" note, no text bubbles.
    expect(screen.queryByText(/guest list updated/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Start your wedding' })).toHaveAttribute('href', '#start');
    expect(screen.getByRole('heading', { name: 'Opened like a gift.' })).toBeInTheDocument();
    // Condensed: the founders' section is folded into the comparison.
    expect(screen.getByText(/The founders, who built it for their own wedding/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'And everything after the yes.' })).toBeInTheDocument();
    // Paper or phone: the same invitation two ways, and the sample one tap away.
    expect(screen.getByRole('heading', { name: /Every bit as beautiful/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /letterpress invitation/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the sample invitation' })).toHaveAttribute('href', '/demo');
    // No vendors on the front page (launch simplification): only the way for a vendor to list themselves.
    expect(screen.queryAllByRole('link', { name: 'Vendor directory' })).toHaveLength(0);
  });

  it('never offers a free plan or says texts are included', () => {
    const { container } = page();
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/start free|free plan|free to start/i);
    expect(text).not.toMatch(/texts? (are )?included/i);
    // No vendor links on the sales page (send-10): the directory and "List your business" are gone from it.
    expect(screen.queryByText(/List your business/)).toBeNull();
    expect(container.querySelector('a[href*="vendor"]')).toBeNull();
    // The free things that are still true stay.
    expect(screen.getByText('Send from your own phone or email, free')).toBeInTheDocument();
  });

  it('shows texts at cost, never inside the plan', () => {
    const { container } = page();
    expect(TEXT_CREDIT_ALL_IN).toBe(8);
    expect(screen.getByText('Text messages, if you want them, at cost.')).toBeInTheDocument();
    expect(container.textContent).toContain(TEXT_COST_NOTE);
  });

  it('one plan, one price (the app’s own), one button: no tiers, no comparison table, no urgency', () => {
    const { container } = page();
    const card = screen.getByRole('article', { name: `${PLAN_NAME}, ${PLAN_PRICE_AUD} once` });
    expect(PLAN_INFO.complete.price).toBe('$87');
    expect(PLAN_PRICE_AUD).toBe('A$87');
    expect(within(card).getByText('A$87')).toBeInTheDocument();
    expect(within(card).getByText('As many guests as you like')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '#start');
    expect(screen.queryByRole('table')).toBeNull();
    const pricing = container.querySelector('#pricing')!.textContent ?? '';
    expect(pricing).not.toMatch(/Essentials|Deluxe|Most popular|\$88|\$98|\$50\b|\$80\b/);
    // One price everywhere, from the price config: no "From $50", no plan cards, no extra-event price.
    expect(container.textContent).not.toMatch(/Essentials|Deluxe|\$88|\$98|\$50\b|\$39|From \$|From A\$/);
    expect((container.textContent ?? '').match(/A\$87/g)!.length).toBeGreaterThanOrEqual(4);
    expect(container.textContent).not.toMatch(/(^|[^A])\$87/);
  });

  it('keeps the questions short', () => {
    page();
    const faq = screen.getByRole('region', { name: 'Questions' });
    const ours = within(faq).getByRole('group', { name: /^About / });
    const invites = within(faq).getByRole('group', { name: 'Wedding invitations, answered' });
    expect(ours.querySelectorAll('details').length).toBeLessThanOrEqual(6);
    expect(invites.querySelectorAll('details').length).toBeLessThanOrEqual(6);
    expect(within(ours).getByText('Is it a subscription?')).toBeInTheDocument();
    expect(within(invites).getByText('When should we send our wedding invitations?')).toBeInTheDocument();
  });

  it('compares itself without naming anyone', () => {
    page();
    const list = screen.getByRole('list', { name: 'How we compare' });
    expect(within(list).getAllByRole('listitem').length).toBe(5);
    expect(within(list).getByText(/Free, as often as you like/)).toBeInTheDocument();
  });

  it('leads with the real envelope and wax seal, closed until a tap, in the one phone frame', async () => {
    const { container } = page();
    // The live invitation loads just after the page (its cover paints first): sales mode, never opening by itself.
    const phone = await screen.findByTitle(/^Sample invitation for/);
    expect(phone.tagName).toBe('IFRAME');
    expect(phone).toHaveAttribute('src', '/demo?embed=1&sales=1');
    // Every closed-envelope preview is the same still of the sample (H&T, Harriet & Theo), in the same frame.
    const stills = screen.getAllByRole('img', { name: /^The sample invitation, closed/ });
    expect(stills.length).toBeGreaterThanOrEqual(2);
    for (const s of stills) expect(s).toHaveAttribute('src', CLOSED_STILL);
    const frames = [...container.querySelectorAll<HTMLElement>('[data-phone-frame]')];
    expect(frames.length).toBeGreaterThanOrEqual(4);
    expect(new Set(frames.map((f) => f.style.boxShadow)).size).toBe(1);
    // The colour tiles: the invitation's own wax seal and envelope papers.
    const envelopes = screen.getAllByRole('img', { name: /^A sealed envelope/ });
    for (const e of envelopes) expect(e).toHaveTextContent('H&T');
    // The sample guests' names are never on the sales page (they're inside the opened card only).
    expect(container.textContent).not.toMatch(/Emma/);
    // No paper still lifes (ribbons, eucalyptus) we don't provide.
    expect(screen.queryByRole('img', { name: /ribbon|eucalyptus/i })).toBeNull();
    expect(screen.getByRole('link', { name: 'See every design' })).toHaveAttribute('href', '/designs');
  });

  it('shows how sending works, step by step, with text credits bought separately', () => {
    page();
    const steps = screen.getByRole('heading', { name: 'From your guest list to their yes.' }).closest('section')!;
    expect(within(steps).getAllByRole('listitem')).toHaveLength(6);
    expect(within(steps).getByText(/not included in the plan: at cost/)).toBeInTheDocument();
    expect(within(steps).getByText(/Free from your own phone/)).toBeInTheDocument();
  });

  it('says clearly it is Australian owned and operated', () => {
    page();
    expect(screen.getByTestId('aussie-badge')).toHaveTextContent('Australian owned and operated');
  });
});

describe('sample invitation (/demo)', () => {
  beforeEach(() => localStorage.clear());

  it('is the real guest invitation with made-up names and venue, and needs no server', async () => {
    render(
      <MemoryRouter initialEntries={['/demo']}>
        <DemoPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Dear Emma & Tom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open invitation' })).toBeInTheDocument();
    expect(screen.getAllByText('Larkwood Estate').length).toBeGreaterThan(0);
    expect(screen.queryByText('[Ceremony venue]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Make your own' })).toHaveAttribute('href', '/#start');
  });

  it('answers the usual questions, shows where dietary needs go, and plays our own music', async () => {
    render(
      <MemoryRouter initialEntries={['/demo']}>
        <DemoPage />
      </MemoryRouter>,
    );
    await screen.findByText('Dear Emma & Tom');
    // The questions section is on, with the couple's own answers (no placeholders).
    expect(screen.getByText('Can I tell you about my dietary needs?')).toBeInTheDocument();
    expect(screen.getByText('What should I wear?')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\[your mobile\]|\[the venue/);
    // A dietary need already noted, so the reply shows where it goes.
    expect(SAMPLE_INVITE.invitation!.people.find((p) => p.name === 'Tom')!.diet).toBe('Vegetarian');
    // Our own music, never someone else's recording.
    expect(SAMPLE_INVITE.content.audioUrl).toBe(MUSIC_BOX);
  });

  it('never shows a [placeholder]: every one in the starting wording has a Harriet & Theo value (YL-016)', async () => {
    // The wording itself: the invitation, the night-before guide and the photo page.
    for (const [k, v] of Object.entries(SAMPLE_INVITE.texts)) expect(v, k).not.toMatch(/\[|\]/);
    const { sampleGuide, samplePhotos } = await import('../src/sales/sampleGuide');
    for (const [k, v] of Object.entries({ ...sampleGuide().texts, ...samplePhotos().texts })) expect(v, k).not.toMatch(/\[|\]/);
    // And what a guest reads on the page.
    render(
      <MemoryRouter initialEntries={['/demo']}>
        <DemoPage />
      </MemoryRouter>,
    );
    await screen.findByText('Dear Emma & Tom');
    expect(document.body.textContent).not.toContain('[');
  });
});
