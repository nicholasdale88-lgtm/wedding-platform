import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MyListing, VendorCouple } from '../src/lib/api';
import { EnquiryPipeline, listingStrength, VendorCalendar, VendorOverview } from '../src/sales/VendorDesk';

const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const data: MyListing = {
  partner: { code: 'BLOOM10', percentOff: 10, uses: 2 },
  listing: { slug: 's', name: 'Bloom Co', category: 'florist', region: 'sydney', regions: [], about: 'Short', priceFrom: 0, photo: '', booked: 1, contactName: 'Jess Lee', phone: '', website: '', instagram: '', photos: [], email: 'a@example.com', hidden: false },
  enquiries: [
    { id: 'e1', name: 'Grace Wu', email: 'g@example.com', phone: '', date: soon(20).slice(0, 10), guests: 90, message: 'Free on our date?', read: false, at: soon(-1), stage: 'new', note: '' },
    { id: 'e2', name: 'Tom Reid', email: 't@example.com', phone: '', date: soon(90).slice(0, 10), guests: 60, message: 'Bouquets only', read: true, at: soon(-5), stage: 'quoted', note: 'Sent $950' },
  ],
  busy: [],
};
const couples: VendorCouple[] = [{ id: 'w1', couple: 'Ella & Kai', date: soon(20), venue: 'The Barn', coming: 80, invited: 90, status: 'booked', via: '', since: soon(-30), unread: 1, last: { body: 'Hi!', at: soon(-1) }, details: '' }];

describe('the vendor’s desk', () => {
  it('Overview: what needs them first, what’s coming up, and how strong their listing is', () => {
    const go = vi.fn();
    render(<VendorOverview data={data} couples={couples} unread={1} quotesOpen={0} go={go} />);
    const needs = screen.getByRole('region', { name: 'Needs you' });
    expect(within(needs).getByText('Ella & Kai wrote to you')).toBeInTheDocument();
    expect(within(needs).getByText('New enquiry from Grace Wu')).toBeInTheDocument();
    expect(within(needs).getByText('Grace Wu’s date clashes')).toBeInTheDocument(); // booked with Ella & Kai that day
    expect(within(screen.getByRole('region', { name: 'Coming up' })).getByText('Ella & Kai')).toBeInTheDocument();
    fireEvent.click(within(needs).getByText('New enquiry from Grace Wu'));
    expect(go).toHaveBeenCalledWith('enquiries');
    expect(listingStrength(data.listing).score).toBeLessThan(50);
  });

  it('Enquiries: filtered by stage, with a clash warning and a first reply written for them', () => {
    render(<EnquiryPipeline data={data} couples={couples} onChanged={async () => {}} />);
    const grace = screen.getByRole('article', { name: 'Enquiry from Grace Wu' });
    expect(within(grace).getByText('You’re booked that day: Ella & Kai')).toBeInTheDocument();
    expect(within(grace).getByRole('link', { name: 'Reply by email' }).getAttribute('href')).toMatch(/already%20booked/);
    expect(within(screen.getByRole('article', { name: 'Enquiry from Tom Reid' })).getByText('You’re free that day')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Quoted/ }));
    expect(screen.queryByRole('article', { name: 'Enquiry from Grace Wu' })).toBeNull();
  });

  it('Calendar: a booked day says who, and a free day can be marked unavailable', async () => {
    const onBusy = vi.fn(async () => {});
    render(<VendorCalendar data={data} couples={couples} onBusy={onBusy} />);
    expect(screen.getByRole('region', { name: 'Calendar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    const free = screen.getAllByRole('button', { pressed: false }).find((b) => /\d{4}$/.test(b.getAttribute('aria-label') ?? ''));
    fireEvent.click(free!);
    fireEvent.click(screen.getByRole('button', { name: 'Mark this day unavailable' }));
    expect(onBusy).toHaveBeenCalledWith([expect.objectContaining({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) })]);
  });
});
