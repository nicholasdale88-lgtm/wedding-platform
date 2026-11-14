import { describe, expect, it } from 'vitest';
import { STAFF_CAN, STAFF_PERMS } from '../src/company';
import { COMPANY_HELP, COMPANY_HELP_PLACES, COMPANY_HELP_SAY, COMPANY_HELP_SCENES, COMPANY_HELP_TOUR, COMPANY_TAB_PERM, companyHelpAllowed, companyHelpFor, companyHelpSayLine } from '../src/companyHelp';
import { HELP, searchHelp } from '../src/help';
import { HELP_SAY } from '../src/helpSay';

/** The company portal's Help: complete for every guide, and private to the roles that can use it. */
describe('company help', () => {
  it('every guide has steps, a scene and a spoken line per step, and a place in the menu', () => {
    const ids = new Set(COMPANY_HELP.map((a) => a.id));
    expect(ids.size).toBe(COMPANY_HELP.length);
    for (const a of COMPANY_HELP) {
      expect(a.id, a.id).toMatch(/^co-[a-z-]+$/);
      expect(a.steps.length, a.id).toBeGreaterThan(0);
      expect(COMPANY_HELP_PLACES[a.go.tab], a.id).toBeTruthy();
      expect(COMPANY_TAB_PERM[a.go.tab], a.id).toBeTruthy();
      expect(COMPANY_HELP_SCENES[a.id]?.length, a.id).toBe(a.steps.length);
      const say = COMPANY_HELP_SAY[a.id]!;
      expect(say.steps.length, a.id).toBe(a.steps.length);
      for (const line of [say.intro, ...say.steps, say.outro]) expect(line.length, `${a.id}: ${line}`).toBeLessThanOrEqual(220);
    }
    expect(Object.keys(COMPANY_HELP_SAY).sort()).toEqual([...ids].sort());
    for (const id of COMPANY_HELP_TOUR) expect(ids.has(id), id).toBe(true);
  });

  it('never mixes with the couples’ guides', () => {
    for (const a of COMPANY_HELP) {
      expect(HELP.some((h) => h.id === a.id)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(HELP_SAY, a.id)).toBe(false);
    }
    // Couples searching their Help never land on a business guide.
    expect(searchHelp('refund a couple').every((a) => !a.id.startsWith('co-'))).toBe(true);
  });

  it('finds the right guide for everyday questions', () => {
    const find = (q: string) => searchHelp(q, 3, COMPANY_HELP)[0]?.id;
    expect(find('make a promo code')).toBe('co-promos');
    expect(find('set up a grok bot')).toBe('co-bots');
    expect(find('stripe keys')).toBe('co-connections');
    expect(find('mark paid')).toBe('co-requests');
    expect(find('gst and bas')).toBe('co-money');
    expect(find('invite someone to the team')).toBe('co-team');
  });

  it('gives each role only the guides for its own part of the portal', () => {
    const support = companyHelpFor(STAFF_CAN.support);
    const ids = support.articles.map((a) => a.id);
    expect(ids).toContain('co-requests');
    expect(ids).not.toContain('co-money');
    expect(ids).not.toContain('co-bots');
    expect(Object.keys(support.say).every((id) => ids.includes(id))).toBe(true);
    expect(Object.keys(support.scenes).every((id) => ids.includes(id))).toBe(true);
    expect(companyHelpFor(STAFF_PERMS).articles.length).toBe(COMPANY_HELP.length);
    expect(companyHelpFor([]).articles).toEqual([]);
    expect(companyHelpAllowed('co-money', ['overview'])).toBe(false);
    expect(companyHelpAllowed('nope', STAFF_PERMS)).toBe(false);
  });

  it('speaks only known lines', () => {
    expect(companyHelpSayLine('co-bots', -1)).toBe(COMPANY_HELP_SAY['co-bots']!.intro);
    const last = COMPANY_HELP_SAY['co-bots']!.steps.length - 1;
    expect(companyHelpSayLine('co-bots', last)).toMatch(/That’s it/);
    for (const [id, step] of [['co-bots', 99], ['co-bots', 1.5], ['guests', 0], ['__proto__', 0]] as const) expect(companyHelpSayLine(id, step)).toBeNull();
  });
});
