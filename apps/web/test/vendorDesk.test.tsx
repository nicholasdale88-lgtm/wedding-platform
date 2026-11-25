import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyListing, VendorCouple } from '../src/lib/api';
import { deskDay, deskMonths, deskToday, EnquiryPipeline, listingStrength, VendorCalendar, VendorOverview } from '../src/sales/VendorDesk';

const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const data: MyListing = {
  partner: { code: 'BLOOM10', percentOff: 10, uses: 2 },
  listing: { slug: 's', name: 'Bloom Co', category: 'florist', region: 'sydney', regions: [], about: 'Short', priceFrom: 0, photo: '', booked: 1, contactName: 'Jess Lee', phone: '', website: '', instagram: '', photos: [], packages: [], email: 'a@example.com', hidden: false },
  enquiries: [
    { id: 'e1', name: 'Grace Wu', email: 'g@example.com', phone: '', date: deskDay(soon(20)), guests: 90, message: 'Free on our date?', read: false, at: soon(-1), stage: 'new', note: '' },
    { id: 'e2', name: 'Tom Reid', email: 't@example.com', phone: '', date: deskDay(soon(90)), guests: 60, message: 'Bouquets only', read: true, at: soon(-5), stage: 'quoted', note: 'Sent $950' },
  ],
  busy: [],
};
const couples: VendorCouple[] = [{ id: 'w1', couple: 'Ella & Kai', date: soon(20), venue: 'The Barn', coming: 80, invited: 90, status: 'booked', via: '', since: soon(-30), unread: 1, last: { body: 'Hi!', at: soon(-1) }, details: '' }];

describe('the vendor’s desk', () => {
  it('Overview: the next three things first, what’s coming up, and how strong their listing is (folded)', () => {
    const go = vi.fn();
    render(<VendorOverview data={data} couples={couples} unread={1} quotesOpen={0} go={go} />);
    const needs = screen.getByRole('region', { name: 'Next 3 things' });
    expect(within(needs).getAllByRole('button').filter((b) => !/All requests/.test(b.textContent ?? '')).length).toBeLessThanOrEqual(3);
    expect(screen.getByRole('region', { name: 'Your season' }).closest('details')).not.toBeNull();
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

describe('the vendor’s desk runs on Sydney time, not UTC', () => {
  afterEach(() => vi.useRealTimers());

  it('8am AEDT on the 17th is the 17th (UTC is still on the 16th): today, day counts and the calendar month', () => {
    const at = new Date('2026-11-16T21:00:00Z'); // 8:00am AEDT, 17 November
    expect(deskToday(at)).toBe('2026-11-17');
    expect(deskDay('2026-11-17T00:30:00.000Z')).toBe('2026-11-17'); // an 11:30am wedding is that day, not the 16th
    expect(deskDay('2026-11-17')).toBe('2026-11-17');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
    const wedding: VendorCouple = { ...couples[0]!, date: '2026-11-18T00:30:00.000Z', unread: 0 }; // tomorrow 11:30am Sydney
    render(<VendorOverview data={{ ...data, enquiries: [] }} couples={[wedding]} unread={0} quotesOpen={0} go={vi.fn()} />);
    expect(screen.getByText(/Good morning/)).toBeInTheDocument();
    expect(screen.getAllByText(/17 November/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Ella & Kai’s wedding is tomorrow/)).toBeInTheDocument();
  });

  it('8am AEDT on the 1st: the calendar opens on the new month and the season starts there', () => {
    const at = new Date('2026-11-30T21:00:00Z'); // 8:00am AEDT, 1 December
    expect(deskToday(at)).toBe('2026-12-01');
    const months = deskMonths(at);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ key: '2026-12', label: 'Dec' });
    expect(months[1]!.key).toBe('2027-01');
    expect(months[11]!.key).toBe('2027-11');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at);
    render(<VendorCalendar data={{ ...data, enquiries: [] }} couples={[]} onBusy={vi.fn()} />);
    expect(screen.getAllByText('December 2026').length).toBeGreaterThan(0);
  });
});
