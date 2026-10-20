import { describe, expect, it } from 'vitest';
import { answerFrom, dietsIn, whoseDiet, type EventFacts } from '../src/sms/smart';

/** Understanding a guest's message: dietary needs and questions the wedding already answers. */
describe('smart replies', () => {
  it('reads dietary needs, and nothing from a message that has none', () => {
    expect(dietsIn("I'm vegetarian")).toEqual(['Vegetarian']);
    expect(dietsIn('Sam is coeliac and gluten free please')).toEqual(['Coeliac (gluten free)']);
    expect(dietsIn('Jo has a severe nut allergy, and is dairy free')).toEqual(['Dairy free', 'Nut allergy']);
    expect(dietsIn('allergic to sesame.')).toEqual(['Allergic to sesame']);
    expect(dietsIn('No dietary requirements, thanks!')).toEqual([]);
    expect(dietsIn('See you there!')).toEqual([]);
  });

  it('only says whose need it is when that is clear', () => {
    const two = ['Alex Smith', 'Sam Smith'];
    expect(whoseDiet('Sam is vegan', two)).toEqual(['Sam Smith']);
    expect(whoseDiet("We're both vegetarian", two)).toEqual(two);
    expect(whoseDiet("I'm coeliac", two)).toEqual(['Alex Smith']);
    expect(whoseDiet('One of us is vegetarian', two)).toBeNull();
    expect(whoseDiet('vegan', ['Jo Lee'])).toEqual(['Jo Lee']);
  });

  const facts: EventFacts[] = [
    { eventKey: 'wedding', name: 'The wedding', startsAt: '2027-11-18T03:00:00.000Z', venue: 'The Lookout', address: '1 Valley Rd', arrive: 'Arrive from 1:30pm', parking: 'Free parking by the stables.', dress: 'Cocktail.', faq: [{ q: 'Can we bring our kids?', a: 'Little ones are very welcome.' }] },
  ];
  it('answers questions the wedding already answers, and nothing else', () => {
    expect(answerFrom('What time does it start?', facts, 'Australia/Sydney')).toBe('The wedding starts at 2:00pm on Thursday 18 November (arrive from 1:30pm).');
    expect(answerFrom('Where is it?', facts, 'Australia/Sydney')).toBe('The Lookout, 1 Valley Rd.');
    expect(answerFrom('Is there parking?', facts, 'Australia/Sydney')).toBe('Free parking by the stables.');
    expect(answerFrom('What should I wear?', facts, 'Australia/Sydney')).toBe('Cocktail.');
    expect(answerFrom('Can we bring the kids?', facts, 'Australia/Sydney')).toBe('Little ones are very welcome.');
    expect(answerFrom('Can I bring my dog?', facts, 'Australia/Sydney')).toBeNull();
    expect(answerFrom('Parking was great last time', facts, 'Australia/Sydney')).toBeNull(); // not a question
    expect(answerFrom('Where is it?', [], 'Australia/Sydney')).toBeNull();
  });
});
