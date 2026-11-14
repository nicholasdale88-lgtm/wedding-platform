import { describe, expect, it } from 'vitest';
import { householdName, joinName, othersNames, sharedLast, splitName } from '../src/names';

describe('guests’ names', () => {
  it('splits a name into first and last, keeping last names with particles whole', () => {
    expect(splitName('Emma Smith')).toEqual({ first: 'Emma', last: 'Smith' });
    expect(splitName('Mary Ann Lee')).toEqual({ first: 'Mary Ann', last: 'Lee' });
    expect(splitName('Anna van der Berg')).toEqual({ first: 'Anna', last: 'van der Berg' });
    expect(splitName('  Lily ')).toEqual({ first: 'Lily', last: '' });
    expect(splitName('')).toEqual({ first: '', last: '' });
    expect(joinName(' Emma ', '')).toBe('Emma');
    expect(joinName('Emma', 'Smith')).toBe('Emma Smith');
  });

  it('says a shared last name once, and different ones in full', () => {
    expect(sharedLast(['Emma Smith', 'Tom smith'])).toBe('Smith');
    expect(sharedLast(['Emma Smith'])).toBe('');
    expect(sharedLast(['Emma Smith', 'Tom Jones'])).toBe('');
    expect(householdName(['Emma Smith', 'Tom Smith'])).toBe('Emma & Tom Smith');
    expect(householdName(['Emma Smith', 'Tom Smith', 'Lily Smith'])).toBe('Emma, Tom & Lily Smith');
    expect(householdName(['Abby Garcia', 'Caleb Shepherd'])).toBe('Abby Garcia & Caleb Shepherd');
    expect(householdName(['Emma Smith', ''])).toBe('Emma Smith');
    expect(othersNames(['Emma Smith', 'Tom Smith', 'Sam Jones'])).toEqual(['Tom', 'Sam Jones']);
  });
});
