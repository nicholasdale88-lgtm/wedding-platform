import { describe, expect, it } from 'vitest';
import { addMonths, Ceremony, CEREMONY_ORDER, GETTING_TO_KNOW_YOU, keepPrivateVows, noimStatus, noimWindow, paperworkProgress, questionnaireProgress, Questionnaire, vowsFor } from '../src/ceremony';
import { PLANNER_DOCS } from '../src/planner';

describe('ceremony: the Notice of Intended Marriage', () => {
  it('moves by calendar months, keeping to the end of a short month', () => {
    expect(addMonths('2027-11-18', -1)).toBe('2027-10-18');
    expect(addMonths('2027-11-18', -18)).toBe('2026-05-18');
    expect(addMonths('2027-03-31', -1)).toBe('2027-02-28');
    expect(addMonths('2028-03-31', -1)).toBe('2028-02-29');
    expect(addMonths('2027-01-15', -1)).toBe('2026-12-15');
    expect(addMonths('2027-12-31', 2)).toBe('2028-02-29');
  });

  it('can be lodged from 18 months before the wedding until a month before', () => {
    expect(noimWindow('2027-11-18')).toEqual({ earliest: '2026-05-18', latest: '2027-10-18' });
    expect(noimWindow('')).toBeNull();
    expect(noimWindow('18/11/2027')).toBeNull();
  });

  it('says where it stands: too early, open, closing, late or lodged', () => {
    const day = '2027-11-18';
    expect(noimStatus(day, '2026-01-01', '').state).toBe('early');
    expect(noimStatus(day, '2026-05-18', '').state).toBe('open');
    expect(noimStatus(day, '2027-10-01', '')).toMatchObject({ state: 'closing', daysLeft: 17 });
    expect(noimStatus(day, '2027-10-18', '')).toMatchObject({ state: 'closing', daysLeft: 0 });
    expect(noimStatus(day, '2027-10-19', '').state).toBe('late');
    expect(noimStatus(day, '2027-10-19', '2027-02-01').state).toBe('lodged');
    expect(noimStatus('', '2027-10-19', '').state).toBe('unknown');
  });
});

describe('ceremony: questionnaires and paperwork', () => {
  const q = (over: Partial<Questionnaire> = {}): Questionnaire =>
    Questionnaire.parse({ id: 'q', title: 'Getting to know you', questions: GETTING_TO_KNOW_YOU.map((x, i) => ({ ...x, id: `x${i}` })), ...over });

  it('the templates are valid, and the document starts empty', () => {
    expect(GETTING_TO_KNOW_YOU.length).toBeGreaterThanOrEqual(10);
    expect(CEREMONY_ORDER.map((p) => p.part)).toEqual(['Entrance', 'Welcome', 'Readings', 'Vows', 'Rings', 'Signing', 'Pronouncement']);
    const empty = PLANNER_DOCS.ceremony.parse({});
    expect(empty.questionnaires).toEqual([]);
    expect(empty.vows.p1).toEqual({ text: '', private: false, by: '' });
    expect(PLANNER_DOCS.ceremony.safeParse({ questionnaires: [q()] }).success).toBe(true);
  });

  it('each partner answers on their own; it is done when both say theirs is ready', () => {
    const one = q({ answers: { p1: { x0: 'At a friend’s barbecue', x1: '  ' }, p2: {} }, ready: { p1: true, p2: false } });
    const p = questionnaireProgress(one);
    expect(p.p1).toEqual({ answered: 1, asked: GETTING_TO_KNOW_YOU.length, ready: true });
    expect(p.p2.answered).toBe(0);
    expect(p.done).toBe(false);
    expect(questionnaireProgress({ ...one, ready: { p1: true, p2: true } }).done).toBe(true);
    // A file only: done once a filled-in copy is back.
    const file = q({ questions: [], file: { id: 'f', name: 'Questions.pdf' } });
    expect(questionnaireProgress(file).done).toBe(false);
    expect(questionnaireProgress({ ...file, returned: [{ id: 'g', name: 'Ours.pdf' }] }).done).toBe(true);
  });

  it('counts the paperwork, with proof a marriage ended only when someone was married before', () => {
    const p = Ceremony.parse({}).paperwork;
    expect(paperworkProgress(p)).toEqual({ done: 0, total: 10 });
    const married = { ...p, noimLodged: '2027-01-02', papers: { ...p.papers, p2: { ...p.papers.p2, married: true } } };
    expect(paperworkProgress(married)).toEqual({ done: 1, total: 11 });
  });

  it('private vows are hidden from everyone but their author, and kept when someone else saves', () => {
    const doc = Ceremony.parse({ vows: { p1: { text: 'I promise…', private: true, by: 'u1' }, p2: { text: 'Open words', private: false } } });
    expect(vowsFor(doc, 'u1').vows.p1.text).toBe('I promise…');
    expect(vowsFor(doc, 'u2').vows.p1.text).toBe('');
    expect(vowsFor(doc, 'u2').vows.p2.text).toBe('Open words');
    // u2 saves what they saw (blank private vows) and changes p2: p1's stay as they were.
    const saved = keepPrivateVows(Ceremony.parse({ vows: { p1: { text: '', private: true, by: 'u1' }, p2: { text: 'Changed', private: true } } }), doc, 'u2');
    expect(saved.vows.p1).toEqual({ text: 'I promise…', private: true, by: 'u1' });
    expect(saved.vows.p2).toEqual({ text: 'Changed', private: true, by: 'u2' });
  });
});
