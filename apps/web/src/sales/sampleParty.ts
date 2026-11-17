import type { PartyPayload } from '../guest/invitation/api';

/**
 * The sample wedding party page (/demo/party, ?as=best | maid | bridesmaid | groomsman): what someone in the sample
 * wedding's party sees on their own page. Made up; ticking and adding work for this visit only, nothing is sent.
 */
const day = (days: number, hour: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const WHO = {
  maid: { name: 'Olivia Hart', role: 'Maid of honour', side: 'p1' as const },
  bridesmaid: { name: 'Priya Nair', role: 'Bridesmaid', side: 'p1' as const },
  best: { name: 'James Hart', role: 'Best man', side: 'p2' as const },
  groomsman: { name: 'Sam Nair', role: 'Groomsman', side: 'p2' as const },
};
export type SampleRole = keyof typeof WHO;

export function sampleParty(as: string | null): PartyPayload {
  const me = WHO[(as ?? 'bridesmaid') as SampleRole] ?? WHO.bridesmaid;
  const p1 = me.side === 'p1';
  return {
    couple: 'Harriet & Theo',
    names: { p1: 'Harriet', p2: 'Theo' },
    theme: 'Cream & Sage',
    sides: { p1: 'Bride', p2: 'Groom' },
    me: [{ name: me.name, role: me.role }],
    party: [
      { name: 'Olivia Hart', role: 'Maid of honour', side: 'p1', phone: '0400 111 001' },
      { name: 'Priya Nair', role: 'Bridesmaid', side: 'p1', phone: '0400 111 002' },
      { name: 'Lucy Chen', role: 'Bridesmaid', side: 'p1', phone: '0400 111 003' },
      { name: 'James Hart', role: 'Best man', side: 'p2', phone: '0400 111 004' },
      { name: 'Sam Nair', role: 'Groomsman', side: 'p2', phone: '0400 111 005' },
      { name: 'Ben Chen', role: 'Groomsman', side: 'p2', phone: '0400 111 006' },
      { name: 'Alex Moore', role: 'MC', side: '', phone: '0400 111 007' },
    ],
    mine: [
      {
        personId: 'sample-me',
        name: me.name,
        role: me.role,
        tasks: [
          { id: 't1', text: p1 ? 'Book the hair and make-up trial' : 'Get fitted for your suit', due: day(14, 9).slice(0, 10), done: false, mine: false },
          { id: 't2', text: p1 ? 'Plan the hens day' : 'Plan the bucks day', due: day(30, 9).slice(0, 10), done: false, mine: false },
          { id: 't3', text: 'Reply to the invitation', due: '', done: true, mine: false },
        ],
        packed: [],
        pack: [
          { text: 'Phone charger', done: false },
          { text: p1 ? 'Emergency kit (pins, plasters, tissues)' : 'The rings (best man)', done: false },
        ],
        outfit: { how: p1 ? 'buy' : 'hire', payer: p1 ? 'us' : 'them', each: p1 ? 320 : 180, what: p1 ? 'Sage chiffon dress' : 'Navy suit', colour: p1 ? 'Sage' : 'Navy', where: p1 ? 'Bridal Rooms, Sydney' : 'Suit Hire Co', orderBy: day(40, 9).slice(0, 10), returnBy: '', notes: '', size: '', fitting: day(60, 11).slice(0, 10), collected: false },
        night: { title: p1 ? 'The hens day' : 'The bucks day', date: day(45, 12).slice(0, 10), place: p1 ? 'High tea in the Blue Mountains' : 'Golf, then dinner', organiser: p1 ? 'Olivia' : 'James' },
      },
    ],
    events: [
      {
        key: 'wedding',
        name: 'The wedding',
        startsAt: day(124, 15),
        note: 'Thank you for being part of our day. Everything you need is here, and it updates if anything changes.',
        items: [
          { time: '9:00am', until: '', title: p1 ? 'Hair and make-up' : 'Breakfast together', detail: p1 ? 'At the bridal suite. Come with clean, dry hair.' : 'At the cottage.', place: p1 ? 'Larkwood Estate, bridal suite' : 'The cottage', who: [me.side] },
          { time: '1:30pm', until: '', title: 'Photos before the ceremony', detail: '', place: 'The gardens', who: ['party'] },
          { time: '2:00pm', until: '2:30pm', title: 'Ceremony', detail: '', place: 'Among the vines', who: ['party'] },
          { time: '6:30pm', until: '', title: 'Speeches', detail: '', place: 'The barn', who: ['party'] },
        ],
        speeches: [
          { who: 'Father of the bride', minutes: 5 },
          { who: 'Maid of honour', minutes: 4 },
          { who: 'Best man', minutes: 5 },
        ],
        holding: me.role === 'Best man' ? ['The rings'] : me.role === 'Maid of honour' ? ['The bouquet during the vows'] : [],
        packing: [{ text: 'Comfortable shoes for later', who: ['party'] }],
      },
    ],
  };
}
