import { describe, expect, it } from 'vitest';
import { HELP } from '../src/help';
import { HELP_SAY, helpSayLine, helpSayVersion, helpVoiceUrl, speakable } from '../src/helpSay';

/** The walkthroughs' narration: a spoken line for every step of every guide, short enough to sound natural. */
describe('help narration', () => {
  it('every step of every guide has a spoken line under 220 characters, with an intro and an outro', () => {
    for (const a of HELP) {
      const say = HELP_SAY[a.id];
      expect(say, a.id).toBeTruthy();
      expect(say!.steps.length, a.id).toBe(a.steps.length);
      for (const line of [say!.intro, ...say!.steps, say!.outro]) {
        expect(line.trim().length, `${a.id}: ${line}`).toBeGreaterThan(10);
        expect(line.length, `${a.id}: ${line}`).toBeLessThan(220);
        // Written to be heard: no arrows or screen symbols the voice would stumble on.
        expect(line, a.id).not.toMatch(/[→+•✓⚠]/);
      }
      expect(say!.intro, a.id).toMatch(/^Here’s how/);
      expect(say!.outro, a.id).toMatch(/^That’s/);
    }
    expect(Object.keys(HELP_SAY).sort()).toEqual(HELP.map((a) => a.id).sort());
  });

  it('only known lines can be spoken: intro is -1, the last step ends with the outro', () => {
    expect(helpSayLine('guests', -1)).toBe(HELP_SAY.guests!.intro);
    expect(helpSayLine('guests', 0)).toBe(HELP_SAY.guests!.steps[0]);
    expect(helpSayLine('guests', 3)).toBe(`${HELP_SAY.guests!.steps[3]} ${HELP_SAY.guests!.outro}`);
    for (const [id, step] of [['guests', 4], ['guests', -2], ['guests', 0.5], ['nope', 0], ['__proto__', 0], ['toString', 0]] as const) expect(helpSayLine(id, step)).toBeNull();
  });

  it('a changed line gets a new address, so an old recording is never played for it', () => {
    expect(helpSayVersion('Hello there.')).toBe(helpSayVersion('Hello there.'));
    expect(helpSayVersion('Hello there.')).not.toBe(helpSayVersion('Hello there!'));
    expect(helpVoiceUrl('guests', 0)).toMatch(/^\/api\/a\/help\/voice\?id=guests&step=0&v=[0-9a-z]+$/);
    expect(helpVoiceUrl('guests', 9)).toBeNull();
    expect(speakable('Tap “Save” → done')).toBe('Tap Save, then done');
  });
});
