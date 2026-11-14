import { describe, expect, it } from 'vitest';
import { dietCategories, dietNeeds, safeFor } from '../src/diet';

describe('dietary headings for the caterer', () => {
  it('halal and kosher are each their own heading', () => {
    expect(dietCategories('Halal please')).toEqual(['Halal']);
    expect(dietCategories('kosher')).toEqual(['Kosher']);
    expect(dietNeeds('Halal, no nuts')).toEqual(['Nut allergy', 'Halal']);
  });

  it('a halal menu suits halal guests (and not kosher ones)', () => {
    expect(safeFor('halal').has('Halal')).toBe(true);
    expect(safeFor('halal').has('Kosher')).toBe(false);
  });
});
