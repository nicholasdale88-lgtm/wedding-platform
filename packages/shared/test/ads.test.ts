import { describe, expect, it } from 'vitest';
import { adCopyProblems, adDecisions, AdsState, adLink } from '../src/ads';

const words = (primary: string, headline = 'Wedding RSVPs by text') => ({ name: 'x', primary, headline, description: '' });

describe('ad copy rules', () => {
  it('passes plain, true copy at today’s prices', () => {
    expect(adCopyProblems(words('Your guests reply by text and the list fills itself in. $87, paid once.'))).toEqual([]);
    expect(adCopyProblems(words('Everything for the wedding, A$87 once. Not a subscription.'))).toEqual([]);
    expect(adCopyProblems(words('Everything for the wedding, A$88 once.'))).toHaveLength(1);
  });
  it('refuses personal attributes, rival names, unprovable claims, free, wrong prices and emoji', () => {
    expect(adCopyProblems(words('Just engaged? Send invitations your guests answer by text.'))[0]).toMatch(/Meta/);
    expect(adCopyProblems(words('Congrats! Plan the wedding by text.'))[0]).toMatch(/Meta/);
    expect(adCopyProblems(words('Cheaper than Wooow Invites, and guests reply by text.')).join(' ')).toMatch(/company’s name/);
    expect(adCopyProblems(words('The best wedding invitation app, guaranteed.')).join(' ')).toMatch(/claims/);
    expect(adCopyProblems(words('Start free today: invitations your guests answer by text.')).join(' ')).toMatch(/no free plan/);
    expect(adCopyProblems(words('Only $29 for everything your wedding needs, paid once.')).join(' ')).toMatch(/\$29/);
    expect(adCopyProblems(words('Guests reply by text, the list fills in 💍')).join(' ')).toMatch(/emoji/);
  });
  it('links to the front page with the ad’s own ref', () => {
    expect(adLink('https://x.test/', 'text-mar')).toBe('https://x.test/?ref=meta-text-mar&utm_source=meta&utm_campaign=ads-bot&utm_content=text-mar');
  });
});

describe('daily decisions', () => {
  const ad = (id: string, spendCents: number, signups: number, paid = 0, status = 'live') => ({ id, name: id, primary: 'p'.repeat(12), headline: 'hhh', image: 'text-feed', status, metaAdId: `m-${id}`, stats: { spendCents, signups, paid, clicks: 10 } });
  it('pauses an ad that spent the limit with no sign-ups, keeps the one that works', () => {
    const s = AdsState.parse({ variants: [ad('aa', 3000, 0), ad('bb', 3000, 4, 1)] });
    expect(adDecisions(s)).toEqual({ decisions: [{ id: 'aa', pause: true, why: 'Spent $30.00 with no sign-ups.' }], stopAll: '' });
  });
  it('pauses on cost per sale only after twice the limit', () => {
    const s = AdsState.parse({ variants: [ad('aa', 7000, 5, 1), ad('bb', 9000, 6, 1), ad('cc', 1000, 1)] });
    expect(adDecisions(s).decisions.map((d) => d.id)).toEqual(['bb']);
  });
  it('never pauses the last live ad on its numbers alone, but the total cap stops everything', () => {
    const one = AdsState.parse({ variants: [ad('aa', 3000, 0), ad('bb', 4000, 0)] });
    expect(adDecisions(one).decisions).toHaveLength(1);
    const capped = AdsState.parse({ settings: { totalCapCents: 5000 }, variants: [ad('aa', 3000, 2), ad('bb', 2500, 1, 0, 'paused')] });
    expect(adDecisions(capped).stopAll).toMatch(/cap/);
  });
});
