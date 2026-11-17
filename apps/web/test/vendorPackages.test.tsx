import type { Listing } from '@wp/shared';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListingPage, packagePrice } from '../src/sales/Directory';

const listing: Listing = {
  slug: 'wildflower-studio',
  name: 'Wildflower Studio',
  category: 'florist',
  region: 'sydney',
  regions: [],
  about: 'Garden-style wedding flowers.',
  priceFrom: 0,
  photo: '',
  booked: 0,
  contactName: 'Jess Lee',
  phone: '',
  website: '',
  instagram: '',
  photos: [],
  packages: [
    { name: 'Ceremony', price: 1200, unit: 'total', includes: ['Bridal bouquet', 'Aisle flowers'], popular: false },
    { name: 'Ceremony and reception', price: 2400, unit: 'total', includes: ['Long-table centrepieces'], popular: true },
    { name: 'Grazing flowers', price: 85, unit: 'per guest', includes: [], popular: false },
  ],
};

const serve = (l: Listing) => {
  const fetch = vi.fn(async (url: string) =>
    url === `/api/directory/v/${l.slug}`
      ? new Response(JSON.stringify(l), { headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ error: { code: 'nope', message: 'Not here' } }), { status: 401, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetch);
};
const show = (slug: string) =>
  render(
    <MemoryRouter initialEntries={[`/vendors/${slug}`]}>
      <Routes>
        <Route path="/vendors/:slug" element={<ListingPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('a vendor’s packages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('prices read the way couples say them', () => {
    expect(packagePrice({ price: 2400, unit: 'total' })).toBe('$2,400');
    expect(packagePrice({ price: 85, unit: 'per guest' })).toBe('$85 per guest');
    expect(packagePrice({ price: 300, unit: 'per hour' })).toBe('$300 per hour');
  });

  it('show on their page as cards, the popular one marked, with what’s included; the enquiry form stays', async () => {
    serve(listing);
    show(listing.slug);
    const section = await screen.findByRole('region', { name: 'Packages' });
    const cards = within(section).getAllByRole('listitem').filter((li) => li.parentElement?.parentElement === section);
    expect(cards).toHaveLength(3);
    expect(within(cards[0]!).getByText('Ceremony')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('$1,200')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Bridal bouquet')).toBeInTheDocument();
    expect(within(cards[0]!).getByText('Aisle flowers')).toBeInTheDocument();
    expect(within(cards[0]!).queryByText('Most popular')).toBeNull();
    expect(within(cards[1]!).getByText('Most popular')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('$2,400')).toBeInTheDocument();
    expect(within(cards[2]!).getByText('$85 per guest')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send enquiry' })).toBeInTheDocument();
  });

  it('nothing shows when they have none', async () => {
    serve({ ...listing, packages: [] });
    show(listing.slug);
    expect(await screen.findByRole('heading', { name: 'Wildflower Studio' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Packages' })).toBeNull();
  });
});
