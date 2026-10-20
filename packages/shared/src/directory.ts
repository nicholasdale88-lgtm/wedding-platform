import { z } from 'zod';
import { VENDOR_SEARCH } from './planner';

/**
 * The vendor directory: wedding vendors who sign up and list themselves (free), found by what they do and
 * where they work. Couples browse it on the public site, send an enquiry, or add a vendor to their plan.
 * Regions are the places Australians usually marry; a vendor has a home region and can add the others
 * they travel to.
 */
export interface Region {
  slug: string;
  name: string;
  state: 'NSW' | 'ACT' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT';
  lat: number;
  lon: number;
}

export const REGIONS: Region[] = [
  { slug: 'sydney', name: 'Sydney', state: 'NSW', lat: -33.87, lon: 151.21 },
  { slug: 'central-coast', name: 'Central Coast', state: 'NSW', lat: -33.43, lon: 151.34 },
  { slug: 'hunter-valley', name: 'Hunter Valley', state: 'NSW', lat: -32.78, lon: 151.28 },
  { slug: 'newcastle', name: 'Newcastle & Port Stephens', state: 'NSW', lat: -32.93, lon: 151.78 },
  { slug: 'blue-mountains', name: 'Blue Mountains', state: 'NSW', lat: -33.71, lon: 150.31 },
  { slug: 'southern-highlands', name: 'Southern Highlands', state: 'NSW', lat: -34.48, lon: 150.42 },
  { slug: 'south-coast', name: 'NSW South Coast', state: 'NSW', lat: -34.77, lon: 150.69 },
  { slug: 'byron-bay', name: 'Byron Bay & Northern Rivers', state: 'NSW', lat: -28.64, lon: 153.61 },
  { slug: 'canberra', name: 'Canberra', state: 'ACT', lat: -35.28, lon: 149.13 },
  { slug: 'melbourne', name: 'Melbourne', state: 'VIC', lat: -37.81, lon: 144.96 },
  { slug: 'yarra-valley', name: 'Yarra Valley', state: 'VIC', lat: -37.66, lon: 145.45 },
  { slug: 'mornington', name: 'Mornington Peninsula', state: 'VIC', lat: -38.33, lon: 144.97 },
  { slug: 'geelong', name: 'Geelong & the Great Ocean Road', state: 'VIC', lat: -38.15, lon: 144.36 },
  { slug: 'brisbane', name: 'Brisbane', state: 'QLD', lat: -27.47, lon: 153.03 },
  { slug: 'gold-coast', name: 'Gold Coast', state: 'QLD', lat: -28.02, lon: 153.4 },
  { slug: 'sunshine-coast', name: 'Sunshine Coast', state: 'QLD', lat: -26.65, lon: 153.07 },
  { slug: 'cairns', name: 'Cairns & Port Douglas', state: 'QLD', lat: -16.92, lon: 145.77 },
  { slug: 'adelaide', name: 'Adelaide', state: 'SA', lat: -34.93, lon: 138.6 },
  { slug: 'barossa', name: 'Barossa Valley', state: 'SA', lat: -34.53, lon: 138.95 },
  { slug: 'mclaren-vale', name: 'McLaren Vale', state: 'SA', lat: -35.22, lon: 138.54 },
  { slug: 'perth', name: 'Perth', state: 'WA', lat: -31.95, lon: 115.86 },
  { slug: 'margaret-river', name: 'Margaret River', state: 'WA', lat: -33.95, lon: 115.07 },
  { slug: 'hobart', name: 'Hobart', state: 'TAS', lat: -42.88, lon: 147.33 },
  { slug: 'launceston', name: 'Launceston', state: 'TAS', lat: -41.44, lon: 147.14 },
  { slug: 'darwin', name: 'Darwin', state: 'NT', lat: -12.46, lon: 130.84 },
];
export const regionOf = (slug: string) => REGIONS.find((r) => r.slug === slug);

const region = z.string().refine((s) => !!regionOf(s), 'Choose a region.');
const category = z.string().refine((s) => Object.hasOwn(VENDOR_SEARCH, s), 'Choose what you do.');
const link = z
  .string()
  .trim()
  .max(300)
  .refine((u) => !u || /^https:\/\/[^\s"'<>]+$/i.test(u), 'Links start with https://');

/** What a vendor can change on their listing. */
export const ListingFields = z.object({
  name: z.string().trim().min(2, 'Add your business name.').max(100),
  category,
  region,
  /** Other regions they travel to. */
  regions: z.array(region).max(12).default([]),
  contactName: z.string().trim().max(60).default(''),
  phone: z.string().trim().max(30).default(''),
  website: link.default(''),
  instagram: z
    .string()
    .trim()
    .max(60)
    .regex(/^@?[\w.]*$/, 'Just your Instagram handle, like @yourbusiness')
    .default(''),
  about: z.string().trim().max(2000).default(''),
  /** Prices start from (whole dollars; 0 = not shown). */
  priceFrom: z.number().int().min(0).max(1_000_000).default(0),
  /** Photos by link (from their website or a photo host), up to six. */
  photos: z.array(link.refine((u) => !!u, 'Add a link')).max(6).default([]),
});
export type ListingFields = z.infer<typeof ListingFields>;

/** Joining: the listing, plus the account to sign in with. */
export const ListingJoin = ListingFields.extend({
  email: z.string().trim().toLowerCase().email('Check your email address.').max(200),
  passcode: z.string().max(200),
  /** Left empty by people; filled in by bots. */
  company: z.string().max(200).default(''),
}).strict();

/** A couple's enquiry to a vendor. */
export const Enquiry = z
  .object({
    name: z.string().trim().min(1, 'Add your name.').max(80),
    email: z.string().trim().toLowerCase().email('Check your email address.').max(200),
    phone: z.string().trim().max(30).default(''),
    date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(''),
    guests: z.number().int().min(0).max(2000).default(0),
    message: z.string().trim().min(5, 'Tell them a little about your wedding.').max(2000),
    company: z.string().max(200).default(''),
  })
  .strict();
export type Enquiry = z.infer<typeof Enquiry>;

/** A listing as couples see it in the directory. */
export interface ListingCard {
  slug: string;
  name: string;
  category: string;
  region: string;
  regions: string[];
  about: string;
  priceFrom: number;
  photo: string;
  /** Couples who've booked them through the planner. */
  booked: number;
}
export interface Listing extends ListingCard {
  contactName: string;
  phone: string;
  website: string;
  instagram: string;
  photos: string[];
}
