/**
 * Contacts for the phone: a .vcf file (vCard 3.0) that iPhone, Android and Outlook open as "add these
 * contacts". Made in the browser; nothing is sent anywhere.
 */
export interface Contact {
  name: string;
  org?: string;
  title?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  note?: string;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');

export function vcard(cs: Contact[]): string {
  return cs
    .filter((c) => c.name.trim())
    .map((c) =>
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${esc(c.name.trim())}`,
        `N:;${esc(c.name.trim())};;;`,
        c.org && `ORG:${esc(c.org)}`,
        c.title && `TITLE:${esc(c.title)}`,
        c.phone && `TEL;TYPE=CELL:${esc(c.phone)}`,
        c.email && `EMAIL;TYPE=INTERNET:${esc(c.email)}`,
        c.website && `URL:${esc(c.website)}`,
        c.address && `ADR;TYPE=WORK:;;${esc(c.address)};;;;`,
        c.note && `NOTE:${esc(c.note)}`,
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\r\n'),
    )
    .join('\r\n');
}

/** Downloads the contacts; on a phone, opening the file offers to add them. */
export function saveContacts(cs: Contact[], file: string) {
  const url = URL.createObjectURL(new Blob([vcard(cs)], { type: 'text/vcard;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = file.endsWith('.vcf') ? file : `${file}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
