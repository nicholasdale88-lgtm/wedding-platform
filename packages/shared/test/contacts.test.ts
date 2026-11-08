import { describe, expect, it } from 'vitest';
import { addressLines, contactMobile, csvRows, digitalOk, parseContactsCsv, parseContactsFile, parseVCard, printed } from '../src/contacts';

/** Guests from phone contacts: vCard files (iPhone, Google, Android) and Google / Outlook CSV. */
describe('contacts files', () => {
  it('reads an iPhone vCard 3.0: several numbers (mobile first), email, address, folded lines, unicode', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:Nguyễn;Thảo;;;',
      'FN:Thảo Nguyễn',
      'item1.TEL;type=HOME;type=VOICE:(02) 9555 1234',
      'TEL;type=CELL;type=VOICE;type=pref:+61 412 345 678',
      'EMAIL;type=INTERNET;type=HOME:Thao@Example.com',
      'item2.ADR;type=HOME;type=pref:;;12 Rose Street\\nUnit 3;Newtown;NSW;2042;Austra',
      ' lia',
      'NOTE:A long note that is folded over',
      '  two lines',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Jo Banks',
      'TEL;TYPE=CELL:0400 111 222',
      'END:VCARD',
    ].join('\r\n');
    const [thao, jo] = parseVCard(vcf);
    expect(thao).toEqual({
      name: 'Thảo Nguyễn',
      phones: ['+61 412 345 678', '(02) 9555 1234'],
      emails: ['thao@example.com'],
      address: { street: '12 Rose Street\nUnit 3', suburb: 'Newtown', state: 'NSW', postcode: '2042', country: 'Australia' },
    });
    expect(contactMobile(thao!)).toBe('+61412345678');
    expect(addressLines(thao!.address)).toEqual(['12 Rose Street', 'Unit 3', 'Newtown NSW 2042']);
    expect(jo).toMatchObject({ name: 'Jo Banks', phones: ['0400 111 222'], address: null });
  });

  it('reads vCard 4.0 (Google, Android): tel: links, N when there is no FN, quoted-printable names', () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:4.0',
      'N:Lee;Alex;;Dr;',
      'TEL;TYPE="cell,voice";VALUE=uri:tel:+61-400-222-333',
      'ADR;TYPE=home:;;1 King St;Perth;WA;6000;',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen;;;',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=BCrgen M=C3=BC=',
      'ller',
      'TEL;CELL:0411 999 888',
      'END:VCARD',
    ].join('\n');
    const [alex, jurgen] = parseVCard(vcf);
    expect(alex).toMatchObject({ name: 'Dr Alex Lee', phones: ['+61-400-222-333'], address: { street: '1 King St', suburb: 'Perth', state: 'WA', postcode: '6000' } });
    expect(contactMobile(alex!)).toBe('+61400222333');
    expect(jurgen).toMatchObject({ name: 'Jürgen Müller', phones: ['0411 999 888'] });
  });

  it('reads a Google Contacts CSV: several values in one cell, phone types, address parts', () => {
    const csv = [
      'Name,Given Name,Family Name,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value,Phone 2 - Type,Phone 2 - Value,Address 1 - Type,Address 1 - Formatted,Address 1 - Street,Address 1 - City,Address 1 - Region,Address 1 - Postal Code,Address 1 - Country',
      'Priya Shah,Priya,Shah,* Home,priya@example.com ::: p.shah@work.example,Home,03 9000 0000,Mobile,0412 000 111,Home,"5 Elm Rd\nCarlton VIC 3053","5 Elm Rd",Carlton,VIC,3053,Australia',
      ',Sam,"O\'Brien, Jr",,,Mobile,+61 433 222 111,,,,,,,,,',
    ].join('\n');
    const [priya, sam] = parseContactsCsv(csv);
    expect(priya).toEqual({
      name: 'Priya Shah',
      phones: ['0412 000 111', '03 9000 0000'],
      emails: ['priya@example.com', 'p.shah@work.example'],
      address: { street: '5 Elm Rd', suburb: 'Carlton', state: 'VIC', postcode: '3053', country: 'Australia' },
    });
    expect(sam).toMatchObject({ name: "Sam O'Brien, Jr", phones: ['+61 433 222 111'], address: null });
  });

  it('reads an Outlook CSV', () => {
    const csv = 'First Name,Middle Name,Last Name,E-mail Address,Mobile Phone,Home Phone,Home Street,Home City,Home State,Home Postal Code,Home Country/Region\r\nKim,,Tran,kim@example.com,0499 888 777,,9 Bay Pde,Manly,NSW,2095,Australia\r\n';
    expect(parseContactsCsv(csv)).toEqual([
      { name: 'Kim Tran', phones: ['0499 888 777'], emails: ['kim@example.com'], address: { street: '9 Bay Pde', suburb: 'Manly', state: 'NSW', postcode: '2095', country: 'Australia' } },
    ]);
  });

  it('knows a file by its name or contents, and reads quoted CSV cells', () => {
    expect(parseContactsFile('contacts.vcf', 'BEGIN:VCARD\nFN:A B\nEND:VCARD')).toHaveLength(1);
    expect(parseContactsFile('export.txt', '﻿BEGIN:VCARD\nFN:A B\nEND:VCARD')).toHaveLength(1);
    expect(csvRows('a,"b ""c""",d\n\n"e\nf",g')).toEqual([['a', 'b "c"', 'd'], ['e\nf', 'g']]);
  });

  it('post only means nothing digital; both means printed and digital', () => {
    expect([digitalOk('post'), digitalOk('both'), digitalOk('digital'), digitalOk(undefined)]).toEqual([false, true, true, true]);
    expect([printed('post'), printed('both'), printed('digital')]).toEqual([true, true, false]);
    expect(addressLines({ street: '1 A St', suburb: 'Hobart', state: 'TAS', postcode: '7000', country: 'New Zealand' })).toEqual(['1 A St', 'Hobart TAS 7000', 'New Zealand']);
  });
});
