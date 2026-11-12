import { InvitationContent } from '@wp/shared';
import { describe, expect, it } from 'vitest';
import { backdropCss } from '../src/guest/invitation/Backdrop';

const PHOTO = 'data:image/jpeg;base64,AAAA';

describe('their photo behind the words', () => {
  it('is off until there is a photo and a place for it', () => {
    expect(backdropCss(undefined, 'welcome', 0.3, '#fbf8f2')).toBe('');
    expect(backdropCss(PHOTO, 'none', 0.3, '#fbf8f2')).toBe('');
    expect(backdropCss(PHOTO, undefined, 0.3, '#fbf8f2')).toBe('');
  });

  it('behind the opening: fills the welcome, with a veil in the paper colour, and the card softly see-through', () => {
    const css = backdropCss(PHOTO, 'welcome', 0.3, '#fbf8f2');
    expect(css).toContain('section[data-screen-label="01 Welcome"]{background:linear-gradient(rgba(251,248,242,0.30),rgba(251,248,242,0.30)),url("data:image/jpeg;base64,AAAA")');
    expect(css).toContain('>div:first-child{opacity:.74}');
    expect(css).not.toContain('#inv-scroll{');
  });

  it('behind everything: still behind the page while frosted sections scroll over it; the veil is kept within bounds', () => {
    const css = backdropCss('https://example.com/us.jpg', 'all', 5, '#000000');
    expect(css).toContain('#inv-scroll{background:linear-gradient(rgba(0,0,0,0.80)');
    expect(css).toContain('#inv-scroll>section{background:rgba(0,0,0,0.80) !important');
  });

  it('never lets a link break out of the style', () => {
    expect(backdropCss('javascript:alert(1)', 'all', 0.2, '#fff')).toBe('');
    expect(backdropCss('https://x.com/a.jpg"){}body{display:none', 'all', 0.2, '#ffffff')).not.toContain('"){}');
  });

  it('is saved with the invitation', () => {
    expect(InvitationContent.safeParse({ backdrop: { where: 'all', veil: 0.3 }, images: { backdrop: PHOTO } }).success).toBe(true);
    expect(InvitationContent.safeParse({ backdrop: { where: 'sky' } }).success).toBe(false);
    expect(InvitationContent.safeParse({ backdrop: { veil: 0.95 } }).success).toBe(false);
  });
});
