import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThanksPayload } from '../src/guest/invitation/api';
import { ThanksPage } from '../src/guest/thanks/ThanksPage';

const TOKEN = 'T'.repeat(22);
const base: ThanksPayload = {
  wedding: { slug: 'alex-and-sam', name1: 'Alex Smith', name2: 'Sam Jones', monogram: 'A&S', theme: 'Cream & Sage' },
  guest: 'Ella & Tom',
  heading: '',
  message: 'What a day it was.',
  signoff: '',
  photo: '',
  album: false,
  gallery: '',
  addPhotos: true,
};
const show = (d: ThanksPayload) => {
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (u: string) => {
    calls.push(u);
    return new Response(JSON.stringify(d), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  render(
    <MemoryRouter initialEntries={[`/w/alex-and-sam/thanks?g=${TOKEN}`]}>
      <Routes>
        <Route path="/w/:slug/thanks" element={<ThanksPage />} />
      </Routes>
    </MemoryRouter>,
  );
  return calls;
};

describe('the thank-you page', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('their words to each guest; the photos say they’re on their way until they’re ready', async () => {
    const calls = show(base);
    expect(await screen.findByText(/Dear Ella & Tom/)).toHaveTextContent('What a day it was.');
    expect(calls[0]).toBe(`/api/p/alex-and-sam/thanks?g=${TOKEN}`);
    expect(screen.getByRole('heading', { name: 'Thank you' })).toBeInTheDocument();
    expect(screen.getByText(/aren’t ready yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your photos from the day' })).toHaveAttribute('href', `/w/alex-and-sam/photos?g=${TOKEN}`);
  });

  it('once ready: the gallery and everyone’s photos', async () => {
    show({ ...base, album: true, gallery: 'https://example.com/gallery' });
    expect(await screen.findByRole('link', { name: 'See the professional photos' })).toHaveAttribute('href', 'https://example.com/gallery');
    expect(screen.getByRole('link', { name: 'See everyone’s photos' })).toHaveAttribute('href', `/w/alex-and-sam/album?g=${TOKEN}`);
  });
});
