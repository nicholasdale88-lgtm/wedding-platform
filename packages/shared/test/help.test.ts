import { describe, expect, it } from 'vitest';
import { HELP, HELP_PLACES, HELP_TOUR, searchHelp, videoEmbed } from '../src/help';

/** Help: the guides answer what people ask, in their words. */
describe('help', () => {
  it('finds the right guide for everyday questions', () => {
    expect(searchHelp('how do I send reminders')[0]?.id).toBe('invitations');
    expect(searchHelp('seating versions')[0]?.id).toBe('seating');
    expect(searchHelp('compare quotes from florists')[0]?.id).toBe('quotes');
    expect(searchHelp('where are our backups')[0]?.id).toBe('backup');
    expect(searchHelp('bridesmaids sign in')[0]?.id).toBe('party');
    expect(searchHelp('xyzzy')).toEqual([]);
  });

  it('every guide has steps and somewhere to go', () => {
    const ids = new Set(HELP.map((a) => a.id));
    expect(ids.size).toBe(HELP.length);
    for (const a of HELP) {
      expect(a.steps.length).toBeGreaterThan(0);
      expect(a.go.tab).toMatch(/^[a-z]+$/);
      // The animated walkthrough names the place in the menu.
      expect(HELP_PLACES[a.go.tab], a.id).toBeTruthy();
    }
    for (const id of HELP_TOUR) expect(ids.has(id), id).toBe(true);
  });

  it('plays recorded walkthroughs from YouTube, Vimeo and Loom, and nothing else', () => {
    expect(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ kind: 'frame', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0' });
    expect(videoEmbed('https://youtu.be/dQw4w9WgXcQ')?.src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0');
    expect(videoEmbed('https://vimeo.com/76979871')?.src).toBe('https://player.vimeo.com/video/76979871?autoplay=1');
    expect(videoEmbed('https://www.loom.com/share/0123456789abcdef0123456789abcdef')?.src).toBe('https://www.loom.com/embed/0123456789abcdef0123456789abcdef?autoplay=1');
    expect(videoEmbed('https://example.com/how-to.mp4')).toEqual({ kind: 'file', src: 'https://example.com/how-to.mp4' });
    for (const bad of ['', undefined, 'javascript:alert(1)', 'http://youtu.be/dQw4w9WgXcQ', 'https://evil.example/watch?v=dQw4w9WgXcQ', 'https://youtu.be/"><script>', 'not a url']) expect(videoEmbed(bad)).toBeNull();
  });
});
